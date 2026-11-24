import type { CoastLine } from './CoastProximity';
import type { RoutePosition } from './RouteCorridor';

export interface RouteLegClearance {
    legIndex: number;
    distanceMeters: number | null;
    intersectsCoastline: boolean;
    belowRequestedDistance: boolean;
}

export interface RouteCoastClearance {
    requestedDistanceNm: number;
    legs: RouteLegClearance[];
    minimumDistanceMeters: number | null;
    meetsRequestedDistance: boolean | null;
}

type Point = readonly [number, number];

const EARTH_RADIUS = 6371000;
const NM_METERS = 1852;

function valid(p: Point): boolean {
    return p.length === 2 &&
        Number.isFinite(p[0]) &&
        Number.isFinite(p[1]) &&
        Math.abs(p[0]) <= 180 &&
        Math.abs(p[1]) <= 80;
}

function segmentDistance(
    a: Point, b: Point, c: Point, d: Point
): number {
    const latitude = (a[1] + b[1] + c[1] + d[1]) / 4;
    const scale = EARTH_RADIUS * Math.PI / 180;
    const cos = Math.cos(latitude * Math.PI / 180);

    const project = (p: Point): Point => [
        p[0] * scale * cos,
        p[1] * scale
    ];

    const [ax, ay] = project(a);
    const [bx, by] = project(b);
    const [cx, cy] = project(c);
    const [dx, dy] = project(d);

    const cross = (
        x1: number, y1: number,
        x2: number, y2: number
    ) => x1 * y2 - y1 * x2;

    const abx = bx - ax, aby = by - ay;
    const cdx = dx - cx, cdy = dy - cy;

    const denominator = cross(abx, aby, cdx, cdy);

    if (Math.abs(denominator) > 1e-9) {
        const acx = cx - ax, acy = cy - ay;
        const t = cross(acx, acy, cdx, cdy) / denominator;
        const u = cross(acx, acy, abx, aby) / denominator;

        if (t >= 0 && t <= 1 && u >= 0 && u <= 1) {
            return 0;
        }
    }

    function pointSegmentDistance(
        px: number, py: number,
        x1: number, y1: number,
        x2: number, y2: number
    ): number {
        const vx = x2 - x1, vy = y2 - y1;
        const length2 = vx * vx + vy * vy;
        const t = length2 === 0 ? 0 : Math.max(
            0, Math.min(1, ((px - x1) * vx + (py - y1) * vy) / length2)
        );
        return Math.hypot(px - x1 - t * vx, py - y1 - t * vy);
    }

    return Math.min(
        pointSegmentDistance(ax, ay, cx, cy, dx, dy),
        pointSegmentDistance(bx, by, cx, cy, dx, dy),
        pointSegmentDistance(cx, cy, ax, ay, bx, by),
        pointSegmentDistance(dx, dy, ax, ay, bx, by)
    );
}

export function analyzeRouteCoastClearance(
    route: readonly RoutePosition[],
    coastlines: readonly CoastLine[],
    requestedDistanceNm: number
): RouteCoastClearance {
    if (
        route.length < 2 ||
        route.some(p => !valid(p)) ||
        !Number.isFinite(requestedDistanceNm) ||
        requestedDistanceNm < 0 ||
        requestedDistanceNm > 100
    ) {
        throw new Error('Invalid route clearance input');
    }

    const threshold = requestedDistanceNm * NM_METERS;
    const legs: RouteLegClearance[] = [];

    for (let i = 1; i < route.length; i++) {
        let minimum = Infinity;

        for (const line of coastlines) {
            for (let j = 1; j < line.length; j++) {
                const c = line[j - 1];
                const d = line[j];

                if (!valid(c) || !valid(d)) continue;

                minimum = Math.min(
                    minimum,
                    segmentDistance(route[i - 1], route[i], c, d)
                );
            }
        }

        const distanceMeters = Number.isFinite(minimum) ? minimum : null;

        legs.push({
            legIndex: i - 1,
            distanceMeters,
            intersectsCoastline: distanceMeters !== null && distanceMeters < 0.01,
            belowRequestedDistance: distanceMeters !== null && distanceMeters < threshold
        });
    }

    const distances = legs
        .map(leg => leg.distanceMeters)
        .filter((d): d is number => d !== null);

    return {
        requestedDistanceNm,
        legs,
        minimumDistanceMeters: distances.length ? Math.min(...distances) : null,
        meetsRequestedDistance: distances.length !== legs.length
            ? null
            : legs.every(leg => !leg.belowRequestedDistance)
    };
}
