export type RoutePosition = readonly [number, number];
export type RouteBounds = readonly [number, number, number, number];

export interface RouteSector {
    id: string;
    bbox: RouteBounds;
    simplified: boolean;
    resources: readonly string[];
}

export interface RouteCorridorSelection {
    bounds: RouteBounds;
    sectors: RouteSector[];
    covered: boolean;
}

function validPosition(p: RoutePosition): boolean {
    return Number.isFinite(p[0]) &&
        Number.isFinite(p[1]) &&
        Math.abs(p[0]) <= 180 &&
        Math.abs(p[1]) <= 90;
}

function intersects(a: RouteBounds, b: RouteBounds): boolean {
    return a[0] <= b[2] &&
        a[2] >= b[0] &&
        a[1] <= b[3] &&
        a[3] >= b[1];
}

export function selectRouteCorridor(
    positions: readonly RoutePosition[],
    sectors: readonly RouteSector[],
    marginNm = 5
): RouteCorridorSelection {
    if (positions.length < 2 || positions.some(p => !validPosition(p))) {
        throw new Error('Invalid route positions');
    }

    if (!Number.isFinite(marginNm) || marginNm < 0 || marginNm > 100) {
        throw new Error('Invalid corridor margin');
    }

    const lngs = positions.map(p => p[0]);
    const lats = positions.map(p => p[1]);

    const minLat = Math.min(...lats);
    const maxLat = Math.max(...lats);
    const midLat = (minLat + maxLat) / 2;

    const latMargin = marginNm / 60;
    const cosLat = Math.cos(midLat * Math.PI / 180);

    if (cosLat < 0.01) {
        throw new Error('Unsupported polar corridor');
    }

    const lngMargin = marginNm / (60 * cosLat);

    const bounds: RouteBounds = [
        Math.min(...lngs) - lngMargin,
        minLat - latMargin,
        Math.max(...lngs) + lngMargin,
        maxLat + latMargin
    ];

    const selected = sectors.filter(
        sector => !sector.simplified && intersects(bounds, sector.bbox)
    );

    // Intersecting bounding boxes do not prove continuous coverage.
    // Coverage must be verified separately using loaded geometries.
    return {
        bounds,
        sectors: selected,
        covered: false
    };
}
