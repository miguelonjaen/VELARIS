export { VelarisCore } from "./VelarisCore";
export {
    SynchronousNavigationCoreEvents
} from "./events/NavigationCoreEvents";
export type {
    NavigationCoreEvent,
    NavigationCoreEventHandler,
    NavigationCoreEventMap,
    NavigationCoreEventType,
    NavigationCoreEvents,
    NavigationCoreUnsubscribe
} from "./events/NavigationCoreEvents";
export type {
    CoreNavigationState,
    EnvironmentState,
    EnvironmentStateUpdate,
    VesselState,
    VesselStateUpdate,
    NavigationStateUpdate,
    VelarisCoreState
} from "./domain/CoreStateTypes";
export type {
   ActiveRoute,
   Waypoint
} from "./domain/NavigationTypes";

export { NavigationEngine } from "./navigation/NavigationEngine";
export type {
    NavigationInput,
    NavigationMetrics,
    NavigationPosition,
    NavigationRoute,
    NavigationWaypoint,
    WaypointProgression,
    XteResult,
    XteSide
} from "./navigation/NavigationEngine";
export { NavigationAdapter } from "./adapters/NavigationAdapter";
export type { NavigationAdapterOptions } from "./adapters/NavigationAdapter";