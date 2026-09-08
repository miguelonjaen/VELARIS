import { useState, useEffect, useCallback } from 'react';
import { SupabaseClient } from '@supabase/supabase-js';
import { UserProfile, ShipData, VELARISAlarm, AlarmSeverity, SecurityThresholds } from '@/shared/types';
import { SensorQualityMap } from './lib/sensorQuality';
import { calculateDistanceNM } from './lib/aisMath';

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

      console.log('[AIS SHIELD INPUT]', aisTargets.map(target => ({
        id: target.mmsi ?? target.id ?? 'AIS',
        targetPosition: { lat: target.lat, lng: target.lng },
        ownPosition: ownShipPosition,
        targetSog: target.sog,
        targetCog: target.cog
      })));

      const normalizedTargets = aisTargets.map(target => {
        const distanceNm = ownShipPosition
          && Number.isFinite(target.lat)
          && Number.isFinite(target.lng)
          ? calculateDistanceNM(
            ownShipPosition.lat,
            ownShipPosition.lng,
            target.lat,
            target.lng
          )
          : null;
        const cpaNm = target.cpaNm ?? target.cpa ?? null;
        const tcpaMinutes = target.tcpaMinutes ?? target.tcpa ?? null;

        console.log('[AIS SHIELD CALC]', {
          id: target.mmsi ?? target.id ?? 'AIS',
          distanceNm,
          bearing: target.relativeBearing ?? null,
          relativeBearing: target.relativeBearing ?? null,
          cpaNm,
          tcpaMinutes,
          ownSog: ownShipSog,
          targetSog: target.sog,
          ownCog: ownShipCog,
          targetCog: target.cog,
          riskLevel: target.riskLevel ?? 'SAFE',
          threshold: thresholds.minCPA
        });

        return { target, cpaNm, tcpaMinutes, distanceNm };
      });

      const proximity = normalizedTargets
        .filter(item => Number.isFinite(item.cpaNm))
        .sort((a, b) => (a.cpaNm as number) - (b.cpaNm as number))[0];
      const proximityTarget = proximity?.target;
      const proximityCpa = proximity?.cpaNm ?? null;
      const proximityTcpa = proximity?.tcpaMinutes ?? null;
      const riskLevel = proximityTarget?.riskLevel;
      const hasRiskLevel = riskLevel === 'CAUTION'
        || riskLevel === 'WARNING'
        || riskLevel === 'CRITICAL';
      const thresholdExceeded = Number.isFinite(proximityCpa)
        && (proximityCpa as number) < thresholds.minCPA;

      if (proximityTarget && (hasRiskLevel || thresholdExceeded)) {
        const tcpaText = Number.isFinite(proximityTcpa) ? ' TCPA ' + proximityTcpa.toFixed(1) + ' min' : '';
        const targetName = proximityTarget.nombre || proximityTarget.name || proximityTarget.mmsi || 'AIS';
        console.log('[AIS SHIELD ALERT]', {
          id: proximityTarget.mmsi ?? proximityTarget.id ?? 'AIS',
          alertLevel: riskLevel === 'CRITICAL' || thresholdExceeded ? 'critical' : 'warning',
          reason: hasRiskLevel
            ? `riskLevel=${riskLevel}`
            : `CPA ${proximityCpa} < ${thresholds.minCPA}`,
          addedToAlarmStatus: true
        });
        addAlarm(
          'ais_collision',
          'critical',
          'PELIGRO COLISION: ' + targetName + '.' + tcpaText,
          proximityCpa ?? 0
        );
      } else {
        console.log('[AIS SHIELD NO ALERT]', {
          reason: proximityTarget
            ? `CPA ${String(proximityCpa)} no supera ${thresholds.minCPA} y riskLevel=${String(riskLevel ?? 'SAFE')}`
            : 'No hay targets con CPA válido'
        });
        removeAlarmByType('ais_collision');
      }

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
  }, [depth, engineData, aisTargets, thresholds, isTravesiaActive, isEngineOn, sensorQuality, anchorWatch, ownShipPosition, ownShipSog, ownShipCog, addAlarm, removeAlarmByType]);

  return {
    alarms, alarmHistory, thresholds, setThresholds, 
    isAlertMuted, setIsAlertMuted, removeAlarm, removeAlarmByType, addAlarm
  };
};
