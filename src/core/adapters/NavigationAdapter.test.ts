import { describe, expect, it, vi } from "vitest";
import { VelarisCore } from "@/core/VelarisCore";
import { NavigationEngine } from "@/core/navigation/NavigationEngine";
import { NavigationAdapter } from "./NavigationAdapter";

const route = {
    id: "route-1",
    name: "Test route",
    waypoints: [
        {
            id: "start",
            position: { lat: 0, lng: 0 }
        },
        {
            id: "finish",
            position: { lat: 1, lng: 0 },
            radiusNm: 0.05
        }
    ]
};

function createAdapter() {
    const core = new VelarisCore();
    const engine = new NavigationEngine();
    const calculate = vi.spyOn(engine, "calculate");
    const adapter = new NavigationAdapter({ core, engine });

    return { core, engine, calculate, adapter };
}

describe("NavigationAdapter", () => {
    it("creates with a Core and an optional Engine", () => {
        const { adapter } = createAdapter();

        expect(adapter).toBeInstanceOf(NavigationAdapter);
    });

    it("starts idempotently and recalculates once per update", () => {
        const { core, calculate, adapter } = createAdapter();

        core.setRoute(route);
        adapter.start();
        adapter.start();
        core.updateVessel({ position: { lat: 0, lng: 0 } });

        expect(calculate).toHaveBeenCalledOnce();
    });

    it("stops and removes all subscriptions", () => {
        const { core, calculate, adapter } = createAdapter();

        adapter.start();
        adapter.stop();
        core.updateVessel({ position: { lat: 0, lng: 0 } });

        expect(calculate).not.toHaveBeenCalled();
    });

    it("recalculates DTW, BTW, XTE and ETA for position and route", () => {
        const { core, adapter } = createAdapter();

        core.setRoute(route);
        core.updateVessel({
            position: { lat: 0.5, lng: 0.1 },
            heading: 90,
            cog: 0,
            sog: 5
        });
        core.updateNavigation({ activeWaypointIndex: 1 });
        adapter.start();
        adapter.recalculate();

        const navigation = core.getState().navigation;
        expect(navigation.distanceToWaypoint).toBeCloseTo(30.61, 1);
        expect(navigation.bearingToWaypoint).toBeCloseTo(348.6, 0);
        expect(navigation.crossTrackError).toBeGreaterThan(0);
        expect(navigation.etaSeconds).toBeCloseTo(22042.6, 0);
    });

it("stores VMG calculated by NavigationEngine", () => {
    const { core, adapter } = createAdapter();

    core.setRoute(route);
    core.updateVessel({
        position: { lat: 0.5, lng: 0 },
        cog: 0,
        sog: 5
    });
    core.updateNavigation({ activeWaypointIndex: 1 });

    adapter.start();
    adapter.recalculate();

    const navigation = core.getState().navigation;
    expect(navigation.vmg).not.toBeNull();
    expect(navigation.vmg).toBeCloseTo(5, 1);
});

    it("recalculates after position changes", () => {
        const { core, calculate, adapter } = createAdapter();

        core.setRoute(route);
        adapter.start();
        core.updateVessel({ position: { lat: 0.2, lng: 0 } });

        expect(calculate).toHaveBeenCalledOnce();
    });

    it("recalculates on heading changes without changing navigation inputs", () => {
        const { core, calculate, adapter } = createAdapter();

        core.setRoute(route);
        core.updateVessel({ position: { lat: 0, lng: 0 }, sog: 5, cog: 90 });
        adapter.start();
        adapter.recalculate();
        const before = core.getState().navigation;

        core.updateVessel({ heading: 270 });

        expect(calculate).toHaveBeenCalledTimes(2);
        expect(core.getState().navigation.distanceToWaypoint)
            .toBe(before.distanceToWaypoint);
        expect(core.getState().navigation.bearingToWaypoint)
            .toBe(before.bearingToWaypoint);
    });

    it("updates ETA when SOG changes", () => {
        const { core, adapter } = createAdapter();

        core.setRoute(route);
        adapter.start();
        core.updateVessel({ position: { lat: 0, lng: 0 } });
        core.updateVessel({ sog: 5 });
        core.updateNavigation({ activeWaypointIndex: 1 });
        const firstEta = core.getState().navigation.etaSeconds;
        core.updateVessel({ sog: 10 });

        expect(firstEta).toBeGreaterThan(0);
        expect(core.getState().navigation.etaSeconds)
            .toBeCloseTo(firstEta / 2, 8);
    });

    it("recalculates after route and active waypoint changes", () => {
        const { core, calculate, adapter } = createAdapter();

        adapter.start();
        core.updateVessel({ position: { lat: 0, lng: 0 }, sog: 5 });
        core.setRoute(route);
        core.updateNavigation({ activeWaypointIndex: 1 });

        expect(calculate).toHaveBeenCalledTimes(2);
    });

    it("does not create an update loop", () => {
        const { core, adapter } = createAdapter();
        const updateNavigation = vi.spyOn(core, "updateNavigation");

        core.setRoute(route);
        adapter.start();
        core.updateVessel({ position: { lat: 0, lng: 0 } });

        expect(updateNavigation).toHaveBeenCalledTimes(1);
    });

    it("does not calculate without position or route", () => {
        const { core, calculate, adapter } = createAdapter();

        adapter.start();
        adapter.recalculate();
        expect(calculate).not.toHaveBeenCalled();

        core.updateVessel({ position: { lat: 0, lng: 0 } });
        expect(calculate).not.toHaveBeenCalled();
        expect(core.getState().navigation.etaSeconds).toBeNull();
    });

    it("stores ETA in etaSeconds and preserves signed XTE", () => {
        const { core, adapter } = createAdapter();

        core.setRoute(route);
        adapter.start();
        core.updateVessel({
            position: { lat: 0.5, lng: 0.1 },
            sog: 5
        });
        core.updateNavigation({ activeWaypointIndex: 1 });

        expect(core.getState().navigation.etaSeconds).not.toBeNull();
        expect(core.getState().navigation.crossTrackError).toBeGreaterThan(0);
    });

    it("disposes and stops reacting", () => {
        const { core, calculate, adapter } = createAdapter();

        adapter.start();
        adapter.dispose();
        core.updateVessel({ position: { lat: 0, lng: 0 } });

        expect(calculate).not.toHaveBeenCalled();
    });
});
