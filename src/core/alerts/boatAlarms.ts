/**
 * Alarmas de sistemas del barco basadas EXCLUSIVAMENTE en lecturas medidas por instrumentos
 * (BoatInstrumentStore, fuente BOAT y dentro de su caducidad). Si un sensor no existe o su
 * lectura ha caducado, la alarma correspondiente no se evalúa: nunca se dispara (ni se da por
 * resuelta con un valor inventado) a partir de valores por defecto o simulados.
 *
 * AlarmTransitionTracker decide cuándo una alarma debe registrarse en la bitácora: al activarse,
 * al cambiar de severidad y al resolverse; nunca en cada ciclo mientras siga igual.
 */

export type BoatAlarmType = "depth" | "engine_temp" | "oil_pressure" | "battery_low" | "fuel" | "water_low";
export type BoatAlarmSeverity = "warning" | "critical";

/** Lecturas medidas vigentes; null = sin sensor o lectura caducada. */
export interface MeasuredBoatSensors {
    readonly depthM: number | null;
    readonly engineTempC: number | null;
    readonly engineRpm: number | null;
    readonly oilPressureBar: number | null;
    /** Tensión de la batería más baja disponible (arranque o servicio), voltios. */
    readonly batteryVolts: number | null;
    readonly fuelPercent: number | null;
    readonly freshWaterPercent: number | null;
}

export interface BoatAlarmThresholds {
    readonly minDepth: number;
    readonly maxEngineTemp: number;
    readonly minFuel: number;
    /** Presión mínima con el motor girando (bar). */
    readonly minOilPressureBar: number;
    /** RPM por encima de las cuales se considera que el motor gira (para la presión de aceite). */
    readonly engineRunningRpm: number;
    /** Umbrales para un sistema de 12 V; en 24 V se duplican. */
    readonly lowBattery12V: number;
    readonly criticalBattery12V: number;
    readonly minFreshWater: number;
}

export const DEFAULT_BOAT_ALARM_THRESHOLDS: BoatAlarmThresholds = {
    minDepth: 2.5,
    maxEngineTemp: 90,
    minFuel: 15,
    minOilPressureBar: 1.0,
    engineRunningRpm: 400,
    lowBattery12V: 12.0,
    criticalBattery12V: 11.5,
    minFreshWater: 15
};

/** Resultado de evaluar una alarma con dato medido: activa (severity) o inactiva (null). */
export interface BoatAlarmEvaluation {
    readonly type: BoatAlarmType;
    readonly severity: BoatAlarmSeverity | null;
    readonly message: string;
    readonly value: number;
}

const finite = (value: number | null | undefined): value is number => typeof value === "number" && Number.isFinite(value);

/**
 * Evalúa solo las alarmas cuyo sensor tiene lectura vigente. Las que no aparecen en el resultado
 * no tienen dato: su estado no cambia por falta de datos (la pérdida de instrumentos se registra aparte).
 */
export function evaluateBoatAlarms(
    sensors: MeasuredBoatSensors,
    thresholds: BoatAlarmThresholds = DEFAULT_BOAT_ALARM_THRESHOLDS
): BoatAlarmEvaluation[] {
    const out: BoatAlarmEvaluation[] = [];
    if (finite(sensors.depthM)) {
        out.push({
            type: "depth",
            severity: sensors.depthM < thresholds.minDepth ? "critical" : null,
            message: `CALADO CRITICO: ${sensors.depthM.toFixed(1)} m (mínimo ${thresholds.minDepth} m)`,
            value: sensors.depthM
        });
    }
    if (finite(sensors.engineTempC)) {
        out.push({
            type: "engine_temp",
            severity: sensors.engineTempC > thresholds.maxEngineTemp ? "critical" : null,
            message: `SOBRECALENTAMIENTO MOTOR: ${sensors.engineTempC.toFixed(0)} °C (máximo ${thresholds.maxEngineTemp} °C)`,
            value: sensors.engineTempC
        });
    }
    // La presión de aceite baja solo es alarma con el motor girando (confirmado por RPM medidas).
    if (finite(sensors.oilPressureBar) && finite(sensors.engineRpm)) {
        const running = sensors.engineRpm >= thresholds.engineRunningRpm;
        out.push({
            type: "oil_pressure",
            severity: running && sensors.oilPressureBar < thresholds.minOilPressureBar ? "critical" : null,
            message: `PRESION DE ACEITE BAJA: ${sensors.oilPressureBar.toFixed(1)} bar a ${sensors.engineRpm.toFixed(0)} rpm`,
            value: sensors.oilPressureBar
        });
    }
    if (finite(sensors.batteryVolts)) {
        const scale = sensors.batteryVolts > 18 ? 2 : 1; // 24 V
        const v = sensors.batteryVolts;
        const severity = v < thresholds.criticalBattery12V * scale ? "critical" : v < thresholds.lowBattery12V * scale ? "warning" : null;
        out.push({ type: "battery_low", severity, message: `TENSION DE BATERIA BAJA: ${v.toFixed(2)} V`, value: v });
    }
    if (finite(sensors.fuelPercent)) {
        const f = sensors.fuelPercent;
        out.push({
            type: "fuel",
            severity: f < thresholds.minFuel ? (f < 5 ? "critical" : "warning") : null,
            message: `COMBUSTIBLE BAJO: ${f.toFixed(0)} %`,
            value: f
        });
    }
    if (finite(sensors.freshWaterPercent)) {
        const w = sensors.freshWaterPercent;
        out.push({
            type: "water_low",
            severity: w < thresholds.minFreshWater ? "warning" : null,
            message: `AGUA DULCE BAJA: ${w.toFixed(0)} %`,
            value: w
        });
    }
    return out;
}

export type AlarmTransition = "ACTIVATED" | "SEVERITY_CHANGED" | "RESOLVED";

/** Estado operativo por tipo de alarma para registrar solo las transiciones. */
export class AlarmTransitionTracker<T extends string = string> {
    private readonly active = new Map<T, string>();

    /** severity null = condición desaparecida. Devuelve la transición o null si nada cambia. */
    update(type: T, severity: string | null): AlarmTransition | null {
        const previous = this.active.get(type);
        if (severity === null) {
            if (previous === undefined) return null;
            this.active.delete(type);
            return "RESOLVED";
        }
        if (previous === severity) return null;
        this.active.set(type, severity);
        return previous === undefined ? "ACTIVATED" : "SEVERITY_CHANGED";
    }

    /** Olvida una alarma sin registrar resolución (p. ej. descartada por el usuario). */
    forget(type: T): void {
        this.active.delete(type);
    }

    isActive(type: T): boolean {
        return this.active.has(type);
    }
}

/** Legacy tactical IDs cannot enter the safety/toast/sound/journal channel. */
export function isTacticalAlarmType(type: string): boolean {
    return type.toLowerCase() === 'layline_deviation';
}
