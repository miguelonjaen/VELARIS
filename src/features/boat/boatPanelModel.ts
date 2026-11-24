import { batteryPower, currentValue, relayLabel } from './boatVisualModel';
import { LIGHT_CIRCUITS } from '../../core/instruments/BoatInstrumentStore';
import { resolveWind } from '../../core/instruments/resolveWind';
import { measuredEngineRunning } from '../../core/instruments/BoatInstrumentStore';
/**
 * Modelo de presentación del panel «Barco». Función pura: recibe el estado de navegación
 * compartido, las lecturas de instrumentos del barco y el estado de travesía/alarmas/AIS, y
 * devuelve filas ya formateadas. Nunca rellena un dato ausente: si no hay sensor o la lectura
 * ha caducado, la fila lo dice («Sin sensor», «Sin datos», «Desconocido», «No soportado»).
 */
import type { BoatInstrumentSnapshot, DepthReference, TankKind } from "@/core/instruments/BoatInstrumentStore";
import type { NavigationSource, ResolvedNavigationState } from "@/core/navigation/SharedNavigationState";

export type BoatRowStatus = "ok" | "missing" | "warning" | "critical" | "info";

export interface BoatPanelRow {
    readonly label: string;
    readonly value: string;
    readonly status: BoatRowStatus;
    /** Procedencia de la lectura (p. ej. «Instrumentos del barco»), si aplica. */
    readonly source?: string;
    /** Antigüedad legible («hace 3 s»), si aplica. */
    readonly age?: string;
}

export interface BoatPanelSection {
    readonly id: "navigation" | "engine" | "tanks" | "electrical" | "safety";
    readonly title: string;
    readonly rows: readonly BoatPanelRow[];
}

export type VoyagePanelStatus = "active" | "not_started" | "no_signal" | "finished";

export interface BoatPanelAlarm {
    readonly type: string;
    readonly severity: "info" | "warning" | "critical" | string;
    readonly message: string;
}

export interface BoatPanelInput {
    readonly vesselId?: string | null;
    readonly now: number;
    readonly laylines?: { readonly available: boolean; readonly reason: string };
    readonly propulsion?: { readonly mode: "MOTOR" | "VELA"; readonly source: "RPM" | "manual" };
    readonly navigation: ResolvedNavigationState;
    readonly instruments: BoatInstrumentSnapshot;
    readonly voyage: { readonly status: VoyagePanelStatus; readonly autoStarted: boolean; readonly startedAt: number | null; readonly distanceNm?: number; readonly isTrial?: boolean; readonly trialState?: string };
    readonly alarms: readonly BoatPanelAlarm[];
    readonly ais: { readonly enabled: boolean; readonly targetCount: number; readonly dangerousCount: number };
    /** Estado de la conexión NMEA del Desktop, si se conoce. */
    readonly nmea?: { readonly connected: boolean; readonly declaredAs: "BOAT" | "SIMULATOR" | null; readonly lastLineAgeMs: number | null } | null;
}

export const NO_SENSOR = "Sin sensor";
export const NO_DATA = "Sin datos";
export const UNKNOWN = "Desconocido";
export const NOT_SUPPORTED = "No soportado";

/** Antigüedad legible; null si no hay lectura. */
export function formatAge(ageMs: number | null | undefined): string | undefined {
    if (typeof ageMs !== "number" || !Number.isFinite(ageMs) || ageMs < 0) return undefined;
    if (ageMs < 1000) return "ahora";
    const s = Math.round(ageMs / 1000);
    if (s < 60) return `hace ${s} s`;
    const m = Math.round(s / 60);
    if (m < 60) return `hace ${m} min`;
    return `hace ${Math.round(m / 60)} h`;
}

export const SOURCE_LABEL: Record<NavigationSource, string> = {
    BOAT: "Instrumentos del barco",
    DROID: "GPS del teléfono (Droid)",
    SIMULATOR: "Simulador visual"
} as Record<NavigationSource, string>;

const BOAT_SOURCE = "Instrumentos del barco";

const DEPTH_REFERENCE_LABEL: Record<DepthReference, string> = {
    keel: "bajo quilla",
    surface: "desde superficie",
    transducer: "bajo transductor"
};

const TANK_LABEL: Record<TankKind, string> = {
    fuel: "Combustible",
    freshWater: "Agua dulce",
    greyWater: "Aguas grises",
    blackWater: "Aguas negras"
};

const missing = (label: string, value: string = NO_SENSOR): BoatPanelRow => ({ label, value, status: "missing" });

function formatLatLng(lat: number, lng: number): string {
    const fmt = (v: number, pos: string, neg: string) => {
        const abs = Math.abs(v);
        const deg = Math.floor(abs);
        const min = (abs - deg) * 60;
        return `${deg}°${min.toFixed(3).padStart(6, "0")}' ${v >= 0 ? pos : neg}`;
    };
    return `${fmt(lat, "N", "S")}  ${fmt(lng, "E", "W")}`;
}

const pad3 = (deg: number) => `${Math.round(((deg % 360) + 360) % 360).toString().padStart(3, "0")}°`;

function navRow<T>(label: string, field: ResolvedNavigationState[keyof ResolvedNavigationState], format: (value: T) => string): BoatPanelRow {
    if (field.status !== "VALID" || field.value === null || field.source === null) return missing(label, NO_DATA);
    return {
        label,
        value: format(field.value as unknown as T),
        status: field.source === "SIMULATOR" ? "info" : "ok",
        source: SOURCE_LABEL[field.source],
        age: formatAge(field.ageMs)
    };
}

const VOYAGE_LABEL: Record<VoyagePanelStatus, string> = {
    active: "Activa",
    not_started: "Sin iniciar",
    no_signal: "Activa · sin señal de instrumentos",
    finished: "Finalizada"
};

function navigationSection(input: BoatPanelInput): BoatPanelSection {
    const { navigation: nav, instruments: ins, voyage } = input;
    const rows: BoatPanelRow[] = [];
    rows.push({
        label: "Travesía",
        value: voyage.isTrial
            ? `Ensayo de ruta · ${voyage.trialState === "paused" ? "pausado" : VOYAGE_LABEL[voyage.status]}`
            : VOYAGE_LABEL[voyage.status] + (voyage.status === "active" || voyage.status === "no_signal" ? (voyage.autoStarted ? " (automática)" : " (manual)") : ""),
        status: voyage.status === "no_signal" ? "warning" : voyage.status === "active" ? "ok" : "info"
    });
    if (voyage.status === "active" || voyage.status === "no_signal") {
        const distance = voyage.distanceNm;
        rows.push(typeof distance === "number" && Number.isFinite(distance) && distance >= 0
            ? { label: "Millas navegadas", value: `${distance.toFixed(2)} NM`, status: "ok", source: "Recorrido GPS de la travesía" }
            : missing("Millas navegadas", NO_DATA));
    }
    if (input.laylines) rows.push({ label: "Laylines", value: input.laylines.reason,
        status: input.laylines.available ? "ok" : "info" });
    const pos = nav.position;
    rows.push(pos.status === "VALID" && pos.source
        ? { label: "Fuente de navegación", value: SOURCE_LABEL[pos.source], status: pos.source === "SIMULATOR" ? "info" : "ok" }
        : missing("Fuente de navegación", "Sin posición válida"));
    rows.push(navRow<{ lat: number; lng: number }>("Posición", nav.position, (p) => formatLatLng(p.lat, p.lng)));
    rows.push(navRow<number>("SOG", nav.sog, (v) => `${v.toFixed(1)} kn`));
    rows.push(navRow<number>("COG", nav.cog, (v) => `${pad3(v)} T`));
    if (nav.headingTrue.status === "VALID") rows.push(navRow<number>("HDG", nav.headingTrue, (v) => `${pad3(v)} verdadero`));
    else if (nav.headingMagnetic.status === "VALID") rows.push(navRow<number>("HDG", nav.headingMagnetic, (v) => `${pad3(v)} magnético`));
    else rows.push(missing("HDG", NO_DATA));

    rows.push(ins.depth
        ? {
            label: "Profundidad",
            value: `${ins.depth.value.meters.toFixed(1)} m${ins.depth.value.reference ? ` ${DEPTH_REFERENCE_LABEL[ins.depth.value.reference]}` : " (referencia desconocida)"}`,
            status: "ok", source: BOAT_SOURCE, age: formatAge(ins.depth.ageMs)
        }
        : missing("Profundidad"));
    rows.push(ins.windApparent
        ? { label: "Viento aparente", value: `${ins.windApparent.value.speedKn.toFixed(1)} kn · ${pad3(ins.windApparent.value.angleDeg)} rel.`, status: "ok", source: BOAT_SOURCE, age: formatAge(ins.windApparent.ageMs) }
        : missing("Viento aparente"));
    const wind = resolveWind(ins, nav, null, input.now);
    rows.push(wind.tws !== null
        ? { label: "Viento real", value: `${wind.tws.toFixed(1)} kn${wind.twd !== null ? ` · ${pad3(wind.twd)} T` : wind.twa !== null ? ` · ${pad3(wind.twa)} rel.` : ""}`,
            status: "ok", source: BOAT_SOURCE, age: formatAge(wind.ageMs) }
        : missing("Viento real"));
    const running = measuredEngineRunning(ins.engines);
    const propulsion = input.propulsion ?? (running === null ? null : { mode: running ? "MOTOR" : "VELA", source: "RPM" });
    rows.push(propulsion
        ? { label: "Propulsión", value: propulsion.mode === "MOTOR" ? "Motor" : "Vela", status: "ok",
            source: propulsion.source === "RPM" ? "RPM de los instrumentos del barco" : "Selección manual · sin RPM vigentes" }
        : missing("Propulsión", UNKNOWN));
    return { id: "navigation", title: "Navegación", rows };
}

function engineSection(input: BoatPanelInput): BoatPanelSection {
    const ins = input.instruments;
    if (ins.engines.length === 0) {
        return {
            id: "engine", title: "Motor", rows: [
                missing("Estado", UNKNOWN), missing("RPM"), missing("Temperatura"), missing("Presión de aceite"),
                missing("Horas", NOT_SUPPORTED),
                ins.alternatorVolts
                    ? { label: "Alternador · tensión", value: `${ins.alternatorVolts.value.toFixed(2)} V`, status: "ok", source: BOAT_SOURCE, age: formatAge(ins.alternatorVolts.ageMs) }
                    : missing("Alternador · tensión")
            ]
        };
    }
    const rows: BoatPanelRow[] = [];
    const multi = ins.engines.length > 1;
    for (const engine of ins.engines) {
        const p = multi ? `Motor ID ${engine.engine} · ` : "";
        const rpm = engine.rpm;
        // Estado solo con RPM medidas: 0 rpm recibidas confirman parado; sin RPM = desconocido.
        rows.push(rpm
            ? { label: `${p}Estado`, value: Math.abs(rpm.value) > 0 ? "En marcha" : "Parado", status: "ok", source: BOAT_SOURCE, age: formatAge(rpm.ageMs) }
            : missing(`${p}Estado`, UNKNOWN));
        rows.push(rpm ? { label: `${p}RPM`, value: `${Math.round(rpm.value)} rpm`, status: "ok", source: BOAT_SOURCE, age: formatAge(rpm.ageMs) } : missing(`${p}RPM`));
        rows.push(engine.temperatureC
            ? { label: `${p}Temperatura`, value: `${engine.temperatureC.value.toFixed(0)} °C`, status: "ok", source: BOAT_SOURCE, age: formatAge(engine.temperatureC.ageMs) }
            : missing(`${p}Temperatura`));
        rows.push(engine.oilPressureBar
            ? { label: `${p}Presión de aceite`, value: `${engine.oilPressureBar.value.toFixed(1)} bar`, status: "ok", source: BOAT_SOURCE, age: formatAge(engine.oilPressureBar.ageMs) }
            : missing(`${p}Presión de aceite`));
    }
    rows.push(missing("Horas de motor", NOT_SUPPORTED));
    rows.push(ins.alternatorVolts
        ? { label: "Alternador · tensión", value: `${ins.alternatorVolts.value.toFixed(2)} V`, status: "ok", source: BOAT_SOURCE, age: formatAge(ins.alternatorVolts.ageMs) }
        : missing("Alternador · tensión"));
    return { id: "engine", title: "Motor", rows };
}

function tanksSection(input: BoatPanelInput): BoatPanelSection {
    const rows: BoatPanelRow[] = [];
    for (const kind of ["fuel", "freshWater", "greyWater", "blackWater"] as const) {
        const tanks = input.instruments.tanks.filter(t => t.kind === kind);
        if (tanks.length === 0) { rows.push(missing(TANK_LABEL[kind])); continue; }
        for (const tank of tanks) {
            rows.push({
                label: tanks.length > 1 ? `${TANK_LABEL[kind]} (${tank.name})` : TANK_LABEL[kind],
                // El volumen requiere la capacidad del depósito, que GAULOS aún no tiene configurada.
                value: `${tank.percent.value.toFixed(0)} % · volumen sin capacidad configurada`,
                status: "ok", source: BOAT_SOURCE, age: formatAge(tank.percent.ageMs)
            });
        }
    }
    return { id: "tanks", title: "Depósitos", rows };
}

const BATTERY_ROLE_LABEL = { start: "Batería de arranque", service: "Batería de servicio", unknown: "Batería" } as const;

function electricalSection(input: BoatPanelInput): BoatPanelSection {
    const ins = input.instruments;
    const rows: BoatPanelRow[] = [];
    if (ins.batteries.length === 0) {
        rows.push(missing("Baterías"));
    } else {
        for (const b of ins.batteries) {
            const label = `${BATTERY_ROLE_LABEL[b.role]}${b.role === "unknown" ? ` (${b.name})` : ""}`;
            rows.push(b.volts
                ? { label: `${label} · tensión`, value: `${b.volts.value.toFixed(2)} V`, status: "ok", source: BOAT_SOURCE, age: formatAge(b.volts.ageMs) }
                : missing(`${label} · tensión`));
            rows.push(b.amps
                ? { label: `${label} · corriente`, value: `${b.amps.value >= 0 ? "+" : ""}${b.amps.value.toFixed(1)} A ${b.amps.value >= 0 ? "(carga)" : "(descarga)"}`, status: "ok", source: BOAT_SOURCE, age: formatAge(b.amps.ageMs) }
                : missing(`${label} · corriente`));
            const volts = b.volts;
            const amps = b.amps;
            // Do not multiply unrelated or differently aged measurements.
            rows.push(volts && amps && Math.abs(volts.ageMs - amps.ageMs) <= 2000
                ? { label: `${label} · potencia neta`, value: `${(volts.value * amps.value).toFixed(0)} W`, status: "info", source: "Derivada de V × A del mismo sensor", age: formatAge(Math.max(volts.ageMs, amps.ageMs)) }
                : missing(`${label} · potencia neta`, "Requiere V/A simultáneos"));
        }
    }
    rows.push(missing("Estado de carga (SOC)", NOT_SUPPORTED));
    rows.push(missing("Autonomía", "Requiere SOC, capacidad útil y consumo medidos"));
    const solar = ins.solar;
    const watts = batteryPower(solar?.outputVolts ?? null, solar?.outputAmps ?? null);
    rows.push(watts === null ? missing('Solar · salida MPPT')
        : { label: 'Solar · salida MPPT', value: `${watts.toFixed(1)} W`, status: 'info', source: 'V × A sincronizados · BOAT' });
    for (const light of ins.lights ?? []) {
        rows.push({ label: `Luces · ${LIGHT_CIRCUITS[light.circuit]}`, value: relayLabel(light.relay),
            status: currentValue(light.relay) === null ? 'warning' : 'info', source: 'Retorno de relé · BOAT' });
    }
    rows.push(missing("Cargador de puerto", "Sin fuente identificada"));
    rows.push(missing("Generador", "Sin fuente identificada"));
    rows.push(ins.alternatorVolts
        ? { label: "Alternador · tensión", value: `${ins.alternatorVolts.value.toFixed(2)} V`, status: "ok", source: BOAT_SOURCE, age: formatAge(ins.alternatorVolts.ageMs) }
        : missing("Alternador · tensión"));
    const electrical = input.alarms.filter(a => a.type === "battery_low");
    rows.push(electrical.length
        ? { label: "Alarmas eléctricas", value: electrical.map(a => a.message).join(" · "), status: electrical.some(a => a.severity === "critical") ? "critical" : "warning" }
        : { label: "Alarmas eléctricas", value: "Ninguna activa", status: "info" });
    return { id: "electrical", title: "Sistema eléctrico", rows };
}

function safetySection(input: BoatPanelInput): BoatPanelSection {
    const rows: BoatPanelRow[] = [];
    rows.push(input.alarms.length
        ? {
            label: `Alarmas activas (${input.alarms.length})`,
            value: input.alarms.map(a => a.message).join(" · "),
            status: input.alarms.some(a => a.severity === "critical") ? "critical" : "warning"
        }
        : { label: "Alarmas activas", value: "Ninguna", status: "ok" });
    rows.push(!input.ais.enabled
        ? { label: "AIS", value: "Capa desactivada", status: "info" }
        : input.ais.targetCount === 0
            ? { label: "AIS", value: "Sin objetivos", status: "info" }
            : {
                label: "AIS",
                value: `${input.ais.targetCount} objetivos · ${input.ais.dangerousCount} con riesgo`,
                status: input.ais.dangerousCount > 0 ? "warning" : "ok"
            });
    const nmea = input.nmea;
    rows.push(!nmea
        ? missing("Conexión NMEA", UNKNOWN)
        : !nmea.connected
            ? { label: "Conexión NMEA", value: "Desconectada", status: "warning" }
            : {
                label: "Conexión NMEA",
                value: nmea.declaredAs === "BOAT" ? "Conectada · instrumentos del barco" : "Conectada · simulador visual",
                status: nmea.declaredAs === "BOAT" ? "ok" : "info",
                age: formatAge(nmea.lastLineAgeMs)
            });
    const nav = input.navigation;
    const boatFields = (["position", "sog", "cog", "headingTrue"] as const).filter(f => nav[f].sources.BOAT === "VALID").length;
    const staleFields = (["position", "sog", "cog", "headingTrue"] as const).filter(f => nav[f].sources.BOAT === "STALE").length;
    rows.push({
        label: "Instrumentos del barco",
        value: boatFields > 0 ? `${boatFields}/4 datos de navegación vigentes` : staleFields > 0 ? "Lecturas caducadas" : NO_DATA,
        status: boatFields > 0 ? "ok" : staleFields > 0 ? "warning" : "missing"
    });
    return { id: "safety", title: "Seguridad y sensores", rows };
}

export function buildBoatPanelModel(input: BoatPanelInput): BoatPanelSection[] {
    return [navigationSection(input), engineSection(input), tanksSection(input), electricalSection(input), safetySection(input)];
}
