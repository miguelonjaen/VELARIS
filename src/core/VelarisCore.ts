import type { ActiveRoute } from "@/core/domain/NavigationTypes";
import type { VELARISAlarm } from "@/shared/types";
import {
    createInitialCoreState
} from "./domain/CoreStateFactory";
import type {
    EnvironmentStateUpdate,
    NavigationStateUpdate,
    VesselStateUpdate,
    VelarisCoreState
} from "./domain/CoreStateTypes";
import {
    NavigationCoreEvents,
    NavigationCoreEventType,
    NavigationCoreEventMap,
    NavigationCoreEventHandler,
    NavigationCoreUnsubscribe,
    SynchronousNavigationCoreEvents
} from "./events/NavigationCoreEvents";

export class VelarisCore {
    private state: VelarisCoreState = createInitialCoreState();

    private readonly events: SynchronousNavigationCoreEvents;

    constructor(events: SynchronousNavigationCoreEvents = new SynchronousNavigationCoreEvents()) {
        this.events = events;
    }

    public getState(): VelarisCoreState {
        return {
            ...this.state,
            vessel: {
                ...this.state.vessel,
                position: this.state.vessel.position
                    ? { ...this.state.vessel.position }
                    : null
            },
            navigation: { ...this.state.navigation },
            environment: {
                ...this.state.environment,
                wind: { ...this.state.environment.wind },
                weather: this.state.environment.weather
                    ? { ...this.state.environment.weather }
                    : null
            },
            activeRoute: this.state.activeRoute
                ? {
                    ...this.state.activeRoute,
                    waypoints: this.state.activeRoute.waypoints.map(waypoint => ({
                        ...waypoint,
                        position: { ...waypoint.position }
                    }))
                }
                : null,
            alerts: this.state.alerts.map(alert => ({ ...alert }))
        };
    }

    public updateVessel(update: VesselStateUpdate): void {
        const previous = this.state.vessel;
        this.state = {
            ...this.state,
            vessel: {
                ...previous,
                ...update,
                position: update.position === undefined
                    ? previous.position
                    : update.position
                        ? { ...update.position }
                        : null
            }
        };

        if (update.position !== undefined && update.position !== previous.position) {
            this.publish("VesselPositionChanged", { ...update });
        }
        if (update.heading !== undefined && update.heading !== previous.heading) {
            this.publish("HeadingChanged", { heading: update.heading });
        }
        if (
            (update.sog !== undefined && update.sog !== previous.sog)
            || (update.cog !== undefined && update.cog !== previous.cog)
        ) {
            this.publish("SpeedChanged", {
                sog: update.sog,
                cog: update.cog
            });
        }
    }

    public updateEnvironment(update: EnvironmentStateUpdate): void {
        const previous = this.state.environment;
        this.state = {
            ...this.state,
            environment: {
                ...previous,
                ...update,
                wind: update.wind
                    ? { ...previous.wind, ...update.wind }
                    : previous.wind
            }
        };

        if (update.depth !== undefined && update.depth !== previous.depth) {
            this.publish("DepthChanged", { depth: update.depth });
        }
        if (update.wind !== undefined) {
            this.publish("WindChanged", {
                wind: { ...this.state.environment.wind }
            });
        }
    }

    public updateNavigation(update: NavigationStateUpdate): void {
        const previous = this.state.navigation;
        this.state = {
            ...this.state,
            navigation: { ...previous, ...update }
        };

        if (previous.status !== this.state.navigation.status) {
            if (this.state.navigation.status === "navigating") {
                this.publish("NavigationStarted", { state: { ...this.state.navigation } });
            } else if (previous.status === "navigating") {
                this.publish("NavigationStopped", { state: { ...this.state.navigation } });
            }
        }
        if (
            update.activeWaypointIndex !== undefined
            && update.activeWaypointIndex !== previous.activeWaypointIndex
        ) {
            this.publish("ActiveWaypointChanged", {
                waypointIndex: update.activeWaypointIndex
            });
        }
    }

    public setRoute(route: ActiveRoute | null): void {
        this.state = {
            ...this.state,
            activeRoute: route
                ? {
                    ...route,
                    waypoints: route.waypoints.map(waypoint => ({
                        ...waypoint,
                        position: { ...waypoint.position }
                    }))
                }
                : null
        };
        this.publish("RouteChanged", { route: this.state.activeRoute });
    }

    public clearRoute(): void {
        this.setRoute(null);
    }

    public raiseAlert(alert: VELARISAlarm): void {
        this.state = {
            ...this.state,
            alerts: [
                ...this.state.alerts.filter(existing => existing.id !== alert.id),
                { ...alert }
            ]
        };
        this.publish("AlertRaised", { alert: { ...alert } });
    }

    public clearAlert(alertId: string): void {
        const alertExists = this.state.alerts.some(alert => alert.id === alertId);
        if (!alertExists) return;

        this.state = {
            ...this.state,
            alerts: this.state.alerts.filter(alert => alert.id !== alertId)
        };
        this.publish("AlertCleared", { alertId });
    }

    public subscribe<TType extends NavigationCoreEventType>(
        type: TType,
        handler: NavigationCoreEventHandler<TType>
    ): NavigationCoreUnsubscribe {
        return this.events.subscribe(type, handler);
    }

    private publish<TType extends NavigationCoreEventType>(
        type: TType,
        payload: NavigationCoreEventMap[TType]
    ): void {
        this.events.publish({
            type,
            timestamp: new Date().toISOString(),
            payload
        });
    }
}
