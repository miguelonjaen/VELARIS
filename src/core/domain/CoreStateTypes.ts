import type { ActiveRoute } from "@/core/domain/NavigationTypes";
import type { NavigationPosition } from "@/core/navigation/NavigationEngine";
import type { NavigationStatus } from "@/core/events/CoreEvents";
import type { ProcessedWeather, VELARISAlarm } from "@/shared/types";

export interface VesselState {
    readonly position: NavigationPosition | null;
    readonly heading: number;
    readonly cog: number;
    readonly sog: number;
    readonly timestamp: string | null;
}

export interface EnvironmentState {
    readonly depth: number;
    readonly wind: {
        readonly speed: number;
        readonly angle: number;
    };
    readonly weather: ProcessedWeather | null;
}

export interface CoreNavigationState {
    readonly status: NavigationStatus;
    readonly activeWaypointIndex: number;
    readonly distanceToWaypoint: number | null;
    readonly distanceRemaining: number | null;
    readonly bearingToWaypoint: number | null;
    readonly crossTrackError: number | null;
    readonly eta: string | null;
    readonly etaSeconds: number | null;
    readonly vmg: number | null;
}

export interface VelarisCoreState {
    readonly vessel: VesselState;
    readonly navigation: CoreNavigationState;
    readonly environment: EnvironmentState;
    readonly activeRoute: ActiveRoute | null;
    readonly alerts: readonly VELARISAlarm[];
}

export type VesselStateUpdate = Partial<Omit<VesselState, "timestamp">> & {
    readonly timestamp?: string | null;
};

export type EnvironmentStateUpdate = Partial<Omit<EnvironmentState, "wind">> & {
    readonly wind?: Partial<EnvironmentState["wind"]>;
};

export type NavigationStateUpdate = Partial<CoreNavigationState>;
