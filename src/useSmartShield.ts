import { useState, useEffect, useCallback } from 'react';
import { SupabaseClient } from '@supabase/supabase-js';
import { UserProfile, ShipData, SmartshipAlarm, AlarmSeverity, SecurityThresholds } from '@/shared/types';
import { SensorQualityMap } from './lib/sensorQuality';

interface SmartShieldProps {
  userProfile: UserProfile | null;
  supabase: SupabaseClient;
  fleet: ShipData[];
  selectedShipId: string | null;
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
  depth,
  engineData,
  aisTargets,
  telemetry,
  isTravesiaActive,
  isEngineOn,
  sensorQuality,
  anchorWatch
}: SmartShieldProps) => {
  const [alarms, setAlarms] = useState<SmartshipAlarm[]>([]);
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
        .eq('es_alarma', true)
        .order('created_at', { ascending: false })
        .limit(50);
      if (!error && data) {
        setAlarmHistory(data.map(log => ({
          id: log.id,
          message: log.descripcion,
          type: log.tipo_evento?.replace('ALERTA_', '').toLowerCase() || 'unknown',
          severity: log.nivel_critico || 'warning',
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

  const removeAlarmByType = useCallback((type: SmartshipAlarm['type']) => {
    setAlarms(prev => prev.filter(a => a.type !== type));
  }, []);

  const addAlarm = useCallback(async (type: SmartshipAlarm['type'], severity: AlarmSeverity, message: string, value: number) => {
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
          tipo_evento: `ALERTA_${type.toUpperCase()}`,
          categoria: 'Seguridad',
          nivel_critico: severity,
          es_alarma: true,
          modulo_origen: 'SmartShield-Watchdog',
          is_auto: true
        }]);
      } catch (err) { console.error("Error persistiendo alarma:", err); }
    }

    setAlarms(prev => [{
      id: crypto.randomUUID(), type, severity, message, timestamp: Date.now(), value
    }, ...prev.filter(a => a.type !== type)].slice(0, 8));
  }, [alarms, userProfile, fleet, selectedShipId, supabase]);

  // Watchdog: Monitoreo Activo de Telemetria
  useEffect(() => {
    const checkSecurity = () => {
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

      const proximityTarget = aisTargets.reduce((prev, curr) => ((curr.cpa || Infinity) < (prev?.cpa || Infinity) ? curr : prev), null);
      if (proximityTarget && proximityTarget.cpa < thresholds.minCPA) {
        const tcpaText = Number.isFinite(proximityTarget.tcpa) ? ' TCPA ' + proximityTarget.tcpa.toFixed(1) + ' min' : '';
        const targetName = proximityTarget.nombre || proximityTarget.name || proximityTarget.mmsi || 'AIS';
        addAlarm('ais_collision', 'critical', 'PELIGRO COLISION: ' + targetName + '.' + tcpaText, proximityTarget.cpa);
      } else { removeAlarmByType('ais_collision'); }

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

    const interval = setInterval(checkSecurity, 5000);
    return () => clearInterval(interval);
  }, [depth, engineData, aisTargets, thresholds, isTravesiaActive, isEngineOn, sensorQuality, anchorWatch, addAlarm, removeAlarmByType]);

  return {
    alarms, alarmHistory, thresholds, setThresholds, 
    isAlertMuted, setIsAlertMuted, removeAlarm, removeAlarmByType, addAlarm
  };
};
