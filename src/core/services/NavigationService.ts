import { CoreEvents, CoreUnsubscribe, NavigationStatus } from "@/core/events/CoreEvents";
import { GeoMath } from "@/core/navigation/GeoMath";

export interface NavigationPosition {
    readonly lat: number;
    readonly lng: number;
}

export interface Waypoint {
    readonly id: string;
    readonly name?: string;
    readonly position: NavigationPosition;
}

export interface ActiveRoute {
    readonly id: string;
    readonly name?: string;
    readonly waypoints: readonly Waypoint[];
}

export interface RouteProgress {
    readonly activeWaypointIndex: number;
    readonly completedWaypoints: number;
    readonly totalWaypoints: number;
    readonly progressRatio: number;
}

export interface NavigationSnapshot {
    readonly currentPosition: NavigationPosition | null;
    readonly navigationStatus: NavigationStatus;
    readonly activeWaypoint: Waypoint | null;
    readonly nextWaypoint: Waypoint | null;
    readonly routeProgress: RouteProgress | null;
    readonly lastUpdate: string | null;
}

export class NavigationService {

    private activeRoute: ActiveRoute | null = null;

    private activeWaypointIndex = 0;
private snapshot: NavigationSnapshot = Object.freeze({
    currentPosition: null,
    navigationStatus: "idle",
    activeWaypoint: null,
    nextWaypoint: null,
    routeProgress: null,
    lastUpdate: null,

    distanceToWaypoint: undefined,
    bearingToWaypoint: undefined,
    eta: undefined
    });

    private readonly unsubscribePositionUpdated: CoreUnsubscribe;

    constructor(
        events: CoreEvents
    ) {
        this.unsubscribePositionUpdated = events.subscribe("core.position.updated", event => {
            this.snapshot = this.createSnapshot(
                {
                    lat: event.payload.lat,
                    lng: event.payload.lng
                },
                event.timestamp
            );
        });
    }

    public getSnapshot(): NavigationSnapshot {
        return this.snapshot;
    }

    public setActiveRoute(route: ActiveRoute): void {
        this.activeRoute = this.freezeRoute(route);
        this.activeWaypointIndex = 0;
        this.snapshot = this.createSnapshot(
            this.snapshot.currentPosition,
            this.snapshot.lastUpdate,
            this.activeRoute.waypoints.length > 0 ? "planned" : "idle"
        );
    }

    public clearActiveRoute(): void {
        this.activeRoute = null;
        this.activeWaypointIndex = 0;
        this.snapshot = this.createSnapshot(
            this.snapshot.currentPosition,
            this.snapshot.lastUpdate,
            "idle"
        );
    }

    public setNavigationStatus(status: NavigationStatus): void {
        this.snapshot = this.createSnapshot(
            this.snapshot.currentPosition,
            this.snapshot.lastUpdate,
            status
        );
    }

    public dispose(): void {
        this.unsubscribePositionUpdated();
    }

    private createSnapshot(
        currentPosition: NavigationPosition | null,
        lastUpdate: string | null,
        navigationStatus: NavigationStatus = this.snapshot.navigationStatus
    ): NavigationSnapshot {
        const activeWaypoint = this.getWaypointAt(this.activeWaypointIndex);
        const nextWaypoint = this.getWaypointAt(this.activeWaypointIndex + 1);
        const routeProgress = this.createRouteProgress();
        let distanceToWaypoint: number | undefined;
    let bearingToWaypoint: number | undefined;
    let eta: Date | undefined;

    if (currentPosition && activeWaypoint) {

        distanceToWaypoint = GeoMath.distanceNM(
            currentPosition,
            activeWaypoint.position
        );

        bearingToWaypoint = GeoMath.initialBearing(
            currentPosition,
            activeWaypoint.position
        );

        // ETA lo dejamos para el siguiente paso
    }

        return Object.freeze({
            currentPosition: currentPosition
        ? Object.freeze({ ...currentPosition })
        : null,

    navigationStatus,

    activeWaypoint,

    nextWaypoint,

    routeProgress,

    lastUpdate,

    distanceToWaypoint,

    bearingToWaypoint
        });
    }

    private getWaypointAt(index: number): Waypoint | null {
        return this.activeRoute?.waypoints[index] ?? null;
    }

    private createRouteProgress(): RouteProgress | null {
        if (!this.activeRoute) return null;

        const totalWaypoints = this.activeRoute.waypoints.length;
        const activeWaypointIndex = totalWaypoints === 0
            ? 0
            : Math.min(this.activeWaypointIndex, totalWaypoints - 1);
        const completedWaypoints = Math.min(activeWaypointIndex, totalWaypoints);
        const progressRatio = totalWaypoints === 0
            ? 0
            : completedWaypoints / totalWaypoints;

        return Object.freeze({
            activeWaypointIndex,
            completedWaypoints,
            totalWaypoints,
            progressRatio
        });
    }

    private freezeRoute(route: ActiveRoute): ActiveRoute {
        return Object.freeze({
            ...route,
            waypoints: Object.freeze(route.waypoints.map(waypoint => Object.freeze({
                ...waypoint,
                position: Object.freeze({ ...waypoint.position })
            })))
        });
    }

}
