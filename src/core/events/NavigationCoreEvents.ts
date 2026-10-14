import type {
    EnvironmentStateUpdate,
    NavigationStateUpdate,
    VesselStateUpdate,
    VelarisCoreState
} from "@/core/domain/CoreStateTypes";
import type { ActiveRoute } from "@/core/domain/NavigationTypes";
import type { VELARISAlarm } from "@/shared/types";

export type NavigationCoreEventType =
    | "VesselPositionChanged"
    | "HeadingChanged"
    | "SpeedChanged"
    | "DepthChanged"
    | "WindChanged"
    | "RouteChanged"
    | "ActiveWaypointChanged"
    | "WaypointReached"
    | "NavigationStarted"
    | "NavigationStopped"
    | "AlertRaised"
    | "AlertCleared";

export interface NavigationCoreEventMap {
    VesselPositionChanged: VesselStateUpdate;
    HeadingChanged: Pick<VesselStateUpdate, "heading">;
    SpeedChanged: Pick<VesselStateUpdate, "sog" | "cog">;
    DepthChanged: Pick<EnvironmentStateUpdate, "depth">;
    WindChanged: Required<Pick<EnvironmentStateUpdate, "wind">>;
    RouteChanged: { readonly route: ActiveRoute | null };
    ActiveWaypointChanged: { readonly waypointIndex: number };
    WaypointReached: { readonly waypointIndex: number };
    NavigationStarted: { readonly state: VelarisCoreState["navigation"] };
    NavigationStopped: { readonly state: VelarisCoreState["navigation"] };
    AlertRaised: { readonly alert: VELARISAlarm };
    AlertCleared: { readonly alertId: string };
}

export interface NavigationCoreEvent<TType extends NavigationCoreEventType = NavigationCoreEventType> {
    readonly type: TType;
    readonly timestamp: string;
    readonly payload: NavigationCoreEventMap[TType];
}

export type NavigationCoreEventHandler<TType extends NavigationCoreEventType> = (
    event: NavigationCoreEvent<TType>
) => void;

export type NavigationCoreUnsubscribe = () => void;

export interface NavigationCoreEvents {
    subscribe<TType extends NavigationCoreEventType>(
        type: TType,
        handler: NavigationCoreEventHandler<TType>
    ): NavigationCoreUnsubscribe;
}

export class SynchronousNavigationCoreEvents implements NavigationCoreEvents {
    private readonly handlers = new Map<
        NavigationCoreEventType,
        Set<NavigationCoreEventHandler<NavigationCoreEventType>>
    >();

    public subscribe<TType extends NavigationCoreEventType>(
        type: TType,
        handler: NavigationCoreEventHandler<TType>
    ): NavigationCoreUnsubscribe {
        const handlers = this.handlers.get(type)
            ?? new Set<NavigationCoreEventHandler<NavigationCoreEventType>>();

        handlers.add(handler as NavigationCoreEventHandler<NavigationCoreEventType>);
        this.handlers.set(type, handlers);

        return () => {
            handlers.delete(handler as NavigationCoreEventHandler<NavigationCoreEventType>);
            if (handlers.size === 0) this.handlers.delete(type);
        };
    }

    public publish<TType extends NavigationCoreEventType>(
        event: NavigationCoreEvent<TType>
    ): void {
        const handlers = this.handlers.get(event.type);
        if (!handlers) return;

        for (const handler of [...handlers]) {
            handler(event as NavigationCoreEvent<NavigationCoreEventType>);
        }
    }

    public dispose(): void {
        this.handlers.clear();
    }
}
