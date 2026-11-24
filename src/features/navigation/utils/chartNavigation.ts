/**
 * Posición y rumbo que DIBUJA la carta, a partir del estado de navegación
 * compartido (app.navigationState). Exclusivamente de visualización: no escribe
 * en app.state ni alimenta alarmas, fondeo, riesgo AIS, enrutado ni Supabase.
 *
 * - Posición: la seleccionada por el estado compartido (prioridad por campo
 *   BOAT > DROID > SIMULATOR) cuando es válida; si no, la posición actual del
 *   núcleo (app.state.shipPosition o su valor por defecto), como antes.
 * - Rumbo del marcador: rumbo de proa verdadero del estado compartido cuando es
 *   válido; si no, el valor que ya usaba la carta. El COG nunca se toma del estado
 *   compartido como rumbo de proa.
 * - simulated: true solo si la posición dibujada procede de SIMULATOR.
 */

import type { NavigationSource, ResolvedNavigationField } from "@/core/navigation/SharedNavigationState";

export interface ChartPoint {
    readonly lat: number;
    readonly lng: number;
}

export interface SharedChartFields {
    readonly position: ResolvedNavigationField<"position">;
    readonly headingTrue: ResolvedNavigationField<"headingTrue">;
}

export interface ChartNavigation {
    readonly position: ChartPoint | null;
    /** Fuente del estado compartido; null cuando se usa la posición del núcleo (fallback). */
    readonly positionSource: NavigationSource | null;
    readonly heading: number;
    /** Fuente del rumbo de proa; null cuando se usa el valor anterior de la carta. */
    readonly headingSource: NavigationSource | null;
    readonly simulated: boolean;
}

export function selectChartNavigation(
    shared: SharedChartFields,
    fallback: { readonly position: ChartPoint | null; readonly heading: number }
): ChartNavigation {
    const position = shared.position.status === "VALID" && shared.position.value
        ? { position: { lat: shared.position.value.lat, lng: shared.position.value.lng }, source: shared.position.source }
        : { position: fallback.position, source: null };

    const heading = shared.headingTrue.status === "VALID" && typeof shared.headingTrue.value === "number"
        ? { heading: shared.headingTrue.value, source: shared.headingTrue.source }
        : { heading: fallback.heading, source: null };

    return {
        position: position.position,
        positionSource: position.source,
        heading: heading.heading,
        headingSource: heading.source,
        simulated: position.source === "SIMULATOR"
    };
}

/** Clave de lo que cambia en la carta: evita renderizar si nada visible ha cambiado. */
export function sharedChartFieldsKey(shared: SharedChartFields): string {
    const p = shared.position;
    const h = shared.headingTrue;
    return [
        p.status, p.source ?? "-", p.value ? `${p.value.lat},${p.value.lng}` : "-",
        h.status, h.source ?? "-", h.value ?? "-"
    ].join("|");
}
