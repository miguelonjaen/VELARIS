/**
 * Lecturas de los instrumentos del barco que no forman parte del estado de navegación compartido:
 * profundidad, viento medido, motor, baterías y depósitos. Solo se alimenta con mensajes de
 * procedencia BOAT (puerto serie o TCP declarado como instrumentos del barco): nunca con el
 * simulador «solo visual», el teléfono ni la meteorología (Open-Meteo).
 *
 * Cada lectura conserva su hora de recepción y caduca por separado. Sin lectura vigente el campo
 * es null: nunca se rellena con 0 ni con un valor por defecto.
 *
 * Caducidades: profundidad y viento = sensorQuality (8 s); RPM 10 s; XDR (temperaturas,
 * presiones, tensiones, depósitos) 15 s, pendiente de acuerdo definitivo por sensor.
 *
 * XDR: solo se interpretan nombres reconocibles (no se adivina):
 *  - C (°C) con ENGINE/ENG/MOTOR → temperatura del motor n (n = dígitos del nombre, 0 si no hay).
 *  - T (R) con ENGINE → RPM del motor n (si no llega $--RPM).
 *  - P (B bar o P pascal) con OIL/ACEITE → presión de aceite del motor n, en bar.
 *  - U (V) con BATT/BAT/BATERIA → tensión de esa batería; ALT/ALTERNATOR → tensión de carga.
 *  - I (A) con BATT… → corriente de esa batería (+ carga, − descarga).
 *  - V o E (P %) con FUEL/GASOIL/DIESEL, FRESH/WATER/AGUA, GREY/GRAY/GRISES, BLACK/WASTE/NEGRAS.
 */

import type { TelemetryMessage, TransducerReading } from "../types/TelemetryMessage";

export const INSTRUMENT_MAX_AGE_MS = {
    depth: 8_000,
    wind: 8_000,
    rpm: 10_000,
    transducer: 15_000
} as const;

interface Timed<T> {
    readonly value: T;
    readonly receivedAt: number;
}

export interface AgedValue<T> {
    readonly value: T;
    readonly ageMs: number;
}

export type DepthReference = "keel" | "surface" | "transducer";
export type TankKind = "fuel" | "freshWater" | "greyWater" | "blackWater";
export type BatteryRole = "start" | "service" | "unknown";

export interface EngineReadings {
    readonly engine: number;
    readonly rpm: AgedValue<number> | null;
    readonly temperatureC: AgedValue<number> | null;
    readonly oilPressureBar: AgedValue<number> | null;
}

export interface BatteryReadings {
    readonly socPercent?: AgedValue<number> | null;
    readonly name: string;
    readonly role: BatteryRole;
    readonly volts: AgedValue<number> | null;
    readonly amps: AgedValue<number> | null;
}

export interface TankReading {
    readonly kind: TankKind;
    readonly name: string;
    readonly percent: AgedValue<number>;
}

/** Local GAULOS XDR contract v1; relay feedback does not prove light emission. */
export const LIGHT_CIRCUITS = {
    LIGHT_NAV_RELAY: 'Navegación · agrupada',
    LIGHT_PORT_RELAY: 'Costado babor',
    LIGHT_STARBOARD_RELAY: 'Costado estribor',
    LIGHT_STERN_RELAY: 'Alcance',
    LIGHT_MASTHEAD_RELAY: 'Tope',
    LIGHT_TRICOLOR_RELAY: 'Tricolor',
    LIGHT_ANCHOR_RELAY: 'Fondeo',
    LIGHT_DECK_RELAY: 'Cubierta',
    LIGHT_CABIN_RELAY: 'Interior'
} as const;
export type LightCircuit = keyof typeof LIGHT_CIRCUITS;
export interface LightReading {
    readonly circuit: LightCircuit;
    readonly relay: AgedValue<0 | 1> | null;
}
export interface SolarReadings {
    readonly pvVolts: AgedValue<number> | null;
    readonly pvAmps: AgedValue<number> | null;
    readonly outputVolts: AgedValue<number> | null;
    readonly outputAmps: AgedValue<number> | null;
}
const SOLAR_SENSORS = ['SOLAR0_PV', 'SOLAR0_OUT'] as const;

export interface BoatInstrumentSnapshot {
    /** Optional for compatibility with older consumers/fixtures. */
    readonly solar?: SolarReadings;
    readonly lights?: readonly LightReading[];
    readonly speedThroughWater?: AgedValue<number> | null;
    readonly depth: AgedValue<{ meters: number; reference: DepthReference | null }> | null;
    /** Viento aparente medido: ángulo relativo a proa (0..360) y velocidad en nudos. */
    readonly windApparent: AgedValue<{ angleDeg: number; speedKn: number }> | null;
    /** Viento real/teórico medido (MWV con referencia T): ángulo relativo a proa y nudos. */
    readonly windTrue: AgedValue<{ angleDeg: number; speedKn: number }> | null;
    readonly windDirectionTrue?: AgedValue<{ directionDeg: number; speedKn: number }> | null;
    readonly engines: readonly EngineReadings[];
    readonly alternatorAmps?: AgedValue<number> | null;
    readonly alternatorCurrentSource?: 'measured' | 'simulated-from-rpm';
    readonly alternatorVolts: AgedValue<number> | null;
    readonly batteries: readonly BatteryReadings[];
    readonly tanks: readonly TankReading[];
}

const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);

function engineIndex(name: string): number {
    // ENGINE#n usa índice desde cero (Simulator X / gateways); RPM numera desde uno.
    // Solo normalizar esta convención explícita, nunca deduplicar por valor de RPM.
    const indexed = name.match(/^ENGINE#(\d+)(?:_|$)/i);
    if (indexed) return Math.min(99, parseInt(indexed[1], 10)) + 1;
    const digits = name.match(/(\d+)/);
    return digits ? Math.min(99, parseInt(digits[1], 10)) : 0;
}

function tankKind(name: string): TankKind | null {
    const n = name.toUpperCase();
    if (/FUEL|GASOIL|DIESEL|COMBUST/.test(n)) return "fuel";
    if (/GREY|GRAY|GRISES/.test(n)) return "greyWater";
    if (/BLACK|WASTE|NEGRAS/.test(n)) return "blackWater";
    if (/FRESH|WATER|AGUA/.test(n)) return "freshWater";
    return null;
}

function batteryRole(name: string): BatteryRole {
    const n = name.toUpperCase();
    if (/START|ARRANQ|ENGINE|MOTOR/.test(n)) return "start";
    if (/HOUSE|SERVICE|SERVICIO|DOMEST/.test(n)) return "service";
    return "unknown";
}

export class BoatInstrumentStore {
    private readonly solarVolts = new Map<string, Timed<number>>();
    private readonly solarAmps = new Map<string, Timed<number>>();
    private readonly lightRelays = new Map<LightCircuit, Timed<0 | 1>>();
    private speedThroughWater: Timed<number> | null = null;
    private depth: Timed<{ meters: number; reference: DepthReference | null }> | null = null;
    private windApparent: Timed<{ angleDeg: number; speedKn: number }> | null = null;
    private windTrue: Timed<{ angleDeg: number; speedKn: number }> | null = null;
    private windDirectionTrue: Timed<{ directionDeg: number; speedKn: number }> | null = null;
    private readonly engineRpm = new Map<number, Timed<number>>();
    private readonly engineRpmFromXdr = new Map<number, Timed<number>>();
    private readonly engineTemp = new Map<number, Timed<number>>();
    private readonly oilPressure = new Map<number, Timed<number>>();
    private alternator: Timed<number> | null = null;
    private alternatorCurrent: Timed<{ amps: number; source: 'measured' | 'simulated-from-rpm' }> | null = null;
    private readonly batterySoc = new Map<string, Timed<number>>();
    private readonly batteryVolts = new Map<string, Timed<number>>();
    private readonly batteryAmps = new Map<string, Timed<number>>();
    private readonly tanks = new Map<string, Timed<{ kind: TankKind; percent: number }>>();

    constructor(private readonly clock: () => number = Date.now) {}

    /** Olvida todas las lecturas (cambio de conexión NMEA). */
    public clear(): void {
        this.speedThroughWater = null;
        this.depth = null;
        this.windApparent = null;
        this.windTrue = null;
        this.windDirectionTrue = null;
        for (const map of [this.engineRpm, this.engineRpmFromXdr, this.engineTemp, this.oilPressure,
            this.batteryVolts, this.batteryAmps, this.tanks]) map.clear();
        this.alternator = null;
        this.clearElectricalFeedback();
    }

    /** Clear local electrical feedback on loss/change of the BOAT connection. */
    public clearElectricalFeedback(): void {
        this.alternatorCurrent = null;
        this.batterySoc.clear();
        this.solarVolts.clear();
        this.solarAmps.clear();
        this.lightRelays.clear();
    }

    /** Registra un mensaje de los instrumentos del barco. Devuelve true si aportó alguna lectura. */
    public ingest(message: TelemetryMessage, receivedAt: number = this.clock()): boolean {
        switch (message.type) {
            case "WATER_SPEED": {
                if (!finite(message.knots) || message.knots < 0 || message.knots > 200) return false;
                this.speedThroughWater = { value: message.knots, receivedAt }; return true;
            }
            case "DEPTH": {
                if (!finite(message.depth) || message.depth < 0 || message.depth > 11_000) return false;
                const reference = message.reference === "keel" || message.reference === "surface" || message.reference === "transducer"
                    ? message.reference : null;
                this.depth = { value: { meters: message.depth, reference }, receivedAt };
                return true;
            }
            case "WIND": {
                if (!finite(message.speed) || message.speed < 0 || message.speed > 200
                    || !finite(message.angle) || message.angle < 0 || message.angle > 360) return false;
                if (message.angleReference === "trueNorth") {
                    this.windDirectionTrue = { value: { directionDeg: message.angle % 360, speedKn: message.speed }, receivedAt };
                    return true;
                }
                const value = { angleDeg: message.angle % 360, speedKn: message.speed };
                if (message.reference === "true") this.windTrue = { value, receivedAt };
                else this.windApparent = { value, receivedAt };
                return true;
            }
            case "ENGINE_RPM": {
                if (message.source !== "engine" || !finite(message.rpm) || Math.abs(message.rpm) > 20_000) return false;
                this.engineRpm.set(message.engine, { value: message.rpm, receivedAt });
                return true;
            }
            case "TRANSDUCER":
                return message.readings.map((reading) => this.ingestTransducer(reading, receivedAt)).some(Boolean);
            default:
                return false;
        }
    }

    private ingestTransducer(reading: TransducerReading, receivedAt: number): boolean {
        const name = reading.name.toUpperCase();
        const { kind, unit, value } = reading;
        if (!finite(value)) return false;

        // Exact IDs keep arbitrary XDR names from creating unbounded sensor maps.
        if (SOLAR_SENSORS.some(sensor => sensor === reading.name)) {
            const isInput = reading.name === 'SOLAR0_PV';
            if (kind === 'U' && unit === 'V' && value >= 0 && value <= (isInput ? 250 : 100)) {
                this.solarVolts.set(reading.name, { value, receivedAt });
                return true;
            }
            if (kind === 'I' && unit === 'A' && value >= 0 && value <= 200) {
                this.solarAmps.set(reading.name, { value, receivedAt });
                return true;
            }
            return false;
        }
        if (Object.prototype.hasOwnProperty.call(LIGHT_CIRCUITS, reading.name)) {
            if (kind !== 'S' || unit !== '' || (value !== 0 && value !== 1)) return false;
            this.lightRelays.set(reading.name as LightCircuit, { value, receivedAt });
            return true;
        }

        if (kind === "C" && unit === "C" && /ENGINE|ENG|MOTOR/.test(name)) {
            if (value < -40 || value > 200) return false;
            this.engineTemp.set(engineIndex(name), { value, receivedAt });
            return true;
        }
        if (kind === "T" && unit === "R" && /ENGINE|ENG|MOTOR/.test(name)) {
            if (Math.abs(value) > 20_000) return false;
            this.engineRpmFromXdr.set(engineIndex(name), { value, receivedAt });
            return true;
        }
        if (kind === "P" && (unit === "B" || unit === "P") && /OIL|ACEITE/.test(name)) {
            const bar = unit === "P" ? value / 100_000 : value;
            if (bar < 0 || bar > 20) return false;
            this.oilPressure.set(engineIndex(name), { value: bar, receivedAt });
            return true;
        }
        // ALT_ENGINE1_SIM explicitly declares a nominal simulation current, not a measurement.
        if (kind === 'I' && unit === 'A' && ['ALT', 'ALTERNATOR', 'ALT_ENGINE1_SIM'].includes(reading.name)) {
            if (value < 0 || value > 500) return false;
            this.alternatorCurrent = { value: { amps: value,
                source: reading.name === 'ALT_ENGINE1_SIM' ? 'simulated-from-rpm' : 'measured' }, receivedAt };
            return true;
        }
        if (kind === "U" && unit === "V" && /ALT/.test(name)) {
            if (value < 0 || value > 60) return false;
            this.alternator = { value, receivedAt };
            return true;
        }
        // Local GAULOS SOC contract: exact sensor IDs, percent 0..100.
        if (kind === 'E' && unit === 'P' && (reading.name === 'BAT_START_SOC' || reading.name === 'BAT_HOUSE_SOC')) {
            if (value < 0 || value > 100) return false;
            this.batterySoc.set(reading.name.slice(0, -4), { value, receivedAt });
            return true;
        }
        if (kind === "U" && unit === "V" && /BAT/.test(name)) {
            if (value < 0 || value > 60) return false;
            this.batteryVolts.set(reading.name, { value, receivedAt });
            return true;
        }
        if (kind === "I" && unit === "A" && /BAT/.test(name)) {
            if (Math.abs(value) > 2_000) return false;
            this.batteryAmps.set(reading.name, { value, receivedAt });
            return true;
        }
        if ((kind === "V" || kind === "E") && unit === "P") {
            const tank = tankKind(name);
            if (!tank || value < 0 || value > 100) return false;
            this.tanks.set(reading.name, { value: { kind: tank, percent: value }, receivedAt });
            return true;
        }
        return false;
    }

    public engineRunning(now: number = this.clock()): boolean | null {
        const engines = this.snapshot(now).engines;
        const running = measuredEngineRunning(engines);
        if (running === true) return true;
        const known = new Set([...this.engineRpm.keys(), ...this.engineRpmFromXdr.keys(),
            ...this.engineTemp.keys(), ...this.oilPressure.keys()]);
        // Un motor conocido sin RPM vigentes impide confirmar que todos están parados.
        return engines.length === known.size ? running : null;
    }

    public snapshot(now: number = this.clock()): BoatInstrumentSnapshot {
        const aged = <T>(timed: Timed<T> | null | undefined, maxAgeMs: number): AgedValue<T> | null => {
            if (!timed) return null;
            const ageMs = Math.max(0, now - timed.receivedAt);
            return ageMs <= maxAgeMs ? { value: timed.value, ageMs } : null;
        };
        const engineIds = new Set<number>([
            ...this.engineRpm.keys(), ...this.engineRpmFromXdr.keys(), ...this.engineTemp.keys(), ...this.oilPressure.keys()
        ]);
        const engines: EngineReadings[] = [...engineIds].sort((a, b) => a - b).map((engine) => ({
            engine,
            rpm: aged(this.engineRpm.get(engine), INSTRUMENT_MAX_AGE_MS.rpm)
                ?? aged(this.engineRpmFromXdr.get(engine), INSTRUMENT_MAX_AGE_MS.transducer),
            temperatureC: aged(this.engineTemp.get(engine), INSTRUMENT_MAX_AGE_MS.transducer),
            oilPressureBar: aged(this.oilPressure.get(engine), INSTRUMENT_MAX_AGE_MS.transducer)
        })).filter((e) => e.rpm || e.temperatureC || e.oilPressureBar);

        const batteryNames = new Set<string>([...this.batteryVolts.keys(), ...this.batteryAmps.keys(), ...this.batterySoc.keys()]);
        const batteries: BatteryReadings[] = [...batteryNames].sort().map((name) => ({
            name,
            role: batteryRole(name),
            ...(this.batterySoc.has(name) ? { socPercent: aged(this.batterySoc.get(name), INSTRUMENT_MAX_AGE_MS.transducer) } : {}),
            volts: aged(this.batteryVolts.get(name), INSTRUMENT_MAX_AGE_MS.transducer),
            amps: aged(this.batteryAmps.get(name), INSTRUMENT_MAX_AGE_MS.transducer)
        })).filter((b) => b.volts || b.amps || b.socPercent);

        const tanks: TankReading[] = [];
        for (const [name, timed] of [...this.tanks.entries()].sort(([a], [b]) => a.localeCompare(b))) {
            const value = aged(timed, INSTRUMENT_MAX_AGE_MS.transducer);
            if (value) tanks.push({ kind: value.value.kind, name, percent: { value: value.value.percent, ageMs: value.ageMs } });
        }

        const current = aged(this.alternatorCurrent, INSTRUMENT_MAX_AGE_MS.transducer);
        const engineRpm = engines.find(engine => engine.engine === 1)?.rpm ?? null;
        const alternatorAmps = current === null ? null
            : current.value.source === 'measured' ? { value: current.value.amps, ageMs: current.ageMs }
            : engineRpm === null ? null
            : { value: Math.abs(engineRpm.value) > 0 ? current.value.amps : 0, ageMs: Math.max(current.ageMs, engineRpm.ageMs) };
        return {
            ...(this.alternatorCurrent ? { alternatorAmps, alternatorCurrentSource: this.alternatorCurrent.value.source } : {}),
            ...(this.solarVolts.size || this.solarAmps.size ? { solar: {
                pvVolts: aged(this.solarVolts.get('SOLAR0_PV'), INSTRUMENT_MAX_AGE_MS.transducer),
                pvAmps: aged(this.solarAmps.get('SOLAR0_PV'), INSTRUMENT_MAX_AGE_MS.transducer),
                outputVolts: aged(this.solarVolts.get('SOLAR0_OUT'), INSTRUMENT_MAX_AGE_MS.transducer),
                outputAmps: aged(this.solarAmps.get('SOLAR0_OUT'), INSTRUMENT_MAX_AGE_MS.transducer)
            } } : {}),
            ...(this.lightRelays.size ? { lights: [...this.lightRelays].map(([circuit, reading]) => ({
                circuit, relay: aged(reading, INSTRUMENT_MAX_AGE_MS.transducer)
            })) } : {}),
            speedThroughWater: aged(this.speedThroughWater, INSTRUMENT_MAX_AGE_MS.wind),
            depth: aged(this.depth, INSTRUMENT_MAX_AGE_MS.depth),
            windApparent: aged(this.windApparent, INSTRUMENT_MAX_AGE_MS.wind),
            windTrue: aged(this.windTrue, INSTRUMENT_MAX_AGE_MS.wind),
            windDirectionTrue: aged(this.windDirectionTrue, INSTRUMENT_MAX_AGE_MS.wind),
            engines,
            alternatorVolts: aged(this.alternator, INSTRUMENT_MAX_AGE_MS.transducer),
            batteries,
            tanks
        };
    }
}

/** Cualquier motor girando prevalece. Parados solo si todos tienen RPM vigentes a cero. */
export function measuredEngineRunning(engines: readonly EngineReadings[]): boolean | null {
    if (engines.some(engine => engine.rpm !== null && Math.abs(engine.rpm.value) > 0)) return true;
    if (engines.length > 0 && engines.every(engine => engine.rpm?.value === 0)) return false;
    return null;
}
