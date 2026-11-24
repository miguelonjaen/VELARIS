import type { GeographicReference } from '../../shared/geographicReference';
import referenceCatalog from '../../../route-reference-catalog.json';
import type { RoutePosition } from '../../core/navigation/RouteCorridor';

export interface RoutePlace extends GeographicReference {}
// Curated published port references. These are NOT validated arrival/departure waypoints.
const places: readonly RoutePlace[] = referenceCatalog.map(place => {
    if (place.position.length !== 2 || !place.position.every(Number.isFinite) ||
        Math.abs(place.position[0]) > 180 || Math.abs(place.position[1]) > 90 ||
        place.datum !== 'NOT_STATED_BY_SOURCE') throw new Error('Invalid curated geographic reference');
    return {...place,position:[place.position[0],place.position[1]],datum:'NOT_STATED_BY_SOURCE'};
});
function normalize(name: string): string {
    return name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase().replace(/^puerto (?:de )?/, '');
}
export function resolveRoutePlace(name: string | null): RoutePlace {
    const matches = name ? places.filter(p => normalize(p.name) === normalize(name)) : [];
    if (matches.length !== 1) throw new Error(`Lugar sin referencia portuaria inequívoca: ${name || '(no indicado)'}. Especifique el puerto.`);
    return { ...matches[0], position: [...matches[0].position] };
}
