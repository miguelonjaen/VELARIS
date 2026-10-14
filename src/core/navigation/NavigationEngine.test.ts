import { describe, expect, it } from "vitest";
import {
    NavigationEngine,
    NavigationRoute,
    NavigationWaypoint
} from "./NavigationEngine";

const engine = new NavigationEngine();

const waypoint = (
    id: string,
    lat: number,
    lng: number,
    radiusNm?: number
): NavigationWaypoint => ({
    id,
    position: { lat, lng },
    ...(radiusNm === undefined ? {} : { radiusNm })
});

const route: NavigationRoute = {
    waypoints: [
        waypoint("start", 0, 0),
        waypoint("north", 1, 0, 0.05),
        waypoint("east", 1, 1)
    ]
};

describe("NavigationEngine", () => {
    it("calculates a known distance in NM", () => {
        expect(engine.calculateDistance(
            { lat: 0, lng: 0 },
            { lat: 1, lng: 0 }
        )).toBeCloseTo(60.04, 1);
    });

    it("calculates cardinal bearings", () => {
        const origin = { lat: 0, lng: 0 };

        expect(engine.calculateBearing(origin, { lat: 1, lng: 0 }))
            .toBeCloseTo(0, 5);
        expect(engine.calculateBearing(origin, { lat: 0, lng: 1 }))
            .toBeCloseTo(90, 5);
        expect(engine.calculateBearing(origin, { lat: -1, lng: 0 }))
            .toBeCloseTo(180, 5);
        expect(engine.calculateBearing(origin, { lat: 0, lng: -1 }))
            .toBeCloseTo(270, 5);
    });

    it("calculates XTE to the left of a northbound leg", () => {
        const result = engine.calculateXTE(
            { lat: 0.5, lng: -0.1 },
            { lat: 0, lng: 0 },
            { lat: 1, lng: 0 }
        );

        expect(result.side).toBe("left");
        expect(result.signedDistanceNm).toBeLessThan(0);
        expect(result.distanceNm).toBeCloseTo(6, 0);
    });

    it("calculates XTE to the right of a northbound leg", () => {
        const result = engine.calculateXTE(
            { lat: 0.5, lng: 0.1 },
            { lat: 0, lng: 0 },
            { lat: 1, lng: 0 }
        );

        expect(result.side).toBe("right");
        expect(result.signedDistanceNm).toBeGreaterThan(0);
        expect(result.distanceNm).toBeCloseTo(6, 0);
    });

    it("returns zero XTE on the route", () => {
        const result = engine.calculateXTE(
            { lat: 0.5, lng: 0 },
            { lat: 0, lng: 0 },
            { lat: 1, lng: 0 }
        );

        expect(result).toEqual({
            distanceNm: 0,
            signedDistanceNm: 0,
            side: "on_track"
        });
    });

    it("calculates ETA in seconds", () => {
        expect(engine.calculateETA(10, 5)).toBe(7200);
    });

    it("returns zero ETA for zero distance", () => {
        expect(engine.calculateETA(0, 5)).toBe(0);
    });

    it("returns null ETA for zero, negative, or non-finite SOG", () => {
        expect(engine.calculateETA(10, 0)).toBeNull();
        expect(engine.calculateETA(10, -1)).toBeNull();
        expect(engine.calculateETA(10, Number.NaN)).toBeNull();
        expect(engine.calculateETA(10, Number.POSITIVE_INFINITY)).toBeNull();
    });

    it("returns null ETA for invalid distance", () => {
        expect(engine.calculateETA(-1, 5)).toBeNull();
        expect(engine.calculateETA(Number.NaN, 5)).toBeNull();
        expect(engine.calculateETA(Number.POSITIVE_INFINITY, 5)).toBeNull();
    });

    it("returns the active waypoint, next waypoint, DTW and BTW", () => {
        const result = engine.calculateWaypointProgression(
            { lat: 0, lng: 0 },
            route,
            1
        );

        expect(result.activeWaypoint?.id).toBe("north");
        expect(result.nextWaypoint?.id).toBe("east");
        expect(result.distanceToWaypointNm).toBeCloseTo(60.04, 1);
        expect(result.bearingToWaypoint).toBeCloseTo(0, 5);
    });

    it("returns a safe result for an out-of-range waypoint index", () => {
        const result = engine.calculateWaypointProgression(
            { lat: 0, lng: 0 },
            route,
            5
        );

        expect(result).toEqual({
            activeWaypointIndex: null,
            activeWaypoint: null,
            nextWaypoint: null,
            distanceToWaypointNm: null,
            bearingToWaypoint: null,
            hasArrived: false
        });
    });

    it("detects arrival using the waypoint radius", () => {
        const result = engine.calculateWaypointProgression(
            { lat: 0.9995, lng: 0 },
            route,
            1
        );

        expect(result.hasArrived).toBe(true);
    });

    it("returns a safe result for an empty route", () => {
        const result = engine.calculateWaypointProgression(
            { lat: 0, lng: 0 },
            { waypoints: [] },
            0
        );

        expect(result.activeWaypoint).toBeNull();
        expect(result.distanceToWaypointNm).toBeNull();
        expect(result.hasArrived).toBe(false);
    });

    it("keeps HDG separate from COG", () => {
        const first = engine.calculate({
            position: { lat: 0, lng: 0 },
            heading: 10,
            cog: 90,
            sog: 5,
            route,
            activeWaypointIndex: 1
        });
        const second = engine.calculate({
            position: { lat: 0, lng: 0 },
            heading: 270,
            cog: 90,
            sog: 5,
            route,
            activeWaypointIndex: 1
        });

        expect(first.heading).toBe(10);
        expect(second.heading).toBe(270);
        expect(first.cog).toBe(second.cog);
        expect(first.bearingToWaypoint).toBe(second.bearingToWaypoint);
        expect(first.distanceToWaypointNm).toBe(second.distanceToWaypointNm);
        expect(first.xte).toEqual(second.xte);
    });

    it("calculates VMG toward the waypoint", () => {
    expect(engine.calculateVMG(10, 0, 0)).toBeCloseTo(10, 10);
    expect(engine.calculateVMG(10, 90, 0)).toBeCloseTo(0, 10);
    expect(engine.calculateVMG(10, 180, 0)).toBeCloseTo(-10, 10);
});

it("includes VMG in navigation metrics", () => {
    const result = engine.calculate({
        position: { lat: 0, lng: 0 },
        heading: 10,
        cog: 0,
        sog: 5,
        route,
        activeWaypointIndex: 1
    });

    expect(result.vmg).toBeCloseTo(5, 10);
});
it("is deterministic for identical inputs", () => {
        const input = {
            position: { lat: 0.2, lng: 0.1 },
            heading: 120,
            cog: 118,
            sog: 6,
            route,
            activeWaypointIndex: 1
        };

        expect(engine.calculate(input)).toEqual(engine.calculate(input));
    });

    it("rejects invalid positions explicitly", () => {
        expect(() => engine.calculateDistance(
            { lat: Number.NaN, lng: 0 },
            { lat: 0, lng: 0 }
        )).toThrow(RangeError);
        expect(() => engine.calculateDistance(
            { lat: 91, lng: 0 },
            { lat: 0, lng: 0 }
        )).toThrow(RangeError);
    });
});
