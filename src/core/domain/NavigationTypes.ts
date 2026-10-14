import type { NavigationPosition } from "@/core/navigation/NavigationEngine";

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