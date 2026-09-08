import { describe, expect, it } from "vitest";
import { Route } from "./Route";
import { Waypoint } from "../../tactical/contacts/Waypoint";
import {
    getSimulationPath,
    routeToSimulationPath,
    validateSimulationRoute
} from "./RouteSimulationAdapter";

const waypoint = (id: string, lat: number, lng: number): Waypoint =>
    new Waypoint(id, lat, lng);

describe("RouteSimulationAdapter", () => {
    it("converts multiple waypoints to [lat, lng] pairs", () => {
        const route = new Route(
            "route",
            "Route",
            [
                waypoint("a", 36, -4),
                waypoint("b", 36.1, -3.9)
            ]
        );

        expect(routeToSimulationPath(route)).toEqual([
            [36, -4],
            [36.1, -3.9]
        ]);
    });

    it("preserves waypoint order", () => {
        const route = new Route(
            "ordered",
            "Ordered",
            [
                waypoint("first", 1, 2),
                waypoint("second", 3, 4),
                waypoint("third", 5, 6)
            ]
        );

        expect(routeToSimulationPath(route)).toEqual([
            [1, 2],
            [3, 4],
            [5, 6]
        ]);
    });

    it("does not modify the original route", () => {
        const waypoints = [
            waypoint("a", 36, -4),
            waypoint("b", 36.1, -3.9)
        ];
        const route = new Route("immutable", "Immutable", waypoints);
        const originalWaypoints = [...route.waypoints];
        const path = routeToSimulationPath(route);

        path[0][0] = 99;

        expect(route.waypoints).toEqual(originalWaypoints);
        expect(route.waypoints[0].lat).toBe(36);
        expect(route.waypoints[0].lng).toBe(-4);
    });

    it("rejects an empty route", () => {
        const result = getSimulationPath(new Route("empty", "Empty"));

        expect(result.valid).toBe(false);
        expect(result.path).toEqual([]);
    });

    it("rejects a route with one waypoint", () => {
        const route = new Route(
            "single",
            "Single",
            [waypoint("only", 36, -4)]
        );

        const result = validateSimulationRoute(route);

        expect(result.valid).toBe(false);
        expect(result.errors).toContain(
            "Route must contain at least two waypoints for navigation."
        );
    });

    it("rejects invalid coordinates", () => {
        const route = new Route(
            "invalid-coordinates",
            "Invalid coordinates",
            [
                waypoint("invalid", Number.NaN, -4),
                waypoint("valid", 36.1, -3.9)
            ]
        );

        const result = getSimulationPath(route);

        expect(result.valid).toBe(false);
        expect(result.path).toEqual([]);
        expect(result.errors).toContain(
            "Waypoint 0 must have finite latitude and longitude."
        );
    });

    it("rejects consecutive duplicate waypoints", () => {
        const route = new Route(
            "duplicates",
            "Duplicates",
            [
                waypoint("a", 36, -4),
                waypoint("duplicate", 36, -4),
                waypoint("b", 36.1, -3.9)
            ]
        );

        const result = validateSimulationRoute(route);

        expect(result.valid).toBe(false);
        expect(result.errors).toContain(
            "Waypoints 0 and 1 must not be duplicates."
        );
    });

    it("returns a valid simulation path for a valid route", () => {
        const route = new Route(
            "valid",
            "Valid",
            [
                waypoint("a", 36, -4),
                waypoint("b", 36.1, -4),
                waypoint("c", 36.1, -3.9)
            ]
        );

        const result = getSimulationPath(route);

        expect(result.valid).toBe(true);
        expect(result.errors).toHaveLength(0);
        expect(result.path).toEqual([
            [36, -4],
            [36.1, -4],
            [36.1, -3.9]
        ]);
    });
});
