import type {
    SurfaceCollection,
    SurfacePosition
} from '../../features/navigation/components/smartcharts/surface-contract';

import type { RoutePosition } from './RouteCorridor';

export interface RouteLandLeg {
    legIndex: number;
    crossesLand: boolean;
}

export interface RouteLandAnalysis {
    legs: RouteLandLeg[];
    crossesLand: boolean;
}

type Point = readonly [number, number];

function valid(p: Point): boolean {
    return p.length === 2 &&
        Number.isFinite(p[0]) &&
        Number.isFinite(p[1]) &&
        Math.abs(p[0]) <= 180 &&
        Math.abs(p[1]) <= 90;
}

function orientation(a: Point, b: Point, c: Point): number {
    return (b[0] - a[0]) * (c[1] - a[1]) -
           (b[1] - a[1]) * (c[0] - a[0]);
}

function onSegment(a: Point, b: Point, p: Point): boolean {
    const epsilon = 1e-10;

    return Math.abs(orientation(a, b, p)) <= epsilon &&
        p[0] >= Math.min(a[0], b[0]) - epsilon &&
        p[0] <= Math.max(a[0], b[0]) + epsilon &&
        p[1] >= Math.min(a[1], b[1]) - epsilon &&
        p[1] <= Math.max(a[1], b[1]) + epsilon;
}

function intersects(a: Point, b: Point, c: Point, d: Point): boolean {
    const o1 = orientation(a, b, c);
    const o2 = orientation(a, b, d);
    const o3 = orientation(c, d, a);
    const o4 = orientation(c, d, b);

    if (
        ((o1 > 0 && o2 < 0) || (o1 < 0 && o2 > 0)) &&
        ((o3 > 0 && o4 < 0) || (o3 < 0 && o4 > 0))
    ) {
        return true;
    }

    return onSegment(a, b, c) ||
        onSegment(a, b, d) ||
        onSegment(c, d, a) ||
        onSegment(c, d, b);
}

function insideRing(point: Point, ring: SurfacePosition[]): boolean {
    let inside = false;

    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const a = ring[i];
        const b = ring[j];

        if (onSegment(a, b, point)) return true;

        if (
            (a[1] > point[1]) !== (b[1] > point[1]) &&
            point[0] <
                (b[0] - a[0]) *
                (point[1] - a[1]) /
                (b[1] - a[1]) + a[0]
        ) {
            inside = !inside;
        }
    }

    return inside;
}

function insidePolygon(
    point: Point,
    rings: SurfacePosition[][]
): boolean {
    if (!rings.length || !insideRing(point, rings[0])) {
        return false;
    }

    return !rings.slice(1).some(ring => insideRing(point, ring));
}

export function analyzeRouteLandIntersection(
    route: readonly RoutePosition[],
    land: SurfaceCollection
): RouteLandAnalysis {
    if (route.length < 2 || route.some(p => !valid(p))) {
        throw new Error('Invalid route');
    }

    // This planar detector is restricted to local, non-antimeridian geometry.
    if (route.some((p, i) => i > 0 && Math.abs(p[0] - route[i - 1][0]) > 180)) {
        throw new Error('Unsupported antimeridian route');
    }
    for (const feature of land.features) {
        const rings = feature.geometry.coordinates;
        if (feature.properties.kind !== 'land' || rings.length === 0 || rings.some(ring =>
            ring.length < 4 || ring.some(p => !valid(p)) ||
            ring[0][0] !== ring[ring.length - 1][0] ||
            ring[0][1] !== ring[ring.length - 1][1] ||
            ring.some((p, i) => i > 0 && Math.abs(p[0] - ring[i - 1][0]) > 180)
        )) throw new Error('Invalid or unsupported land geometry');
    }
    const legs: RouteLandLeg[] = [];

    for (let i = 1; i < route.length; i++) {
        const a = route[i - 1];
        const b = route[i];

        let crossesLand = false;

        for (const feature of land.features) {
            const rings = feature.geometry.coordinates;

            if (
                insidePolygon(a, rings) ||
                insidePolygon(b, rings)
            ) {
                crossesLand = true;
                break;
            }

            for (const ring of rings) {
                for (let j = 1; j < ring.length; j++) {
                    if (intersects(a, b, ring[j - 1], ring[j])) {
                        crossesLand = true;
                        break;
                    }
                }

                if (crossesLand) break;
            }

            if (crossesLand) break;
        }

        legs.push({
            legIndex: i - 1,
            crossesLand
        });
    }

    return {
        legs,
        crossesLand: legs.some(leg => leg.crossesLand)
    };
}
