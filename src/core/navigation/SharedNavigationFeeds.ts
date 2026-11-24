/**
 * Conversión de las entradas reales de Desktop a lecturas del estado de
 * navegación compartido (SharedNavigationState).
 *
 * - BOAT: mensajes NMEA de los instrumentos del barco (TelemetryMessage que
 *   llega del proceso principal). La simulación NO pasa por aquí.
 * - DROID: posición en vivo de GAULOSdroid recibida por GAULOS Link.
 * - SIMULATOR: sentencias NMEA de un simulador por TCP (p. ej. NMEA Simulator X).
 *   Mismo parser y mismas reglas de campos que BOAT, pero clasificadas como
 *   simulación. Se fechan con la hora de recepción: el reloj del escenario
 *   simulado no es fiable para ordenar ni caducar.
 *
 * Solo se convierten los campos que el mensaje trae de verdad. Un mensaje GPS
 * sin indicación de campos presentes (emisores antiguos) solo aporta la
 * posición: los ceros de SOG/COG que rellenaba el parser no se tratan como
 * medidas.
 */

import type { GPSTelemetry, HeadingTelemetry, TelemetryMessage } from "../types/TelemetryMessage";
import type { NavigationReadingInput } from "./SharedNavigationState";

export const BOAT_NMEA_SOURCE_ID = "nmea";

export const SIMULATOR_NMEA_SOURCE_ID = "simulator";

/**
 * Instante de observación de un mensaje GPS: solo si trae fecha y hora
 * completas (RMC). La hora sin fecha (GGA) no basta para situar la medida.
 */
function gpsObservedAt(message: GPSTelemetry): number | null {
    const timestamp = message.timestamp;
    if (!timestamp || !timestamp.includes("T")) return null;
    const parsed = Date.parse(timestamp);
    return Number.isFinite(parsed) ? parsed : null;
}

export function boatReadingsFromTelemetry(
    message: TelemetryMessage,
    receivedAt: number,
    sourceId: string = BOAT_NMEA_SOURCE_ID
): NavigationReadingInput[] {
    return readingsFromTelemetry(message, receivedAt, "BOAT", sourceId, true);
}

/** Mensajes NMEA de un simulador: nunca se registran como instrumentos del barco. */
export function simulatorReadingsFromTelemetry(
    message: TelemetryMessage,
    receivedAt: number,
    sourceId: string = SIMULATOR_NMEA_SOURCE_ID
): NavigationReadingInput[] {
    return readingsFromTelemetry(message, receivedAt, "SIMULATOR", sourceId, false);
}

function readingsFromTelemetry(
    message: TelemetryMessage,
    receivedAt: number,
    source: "BOAT" | "SIMULATOR",
    sourceId: string,
    useSourceTime: boolean
): NavigationReadingInput[] {
    if (message.type === "GPS") {
        const gps = message as GPSTelemetry;
        const fromSource = useSourceTime ? gpsObservedAt(gps) : null;
        const base = {
            source,
            sourceId,
            observedAt: fromSource ?? receivedAt,
            receivedAt,
            observedAtFromSource: fromSource !== null
        };
        const present = gps.fields;
        const readings: NavigationReadingInput[] = [];
        if (present ? present.position : true) {
            readings.push({ ...base, field: "position", value: { lat: gps.lat, lng: gps.lng } });
        }
        if (present?.sog) readings.push({ ...base, field: "sog", value: gps.sog });
        if (present?.cog) readings.push({ ...base, field: "cog", value: gps.cog });
        return readings;
    }

    if (message.type === "HEADING") {
        const heading = message as HeadingTelemetry;
        return [{
            field: heading.headingType === "true" ? "headingTrue" : "headingMagnetic",
            source,
            sourceId,
            value: heading.heading,
            observedAt: receivedAt,
            receivedAt,
            observedAtFromSource: false
        }];
    }

    return [];
}

/** Fix de GAULOS Link (estructura de LinkFix, sin depender de la capa de interfaz). */
export interface DroidLinkFix {
    /** Hora GPS de la medida en el teléfono (ms). */
    readonly t: number;
    readonly lat: number;
    readonly lon: number;
    /** Nudos. */
    readonly sog: number | null;
    /** Grados verdaderos. */
    readonly cog: number | null;
    readonly hdg?: number | null;
    readonly hdgRef?: "true" | "magnetic" | null;
    /** Origen de la medida según el protocolo Link (p. ej. "phone_gps", "simulation"). */
    readonly src?: string;
}

/** Valor de `src` con el que GAULOS Link marca una posición simulada en el teléfono. */
export const LINK_SIMULATION_SRC = "simulation";

export interface DroidLinkPosition {
    readonly deviceId: string;
    readonly fix: DroidLinkFix;
    /** Hora de recepción en Desktop (ms). */
    readonly rx: number;
}

/**
 * HDG solo se convierte si viene con referencia explícita verdadera o magnética.
 * Los clientes anteriores sin hdgRef no alimentan ninguno de los dos campos.
 */
export function droidReadingsFromLinkPosition(position: DroidLinkPosition): NavigationReadingInput[] {
    const { fix } = position;
    // Un fix simulado del teléfono no es una lectura real de DROID. Tampoco se pasa a
    // SIMULATOR: esa ranura es la del simulador NMEA y mezclar dos simulaciones en el
    // mismo campo sería ambiguo. Se descarta del estado compartido (la capa Link lo
    // sigue dibujando como «SIMULADO»).
    if (fix.src === LINK_SIMULATION_SRC) return [];
    const base = {
        source: "DROID" as const,
        sourceId: position.deviceId,
        observedAt: fix.t,
        receivedAt: position.rx,
        observedAtFromSource: true
    };
    const readings: NavigationReadingInput[] = [
        { ...base, field: "position", value: { lat: fix.lat, lng: fix.lon } }
    ];
    if (fix.sog !== null && fix.sog !== undefined) readings.push({ ...base, field: "sog", value: fix.sog });
    if (fix.cog !== null && fix.cog !== undefined) readings.push({ ...base, field: "cog", value: fix.cog });
    if (fix.hdg != null && fix.hdgRef) readings.push({ ...base,
        field: fix.hdgRef === "true" ? "headingTrue" : "headingMagnetic", value: fix.hdg });
    return readings;
}
