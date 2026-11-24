import type { NavigationPosition } from "@/core/navigation/NavigationEngine";

export interface Waypoint {
    readonly id: string;
    readonly name?: string;
    readonly radiusNm?: number;
    readonly position: NavigationPosition;
}

export interface ActiveRoute {
    readonly id: string;
    readonly name?: string;
    /** When set, guidance and waypoint progression require this position source. */
    readonly positionSource?: "SIMULATOR";
    readonly waypoints: readonly Waypoint[];
}