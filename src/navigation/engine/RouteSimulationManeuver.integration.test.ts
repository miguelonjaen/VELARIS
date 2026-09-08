import { describe, expect, it, afterEach, vi } from "vitest";
import { SimulationService } from "../../core/services/SimulationService";
import { CoreState } from "../../core/CoreState";
import { ManeuverEngineAdapter } from "./ManeuverEngineAdapter";
import { ManeuverEventStore } from "./ManeuverEventStore";
import { persistManeuverEvents } from "./ManeuverLogPersistence";
import { Route } from "./Route";
import { Waypoint } from "../../tactical/contacts/Waypoint";
import { getSimulationPath } from "./RouteSimulationAdapter";
import { logRepository } from "../../lib/supabaseRepository";

describe("Route to simulation to maneuver integration", () => {
    const originalDateNow = Date.now;

    afterEach(() => {
        Date.now = originalDateNow;
    });

    it("detects a course change when simulation advances to the next route segment", () => {
        let simulatedTimestamp = 1_700_000_000_000;
        Date.now = () => simulatedTimestamp;

        const route = new Route(
            "integration-route",
            "Integration route",
            [
                new Waypoint("wp0", 0, 0),
                new Waypoint("wp1", 0, 0.1),
                new Waypoint("wp2", 0.1, 0.1)
            ]
        );
        const simulationRoute = getSimulationPath(route);

        expect(simulationRoute.valid).toBe(true);
        expect(simulationRoute.path).toHaveLength(3);

        const simulation = new SimulationService();
        const maneuverAdapter = new ManeuverEngineAdapter();
        const firstPosition = {
            lat: simulationRoute.path[0][0],
            lng: simulationRoute.path[0][1]
        };
        let position = firstPosition;
        let firstSegmentPosition: { lat: number; lng: number } | null = null;
        let reachedFirstWaypoint = false;
        let secondSegmentPosition: { lat: number; lng: number } | null = null;
        let firstGpsCount = 0;
        let maneuverEvent = null;

        simulation.resetNavigation(1);

        for (let tick = 0; tick < 5_000; tick += 1) {
            simulatedTimestamp += 1_000;
            const gps = simulation.tick({
                position,
                route: simulationRoute.path,
                sog: 6,
                speedMultiplier: 1
            });

            if (!gps) {
                continue;
            }

            firstGpsCount += 1;
            const nextPosition = { lat: gps.lat, lng: gps.lng };
            if (!firstSegmentPosition && gps.lng > firstPosition.lng) {
                firstSegmentPosition = nextPosition;
            }
            if (!reachedFirstWaypoint
                && Math.abs(gps.lat - simulationRoute.path[1][0]) < 0.000001
                && gps.lng >= simulationRoute.path[1][1] - 0.001) {
                reachedFirstWaypoint = true;
            }
            if (reachedFirstWaypoint && gps.lat > simulationRoute.path[1][0]) {
                secondSegmentPosition = nextPosition;
            }

            const detectedManeuver = maneuverAdapter.process({
                timestamp: simulatedTimestamp,
                position: nextPosition,
                sog: gps.sog,
                cog: gps.cog,
                windDirection: 220,
                windSpeed: 14
            });
            if (detectedManeuver) {
                maneuverEvent = detectedManeuver;
            }
            position = nextPosition;
        }

        expect(firstGpsCount).toBeGreaterThan(1);
        expect(firstSegmentPosition).not.toBeNull();
        expect(reachedFirstWaypoint).toBe(true);
        expect(secondSegmentPosition).not.toBeNull();
        expect(maneuverEvent).not.toBeNull();
        expect(["COURSE_CHANGE", "TACK", "GYBE"]).toContain(maneuverEvent?.type);
        expect(maneuverEvent?.courseBefore).toBeGreaterThan(80);
        expect(maneuverEvent?.courseBefore).toBeLessThan(100);
        expect(maneuverEvent?.courseAfter).toBeGreaterThanOrEqual(0);
        expect(maneuverEvent?.courseAfter).toBeLessThanOrEqual(1);
        expect(Math.abs(maneuverEvent?.deltaCourse ?? 0)).toBeGreaterThanOrEqual(30);
        expect(Number.isFinite(maneuverEvent?.timestamp)).toBe(true);
        expect(Number.isFinite(maneuverEvent?.position.lat)).toBe(true);
        expect(Number.isFinite(maneuverEvent?.position.lng)).toBe(true);
    });

    it("runs the controlled voyage closure flow without duplicating maneuver logs", async () => {
        let simulatedTimestamp = 1_700_001_000_000;
        Date.now = () => simulatedTimestamp;

        const route = new Route(
            "e2e-route",
            "Controlled E2E route",
            [
                Object.assign(new Waypoint("wp0", 0, 0), { name: "Salida" }),
                Object.assign(new Waypoint("wp1", 0, 0.02), { name: "Virada norte" }),
                Object.assign(new Waypoint("wp2", 0.02, 0.02), { name: "Virada este" }),
                Object.assign(new Waypoint("wp3", 0.02, 0.04), { name: "Final" })
            ]
        );
        const simulationRoute = getSimulationPath(route);
        const simulation = new SimulationService();
        const coreState = new CoreState();
        const maneuverAdapter = new ManeuverEngineAdapter();
        const maneuverStore = new ManeuverEventStore();
        const waypoints = route.waypoints;
        const insertEntry = vi
            .spyOn(logRepository, "insertEntry")
            .mockResolvedValue({ data: [], error: null });
        let position = {
            lat: simulationRoute.path[0][0],
            lng: simulationRoute.path[0][1]
        };
        let moved = false;
        let reachedWaypoint = false;

        simulation.resetNavigation(1);
        coreState.updateWind(14, 180);

        for (let tick = 0; tick < 1_200; tick += 1) {
            simulatedTimestamp += 1_000;
            const gps = simulation.tick({
                position,
                route: simulationRoute.path,
                sog: 6,
                speedMultiplier: 1
            });

            if (!gps) break;

            const nextPosition = { lat: gps.lat, lng: gps.lng };
            moved ||= nextPosition.lat !== position.lat || nextPosition.lng !== position.lng;
            const reached = waypoints.find(waypoint =>
                Math.abs(waypoint.lat - nextPosition.lat) < 0.001
                && Math.abs(waypoint.lng - nextPosition.lng) < 0.001
            );

            if (reached && reached.id !== "wp0") {
                reachedWaypoint = true;
            }

            coreState.updatePosition(
                gps.lat,
                gps.lng,
                gps.sog,
                gps.cog,
                "system"
            );

            const event = maneuverAdapter.process({
                timestamp: simulatedTimestamp,
                position: coreState.shipPosition!,
                sog: coreState.sog,
                cog: coreState.cog,
                windDirection: coreState.wind.angle,
                windSpeed: coreState.wind.speed,
                waypoint: reached
                    ? {
                        id: reached.id,
                        lat: reached.lat,
                        lng: reached.lng,
                        name: reached.name
                    }
                    : undefined
            });

            if (event) maneuverStore.add(event);
            position = nextPosition;
        }

        expect(moved).toBe(true);
        expect(reachedWaypoint).toBe(true);
        expect(maneuverStore.size()).toBeGreaterThanOrEqual(2);

        const storedEvents = maneuverStore.getAll();
        expect(storedEvents.some(event => event.type === "WAYPOINT_REACHED")).toBe(true);
        expect(storedEvents.some(event => event.type === "COURSE_CHANGE")).toBe(true);
        expect(storedEvents.map(event => event.timestamp)).toEqual(
            [...storedEvents]
                .sort((first, second) => first.timestamp - second.timestamp)
                .map(event => event.timestamp)
        );

        const persistedKeys = new Set<string>();
        const writer = (entry: Parameters<typeof logRepository.insertEntry>[0]) =>
            logRepository.insertEntry(entry);
        const context = {
            barcoId: "boat-e2e",
            userId: "user-e2e",
            fecha: "2026-09-08T08:00:00.000Z",
            tipoNavegacion: "Planificada" as const,
            destinoPlanificado: "Final"
        };

        const firstClose = await persistManeuverEvents(
            storedEvents,
            context,
            writer,
            persistedKeys
        );
        const secondClose = await persistManeuverEvents(
            storedEvents,
            context,
            writer,
            persistedKeys
        );

        expect(firstClose).toEqual({
            attempted: storedEvents.length,
            persisted: storedEvents.length,
            failed: 0
        });
        expect(secondClose).toEqual({
            attempted: 0,
            persisted: 0,
            failed: 0
        });
        expect(insertEntry).toHaveBeenCalledTimes(storedEvents.length);

        const entries = insertEntry.mock.calls.map(([entry]) => entry);
        expect(entries.every(entry =>
            entry.categoria === "Técnico" && entry.is_auto === true
        )).toBe(true);
        expect(entries.map(entry => entry.titulo)).toEqual(
            storedEvents.map(event => {
                switch (event.type) {
                    case "COURSE_CHANGE":
                        return "Cambio de rumbo";
                    case "WAYPOINT_REACHED":
                        return "Waypoint alcanzado";
                    case "TACK":
                        return "Virada";
                    case "GYBE":
                        return "Trasluchada";
                }
            })
        );
        expect(entries.every(entry =>
            Number.isFinite(entry.lat)
            && Number.isFinite(entry.lng)
        )).toBe(true);
        expect(entries.some(entry =>
            Number.isFinite(entry.rumbo)
            && Number.isFinite(entry.velocidad_gps)
            && Number.isFinite(entry.viento_nudos)
        )).toBe(true);
    });
});
