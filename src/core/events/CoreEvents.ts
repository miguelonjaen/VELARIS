export type CoreEventName =
    | "core.position.updated"
    | "core.motion.updated"
    | "core.depth.updated"
    | "core.wind.updated"
    | "core.navigation.updated"
    | "core.ais.updated";

export type CoreUpdateSource =
    | "nmea"
    | "simulation"
    | "ais"
    | "navigation"
    | "replay"
    | "system";

export interface CoreEventEnvelope<
    TName extends CoreEventName,
    TPayload
> {
    readonly name: TName;
    readonly timestamp: string;
    readonly source: CoreUpdateSource;
    readonly payload: TPayload;
}

export interface PositionUpdatedPayload {
    readonly lat: number;
    readonly lng: number;
}

export type PositionUpdatedEvent = CoreEventEnvelope<
    "core.position.updated",
    PositionUpdatedPayload
>;

export interface MotionUpdatedPayload {
    readonly sog: number;
    readonly cog: number;
    readonly heading?: number;
}

export type MotionUpdatedEvent = CoreEventEnvelope<
    "core.motion.updated",
    MotionUpdatedPayload
>;

export interface DepthUpdatedPayload {
    readonly depth: number;
}

export type DepthUpdatedEvent = CoreEventEnvelope<
    "core.depth.updated",
    DepthUpdatedPayload
>;

export interface WindUpdatedPayload {
    readonly speed: number;
    readonly angle: number;
}

export type WindUpdatedEvent = CoreEventEnvelope<
    "core.wind.updated",
    WindUpdatedPayload
>;

export type NavigationStatus =
    | "idle"
    | "planned"
    | "navigating"
    | "arrived"
    | "aborted";

export interface NavigationUpdatedPayload {
    readonly status: NavigationStatus;
    readonly destinationName?: string;
    readonly destinationLat?: number;
    readonly destinationLng?: number;
    readonly activeWaypointIndex?: number;
    readonly dtw?: number;
    readonly xte?: number;
    readonly btw?: number;
    readonly eta?: string;
    readonly arrived: boolean;
}

export type NavigationUpdatedEvent = CoreEventEnvelope<
    "core.navigation.updated",
    NavigationUpdatedPayload
>;

export interface AisContactSummary {
    readonly id: string;
    readonly mmsi?: string | number;
    readonly lat: number;
    readonly lng: number;
    readonly sog?: number;
    readonly cog?: number;
    readonly heading?: number;
    readonly cpa?: number;
    readonly tcpa?: number;
}

export interface AisUpdatedPayload {
    readonly contacts: readonly AisContactSummary[];
}

export type AisUpdatedEvent = CoreEventEnvelope<
    "core.ais.updated",
    AisUpdatedPayload
>;

export type CoreEvent =
    | PositionUpdatedEvent
    | MotionUpdatedEvent
    | DepthUpdatedEvent
    | WindUpdatedEvent
    | NavigationUpdatedEvent
    | AisUpdatedEvent;

export type CoreEventHandler<TEvent extends CoreEvent> = (
    event: TEvent
) => void;

export type CoreUnsubscribe = () => void;

export interface CoreEvents {
    subscribe<TName extends CoreEventName>(
        name: TName,
        handler: CoreEventHandler<Extract<CoreEvent, { name: TName }>>
    ): CoreUnsubscribe;
}

export interface CoreEventPublisher {
    publish<TEvent extends CoreEvent>(event: TEvent): void;
}
