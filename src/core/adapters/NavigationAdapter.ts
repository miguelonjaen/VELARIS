import type { SharedNavigationState } from "../navigation/SharedNavigationState";
import type { NavigationPosition } from "../navigation/NavigationEngine";
import type { ActiveRoute } from "@/core/domain/NavigationTypes";
import { NavigationEngine } from "@/core/navigation/NavigationEngine";
import type { NavigationRoute } from "@/core/navigation/NavigationEngine";
import type { NavigationCoreUnsubscribe } from "@/core/events/NavigationCoreEvents";
import { GaulosCore } from "@/core/GaulosCore";

export interface NavigationAdapterOptions {
    readonly core: GaulosCore;
    readonly engine?: NavigationEngine;
    readonly navigationState?: SharedNavigationState;
    readonly clock?: () => number;
}

export class NavigationAdapter {
    private readonly core: GaulosCore;
    private readonly engine: NavigationEngine;

    private subscriptions: NavigationCoreUnsubscribe[] = [];

    private started = false;
    private calculating = false;
    private timer: ReturnType<typeof setInterval> | null = null;
    // Remember each selected source separately: fallback/recovery cannot reuse
    // an already consumed observation to advance an overlapping target twice.
    private readonly seenFixes = new Map<string, string>();
    private previous: { position: NavigationPosition; source: string; receivedAt: number } | null = null;
    private origin: NavigationPosition | null = null;
    private routeKey = "";
    private index = -1;

    constructor(private readonly options: NavigationAdapterOptions) {
        this.core = options.core;
        this.engine = options.engine ?? new NavigationEngine();
    }

    public start(): void {
        if (this.started) return;

        this.started = true;
        const recalculate = (): void => {
            this.recalculate();
        };

        this.subscriptions = [
            this.core.subscribe("VesselPositionChanged", recalculate),
            this.core.subscribe("HeadingChanged", recalculate),
            this.core.subscribe("SpeedChanged", recalculate),
            this.core.subscribe("RouteChanged", recalculate),
            this.core.subscribe("ActiveWaypointChanged", recalculate),
            this.core.subscribe("NavigationStarted", recalculate),
            this.core.subscribe("NavigationStopped", recalculate)
        ];
        if (this.options.navigationState) {
            this.timer = setInterval(recalculate, 250);
            this.recalculate();
        }
    }

    public stop(): void {
        for (const unsubscribe of this.subscriptions) {
            unsubscribe();
        }
        if (this.timer !== null) clearInterval(this.timer);
        this.timer = null;
        this.previous = null;
        this.seenFixes.clear();
        this.subscriptions = [];
        this.started = false;
    }

    public recalculate(): void {
        if (this.calculating) return;
        this.calculating = true;
        try { this.calculate(); } finally { this.calculating = false; }
    }

    private calculate(): void {
        const state = this.core.getState();
        const now = (this.options.clock ?? Date.now)();
        const shared = this.options.navigationState?.snapshot(now);
        const fix = shared?.position;
        // Validity, freshness and source priority belong to the shared state.
        const route = state.activeRoute;
        const sourceMatches = !route?.positionSource || fix?.source === route.positionSource;
        const position = sourceMatches && shared && fix?.status === "VALID" ? fix.value
            : !shared && sourceMatches ? state.vessel.position : null;

        const key = JSON.stringify(route);
        if (this.routeKey !== key || this.index !== state.navigation.activeWaypointIndex) {
            this.routeKey = key;
            this.index = state.navigation.activeWaypointIndex;
            this.previous = null;
            this.origin = position ? { ...position } : null;
        }
        if (!position || !route) {
            this.previous = null;
            this.core.updateNavigation({
                distanceToWaypoint: null,
                bearingToWaypoint: null,
                crossTrackError: null,
                etaSeconds: null,
                vmg: null
            });
            return;
        }

        const navRoute = this.toNavigationRoute(route);
        let index = state.navigation.activeWaypointIndex;
        const source = `${fix?.source ?? "core"}:${fix?.sourceId ?? ""}`;
        const fixKey = fix ? `${source}:${fix.observedAt}:${fix.receivedAt}` : state.vessel.timestamp;
        const freshFix = fixKey !== null && fixKey !== this.seenFixes.get(fix?.source ?? "core");
        const target = navRoute.waypoints[index];
        let arrived = false;
        if (shared && freshFix && state.navigation.status === "navigating" && target) {
            const progression = this.engine.calculateWaypointProgression(position, navRoute, index);
            const start = navRoute.waypoints[index - 1]?.position ?? this.origin;
            // No geometric continuity across source changes or missing/stale fixes.
            const previous = this.previous?.source === source && fix?.receivedAt !== null
                && fix?.receivedAt !== undefined && fix.receivedAt > this.previous.receivedAt
                && fix.receivedAt - this.previous.receivedAt <= 5000 ? this.previous.position : null;
            arrived = progression.hasArrived || !!(previous && start
                && this.engine.hasPassedWaypoint(previous, position, start, target));
            if (arrived && index < navRoute.waypoints.length - 1) index += 1;
        }
        if (freshFix) {
            this.seenFixes.set(fix?.source ?? "core", fixKey!);
            this.previous = { position: { ...position }, source, receivedAt: fix?.receivedAt ?? now };
        }
        if (!this.origin) this.origin = { ...position };
        const metrics = this.engine.calculate({
            position,
            heading: state.vessel.heading,
            cog: shared ? shared.cog.value ?? NaN : state.vessel.cog,
            sog: shared ? shared.sog.value ?? NaN : state.vessel.sog,
            route: navRoute,
            activeWaypointIndex: index
        });

        const update = {
            distanceToWaypoint: metrics.distanceToWaypointNm,
            bearingToWaypoint: metrics.bearingToWaypoint,
            crossTrackError: metrics.xte?.signedDistanceNm ?? (shared && index === 0 && this.origin && target
                ? this.engine.calculateXTE(position, this.origin, target.position).signedDistanceNm : null),
            etaSeconds: metrics.etaSeconds,
            vmg: metrics.vmg
        };

        this.index = index;

        if (arrived) this.core.reportWaypointReached(state.navigation.activeWaypointIndex);

        this.core.updateNavigation({ ...update, activeWaypointIndex: index,
            ...(arrived && index === state.navigation.activeWaypointIndex ? { status: "arrived" as const } : {}) });
    }

    public dispose(): void {
        this.stop();
    }

    private toNavigationRoute(route: ActiveRoute): NavigationRoute {
        return {
            waypoints: route.waypoints.map(waypoint => ({
                id: waypoint.id,
                name: waypoint.name,
                radiusNm: waypoint.radiusNm,
                position: {
                    lat: waypoint.position.lat,
                    lng: waypoint.position.lng
                }
            }))
        };
    }
}
