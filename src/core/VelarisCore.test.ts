import { describe, expect, it, vi } from "vitest";
import { VelarisCore } from "./VelarisCore";
import type { ActiveRoute } from "./domain/NavigationTypes";
import type { VELARISAlarm } from "@/shared/types";

const route: ActiveRoute = {
    id: "route-1",
    name: "Prueba",
    waypoints: [
        {
            id: "wp-1",
            name: "Salida",
            position: { lat: 36, lng: -4 }
        }
    ]
};

const alert: VELARISAlarm = {
    id: "alert-1",
    type: "depth",
    severity: "warning",
    message: "Depth warning",
    timestamp: 1,
    value: 4
};

describe("VelarisCore", () => {
    it("creates the expected initial state", () => {
        const core = new VelarisCore();

        expect(core.getState()).toEqual({
            vessel: {
                position: null,
                heading: 0,
                cog: 0,
                sog: 0,
                timestamp: null
            },
            navigation: {
                status: "idle",
                activeWaypointIndex: 0,
                distanceToWaypoint: null,
                distanceRemaining: null,
                bearingToWaypoint: null,
                crossTrackError: null,
                eta: null,
                etaSeconds: null,
                vmg: null
            },
            environment: {
                depth: 0,
                wind: { speed: 0, angle: 0 },
                weather: null
            },
            activeRoute: null,
            alerts: []
        });
    });

    it("updates vessel state partially", () => {
        const core = new VelarisCore();

        core.updateVessel({
            position: { lat: 36.1, lng: -3.9 },
            heading: 180,
            cog: 175,
            sog: 6.4
        });
        core.updateVessel({ sog: 7 });

        expect(core.getState().vessel).toMatchObject({
            position: { lat: 36.1, lng: -3.9 },
            heading: 180,
            cog: 175,
            sog: 7
        });
    });

    it("updates environment and navigation state partially", () => {
        const core = new VelarisCore();

        core.updateEnvironment({ depth: 18, wind: { speed: 12 } });
        core.updateNavigation({ status: "planned", distanceRemaining: 24 });

        expect(core.getState().environment).toEqual({
            depth: 18,
            wind: { speed: 12, angle: 0 },
            weather: null
        });
        expect(core.getState().navigation).toMatchObject({
            status: "planned",
            distanceRemaining: 24
        });
    });

    it("sets and clears the active route", () => {
        const core = new VelarisCore();

        core.setRoute(route);
        expect(core.getState().activeRoute).toEqual(route);

        core.clearRoute();
        expect(core.getState().activeRoute).toBeNull();
    });

    it("publishes events and supports unsubscribe", () => {
        const core = new VelarisCore();
        const handler = vi.fn();
        const unsubscribe = core.subscribe("VesselPositionChanged", handler);

        core.updateVessel({ position: { lat: 1, lng: 2 } });
        unsubscribe();
        core.updateVessel({ position: { lat: 3, lng: 4 } });

        expect(handler).toHaveBeenCalledTimes(1);
        expect(handler.mock.calls[0][0].payload).toEqual({
            position: { lat: 1, lng: 2 }
        });
    });

    it("publishes navigation and route events", () => {
        const core = new VelarisCore();
        const started = vi.fn();
        const routeChanged = vi.fn();

        core.subscribe("NavigationStarted", started);
        core.subscribe("RouteChanged", routeChanged);
        core.setRoute(route);
        core.updateNavigation({ status: "navigating" });

        expect(routeChanged).toHaveBeenCalledOnce();
        expect(started).toHaveBeenCalledOnce();
    });

    it("publishes ActiveWaypointChanged without publishing WaypointReached", () => {
        const core = new VelarisCore();
        const activeWaypointChanged = vi.fn();
        const waypointReached = vi.fn();

        core.subscribe("ActiveWaypointChanged", activeWaypointChanged);
        core.subscribe("WaypointReached", waypointReached);
        core.updateNavigation({ activeWaypointIndex: 2 });

        expect(activeWaypointChanged).toHaveBeenCalledOnce();
        expect(activeWaypointChanged.mock.calls[0][0].payload).toEqual({
            waypointIndex: 2
        });
        expect(waypointReached).not.toHaveBeenCalled();
    });

    it("clears an existing alert and publishes AlertCleared", () => {
        const core = new VelarisCore();
        const alertCleared = vi.fn();

        core.raiseAlert(alert);
        core.subscribe("AlertCleared", alertCleared);
        core.clearAlert(alert.id);

        expect(core.getState().alerts).toEqual([]);
        expect(alertCleared).toHaveBeenCalledOnce();
        expect(alertCleared.mock.calls[0][0].payload).toEqual({
            alertId: alert.id
        });
    });

    it("does not change state or publish AlertCleared for an unknown alert", () => {
        const core = new VelarisCore();
        const alertCleared = vi.fn();

        core.raiseAlert(alert);
        const stateBefore = core.getState();
        core.subscribe("AlertCleared", alertCleared);
        core.clearAlert("missing-alert");

        expect(core.getState()).toEqual(stateBefore);
        expect(alertCleared).not.toHaveBeenCalled();
    });

    it("does not expose mutable internal state", () => {
        const core = new VelarisCore();
        const state = core.getState();

        state.vessel.position = { lat: 9, lng: 9 };
        state.environment.wind.speed = 99;

        expect(core.getState().vessel.position).toBeNull();
        expect(core.getState().environment.wind.speed).toBe(0);
    });
});
