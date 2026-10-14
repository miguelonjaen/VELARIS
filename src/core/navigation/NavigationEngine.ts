import { GeoMath } from "./GeoMath";
import type { GeoPoint } from "./GeoPoint";

const DEFAULT_WAYPOINT_RADIUS_NM = 0.05;
const EARTH_RADIUS_NM = 3440.065;

export type NavigationPosition = GeoPoint;

export interface NavigationWaypoint {
    readonly id: string;
    readonly position: NavigationPosition;
    readonly name?: string;
    readonly radiusNm?: number;
}

export interface NavigationRoute {
    readonly waypoints: readonly NavigationWaypoint[];
}

export interface NavigationInput {
    readonly position: NavigationPosition;
    readonly heading: number;
    readonly cog: number;
    readonly sog: number;
    readonly route: NavigationRoute;
    readonly activeWaypointIndex: number;
}

export type XteSide = "left" | "right" | "on_track";

export interface XteResult {
    readonly distanceNm: number;
    readonly signedDistanceNm: number;
    readonly side: XteSide;
}

export interface WaypointProgression {
    readonly activeWaypointIndex: number | null;
    readonly activeWaypoint: NavigationWaypoint | null;
    readonly nextWaypoint: NavigationWaypoint | null;
    readonly distanceToWaypointNm: number | null;
    readonly bearingToWaypoint: number | null;
    readonly hasArrived: boolean;
}

export interface NavigationMetrics {
    readonly heading: number;
    readonly cog: number;
    readonly sog: number;
    readonly bearingToWaypoint: number | null;
    readonly distanceToWaypointNm: number | null;
    readonly xte: XteResult | null;
    readonly etaSeconds: number | null;
readonly vmg: number | null;
    readonly progression: WaypointProgression;
}

export class NavigationEngine {
    public calculateDistance(
        from: NavigationPosition,
        to: NavigationPosition
    ): number {
        this.validatePosition(from, "from");
        this.validatePosition(to, "to");
        return GeoMath.distanceNM(from, to);
    }

    public calculateBearing(
        from: NavigationPosition,
        to: NavigationPosition
    ): number {
        this.validatePosition(from, "from");
        this.validatePosition(to, "to");
        return GeoMath.initialBearing(from, to);
    }

    public calculateXTE(
        position: NavigationPosition,
        legStart: NavigationPosition,
        legEnd: NavigationPosition
    ): XteResult {
        this.validatePosition(position, "position");
        this.validatePosition(legStart, "legStart");
        this.validatePosition(legEnd, "legEnd");

        const leg = this.toLocalVector(legStart, legEnd);
        const fromStart = this.toLocalVector(legStart, position);
        const legLength = Math.hypot(leg.east, leg.north);

        if (legLength === 0) {
            return {
                distanceNm: 0,
                signedDistanceNm: 0,
                side: "on_track"
            };
        }

        const signedDistanceNm = (
            leg.north * fromStart.east - leg.east * fromStart.north
        ) / legLength;

        return {
            distanceNm: Math.abs(signedDistanceNm),
            signedDistanceNm,
            side: this.getXteSide(signedDistanceNm)
        };
    }

    public calculateVMG(
        sogKnots: number,
        cog: number,
        bearingToWaypoint: number | null
    ): number | null {
        if (
            bearingToWaypoint === null
            || !Number.isFinite(sogKnots)
            || !Number.isFinite(cog)
            || !Number.isFinite(bearingToWaypoint)
            || sogKnots < 0
        ) {
            return null;
        }

        const angleDifferenceRadians =
            (bearingToWaypoint - cog) * (Math.PI / 180);

        return sogKnots * Math.cos(angleDifferenceRadians);
    }

    public calculateETA(
        distanceNm: number,
        sogKnots: number
    ): number | null {
        if (!Number.isFinite(distanceNm)
            || !Number.isFinite(sogKnots)
            || distanceNm < 0
            || sogKnots <= 0) {
            return null;
        }

        return distanceNm === 0
            ? 0
            : (distanceNm / sogKnots) * 3600;
    }

    public calculateWaypointProgression(
        position: NavigationPosition,
        route: NavigationRoute,
        activeWaypointIndex: number
    ): WaypointProgression {
        this.validatePosition(position, "position");

        const waypoints = route?.waypoints ?? [];
        if (
            waypoints.length === 0
            || !Number.isInteger(activeWaypointIndex)
            || activeWaypointIndex < 0
            || activeWaypointIndex >= waypoints.length
        ) {
            return {
                activeWaypointIndex: null,
                activeWaypoint: null,
                nextWaypoint: null,
                distanceToWaypointNm: null,
                bearingToWaypoint: null,
                hasArrived: false
            };
        }

        const activeWaypoint = waypoints[activeWaypointIndex];
        this.validateWaypoint(activeWaypoint, activeWaypointIndex);
        const nextWaypoint = waypoints[activeWaypointIndex + 1] ?? null;
        if (nextWaypoint) {
            this.validateWaypoint(nextWaypoint, activeWaypointIndex + 1);
        }

        const distanceToWaypointNm = this.calculateDistance(
            position,
            activeWaypoint.position
        );
        const bearingToWaypoint = this.calculateBearing(
            position,
            activeWaypoint.position
        );
        const radiusNm = activeWaypoint.radiusNm ?? DEFAULT_WAYPOINT_RADIUS_NM;

        if (!Number.isFinite(radiusNm) || radiusNm <= 0) {
            throw new RangeError(
                `Waypoint ${activeWaypointIndex} radiusNm must be positive and finite.`
            );
        }

        return {
            activeWaypointIndex,
            activeWaypoint,
            nextWaypoint,
            distanceToWaypointNm,
            bearingToWaypoint,
            hasArrived: distanceToWaypointNm <= radiusNm
        };
    }

    public calculate(input: NavigationInput): NavigationMetrics {
        this.validatePosition(input.position, "position");

        const progression = this.calculateWaypointProgression(
            input.position,
            input.route,
            input.activeWaypointIndex
        );
        const xte = this.calculateRouteXte(
            input.position,
            input.route,
            input.activeWaypointIndex
        );

        return {
            heading: input.heading,
            cog: input.cog,
            sog: input.sog,
            bearingToWaypoint: progression.bearingToWaypoint,
            distanceToWaypointNm: progression.distanceToWaypointNm,
            xte,
            etaSeconds: this.calculateETA(
                progression.distanceToWaypointNm ?? 0,
                input.sog
            ),
            vmg: this.calculateVMG(
                input.sog,
                input.cog,
                progression.bearingToWaypoint
            ),
            progression
        };
    }

    private calculateRouteXte(
        position: NavigationPosition,
        route: NavigationRoute,
        activeWaypointIndex: number
    ): XteResult | null {
        const waypoints = route?.waypoints ?? [];
        if (
            activeWaypointIndex <= 0
            || activeWaypointIndex >= waypoints.length
        ) {
            return null;
        }

        const legStart = waypoints[activeWaypointIndex - 1];
        const legEnd = waypoints[activeWaypointIndex];
        this.validateWaypoint(legStart, activeWaypointIndex - 1);
        this.validateWaypoint(legEnd, activeWaypointIndex);

        return this.calculateXTE(position, legStart.position, legEnd.position);
    }

    private toLocalVector(
        origin: NavigationPosition,
        point: NavigationPosition
    ): { east: number; north: number } {
        const meanLatitude = (origin.lat + point.lat) / 2;
        const latitudeScale = Math.PI / 180;
        const longitudeScale = Math.cos(meanLatitude * latitudeScale);

        return {
            east: (point.lng - origin.lng)
                * latitudeScale
                * longitudeScale
                * EARTH_RADIUS_NM,
            north: (point.lat - origin.lat)
                * latitudeScale
                * EARTH_RADIUS_NM
        };
    }

    private getXteSide(signedDistanceNm: number): XteSide {
        if (signedDistanceNm > 0) return "right";
        if (signedDistanceNm < 0) return "left";
        return "on_track";
    }

    private validateWaypoint(
        waypoint: NavigationWaypoint,
        index: number
    ): void {
        if (!waypoint || typeof waypoint.id !== "string") {
            throw new RangeError(`Waypoint ${index} is invalid.`);
        }
        this.validatePosition(waypoint.position, `waypoint ${index}`);
    }

    private validatePosition(
        position: NavigationPosition,
        label: string
    ): void {
        if (
            !position
            || !Number.isFinite(position.lat)
            || !Number.isFinite(position.lng)
            || position.lat < -90
            || position.lat > 90
            || position.lng < -180
            || position.lng > 180
        ) {
            throw new RangeError(`${label} contains invalid coordinates.`);
        }
    }
}
