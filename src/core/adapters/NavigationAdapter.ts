import type { ActiveRoute } from "@/core/domain/NavigationTypes";
import { NavigationEngine } from "@/core/navigation/NavigationEngine";
import type { NavigationRoute } from "@/core/navigation/NavigationEngine";
import type { NavigationCoreUnsubscribe } from "@/core/events/NavigationCoreEvents";
import { VelarisCore } from "@/core/VelarisCore";

export interface NavigationAdapterOptions {
    readonly core: VelarisCore;
    readonly engine?: NavigationEngine;
}

export class NavigationAdapter {
    private readonly core: VelarisCore;
    private readonly engine: NavigationEngine;

    private subscriptions: NavigationCoreUnsubscribe[] = [];

    private started = false;

    constructor(options: NavigationAdapterOptions) {
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
            this.core.subscribe("ActiveWaypointChanged", recalculate)
        ];
    }

    public stop(): void {
        for (const unsubscribe of this.subscriptions) {
            unsubscribe();
        }
        this.subscriptions = [];
        this.started = false;
    }

    public recalculate(): void {
        const state = this.core.getState();
        const position = state.vessel.position;
        const route = state.activeRoute;

        if (!position || !route) {
            this.core.updateNavigation({
                distanceToWaypoint: null,
                bearingToWaypoint: null,
                crossTrackError: null,
                etaSeconds: null,
                vmg: null
            });
            return;
        }

        const metrics = this.engine.calculate({
            position,
            heading: state.vessel.heading,
            cog: state.vessel.cog,
            sog: state.vessel.sog,
            route: this.toNavigationRoute(route),
            activeWaypointIndex: state.navigation.activeWaypointIndex
        });

        const update = {
            distanceToWaypoint: metrics.distanceToWaypointNm,
            bearingToWaypoint: metrics.bearingToWaypoint,
            crossTrackError: metrics.xte?.signedDistanceNm ?? null,
            etaSeconds: metrics.etaSeconds,
            vmg: metrics.vmg
        };

        if (
            metrics.progression.activeWaypointIndex !== null
            && metrics.progression.activeWaypointIndex
                !== state.navigation.activeWaypointIndex
        ) {
            this.core.updateNavigation({
                ...update,
                activeWaypointIndex: metrics.progression.activeWaypointIndex
            });
            return;
        }

        this.core.updateNavigation(update);
    }

    public dispose(): void {
        this.stop();
    }

    private toNavigationRoute(route: ActiveRoute): NavigationRoute {
        return {
            waypoints: route.waypoints.map(waypoint => ({
                id: waypoint.id,
                name: waypoint.name,
                position: {
                    lat: waypoint.position.lat,
                    lng: waypoint.position.lng
                }
            }))
        };
    }
}