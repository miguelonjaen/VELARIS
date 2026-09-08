import { useState, useEffect, useCallback } from 'react';
import { VELARISAlarm, SecurityThresholds, AlarmSeverity, UserProfile, ShipData } from './types';
import { SupabaseClient } from '@supabase/supabase-js';
import { SensorQualityMap } from './lib/sensorQuality';
import { calculateDistanceNM } from './lib/aisMath';

interface SmartShieldProps {
  userProfile: UserProfile | null;
  supabase: SupabaseClient;
  fleet: ShipData[];
  selectedShipId: string | null;
  ownShipPosition: { lat: number; lng: number } | null;
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
  ownShipPosition,
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
        .eq('categoria', 'Seguridad')
        .order('created_at', { ascending: false })
        .limit(50);

      if (!error && data) {
        setAlarmHistory(data.map(log => ({
          id: log.id || log.created_at,
          message: log.descripcion,
          type: log.titulo?.replace('ALARMA ', '').toLowerCase() || 'unknown',
          severity: 'warning',
          timestamp: new Date(log.created_at).getTime(),
          value: parseFloat(log.descripcion.split('Valor: ')[1]) || 0
        })));
      }
    };

    fetchAlarms();

    const channel = supabase
      .channel('bitacora-alarms-shield')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'bitacora' },
        (payload) => {
          const newLog = payload.new;
          setAlarmHistory(prev => [{
            id: newLog.id || newLog.created_at,
            message: newLog.descripcion,
            type: newLog.titulo?.replace('ALARMA ', '').toLowerCase() || 'unknown',
            severity: 'warning',
            timestamp: new Date(newLog.created_at).getTime(),
            value: parseFloat(newLog.descripcion.split('Valor: ')[1]) || 0
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
          categoria: 'Seguridad',
          fecha: new Date().toISOString().slice(0, 10),
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

      console.log('[AIS SHIELD INPUT]', {
        ownPosition: ownShipPosition,
        targetCount: aisTargets.length,
        targets: aisTargets.map(target => ({
          id: target.mmsi ?? target.id,
          position: { lat: target.lat, lng: target.lng },
          cpa: target.cpaNm ?? target.cpa ?? null,
          tcpa: target.tcpaMinutes ?? target.tcpa ?? null
        }))
      });
      console.log('[SHIELD AIS INPUT]', {
        ownPosition: ownShipPosition,
        targets: aisTargets.length
      });
      const proximityTarget = aisTargets.reduce((prev, curr) => {
        const currCpa = curr.cpaNm ?? curr.cpa;
        const prevCpa = prev ? (prev.cpaNm ?? prev.cpa) : undefined;
        return Number.isFinite(currCpa) && (!Number.isFinite(prevCpa) || currCpa < prevCpa)
          ? curr
          : prev;
      }, null);
      const proximityCpa = proximityTarget
        ? (proximityTarget.cpaNm ?? proximityTarget.cpa)
        : null;
      const proximityTcpa = proximityTarget
        ? (proximityTarget.tcpaMinutes ?? proximityTarget.tcpa)
        : null;
      console.log('[AIS SHIELD CALC]', {
        ownPosition: ownShipPosition,
        targetPosition: proximityTarget
          ? { lat: proximityTarget.lat, lng: proximityTarget.lng }
          : null,
        distance: ownShipPosition && proximityTarget
          && Number.isFinite(proximityTarget.lat)
          && Number.isFinite(proximityTarget.lng)
          ? calculateDistanceNM(
            ownShipPosition.lat,
            ownShipPosition.lng,
            proximityTarget.lat,
            proximityTarget.lng
          )
          : null,
        cpa: proximityCpa,
        tcpa: proximityTcpa,
        threshold: thresholds.minCPA
      });
      const riskLevel = proximityTarget?.riskLevel;
      const hasRiskLevel = riskLevel === 'CAUTION' || riskLevel === 'WARNING' || riskLevel === 'CRITICAL';
      const isWithinShieldThreshold = Number.isFinite(proximityCpa) && proximityCpa < thresholds.minCPA;
      console.log('[SHIELD AIS RISK]', {
        target: proximityTarget?.mmsi ?? proximityTarget?.id ?? null,
        riskLevel: riskLevel ?? 'SAFE',
        cpa: proximityCpa,
        tcpa: proximityTcpa,
        shieldThresholdExceeded: isWithinShieldThreshold
      });
      if (proximityTarget && (hasRiskLevel || isWithinShieldThreshold)) {
        const tcpaText = Number.isFinite(proximityTcpa) ? ' TCPA ' + proximityTcpa.toFixed(1) + ' min' : '';
        const targetName = proximityTarget.nombre || proximityTarget.name || proximityTarget.mmsi || 'AIS';
        console.log('[AIS SHIELD ALERT]', {
          level: 'critical',
          reason: `CPA ${proximityCpa.toFixed(2)} NM < ${thresholds.minCPA.toFixed(2)} NM`,
          target: targetName,
          cpa: proximityCpa,
          tcpa: proximityTcpa
        });
        console.log('[SHIELD AIS STATE]', {
          type: 'ais_collision',
          severity: riskLevel === 'CRITICAL' || isWithinShieldThreshold ? 'critical' : 'warning',
          visible: true
        });
        addAlarm('ais_collision', 'critical', 'PELIGRO COLISION: ' + targetName + '.' + tcpaText, proximityCpa ?? 0);
      } else {
        console.log('[AIS SHIELD ALERT]', {
          level: 'none',
          reason: proximityTarget
            ? `CPA ${String(proximityCpa)} NM no supera umbral ${thresholds.minCPA.toFixed(2)} NM`
            : 'No hay objetivo AIS válido'
        });
        console.log('[SHIELD AIS STATE]', {
          type: 'ais_collision',
          severity: 'none',
          visible: false,
          reason: proximityTarget ? `riskLevel=${String(riskLevel ?? 'SAFE')}` : 'no-target'
        });
        removeAlarmByType('ais_collision');
      }

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
