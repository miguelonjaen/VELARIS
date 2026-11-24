/**
 * Texto de bitácora de cada acontecimiento de VoyageMonitor. Lógica pura.
 *
 * Los valores numéricos de la entrada (latitud, longitud, velocidad, rumbo) son los del propio
 * acontecimiento: medidos por los instrumentos del barco o null si no se conocen. Nunca se
 * completan con la posición guardada, valores por defecto ni datos meteorológicos.
 * El título incluye los datos clave (y la hora), de modo que dos acontecimientos distintos no se
 * confundan con un duplicado en el filtro existente de la bitácora.
 */

import type { VoyageEvent, VoyagePoint, VoyagePositionSource } from "./VoyageMonitor";

export interface VoyageLogMeasured {
    readonly latitud: number | null;
    readonly longitud: number | null;
    readonly velocidad_gps: number | null;
    readonly rumbo: number | null;
}

export interface VoyageLogEntry {
    readonly titulo: string;
    readonly descripcion: string;
    /** Categorías existentes de la bitácora. */
    readonly categoria: "Navegación" | "Seguridad";
    /** Evento de ciclo de vida existente ('Salida'/'Arribada'); solo en inicio y fin. */
    readonly lifecycleEvent?: "Salida" | "Arribada";
    readonly measured: VoyageLogMeasured;
}

const SOURCE_LABEL: Record<VoyagePositionSource, string> = {
    BOAT: "instrumentos del barco",
    DROID: "GAULOSdroid (GPS del teléfono)",
    SIMULATOR: "simulador NMEA (solo visual)"
};

const pad = (n: number) => String(n).padStart(2, "0");
export const formatClock = (ms: number): string => {
    const date = new Date(ms);
    return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
};
const deg = (value: number) => `${String(Math.round(((value % 360) + 360) % 360)).padStart(3, "0")}°`;
const kn = (value: number) => `${value.toFixed(1)} kn`;
const pos = (point: VoyagePoint | null) => point ? `${point.lat.toFixed(5)}, ${point.lng.toFixed(5)}` : "posición no disponible";
const source = (value: VoyagePositionSource | null) => value ? SOURCE_LABEL[value] : "sin fuente válida";
const measured = (point: VoyagePoint | null, sog: number | null, cog: number | null): VoyageLogMeasured => ({
    latitud: point ? point.lat : null,
    longitud: point ? point.lng : null,
    velocidad_gps: sog,
    rumbo: cog
});
const duration = (ms: number) => {
    const minutes = Math.round(ms / 60_000);
    return minutes < 1 ? `${Math.round(ms / 1000)} s` : `${minutes} min`;
};

export function describeVoyageEvent(event: VoyageEvent): VoyageLogEntry {
    const clock = formatClock(event.at);
    switch (event.type) {
        case "VOYAGE_START":
            return {
                titulo: "Salida",
                descripcion: `Travesía iniciada automáticamente a las ${clock}. Fuente: instrumentos del barco`
                    + `${event.origin ? ` (${event.origin})` : ""}. Posición inicial ${pos(event.position)}, `
                    + `SOG ${kn(event.sog)}${event.cog !== null ? `, COG ${deg(event.cog)}` : ""}.`,
                categoria: "Navegación",
                lifecycleEvent: "Salida",
                measured: measured(event.position, event.sog, event.cog)
            };
        case "COURSE_CHANGE":
            return {
                titulo: `Cambio de rumbo ${deg(event.from)} → ${deg(event.to)} (${clock})`,
                descripcion: `Rumbo sobre el fondo de ${deg(event.from)} a ${deg(event.to)} `
                    + `(${event.delta > 0 ? "+" : ""}${Math.round(event.delta)}°). Posición ${pos(event.position)}, SOG ${kn(event.sog)}.`,
                categoria: "Navegación",
                measured: measured(event.position, event.sog, event.to)
            };
        case "SPEED_CHANGE":
            return {
                titulo: `Cambio de velocidad ${kn(event.from)} → ${kn(event.to)} (${clock})`,
                descripcion: `Velocidad sobre el fondo de ${kn(event.from)} a ${kn(event.to)}. Posición ${pos(event.position)}`
                    + `${event.cog !== null ? `, COG ${deg(event.cog)}` : ""}.`,
                categoria: "Navegación",
                measured: measured(event.position, event.to, event.cog)
            };
        case "SIGNAL_LOST":
            return {
                titulo: `Pérdida de señal de instrumentos (${clock})`,
                descripcion: `Sin datos de navegación de los instrumentos del barco`
                    + `${event.lastSeenAt !== null ? ` desde las ${formatClock(event.lastSeenAt)}` : ""}. `
                    + `Última posición conocida: ${pos(event.lastPosition)}. La travesía sigue abierta.`,
                categoria: "Seguridad",
                measured: measured(null, null, null)
            };
        case "SIGNAL_RECOVERED":
            return {
                titulo: `Señal de instrumentos recuperada (${clock})`,
                descripcion: `Datos de los instrumentos del barco de nuevo disponibles tras ${duration(event.lostForMs)} sin señal. `
                    + `Posición ${pos(event.position)}.`,
                categoria: "Navegación",
                measured: measured(event.position, null, null)
            };
        case "SOURCE_CHANGE":
            return {
                titulo: `Fuente de posición: ${source(event.to)} (${clock})`,
                descripcion: `La posición pasa de ${source(event.from)} a ${source(event.to)}. Posición ${pos(event.position)}.`,
                categoria: "Navegación",
                measured: measured(event.position, null, null)
            };
        case "VOYAGE_AUTO_END":
            return {
                // La entrada «Arribada» la registra el cierre existente de la travesía (handleEndTravesia).
                titulo: `Cierre automático de travesía (${clock})`,
                descripcion: `Travesía cerrada automáticamente: ${event.reason}. `
                    + `Última posición conocida: ${pos(event.lastPosition)}.`,
                categoria: "Navegación",
                measured: measured(event.lastPosition, null, null)
            };
    }
}
