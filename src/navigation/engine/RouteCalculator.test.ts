import { describe, expect, it } from "vitest";
import { Route } from "./Route";
import {
    calculateBearing,
    calculateDistanceNm,
    calculateRoute,
    calculateTotalDistanceNm,
    normalizeBearing,
    validateRoute
} from "./RouteCalculator";
import { Waypoint } from "../../tactical/contacts/Waypoint";

const waypoint = (id: string, lat: number, lng: number): Waypoint =>
    new Waypoint(id, lat, lng);

describe("RouteCalculator", () => {
    it("calculates Haversine distance between known points", () => {
        const route = new Route(
            "known-distance",
            "Known distance",
            [
                waypoint("a", 0, 0),
                waypoint("b", 1, 0)
            ]
        );

        expect(calculateDistanceNm(route)).toBeCloseTo(60.04, 1);
    });

    it("calculates total distance for multiple waypoints", () => {
        const route = new Route(
            "multi-leg",
            "Multi-leg route",
            [
                waypoint("a", 0, 0),
                waypoint("b", 1, 0),
                waypoint("c", 1, 1)
            ]
        );

        expect(calculateTotalDistanceNm(route)).toBeCloseTo(120.08, 1);
        expect(calculateRoute(route).legDistancesNm).toHaveLength(2);
    });

    it("calculates basic cardinal bearings", () => {
        const origin = waypoint("origin", 0, 0);

        expect(calculateBearing(origin, waypoint("north", 1, 0))).toBeCloseTo(0, 5);
        expect(calculateBearing(origin, waypoint("east", 0, 1))).toBeCloseTo(90, 5);
        expect(calculateBearing(origin, waypoint("south", -1, 0))).toBeCloseTo(180, 5);
        expect(calculateBearing(origin, waypoint("west", 0, -1))).toBeCloseTo(270, 5);
    });

    it("normalizes bearings to the expected range", () => {
        expect(normalizeBearing(-90)).toBe(270);
        expect(normalizeBearing(450)).toBe(90);
        expect(normalizeBearing(360)).toBe(0);
        expect(normalizeBearing(719.9999)).toBeCloseTo(359.999, 3);
    });

    it("rejects an empty route", () => {
        const result = validateRoute(new Route("empty", "Empty"));

        expect(result.valid).toBe(false);
        expect(result.errors).toEqual(expect.arrayContaining([
            "Route must contain at least one waypoint."
        ]));
    });

    it("rejects waypoints with invalid coordinates", () => {
        const route = new Route(
            "invalid",
            "Invalid",
            [waypoint("invalid", Number.NaN, Number.POSITIVE_INFINITY)]
        );

        const result = validateRoute(route);

        expect(result.valid).toBe(false);
        expect(result.errors).toEqual(expect.arrayContaining([
            "Waypoint 0 must have finite latitude and longitude."
        ]));
    });

    it("detects consecutive duplicate waypoints", () => {
        const point = waypoint("point", 36, -4);
        const result = validateRoute(new Route(
            "duplicate",
            "Duplicate",
            [point, waypoint("duplicate", point.lat, point.lng)]
        ));

        expect(result.valid).toBe(false);
        expect(result.errors).toEqual(expect.arrayContaining([
            "Waypoints 0 and 1 must not be duplicates."
        ]));
    });

    it("accepts a valid route with multiple waypoints", () => {
        const result = calculateRoute(new Route(
            "valid",
            "Valid",
            [
                waypoint("a", 36, -4),
                waypoint("b", 36.1, -4),
                waypoint("c", 36.1, -3.9)
            ]
        ));

        expect(result.valid).toBe(true);
        expect(result.errors).toHaveLength(0);
        expect(result.legDistancesNm).toHaveLength(2);
        expect(result.legBearings).toHaveLength(2);
        expect(result.totalDistanceNm).toBeGreaterThan(0);
    });
});
