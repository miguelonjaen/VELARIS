import { useState, useEffect, useCallback } from 'react';
import { VELARISAlarm, SecurityThresholds, AlarmSeverity, UserProfile, ShipData } from './types';
import { SupabaseClient } from '@supabase/supabase-js';
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
  // Actualización de la interfaz para el monitoreo de ancla
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
  anchorWatch,
}: SmartShieldProps) => {
  const [alarms, setAlarms] = useState<VELARISAlarm[]>([]);
  const [alarmHistory, setAlarmHistory] = useState<any[]>([]);
  const [thresholds, setThresholds] = useState<SecurityThresholds>({
    minDepth: 2.5,
    maxEngineTemp: 90,
    minFuel: 15,
    minCPA: 0.2, // NM
    maxInternalTemp: 35,
    maxHumidity: 85
  });
  const [isAlertMuted, setIsAlertMuted] = useState(false);

  // Suscripción a Supabase para el historial de alarmas (Bitácora)
  useEffect(() => {
    if (!userProfile || !supabase) return;

    const fetchAlarms = async () => {
      const { data, error } = await supabase
        .from('bitacora')
        .select('*')
        .eq('es_alarma', true)
        .order('created_at', { ascending: false })
        .limit(50);

      if (!error && data) {
        setAlarmHistory(data.map(log => ({
          id: log.id || log.created_at,
          message: log.descripcion,
          type: log.tipo_evento?.replace('ALERTA_', '').toLowerCase() || 'unknown',
          severity: log.nivel_critico || 'warning',
          timestamp: new Date(log.created_at).getTime(),
          value: parseFloat(log.descripcion.split('Valor: ')[1]) || 0,
          modulo_origen: log.modulo_origen
        })));
      }
    };

    fetchAlarms();

    const channel = supabase
      .channel('bitacora-alarms-shield')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'bitacora', filter: 'es_alarma=eq.true' },
        (payload) => {
          const newLog = payload.new;
          setAlarmHistory(prev => [{
            id: newLog.id || newLog.created_at,
            message: newLog.descripcion,
            type: newLog.tipo_evento?.replace('ALERTA_', '').toLowerCase() || 'unknown',
            severity: newLog.nivel_critico || 'warning',
            timestamp: new Date(newLog.created_at).getTime(),
            value: parseFloat(newLog.descripcion.split('Valor: ')[1]) || 0,
            modulo_origen: newLog.modulo_origen
          }, ...prev].slice(0, 50));
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
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
    
    const isNew = !existing;
    const isUpgrade = existing && (
      (existing.severity === 'normal' && (severity === 'warning' || severity === 'critical')) ||
      (existing.severity === 'warning' && severity === 'critical')
    );

    if ((isNew || isUpgrade) && userProfile && supabase) {
      try {
        const activeShip = fleet.find(s => String(s.id) === String(selectedShipId)) || fleet[0];
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
          created_at: new Date().toISOString(),
          is_auto: true
        }]);
      } catch (err) { console.error("Error logging alarm to Supabase:", err); }
    }

    const newAlarm: VELARISAlarm = {
      id: crypto.randomUUID(),
      type,
      severity,
      message,
      timestamp: Date.now(),
      value
    };
    
    setAlarms(prev => [newAlarm, ...prev.filter(a => a.type !== type)].slice(0, 8));
    if (severity === 'critical' && !isAlertMuted) console.log("🚨 ALERTA CRÍTICA:", message);
  }, [alarms, userProfile, fleet, selectedShipId, isAlertMuted, supabase]);

  // Logica del Watchdog (Monitorizacion 5s)
  useEffect(() => {
    const checkSecurity = () => {
      if (!isTravesiaActive && !isEngineOn) return;

      if (depth < thresholds.minDepth) addAlarm('depth', 'critical', 'BAJO CALADO: ' + depth.toFixed(1) + 'm', depth);
      else if (depth < thresholds.minDepth * 1.5) addAlarm('depth', 'warning', 'Aviso Profundidad: ' + depth.toFixed(1) + 'm', depth);
      else removeAlarmByType('depth');

      if (engineData.temp > thresholds.maxEngineTemp) addAlarm('engine_temp', 'critical', 'SOBRECALENTAMIENTO: ' + engineData.temp + 'C', engineData.temp);
      else removeAlarmByType('engine_temp');

      if (engineData.fuel < thresholds.minFuel) addAlarm('fuel', engineData.fuel < 5 ? 'critical' : 'warning', 'COMBUSTIBLE BAJO: ' + engineData.fuel.toFixed(1) + '%', engineData.fuel);
      else removeAlarmByType('fuel');

      if (telemetry.internalTemp > thresholds.maxInternalTemp) addAlarm('internal_temp', 'critical', 'TEMP. CABINA: ' + telemetry.internalTemp + 'C', telemetry.internalTemp);
      else removeAlarmByType('internal_temp');

      // Alerta de Garreo (Trend-based)
      if (anchorWatch?.anchorTrend === 'drifting') {
        addAlarm('anchor_drag', 'critical', `¡ALERTA GARREO! Deriva: ${anchorWatch.currentAnchorDistance.toFixed(0)}m`, anchorWatch.currentAnchorDistance);
      } else {
        removeAlarmByType('anchor_drag');
        removeAlarmByType('anchor_drift');
      }

      const proximityTarget = aisTargets.reduce((prev, curr) => ((curr.cpa || Infinity) < (prev?.cpa || Infinity) ? curr : prev), null);
      if (proximityTarget && proximityTarget.cpa < thresholds.minCPA) {
        const tcpaText = Number.isFinite(proximityTarget.tcpa) ? ' TCPA ' + proximityTarget.tcpa.toFixed(1) + ' min' : '';
        const targetName = proximityTarget.nombre || proximityTarget.name || proximityTarget.mmsi || 'AIS';
        addAlarm('ais_collision', 'critical', 'PELIGRO COLISION: ' + targetName + '.' + tcpaText, proximityTarget.cpa);
      } else { removeAlarmByType('ais_collision'); }

      const badSensor = sensorQuality
        ? Object.values(sensorQuality).find(sensor => sensor.source === 'real' && (sensor.status === 'stale' || sensor.status === 'offline'))
        : null;
      if (badSensor) addAlarm('sensor_quality', 'warning', 'SENSOR ' + badSensor.label + ': ' + badSensor.message, badSensor.ageSeconds || 0);
      else removeAlarmByType('sensor_quality');
    };

    const interval = setInterval(checkSecurity, 5000);
    return () => clearInterval(interval);
  }, [depth, engineData, aisTargets, thresholds, isTravesiaActive, isEngineOn, telemetry, sensorQuality, addAlarm, removeAlarmByType]);

  return { alarms, setAlarms, alarmHistory, thresholds, setThresholds, isAlertMuted, setIsAlertMuted, removeAlarm, removeAlarmByType, addAlarm };
};

