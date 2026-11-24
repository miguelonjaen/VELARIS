import { app } from './application';
import { AutomaticJournal } from './core/voyage/AutomaticJournal';
import { getTripLogger } from './lib/tripLogger';
import { useState, useEffect, useCallback, useRef } from 'react';
import { SupabaseClient } from '@supabase/supabase-js';
import { UserProfile, ShipData, GAULOSAlarm, AlarmSeverity, SecurityThresholds } from '@/shared/types';
import { SensorQualityMap } from './lib/sensorQuality';
import { evaluateAisCollisionAlarm, DEFAULT_AIS_ALARM_OPTIONS } from '@/core/navigation/AisCollisionAlarm';
import {
  AlarmTransitionTracker,
  isTacticalAlarmType,
  DEFAULT_BOAT_ALARM_THRESHOLDS,
  evaluateBoatAlarms,
  type MeasuredBoatSensors
} from '@/core/alerts/boatAlarms';

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
  /**
   * Lecturas medidas por los instrumentos del barco, leídas en cada ciclo del watchdog. Si se
   * indica, profundidad, motor, combustible, aceite, batería y agua se vigilan SOLO con estas
   * lecturas (sin sensor = sin alarma) en lugar de `depth`/`engineData`, que pueden ser simulados.
   */
  getMeasuredSensors?: () => MeasuredBoatSensors;
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
  anchorWatch,
  getMeasuredSensors
}: SmartShieldProps) => {
  const [alarms, setAlarms] = useState<GAULOSAlarm[]>([]);
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

  // Estado operativo por tipo: decide qué se registra en bitácora (activación, cambio de
  // severidad y resolución), nunca una entrada por ciclo mientras la alarma sigue igual.
  const transitionsRef = useRef(new AlarmTransitionTracker<GAULOSAlarm['type']>());
  const lastMessageRef = useRef(new Map<GAULOSAlarm['type'], { message: string; severity: AlarmSeverity; value: number }>());

  // Registro persistente en la bitácora existente (Supabase), mismo mecanismo que ya usaban las alarmas.
  const pendingAlarmLogs = useRef(new Map<string, import('./shared/types').LogEntry>());
  const retryAlarmLogs = useCallback(async () => {
    for (const [id, entry] of pendingAlarmLogs.current) {
      await getTripLogger().appendAutomaticEntry(entry);
      pendingAlarmLogs.current.delete(id);
    }
  }, []);
  const persistAlarmLog = useCallback(async (titulo: string, descripcion: string) => {
    if (!userProfile || !selectedShipId) return;
    const now = Date.now();
    const entry = new AutomaticJournal(selectedShipId, userProfile.id).entry(
      app.navigationState.snapshot(now), now, titulo, descripcion, 'Seguridad');
    pendingAlarmLogs.current.set(String(entry.id), entry);
    try { await retryAlarmLogs(); }
    catch (error: unknown) { console.error('[BITACORA] Alarma pendiente de guardado local', error); }
  }, [userProfile, selectedShipId, retryAlarmLogs]);
  useEffect(() => {
    const timer = window.setInterval(() => { void retryAlarmLogs().catch((error: unknown) => console.error('[BITACORA] Reintento local de alarmas', error)); }, 5000);
    return () => window.clearInterval(timer);
  }, [retryAlarmLogs]);

  const removeAlarm = useCallback((id: string) => {
    setAlarms(prev => {
      const dismissed = prev.find(a => a.id === id);
      // Descartada por el usuario: si la condición persiste se volverá a activar y registrar.
      if (dismissed) transitionsRef.current.forget(dismissed.type);
      return prev.filter(a => a.id !== id);
    });
  }, []);

  const removeAlarmByType = useCallback((type: GAULOSAlarm['type']) => {
    if (isTacticalAlarmType(type)) {
      transitionsRef.current.forget(type);
      lastMessageRef.current.delete(type);
      setAlarms(prev => prev.some(a => a.type === type) ? prev.filter(a => a.type !== type) : prev);
      return; // Do not invent a safety-resolution entry for a tactical indicator.
    }
    if (transitionsRef.current.update(type, null) === 'RESOLVED') {
      const last = lastMessageRef.current.get(type);
      lastMessageRef.current.delete(type);
      const hora = new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
      void persistAlarmLog(
        `ALARMA ${type.toUpperCase()} RESUELTA`,
        `Condición normalizada a las ${hora}.${last ? ` Última alarma (${last.severity}): ${last.message} | Valor: ${last.value}` : ''}`
      );
    }
    setAlarms(prev => prev.some(a => a.type === type) ? prev.filter(a => a.type !== type) : prev);
  }, [persistAlarmLog]);

  const addAlarm = useCallback(async (type: GAULOSAlarm['type'], severity: AlarmSeverity, message: string, value: number) => {
    if (isTacticalAlarmType(type)) return;
    const existing = alarms.find(a => a.type === type);
    if (existing && existing.severity === severity) return;
    const transition = transitionsRef.current.update(type, severity);
    lastMessageRef.current.set(type, { message, severity, value });

    // Registro persistente (Evitando redundancia: solo activación o cambio de severidad)
    if (transition) {
      await persistAlarmLog(
        `ALARMA ${type.toUpperCase()}`,
        `${message} | Valor: ${value} | Severidad: ${severity}${transition === 'SEVERITY_CHANGED' ? ' (cambio de severidad)' : ''}`
      );
    }

    setAlarms(prev => [{
      id: crypto.randomUUID(), type, severity, message, timestamp: Date.now(), value
    }, ...prev.filter(a => a.type !== type)].slice(0, 8));
  }, [alarms, persistAlarmLog]);

  // Clear legacy live state on upgrade without modifying historical log records.
  useEffect(() => { removeAlarmByType('layline_deviation'); }, [removeAlarmByType]);

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
        ? evaluateAisCollisionAlarm(aisTargets, { ...DEFAULT_AIS_ALARM_OPTIONS, minCpaNm: thresholds.minCPA, maxTcpaMinutes: thresholds.maxAisTcpaMinutes ?? DEFAULT_AIS_ALARM_OPTIONS.maxTcpaMinutes })
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
        // Absence of an AIS alarm does not establish recovery.
        transitionsRef.current.forget('ais_collision');
        lastMessageRef.current.delete('ais_collision');

        setAlarms(prev =>
          prev.filter(alarm => alarm.type !== 'ais_collision')
        );
      }

      if (getMeasuredSensors) {
        // Sistemas del barco con lecturas medidas: se vigilan siempre que haya sensor, también
        // fuera de travesía (una sentina, batería o temperatura no esperan a que se inicie).
        const evaluations = evaluateBoatAlarms(getMeasuredSensors(), {
          ...DEFAULT_BOAT_ALARM_THRESHOLDS,
          minDepth: thresholds.minDepth,
          maxEngineTemp: thresholds.maxEngineTemp,
          minFuel: thresholds.minFuel
        });
        const evaluated = new Set<string>();
        for (const evaluation of evaluations) {
          evaluated.add(evaluation.type);
          if (evaluation.severity) addAlarm(evaluation.type, evaluation.severity, evaluation.message, evaluation.value);
          else removeAlarmByType(evaluation.type);
        }
        // Sensor desaparecido o caducado: la alarma visible no se mantiene con un dato que ya no
        // existe ni se registra como resuelta (no se sabe); la pérdida se registra como señal perdida.
        for (const type of ['depth', 'engine_temp', 'oil_pressure', 'battery_low', 'fuel', 'water_low'] as const) {
          if (!evaluated.has(type) && transitionsRef.current.isActive(type)) {
            transitionsRef.current.forget(type);
            lastMessageRef.current.delete(type);
            setAlarms(prev => prev.filter(a => a.type !== type));
          }
        }
      }

      if (!isTravesiaActive && !isEngineOn) return;

      if (getMeasuredSensors) {
        // Profundidad/motor/combustible ya evaluados arriba con lecturas medidas.
      } else if (depth < thresholds.minDepth) {
        addAlarm('depth', 'critical', 'CALADO CRITICO: ' + depth.toFixed(1) + 'm', depth);
      } else { removeAlarmByType('depth'); }

      if (getMeasuredSensors) {
        // Evaluado con lecturas medidas.
      } else if (engineData.temp > thresholds.maxEngineTemp) {
        addAlarm('engine_temp', 'critical', 'SOBRECALENTAMIENTO: ' + engineData.temp + 'C', engineData.temp);
      } else { removeAlarmByType('engine_temp'); }

      if (getMeasuredSensors) {
        // Evaluado con lecturas medidas.
      } else if (engineData.fuel < thresholds.minFuel) {
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
  }, [depth, engineData, aisTargets, alarms, thresholds, isTravesiaActive, isEngineOn, sensorQuality, anchorWatch, ownShipPosition, ownShipSog, ownShipCog, addAlarm, removeAlarmByType, getMeasuredSensors]);

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
