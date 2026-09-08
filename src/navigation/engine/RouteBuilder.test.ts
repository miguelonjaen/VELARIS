import { describe, expect, it } from "vitest";
import { RouteBuilder } from "./RouteBuilder";
import { Waypoint } from "../../tactical/contacts/Waypoint";

const waypoint = (id: string, lat: number, lng: number): Waypoint =>
    new Waypoint(id, lat, lng);

describe("RouteBuilder", () => {
    it("adds two waypoints and calculates a valid route", () => {
        const builder = new RouteBuilder("Test route");

        builder.addWaypoint(waypoint("a", 36, -4));
        builder.addWaypoint(waypoint("b", 36.1, -4));

        const calculated = builder.calculate();

        expect(calculated.valid).toBe(true);
        expect(calculated.errors).toHaveLength(0);
        expect(calculated.totalDistanceNm).toBeGreaterThan(0);
    });

    it("returns total distance, leg distances, and bearings", () => {
        const builder = new RouteBuilder("Multi-leg route");

        builder.addWaypoint(waypoint("a", 36, -4));
        builder.addWaypoint(waypoint("b", 36.1, -4));
        builder.addWaypoint(waypoint("c", 36.1, -3.9));

        const calculated = builder.calculate();

        expect(calculated.totalDistanceNm).toBeGreaterThan(0);
        expect(calculated.legDistancesNm).toHaveLength(2);
        expect(calculated.legDistancesNm[0]).toBeGreaterThan(0);
        expect(calculated.legDistancesNm[1]).toBeGreaterThan(0);
        expect(calculated.legBearings).toHaveLength(2);
        expect(calculated.legBearings[0]).toBeCloseTo(0, 1);
        expect(calculated.legBearings[1]).toBeCloseTo(90, 1);
    });

    it("marks a route with one waypoint as invalid", () => {
        const builder = new RouteBuilder("Incomplete route");
        builder.addWaypoint(waypoint("only", 36, -4));

        expect(builder.calculate().valid).toBe(false);
    });

    it("marks the route as invalid after clearing it", () => {
        const builder = new RouteBuilder("Clearable route");
        builder.addWaypoint(waypoint("a", 36, -4));
        builder.addWaypoint(waypoint("b", 36.1, -4));

        builder.clear();

        const calculated = builder.calculate();
        expect(calculated.valid).toBe(false);
        expect(calculated.errors).toContain("Route must contain at least one waypoint.");
        expect(calculated.totalDistanceNm).toBe(0);
        expect(calculated.legDistancesNm).toHaveLength(0);
        expect(calculated.legBearings).toHaveLength(0);
    });
});
