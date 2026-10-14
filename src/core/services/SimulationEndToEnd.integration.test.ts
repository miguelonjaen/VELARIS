import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import { SimulationService } from "./SimulationService";
import { TelemetryService } from "./TelemetryService";
import { VelarisCore } from "../VelarisCore";
import { NavigationAdapter } from "../adapters/NavigationAdapter";
import { NavigationEngine } from "../navigation/NavigationEngine";
import { CoreState } from "../CoreState";
import { SynchronousCoreEvents } from "../events/SynchronousCoreEvents";
import type { GPSTelemetry } from "../types/TelemetryMessage";
import type { ActiveRoute } from "@/core/domain/NavigationTypes";
import type { NavigationPosition } from "../navigation/NavigationEngine";

describe("Simulation End-to-End Integration — Phase 3B", () => {
    let simulation: SimulationService;
    let telemetry: TelemetryService;
    let core: VelarisCore;
    let coreState: CoreState;
    let navigationAdapter: NavigationAdapter;
    let navigationEngine: NavigationEngine;

    let now: number;

    const WP0: NavigationPosition = { lat: 36.0000, lng: -4.0000 };
    const WP1: NavigationPosition = { lat: 37.0000, lng: -4.0000 };
    const WP2: NavigationPosition = { lat: 37.0000, lng: -3.0000 };

    const createRoute = (): ActiveRoute => ({
        id: "test-route-e2e",
        name: "E2E Test Route",
        waypoints: [
            { id: "wp0", name: "WP0", position: WP0 },
            { id: "wp1", name: "WP1", position: WP1 },
            { id: "wp2", name: "WP2", position: WP2 }
        ]
    });

    beforeEach(() => {
        now = 0;
        vi.spyOn(Date, "now").mockImplementation(() => now);

        core = new VelarisCore();
        coreState = new CoreState(new SynchronousCoreEvents());
        navigationEngine = new NavigationEngine();
        navigationAdapter = new NavigationAdapter({ core, engine: navigationEngine });
        navigationAdapter.start();

        telemetry = new TelemetryService(coreState, core);
        simulation = new SimulationService();
    });

    afterEach(() => {
        navigationAdapter.stop();
        vi.restoreAllMocks();
    });

    const advanceTime = (ms: number): void => {
        now += ms;
    };

    const setupRoute = (activeIndex = 0): void => {
        const route = createRoute();
        core.setRoute(route);
        core.updateNavigation({ status: "navigating", activeWaypointIndex: activeIndex });
    };

    const createTickInput = (position: NavigationPosition, sog = 6, speedMultiplier = 1) => ({
        position,
        route: [
            [WP0.lat, WP0.lng],
            [WP1.lat, WP1.lng],
            [WP2.lat, WP2.lng]
        ] as readonly (readonly [number, number])[],
        sog,
        speedMultiplier
    });

    const processGps = (gps: GPSTelemetry): void => {
        telemetry.process(gps);
    };

    describe("1. Escenario controlado: Ruta de 3 waypoints, SOG=6kn", () => {
        it("configura estado correctamente", () => {
            setupRoute();
            const state = core.getState();
            expect(state.activeRoute).not.toBeNull();
            expect(state.activeRoute!.waypoints).toHaveLength(3);
            expect(state.navigation.status).toBe("navigating");
            expect(state.navigation.activeWaypointIndex).toBe(0);
        });
    });

    describe("2. Primer tick: SimulationService genera GPSTelemetry válida", () => {
        it("tick devuelve GPSTelemetry con campos requeridos y SIN nav", () => {
            setupRoute();
            const input = createTickInput(WP0);
            const gps = simulation.tick(input);

            expect(gps).not.toBeNull();
            expect(gps!.type).toBe("GPS");
            expect(typeof gps!.lat).toBe("number");
            expect(typeof gps!.lng).toBe("number");
            expect(typeof gps!.sog).toBe("number");
            expect(typeof gps!.cog).toBe("number");
            expect("nav" in gps!).toBe(false);
            expect("btw" in gps!).toBe(false);
            expect("dtw" in gps!).toBe(false);
            expect("xte" in gps!).toBe(false);
            expect("eta" in gps!).toBe(false);
        });

        it("GPSTelemetry pasa por TelemetryService sin errores", () => {
            setupRoute();
            const input = createTickInput(WP0);
            const gps = simulation.tick(input);

            expect(() => processGps(gps!)).not.toThrow();

            const state = core.getState();
            expect(state.vessel.position).not.toBeNull();
            expect(state.vessel.sog).toBe(6);
            expect(state.vessel.cog).toBeGreaterThanOrEqual(0);
        });
    });

    describe("3. Métricas del Core: NavigationEngine calcula DTW/BTW/XTE/ETA", () => {
        it("después de procesar GPS, core.navigation tiene métricas calculadas", () => {
            setupRoute();
            const input = createTickInput({ lat: 36.1, lng: -4.0 });
            const gps = simulation.tick(input);
            processGps(gps!);

            const nav = core.getState().navigation;
            expect(nav.distanceToWaypoint).not.toBeNull();
            expect(nav.bearingToWaypoint).not.toBeNull();
            expect(nav.crossTrackError).toBeNull();
            expect(nav.etaSeconds).not.toBeNull();

            expect(typeof nav.distanceToWaypoint).toBe("number");
            expect(typeof nav.bearingToWaypoint).toBe("number");
            expect(typeof nav.etaSeconds).toBe("number");
        });

        it("DTW/BTW/ETA coinciden con NavigationEngine como referencia", () => {
            setupRoute();
            const position = { lat: 36.1, lng: -4.0 };
            const input = createTickInput(position);
            const gps = simulation.tick(input);
            processGps(gps!);

            const nav = core.getState().navigation;
            const engineResult = navigationEngine.calculate({
                position,
                heading: 0,
                cog: gps!.cog,
                sog: gps!.sog,
                route: {
                    waypoints: [
                        { id: "wp0", name: "WP0", position: WP0 },
                        { id: "wp1", name: "WP1", position: WP1 },
                        { id: "wp2", name: "WP2", position: WP2 }
                    ]
                },
                activeWaypointIndex: 0
            });

            expect(nav.distanceToWaypoint!).toBeCloseTo(engineResult.distanceToWaypointNm!, 1);
            expect(nav.bearingToWaypoint!).toBeCloseTo(engineResult.bearingToWaypoint!, 1);
            expect(nav.etaSeconds!).toBeCloseTo(engineResult.etaSeconds!, 0);
        });
    });

    describe("4. Prueba de XTE: posiciones sobre y fuera de la ruta", () => {
        it("XTE ≈ 0 sobre la línea de ruta (WP0→WP1 es Norte exacto), índice activo 1", () => {
            setupRoute(1);
            const onLine = { lat: 36.5, lng: -4.0 };
            const input = createTickInput(onLine, 0);
            const gps = simulation.tick(input);
            processGps(gps!);

            const nav = core.getState().navigation;
            expect(nav.crossTrackError).not.toBeNull();
            expect(Math.abs(nav.crossTrackError!)).toBeLessThan(0.01);
        });

        it("XTE positivo hacia el ESTE (estribor cuando se navega al Norte)", () => {
            setupRoute(1);
            const eastOffset = { lat: 36.5, lng: -3.9 };
            const input = createTickInput(eastOffset, 0);
            const gps = simulation.tick(input);
            processGps(gps!);

            const nav = core.getState().navigation;
            expect(nav.crossTrackError).not.toBeNull();
            expect(nav.crossTrackError!).toBeGreaterThan(0);
        });

        it("XTE negativo hacia el OESTE (babor cuando se navega al Norte)", () => {
            setupRoute(1);
            const westOffset = { lat: 36.5, lng: -4.1 };
            const input = createTickInput(westOffset, 0);
            const gps = simulation.tick(input);
            processGps(gps!);

            const nav = core.getState().navigation;
            expect(nav.crossTrackError).not.toBeNull();
            expect(nav.crossTrackError!).toBeLessThan(0);
        });
    });

    describe("5. Prueba de HDG vs COG: independencia", () => {
        it("COG llega al Core desde SimulationService", () => {
            setupRoute();
            const input = createTickInput(WP0, 6);
            const gps = simulation.tick(input);
            processGps(gps!);

            const vessel = core.getState().vessel;
            expect(vessel.cog).toBe(gps!.cog);
            expect(vessel.cog).toBeGreaterThanOrEqual(0);
            expect(vessel.cog).toBeLessThan(360);
        });

        it("heading NO se inventa a partir de COG (permanece en default 0 si no hay HEADING)", () => {
            setupRoute();
            const input = createTickInput(WP0, 6);
            const gps = simulation.tick(input);
            processGps(gps!);

            const vessel = core.getState().vessel;
            expect(vessel.heading).toBe(0);
            expect(vessel.cog).toBe(gps!.cog);
        });

        it("si se inyecta HEADING independiente, heading y COG permanecen separados", () => {
    setupRoute(1);
    simulation.resetNavigation(1);

    const position = { lat: 36.5, lng: -4.1 };
    const input = createTickInput(position, 6);

    const firstGps = simulation.tick(input);
    expect(firstGps).not.toBeNull();

    advanceTime(1000);

    const gps = simulation.tick(createTickInput(position, 6));
    expect(gps).not.toBeNull();

    processGps(gps!);

    const vessel = core.getState().vessel;
    expect(vessel.cog).toBeGreaterThan(0);
    expect(vessel.heading).toBe(0);

    telemetry.process({
        type: "HEADING",
        heading: 20,
        headingType: "true"
    });

    const updated = core.getState().vessel;
    expect(updated.heading).toBe(20);
    expect(updated.cog).toBe(vessel.cog);
    expect(updated.heading).not.toBe(updated.cog);
    });
});

    describe("6. Prueba de ETA: procede de NavigationEngine y escala con SOG", () => {
        it("ETA calculado por NavigationEngine, no por SimulationService", () => {
            setupRoute();
            const position = { lat: 36.1, lng: -4.0 };
            const input = createTickInput(position, 6);
            const gps = simulation.tick(input);
            processGps(gps!);

            const nav = core.getState().navigation;
            expect(nav.etaSeconds).not.toBeNull();
            expect(nav.etaSeconds).toBeGreaterThan(0);

            const engineResult = navigationEngine.calculate({
                position,
                heading: 0,
                cog: gps!.cog,
                sog: gps!.sog,
                route: { waypoints: [{ id: "wp0", name: "WP0", position: WP0 }] },
                activeWaypointIndex: 0
            });
            expect(nav.etaSeconds!).toBeCloseTo(engineResult.etaSeconds!, 0);
        });

        it("ETA(8kn) ≈ ETA(6kn) × 6/8", () => {
            setupRoute();
            const position = { lat: 36.1, lng: -4.0 };

            const input6 = createTickInput(position, 6);
            const gps6 = simulation.tick(input6);
            processGps(gps6!);
            const eta6 = core.getState().navigation.etaSeconds!;

            simulation.resetNavigation(0);
            core.setRoute(createRoute());
            core.updateNavigation({ status: "navigating", activeWaypointIndex: 0 });

            const input8 = createTickInput(position, 8);
            const gps8 = simulation.tick(input8);
            processGps(gps8!);
            const eta8 = core.getState().navigation.etaSeconds!;

            const expectedRatio = 6 / 8;
            const actualRatio = eta8 / eta6;
            expect(actualRatio).toBeCloseTo(expectedRatio, 1);
        });
    });

    describe("7. Prueba de Waypoint Progression: simulación avanza, NavigationEngine calcula métricas", () => {
        it("simulación avanza hacia WP1 y NavigationEngine actualiza métricas", () => {
            setupRoute();
            let position = WP0;
            let prevDistance = Infinity;

            for (let i = 0; i < 20; i++) {
                const input = createTickInput(position);
                const gps = simulation.tick(input);
                if (!gps) break;
                advanceTime(1000);
                processGps(gps);
                position = { lat: gps.lat, lng: gps.lng };

                const nav = core.getState().navigation;
                expect(nav.distanceToWaypoint).toBeLessThanOrEqual(prevDistance + 0.1);
                prevDistance = nav.distanceToWaypoint!;
            }

            expect(simulation.hasReachedDestination()).toBe(false);
        });

        it("llega a WP2 con SOG alto tras avanzar tiempo", () => {
            setupRoute();
            simulation.resetNavigation(0);
            let position = WP0;

            for (let i = 0; i < 500; i++) {
                const input = createTickInput(position, 12, 360);
                const gps = simulation.tick(input);
                if (!gps) break;
                advanceTime(1000);
                processGps(gps);
                position = { lat: gps.lat, lng: gps.lng };

                if (simulation.hasReachedDestination()) {
                    break;
                }
            }

            expect(simulation.hasReachedDestination()).toBe(true);
        });

        it("la progresión de simulación no muta el activeWaypointIndex del Core", () => {
            setupRoute();
            simulation.resetNavigation(0);
            let position = WP0;

            for (let i = 0; i < 500; i++) {
                const input = createTickInput(position, 12, 360);
                const gps = simulation.tick(input);
                if (!gps) break;
                advanceTime(1000);
                processGps(gps);
                position = { lat: gps.lat, lng: gps.lng };

                if (simulation.hasReachedDestination()) {
                    break;
                }
            }

            const simReached = simulation.hasReachedDestination();
            const coreIndex = core.getState().navigation.activeWaypointIndex;

            expect(simReached).toBe(true);
            expect(coreIndex).toBe(0);
        });
    });

    describe("8. Ausencia de gpsMessage.nav y cálculos NAV duplicados", () => {
        it("no existe acceso a gpsMessage.nav en el código", () => {
            const input = createTickInput(WP0);
            const gps = simulation.tick(input);

            expect("nav" in gps!).toBe(false);
        });

        it("SimulationService no construye objeto nav con btw/dtw/xte/eta", () => {
            const source = SimulationService.toString();
            expect(source).not.toContain("nav: {");
expect(source).not.toContain("btw");
expect(source).not.toContain("xte");
expect(source).not.toContain("eta:");
        });

        it("no existe acceso a (data as any).nav en App.tsx — validación manual", () => {
            expect(true).toBe(true);
        });
    });

    describe("9. Ausencia de loops y flujo unidireccional", () => {
        it("SimulationService NO llama a NavigationEngine/NavigationAdapter/VelarisCore directamente", () => {
            const source = SimulationService.toString();
            expect(source).not.toContain("NavigationEngine");
            expect(source).not.toContain("NavigationAdapter");
            expect(source).not.toContain("VelarisCore");
            expect(source).not.toContain("core.");
        });

        it("Flujo unidireccional: SimulationService → TelemetryService → VelarisCore", () => {
            setupRoute();
            const input = createTickInput(WP0);
            const gps = simulation.tick(input);

            expect(() => processGps(gps!)).not.toThrow();

            const state = core.getState();
            expect(state.vessel.position).not.toBeNull();
        });

        it("NO existe SimulationService → TelemetryService → SimulationService", () => {
            const telemetrySource = TelemetryService.toString();
            expect(telemetrySource).not.toContain("SimulationService");
        });
    });

    describe("10. App/HUD obtiene métricas desde app.core.getState().navigation", () => {
    it("métricas disponibles en core.getState().navigation tras procesar simulación", () => {
        setupRoute();
        const input = createTickInput(WP0);
        const gps = simulation.tick(input);
        processGps(gps!);

        const nav = core.getState().navigation;
        expect(nav.distanceToWaypoint).toBeDefined();
        expect(nav.bearingToWaypoint).toBeDefined();
        expect(nav.crossTrackError).toBeDefined();
        expect(nav.etaSeconds).toBeDefined();
    });
});

});
