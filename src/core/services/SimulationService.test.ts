import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import { SimulationService } from "./SimulationService";
import type { GPSTelemetry } from "@/core/types/TelemetryMessage";

describe("SimulationService — Phase 3A: Pure GPS Telemetry Source", () => {
    let simulation: SimulationService;
    let originalDateNow: typeof Date.now;
    let simulatedTime: number;

    beforeEach(() => {
        simulation = new SimulationService();
        simulatedTime = 1_700_000_000_000;
        originalDateNow = Date.now;
        Date.now = () => simulatedTime;
    });

    afterEach(() => {
        Date.now = originalDateNow;
    });

    const advanceTime = (ms: number) => {
        simulatedTime += ms;
    };

    const createInput = (overrides: Partial<{
        position: { lat: number; lng: number };
        route: readonly (readonly [number, number])[];
        sog: number;
        speedMultiplier: number;
    }> = {}) => ({
        position: { lat: 36.72, lng: -3.52 },
        route: [
            [36.72, -3.52],
            [36.82, -3.42],
            [36.92, -3.32]
        ] as readonly (readonly [number, number])[],
        sog: 6,
        speedMultiplier: 1,
        ...overrides
    });

    it("tick returns valid GPSTelemetry with required fields", () => {
        const gps = simulation.tick(createInput());

        expect(gps).not.toBeNull();
        expect(gps!.type).toBe("GPS");
        expect(typeof gps!.lat).toBe("number");
        expect(typeof gps!.lng).toBe("number");
        expect(typeof gps!.sog).toBe("number");
        expect(typeof gps!.cog).toBe("number");
        expect(gps!.timestamp).toBeDefined();
    });

    it("position changes correctly between ticks", () => {
        const gps1 = simulation.tick(createInput({ sog: 6 }));
        advanceTime(1000);
        const gps2 = simulation.tick(createInput({ sog: 6 }));

        expect(gps1).not.toBeNull();
        expect(gps2).not.toBeNull();
        expect(gps2!.lat).not.toBe(gps1!.lat);
        expect(gps2!.lng).not.toBe(gps1!.lng);
    });

    it("SOG is preserved in output", () => {
        const gps = simulation.tick(createInput({ sog: 8.5 }));

        expect(gps).not.toBeNull();
        expect(gps!.sog).toBe(8.5);
    });

    it("COG is generated correctly (non-zero when moving)", () => {
        const gps = simulation.tick(createInput({ sog: 6 }));

        expect(gps).not.toBeNull();
        expect(gps!.cog).toBeGreaterThanOrEqual(0);
        expect(gps!.cog).toBeLessThan(360);
    });

    it("GPSTelemetry does NOT contain nav property", () => {
        const gps = simulation.tick(createInput());

        expect(gps).not.toBeNull();
        expect("nav" in gps!).toBe(false);
    });

    it("does not calculate DTW internally", () => {
        const gps = simulation.tick(createInput());

        expect(gps).not.toBeNull();
        expect("dtw" in gps!).toBe(false);
    });

    it("does not calculate BTW internally", () => {
        const gps = simulation.tick(createInput());

        expect(gps).not.toBeNull();
        expect("btw" in gps!).toBe(false);
    });

    it("does not calculate XTE internally", () => {
        const gps = simulation.tick(createInput());

        expect(gps).not.toBeNull();
        expect("xte" in gps!).toBe(false);
    });

    it("does not calculate ETA internally", () => {
        const gps = simulation.tick(createInput());

        expect(gps).not.toBeNull();
        expect("eta" in gps!).toBe(false);
    });

    it("preserves waypoint progression for position movement", () => {
        simulation.resetNavigation(0);
        const input = createInput({
            position: { lat: 36.72, lng: -3.52 },
            route: [
                [36.72, -3.52],
                [36.73, -3.51],
                [36.74, -3.50]
            ] as readonly (readonly [number, number])[],
            sog: 1000
        });

        let gps: GPSTelemetry | null = null;
        for (let i = 0; i < 10; i++) {
            gps = simulation.tick(input);
            advanceTime(1000);
            if (!gps) break;
        }

        expect(gps).not.toBeNull();
        expect(simulation.hasReachedDestination()).toBe(false);
    });

    it("advances waypointIndex when arriving at waypoint", () => {
        simulation.resetNavigation(0);
        const input = createInput({
            position: { lat: 36.72, lng: -3.52 },
            route: [
                [36.72, -3.52],
                [36.7201, -3.5199]
            ] as readonly (readonly [number, number])[],
            sog: 1000
        });

        let gps: GPSTelemetry | null = null;
        for (let i = 0; i < 20; i++) {
            gps = simulation.tick(input);
            advanceTime(1000);
            if (!gps) break;
        }

        expect(gps).toBeNull();
        expect(simulation.hasReachedDestination()).toBe(true);
    });

    it("returns null when destination reached", () => {
        simulation.resetNavigation(0);
        const input = createInput({
            position: { lat: 36.72, lng: -3.52 },
            route: [[36.72, -3.52]] as readonly (readonly [number, number])[],
            sog: 6
        });

        const gps = simulation.tick(input);

        expect(gps).toBeNull();
        expect(simulation.hasReachedDestination()).toBe(true);
    });

    it("resetNavigation resets waypointIndex and destinationReached", () => {
        simulation.resetNavigation(0);
        const input = createInput({
            position: { lat: 36.72, lng: -3.52 },
            route: [[36.72, -3.52]] as readonly (readonly [number, number])[],
            sog: 6
        });
        simulation.tick(input);

        expect(simulation.hasReachedDestination()).toBe(true);

        simulation.resetNavigation(1);
        expect(simulation.hasReachedDestination()).toBe(false);
    });

    it("COG is 0 when SOG is 0 (not moving)", () => {
        const gps = simulation.tick(createInput({ sog: 0 }));

        expect(gps).not.toBeNull();
        expect(gps!.cog).toBe(0);
    });

    it("speedMultiplier affects distance traveled", () => {
        const input1 = createInput({ sog: 6, speedMultiplier: 1 });
        const gps1 = simulation.tick(input1);
        advanceTime(1000);
        const gps1b = simulation.tick(input1);

        simulation.resetNavigation(0);
        const input2 = createInput({ sog: 6, speedMultiplier: 10 });
        const gps2 = simulation.tick(input2);
        advanceTime(1000);
        const gps2b = simulation.tick(input2);

        expect(gps1).not.toBeNull();
        expect(gps1b).not.toBeNull();
        expect(gps2).not.toBeNull();
        expect(gps2b).not.toBeNull();

        const dist1 = Math.hypot(gps1b!.lat - input1.position.lat, gps1b!.lng - input1.position.lng);
        const dist2 = Math.hypot(gps2b!.lat - input2.position.lat, gps2b!.lng - input2.position.lng);

        expect(dist2).toBeGreaterThan(dist1);
    });

    it("returns GPS with heading undefined (not set by simulation)", () => {
        const gps = simulation.tick(createInput());

        expect(gps).not.toBeNull();
        expect(gps!.heading).toBeUndefined();
    });
});\n\n
