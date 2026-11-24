import type { GeoPoint } from './GeoPoint';
export type CoastLine = readonly (readonly [number, number])[];
export type CoastLevel = 'clear' | 'warning' | 'critical';
/** Distancia orientativa OSM en plano tangente local; no calcula calado ni navegabilidad. */
export function coastDistanceMeters(position: GeoPoint, lines: readonly CoastLine[]): number | null {
    if (![position.lat, position.lng].every(Number.isFinite) || Math.abs(position.lat) > 80 || Math.abs(position.lng) > 180) return null;
    const scale = 6371000 * Math.PI / 180, cos = Math.cos(position.lat * Math.PI / 180);
    let best = Infinity;
    for (const line of lines) for (let i = 1; i < line.length; i++) {
        const a = line[i - 1], b = line[i];
        if (![...a, ...b].every(Number.isFinite)) continue;
        const ax = (a[0] - position.lng) * scale * cos, ay = (a[1] - position.lat) * scale;
        const bx = (b[0] - position.lng) * scale * cos, by = (b[1] - position.lat) * scale;
        const dx = bx - ax, dy = by - ay, length = dx * dx + dy * dy;
        const t = length === 0 ? 0 : Math.max(0, Math.min(1, -(ax * dx + ay * dy) / length));
        best = Math.min(best, Math.hypot(ax + t * dx, ay + t * dy));
    }
    return Number.isFinite(best) ? best : null;
}
/** Histéresis de salida: 20%/25 m; no repite avisos en cada actualización GPS. */
export function coastLevel(distance: number, threshold: number, previous: CoastLevel): CoastLevel {
    const margin = Math.max(25, threshold * 0.2);
    if (distance <= threshold / 2) return 'critical';
    if (previous === 'critical' && distance <= threshold / 2 + margin) return 'critical';
    if (distance <= threshold || previous !== 'clear' && distance <= threshold + margin) return 'warning';
    return 'clear';
}
