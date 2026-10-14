import { describe, expect, it, vi } from "vitest";
import { CoreState } from "@/core/CoreState";
import { VelarisCore } from "@/core/VelarisCore";
import { NavigationAdapter } from "@/core/adapters/NavigationAdapter";
import { NavigationEngine } from "@/core/navigation/NavigationEngine";
import { TelemetryService } from "./TelemetryService";
import type { GPSTelemetry, WindTelemetry, DepthTelemetry } from "@/core/types/TelemetryMessage";
import type { ActiveRoute } from "@/core/domain/NavigationTypes";

const testRoute: ActiveRoute = {
    id: "route-test-1",
    name: "Travesia Test",
    waypoints: [
        {
            id: "wp-0",
            name: "Origen",
            position: { lat: 36.0, lng: -4.0 },
            radiusNm: 0.1
        },
        {
            id: "wp-1",
            name: "Destino",
            position: { lat: 37.0, lng: -4.0 },
            radiusNm: 0.1
        }
    ]
};

describe("TelemetryService — Phase 1: VelarisCore Connection", () => {
    it("1. propagates position update to VelarisCore", () => {
        const state = new CoreState();
        const core = new VelarisCore();
        const telemetry = new TelemetryService(state, core);

        const gpsData: GPSTelemetry = {
            type: "GPS",
            lat: 36.5,
            lng: -4.2,
            sog: 6.0,
            cog: 90
        };

        telemetry.process(gpsData);

        expect(core.getState().vessel.position).toEqual({
            lat: 36.5,
            lng: -4.2
        });
    });

    it("2. propagates COG update to VelarisCore", () => {
        const state = new CoreState();
        const core = new VelarisCore();
        const telemetry = new TelemetryService(state, core);

        const gpsData: GPSTelemetry = {
            type: "GPS",
            lat: 36.5,
            lng: -4.2,
            sog: 5.5,
            cog: 185
        };

        telemetry.process(gpsData);

        expect(core.getState().vessel.cog).toBe(185);
    });

    it("3. propagates SOG update to VelarisCore", () => {
        const state = new CoreState();
        const core = new VelarisCore();
        const telemetry = new TelemetryService(state, core);

        const gpsData: GPSTelemetry = {
            type: "GPS",
            lat: 36.5,
            lng: -4.2,
            sog: 7.8,
            cog: 180
        };

        telemetry.process(gpsData);

        expect(core.getState().vessel.sog).toBe(7.8);
    });

    it("4. propagates depth update to VelarisCore", () => {
        const state = new CoreState();
        const core = new VelarisCore();
        const telemetry = new TelemetryService(state, core);

        const depthData: DepthTelemetry = {
            type: "DEPTH",
            depth: 14.2
        };

        telemetry.process(depthData);

        expect(core.getState().environment.depth).toBe(14.2);
    });

    it("5. propagates wind update to VelarisCore", () => {
        const state = new CoreState();
        const core = new VelarisCore();
        const telemetry = new TelemetryService(state, core);

        const windData: WindTelemetry = {
            type: "WIND",
            speed: 18.5,
            angle: 45
        };

        telemetry.process(windData);

        expect(core.getState().environment.wind).toEqual({
            speed: 18.5,
            angle: 45
        });
    });

    it("6. does NOT invent HDG from COG when heading is not provided, and updates HDG when provided", () => {
        const state = new CoreState();
        const core = new VelarisCore();
        const telemetry = new TelemetryService(state, core);

        // Initial heading in core is 0
        expect(core.getState().vessel.heading).toBe(0);

        // GPS data without heading property
        const gpsWithoutHdg: GPSTelemetry = {
            type: "GPS",
            lat: 36.0,
            lng: -4.0,
            sog: 6.0,
            cog: 270
        };

        telemetry.process(gpsWithoutHdg);

        // Heading must remain 0 and NOT be replaced by COG (270)
        expect(core.getState().vessel.cog).toBe(270);
        expect(core.getState().vessel.heading).toBe(0);

        // GPS / Compass data with explicit real heading
        const gpsWithRealHdg: GPSTelemetry = {
            type: "GPS",
            lat: 36.0,
            lng: -4.0,
            sog: 6.0,
            cog: 270,
            heading: 265
        };

        telemetry.process(gpsWithRealHdg);

        expect(core.getState().vessel.heading).toBe(265);
        expect(core.getState().vessel.cog).toBe(270);
    });

    it("7. continues updating CoreState exactly as before", () => {
        const state = new CoreState();
        const core = new VelarisCore();
        const telemetry = new TelemetryService(state, core);

        telemetry.process({
            type: "GPS",
            lat: 36.12,
            lng: -4.34,
            sog: 8.2,
            cog: 120
        });

        telemetry.process({
            type: "WIND",
            speed: 15,
            angle: 90
        });

        telemetry.process({
            type: "DEPTH",
            depth: 22.5
        });

        expect(state.shipPosition).toEqual({ lat: 36.12, lng: -4.34 });
        expect(state.sog).toBe(8.2);
        expect(state.cog).toBe(120);
        expect(state.wind).toEqual({ speed: 15, angle: 90 });
        expect(state.depth).toBe(22.5);
    });

    it("8. receives updates without event loops or recursive triggers", () => {
        const state = new CoreState();
        const core = new VelarisCore();
        const telemetry = new TelemetryService(state, core);

        const updateVesselSpy = vi.spyOn(core, "updateVessel");
        const updateEnvironmentSpy = vi.spyOn(core, "updateEnvironment");
        const updatePositionSpy = vi.spyOn(state, "updatePosition");

        telemetry.process({
            type: "GPS",
            lat: 36.0,
            lng: -4.0,
            sog: 5.0,
            cog: 0
        });

        telemetry.process({
            type: "DEPTH",
            depth: 10
        });

        telemetry.process({
            type: "WIND",
            speed: 12,
            angle: 30
        });

        expect(updateVesselSpy).toHaveBeenCalledTimes(1);
        expect(updateEnvironmentSpy).toHaveBeenCalledTimes(2);
        expect(updatePositionSpy).toHaveBeenCalledTimes(1);
    });

    it("9. triggers NavigationAdapter recalculation when position and route are valid", () => {
        const state = new CoreState();
        const core = new VelarisCore();
        const engine = new NavigationEngine();
        const calculateSpy = vi.spyOn(engine, "calculate");

        const adapter = new NavigationAdapter({ core, engine });
        adapter.start();

        const telemetry = new TelemetryService(state, core);

        // Set route and active waypoint index
        core.setRoute(testRoute);
        core.updateNavigation({ activeWaypointIndex: 1 });

        // Process GPS message via TelemetryService
        telemetry.process({
            type: "GPS",
            lat: 36.5,
            lng: -4.0,
            sog: 6.0,
            cog: 0
        });

        expect(calculateSpy).toHaveBeenCalled();

        const navState = core.getState().navigation;
        expect(navState.distanceToWaypoint).toBeCloseTo(30.02, 1);
        expect(navState.bearingToWaypoint).toBe(0);
        expect(navState.crossTrackError).toBe(0);
        expect(navState.etaSeconds).toBeCloseTo(18012.1, 0);

        adapter.dispose();
    });

    it("10. does not generate errors or false metrics when position or route are missing", () => {
        const state = new CoreState();
        const core = new VelarisCore();
        const engine = new NavigationEngine();
        const calculateSpy = vi.spyOn(engine, "calculate");

        const adapter = new NavigationAdapter({ core, engine });
        adapter.start();

        const telemetry = new TelemetryService(state, core);

        // Process telemetry without setting route
        expect(() => {
            telemetry.process({
                type: "GPS",
                lat: 36.5,
                lng: -4.0,
                sog: 6.0,
                cog: 0
            });
        }).not.toThrow();

        expect(calculateSpy).not.toHaveBeenCalled();

        const navState = core.getState().navigation;
        expect(navState.distanceToWaypoint).toBeNull();
        expect(navState.bearingToWaypoint).toBeNull();
        expect(navState.crossTrackError).toBeNull();
        expect(navState.etaSeconds).toBeNull();

        adapter.dispose();
    });

    it("11. processes standalone HEADING message and updates VelarisCore vessel heading", () => {
        const state = new CoreState();
        const core = new VelarisCore();
        const telemetry = new TelemetryService(state, core);

        telemetry.process({
            type: "HEADING",
            heading: 265.5,
            headingType: "true"
        });

        expect(core.getState().vessel.heading).toBe(265.5);
    });
});

\n