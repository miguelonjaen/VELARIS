import type {
    EnvironmentState,
    CoreNavigationState,
    VesselState,
    VelarisCoreState
} from "./CoreStateTypes";

export function createInitialVesselState(): VesselState {
    return {
        position: null,
        heading: 0,
        cog: 0,
        sog: 0,
        timestamp: null
    };
}

export function createInitialEnvironmentState(): EnvironmentState {
    return {
        depth: 0,
        wind: {
            speed: 0,
            angle: 0
        },
        weather: null
    };
}

export function createInitialNavigationState(): CoreNavigationState {
    return {
        status: "idle",
        activeWaypointIndex: 0,
        distanceToWaypoint: null,
        distanceRemaining: null,
        bearingToWaypoint: null,
        crossTrackError: null,
        eta: null,
        etaSeconds: null,
        vmg: null
    };
}

export function createInitialCoreState(): VelarisCoreState {
    return {
        vessel: createInitialVesselState(),
        navigation: createInitialNavigationState(),
        environment: createInitialEnvironmentState(),
        activeRoute: null,
        alerts: []
    };
}
