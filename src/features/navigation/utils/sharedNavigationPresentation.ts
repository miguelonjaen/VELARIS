/**
 * Presentación del estado de navegación compartido (app.navigationState) en la
 * interfaz. Lógica pura: sin React, para poder probarla.
 *
 * - Dato válido: valor con las unidades actuales de GAULOS.
 * - Dato de GAULOSdroid: mismo valor, marcado como respaldo.
 * - Dato del simulador NMEA: mismo valor, marcado siempre como simulado.
 * - UNKNOWN: sin valor. Nunca se rellena con 0, coordenadas por defecto ni datos simulados.
 */

import type {
    NavigationFieldName,
    NavigationSource,
    NavigationSourceStatus,
    ResolvedNavigationField,
    ResolvedNavigationState
} from "@/core/navigation/SharedNavigationState";

/** Misma cadencia con la que la interfaz ya reevalúa la calidad de los sensores. */
export const SHARED_NAVIGATION_REFRESH_MS = 1000;

export interface NavigationCellView {
    readonly label: string;
    readonly available: boolean;
    /** Texto del valor; vacío cuando no hay dato válido. */
    readonly value: string;
    readonly unit: string;
    readonly source: NavigationSource | null;
    /** Descripción emergente: fuente y hora de la medida, o motivo de la ausencia. */
    readonly title: string;
}

export interface SharedNavigationView {
    readonly position: NavigationCellView;
    readonly sog: NavigationCellView;
    readonly cog: NavigationCellView;
    readonly heading: NavigationCellView;
}

const SOURCE_LABEL: Record<NavigationSource, string> = {
    BOAT: "instrumentos del barco",
    DROID: "GAULOSdroid (respaldo)",
    SIMULATOR: "simulador NMEA (datos SIMULADOS, no son del barco)"
};

const STATUS_LABEL: Record<NavigationSourceStatus, string> = {
    VALID: "válido",
    NO_DATA: "sin datos",
    INVALID: "dato inválido",
    STALE: "caducado"
};

const FIELD_LABEL: Record<NavigationFieldName, string> = {
    position: "Posición",
    sog: "SOG",
    cog: "COG",
    headingTrue: "Rumbo verdadero",
    headingMagnetic: "Rumbo magnético"
};

const pad3 = (value: number): string => Math.round(((value % 360) + 360) % 360).toString().padStart(3, "0");

function formatTime(ms: number | null): string {
    if (ms === null) return "";
    const date = new Date(ms);
    const two = (value: number) => value.toString().padStart(2, "0");
    return `${two(date.getHours())}:${two(date.getMinutes())}:${two(date.getSeconds())}`;
}

function formatValue(field: ResolvedNavigationField): string {
    if (field.status !== "VALID" || field.value === null) return "";
    switch (field.field) {
        case "position": {
            const position = field.value as { lat: number; lng: number };
            return `${position.lat.toFixed(4)}, ${position.lng.toFixed(4)}`;
        }
        case "sog":
            return (field.value as number).toFixed(1);
        default:
            return pad3(field.value as number);
    }
}

function describeSources(field: ResolvedNavigationField): string {
    return `barco: ${STATUS_LABEL[field.sources.BOAT]}; Droid: ${STATUS_LABEL[field.sources.DROID]}; simulador: ${STATUS_LABEL[field.sources.SIMULATOR]}`;
}

function cell(label: string, unit: string, field: ResolvedNavigationField): NavigationCellView {
    const name = FIELD_LABEL[field.field];
    if (field.status !== "VALID" || field.source === null) {
        return {
            label,
            available: false,
            value: "",
            unit,
            source: null,
            title: `${name}: sin dato válido (${describeSources(field)})`
        };
    }
    const coordinateDetail = field.field === 'position' && field.value !== null ? (() => {
        const point = field.value as { lat: number; lng: number };
        const dm = (v: number, positive: string, negative: string) => {
            const absolute = Math.abs(v);
            const roundedMinutes = Math.round(absolute * 60 * 1000) / 1000;
            const degrees = Math.floor(roundedMinutes / 60);
            return `${degrees}° ${(roundedMinutes - degrees * 60).toFixed(3).padStart(6, '0')}′ ${v >= 0 ? positive : negative}`;
        };
        return ` · ${point.lat.toFixed(6)}, ${point.lng.toFixed(6)} · ${dm(point.lat, 'N', 'S')} / ${dm(point.lng, 'E', 'W')}`;
    })() : '';
    const time = field.observedAtFromSource ? `medido ${formatTime(field.observedAt)}` : `recibido ${formatTime(field.receivedAt)}`;
    return {
        label,
        available: true,
        value: formatValue(field),
        unit,
        source: field.source,
        title: `${name}${coordinateDetail}: ${field.sourceId === "route-trial" ? "ensayo de ruta (posición y rumbo virtuales)" : SOURCE_LABEL[field.source]}${field.sourceId ? ` (${field.sourceId})` : ""} · ${time}`
    };
}

/**
 * Rumbo de proa: verdadero cuando es válido; si no, magnético indicado como tal
 * (unidad «°M»). Nunca se usa el COG como rumbo.
 */
function headingCell(state: ResolvedNavigationState): NavigationCellView {
    if (state.headingTrue.status === "VALID") return cell("HDG", "°", state.headingTrue);
    if (state.headingMagnetic.status === "VALID") return cell("HDG", "°M", state.headingMagnetic);
    const unknown = cell("HDG", "°", state.headingTrue);
    return {
        ...unknown,
        title: `Rumbo: sin dato válido (verdadero: ${describeSources(state.headingTrue)} · magnético: ${describeSources(state.headingMagnetic)})`
    };
}

export function presentSharedNavigation(state: ResolvedNavigationState): SharedNavigationView {
    return {
        position: cell("POS", "", state.position),
        sog: cell("SOG", "kn", state.sog),
        cog: cell("COG", "°", state.cog),
        heading: headingCell(state)
    };
}

/** Clave estable de lo que se ve: evita renderizar si nada visible ha cambiado. */
export function sharedNavigationViewKey(view: SharedNavigationView): string {
    return [view.position, view.sog, view.cog, view.heading]
        .map((entry) => `${entry.available ? 1 : 0}|${entry.value}|${entry.unit}|${entry.source ?? "-"}|${entry.title}`)
        .join("§");
}
