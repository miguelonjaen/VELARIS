import { useState, useEffect, useCallback, useRef } from 'react';
import { SupabaseClient } from '@supabase/supabase-js';
import { UserProfile, ShipData, VELARISAlarm, AlarmSeverity, SecurityThresholds } from '@/shared/types';
import { SensorQualityMap } from './lib/sensorQuality';
import { evaluateAisCollisionAlarm, DEFAULT_AIS_ALARM_OPTIONS } from '@/core/navigation/AisCollisionAlarm';

/** SOG propio mínimo (kn) para vigilar AIS sin travesía activa ni motor (navegación a vela) */
const AIS_MIN_OWN_SOG_KN = 1;

interface SmartShieldProps {
  userProfile: UserProfile | null;
  supabase: SupabaseClient;
  fleet: ShipData[];
  selectedShipId: string | null;
  ownShipPosition: { lat: number; lng: number } | null;
  ownShipSog: number;
  ownShipCog: number;
  depth: number;
  engineData: { rpm: number; temp: number; voltage: number; fuel: number; water: number };
  aisTargets: any[];
  telemetry: { internalTemp: number; humidity: number };
  isTravesiaActive: boolean;
  isEngineOn: boolean;
  sensorQuality?: SensorQualityMap;
  anchorWatch?: {
    anchorTrend: 'stable' | 'drifting' | 'swinging';
    currentAnchorDistance: number;
  } | null;
}

export const useSmartShield = ({
  userProfile,
  supabase,
  fleet,
  selectedShipId,
  ownShipPosition,
  ownShipSog,
  ownShipCog,
  depth,
  engineData,
  aisTargets,
  telemetry,
  isTravesiaActive,
  isEngineOn,
  sensorQuality,
  anchorWatch
}: SmartShieldProps) => {
  const [alarms, setAlarms] = useState<VELARISAlarm[]>([]);
  const [alarmHistory, setAlarmHistory] = useState<any[]>([]);
  const [isAlertMuted, setIsAlertMuted] = useState(false);
  const [thresholds, setThresholds] = useState<SecurityThresholds>({
    minDepth: 2.5,
    maxEngineTemp: 90,
    minFuel: 15,
    minCPA: 0.27, // Umbral de seguridad ajustado a 500m (0.27 NM)
    maxInternalTemp: 35,
    maxHumidity: 85
  });

  // Suscripción a la Bitácora para el Historial de Alarmas
  useEffect(() => {
    if (!userProfile) return;
    const fetchAlarms = async () => {
      const { data, error } = await supabase
        .from('bitacora')
        .select('*')
        .eq('categoria', 'Seguridad')
        .order('created_at', { ascending: false })
        .limit(50);
      if (!error && data) {
        setAlarmHistory(data.map(log => ({
          id: log.id,
          message: log.descripcion,
          type: log.titulo?.replace('ALARMA ', '').toLowerCase() || 'unknown',
          severity: 'warning',
          timestamp: new Date(log.created_at).getTime(),
          value: parseFloat(log.descripcion.split('Valor: ')[1]) || 0
        })));
      }
    };
    fetchAlarms();
  }, [userProfile, supabase]);

  const removeAlarm = useCallback((id: string) => {
    setAlarms(prev => prev.filter(a => a.id !== id));
  }, []);

  const removeAlarmByType = useCallback((type: VELARISAlarm['type']) => {
    setAlarms(prev => prev.filter(a => a.type !== type));
  }, []);

  const addAlarm = useCallback(async (type: VELARISAlarm['type'], severity: AlarmSeverity, message: string, value: number) => {
    const existing = alarms.find(a => a.type === type);
    if (existing && existing.severity === severity) return;
    
    // Registro persistente en Supabase (Evitando redundancia)
    if (userProfile) {
      try {
        const activeShip = fleet.find(s => s.id === selectedShipId) || fleet[0];
        await supabase.from('bitacora').insert([{
          barco_id: activeShip?.id,
          capitan_id: userProfile.id,
          titulo: `ALARMA ${type.toUpperCase()}`,
          descripcion: `${message} | Valor: ${value}`,
          categoria: 'Seguridad',
          fecha: new Date().toISOString().slice(0, 10),
          is_auto: true
        }]);
      } catch (err) { console.error("Error persistiendo alarma:", err); }
    }

    setAlarms(prev => [{
      id: crypto.randomUUID(), type, severity, message, timestamp: Date.now(), value
    }, ...prev.filter(a => a.type !== type)].slice(0, 8));
  }, [alarms, userProfile, fleet, selectedShipId, supabase]);

  // Watchdog: Monitoreo Activo de Telemetria
  const checkSecurityRef = useRef<() => void>(() => {});
  const lastAisAlarmKeyRef = useRef<string | null>(null);
  useEffect(() => {
    const checkSecurity = () => {
      // --- Alarma de colisión AIS (CPA/TCPA) ---
      // Se vigila con travesía activa, motor encendido o navegando (SOG >= AIS_MIN_OWN_SOG_KN),
      // para cubrir también la navegación a vela sin travesía iniciada.
      const aisMonitoringActive = isTravesiaActive || isEngineOn
        || (Number.isFinite(ownShipSog) && ownShipSog >= AIS_MIN_OWN_SOG_KN);
      const aisAlarm = aisMonitoringActive && ownShipPosition
        ? evaluateAisCollisionAlarm(aisTargets, { ...DEFAULT_AIS_ALARM_OPTIONS, minCpaNm: thresholds.minCPA })
        : null;
      const aisAlarmKey = aisAlarm?.severity ? aisAlarm.severity + ':' + aisAlarm.targetId : null;
      if (aisAlarmKey !== lastAisAlarmKeyRef.current) {
        console.info('[AIS COLLISION ALARM]', aisAlarm?.severity
          ? {
            severity: aisAlarm.severity,
            target: aisAlarm.targetId,
            cpaNm: aisAlarm.cpaNm,
            tcpaMinutes: aisAlarm.tcpaMinutes,
            dangerousCount: aisAlarm.dangerousCount,
            reason: aisAlarm.reason
          }
          : { severity: null, reason: aisAlarm ? aisAlarm.reason : 'vigilancia AIS inactiva' });
        lastAisAlarmKeyRef.current = aisAlarmKey;
      }
      const existingAisAlarm = alarms.find(a => a.type === 'ais_collision');
      if (aisAlarm?.severity && aisAlarm.message) {
        if (existingAisAlarm && existingAisAlarm.severity === aisAlarm.severity) {
          // Misma severidad: refrescar CPA/TCPA en pantalla sin volver a registrar en bitácora
          if (existingAisAlarm.message !== aisAlarm.message) {
            const message = aisAlarm.message;
            const value = aisAlarm.cpaNm ?? 0;
            setAlarms(prev => prev.map(a => a.type === 'ais_collision' ? { ...a, message, value } : a));
          }
        } else {
          addAlarm('ais_collision', aisAlarm.severity, aisAlarm.message, aisAlarm.cpaNm ?? 0);
        }
      } else if (existingAisAlarm) {
        removeAlarmByType('ais_collision');
      }

      if (!isTravesiaActive && !isEngineOn) return;

      if (depth < thresholds.minDepth) {
        addAlarm('depth', 'critical', 'CALADO CRITICO: ' + depth.toFixed(1) + 'm', depth);
      } else { removeAlarmByType('depth'); }

      if (engineData.temp > thresholds.maxEngineTemp) {
        addAlarm('engine_temp', 'critical', 'SOBRECALENTAMIENTO: ' + engineData.temp + 'C', engineData.temp);
      } else { removeAlarmByType('engine_temp'); }

      if (engineData.fuel < thresholds.minFuel) {
        addAlarm('fuel', engineData.fuel < 5 ? 'critical' : 'warning', 'COMBUSTIBLE BAJO: ' + engineData.fuel.toFixed(0) + '%', engineData.fuel);
      } else { removeAlarmByType('fuel'); }

      if (anchorWatch?.anchorTrend === 'drifting') {
        addAlarm('anchor_drag', 'critical', `¡ALERTA GARREO! Deriva: ${anchorWatch.currentAnchorDistance.toFixed(0)}m`, anchorWatch.currentAnchorDistance);
      } else {
        removeAlarmByType('anchor_drag');
        removeAlarmByType('anchor_drift');
      }

      const badSensor = sensorQuality
        ? Object.values(sensorQuality).find(sensor => sensor.source === 'real' && (sensor.status === 'stale' || sensor.status === 'offline'))
        : null;
      if (badSensor) {
        addAlarm('sensor_quality', 'warning', 'SENSOR ' + badSensor.label + ': ' + badSensor.message, badSensor.ageSeconds || 0);
      } else { removeAlarmByType('sensor_quality'); }
    };

    checkSecurityRef.current = checkSecurity;
  }, [depth, engineData, aisTargets, alarms, thresholds, isTravesiaActive, isEngineOn, sensorQuality, anchorWatch, ownShipPosition, ownShipSog, ownShipCog, addAlarm, removeAlarmByType]);

  // Intervalo único del watchdog: siempre ejecuta la versión más reciente de checkSecurity.
  // Antes se reiniciaba con cada actualización de telemetría/AIS y podía no llegar a disparar nunca.
  useEffect(() => {
    const interval = setInterval(() => checkSecurityRef.current(), 5000);
    return () => clearInterval(interval);
  }, []);

  return {
    alarms, alarmHistory, thresholds, setThresholds, 
    isAlertMuted, setIsAlertMuted, removeAlarm, removeAlarmByType, addAlarm
  };
};
