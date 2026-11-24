import { containsSurface, type SurfaceCollection, type SurfaceSector } from '../../features/navigation/components/smartcharts/surface-contract';
import type { RouteBounds, RoutePosition } from './RouteCorridor';
import { analyzeRouteLandIntersection } from './RouteLandIntersection';

export type SurfaceLegStatus = 'LAND_CONTACT' | 'NO_LAND_CONTACT_DETECTED' | 'INDETERMINATE';
export interface SurfaceLegAnalysis {
    legIndex: number;
    status: SurfaceLegStatus;
    declaredCoverageComplete: boolean;
    seaClassified: boolean;
}
export interface RouteSurfaceAnalysis {
    legs: SurfaceLegAnalysis[];
    declaredCoverageComplete: boolean;
    navigationUse: false;
    depthKnown: false;
}

/** Clip the entire segment against each loaded sector extent, then union t intervals.
 * Extents describe declared display coverage, never hydrographic completeness.
 */
export function segmentWithinCoverage(a: RoutePosition, b: RoutePosition, bounds: readonly RouteBounds[]): boolean {
    const intervals: [number, number][] = [];
    for (const box of bounds) {
        if (!box.every(Number.isFinite) || box[0] >= box[2] || box[1] >= box[3]) {
            throw new Error('Invalid coverage bounds');
        }
        let start = 0, end = 1;
        for (const axis of [0, 1] as const) {
            const delta = b[axis] - a[axis];
            if (delta === 0) {
                if (a[axis] < box[axis] || a[axis] > box[axis + 2]) end = -1;
            } else {
                const t1 = (box[axis] - a[axis]) / delta;
                const t2 = (box[axis + 2] - a[axis]) / delta;
                start = Math.max(start, Math.min(t1, t2));
                end = Math.min(end, Math.max(t1, t2));
            }
        }
        if (start <= end) intervals.push([start, end]);
    }
    intervals.sort((x, y) => x[0] - y[0]);
    let covered = 0;
    for (const [start, end] of intervals) {
        // No tolerance that could silently bridge an actual coverage gap.
        if (start > covered) return false;
        covered = Math.max(covered, end);
        if (covered >= 1) return true;
    }
    return false;
}

/** Exact rectangle-union coverage using a sweep across all vertical boundaries. */
export function boundsWithinCoverage(bounds: RouteBounds, extents: readonly RouteBounds[]): boolean {
    const clampLongitude = (x: number): number => Math.max(bounds[0], Math.min(bounds[2], x));
    const xs = [...new Set([
        bounds[0], bounds[2],
        ...extents.flatMap(box => [clampLongitude(box[0]), clampLongitude(box[2])])
    ])].sort((a, b) => a - b);
    return xs.slice(1).every((x, i) => {
        const longitude = (xs[i] + x) / 2;
        return segmentWithinCoverage([longitude, bounds[1]], [longitude, bounds[3]], extents);
    });
}

/** Partition a segment at every sea boundary; classify every resulting open interval.
 * Endpoints alone, midpoint-only sampling and display extents cannot detect internal gaps.
 */
export function segmentHasSeaClassification(
    a: RoutePosition, b: RoutePosition, collections: readonly SurfaceCollection[]
): boolean {
    const dx = b[0]-a[0], dy = b[1]-a[1];
    const length2 = dx*dx+dy*dy;
    if (length2 === 0) return collections.some(c=>containsSurface(c,[a[0],a[1]]));
    const cuts = new Set<number>([0,1]);
    for (const collection of collections) for (const feature of collection.features) {
        for (const ring of feature.geometry.coordinates) for (let i = 1; i < ring.length; i++) {
            const c = ring[i-1], d = ring[i];
            const ex = d[0]-c[0], ey = d[1]-c[1];
            const ax = c[0]-a[0], ay = c[1]-a[1];
            const denominator = dx*ey-dy*ex;
            if (denominator !== 0) {
                const t = (ax*ey-ay*ex)/denominator;
                const u = (ax*dy-ay*dx)/denominator;
                if (t > 0 && t < 1 && u >= 0 && u <= 1) cuts.add(t);
            } else if (ax*dy-ay*dx === 0) {
                for (const point of [c,d]) {
                    const t = ((point[0]-a[0])*dx+(point[1]-a[1])*dy)/length2;
                    if (t > 0 && t < 1) cuts.add(t);
                }
            }
        }
    }
    const sorted = [...cuts].sort((x,y)=>x-y);
    return sorted.slice(1).every((cut,index) => {
        const t = (sorted[index]+cut)/2;
        return collections.some(c=>containsSurface(c,[a[0]+t*dx,a[1]+t*dy]));
    });
}

export function analyzeRouteSurfaces(route: readonly RoutePosition[], sectors: readonly SurfaceSector[]): RouteSurfaceAnalysis {
    const land = { type: 'FeatureCollection' as const, features: sectors.flatMap(s => s.layers.land.features) };
    const geometry = analyzeRouteLandIntersection(route, land);
    const legs = geometry.legs.map(leg => {
        const covered = segmentWithinCoverage(route[leg.legIndex], route[leg.legIndex + 1], sectors.map(s => s.coverage));
        const seaClassified = segmentHasSeaClassification(route[leg.legIndex], route[leg.legIndex+1], sectors.map(s=>s.layers.sea));
        const status: SurfaceLegStatus = leg.crossesLand ? 'LAND_CONTACT' : covered && seaClassified ? 'NO_LAND_CONTACT_DETECTED' : 'INDETERMINATE';
        return { legIndex: leg.legIndex, status, declaredCoverageComplete: covered, seaClassified };
    });
    return { legs, declaredCoverageComplete: legs.every(l => l.declaredCoverageComplete), navigationUse: false, depthKnown: false };
}
