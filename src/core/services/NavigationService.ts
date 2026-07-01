import { CoreEvents, CoreUnsubscribe, NavigationStatus } from "@/core/events/CoreEvents";

export interface NavigationPosition {
    readonly lat: number;
    readonly lng: number;
}

export interface NavigationSnapshot {
    readonly currentPosition: NavigationPosition | null;
    readonly lastUpdate: string | null;
    readonly navigationStatus: NavigationStatus;
}

export class NavigationService {

    private snapshot: NavigationSnapshot = Object.freeze({
        currentPosition: null,
        lastUpdate: null,
        navigationStatus: "idle"
    });

    private readonly unsubscribePositionUpdated: CoreUnsubscribe;

    constructor(
        events: CoreEvents
    ) {
        this.unsubscribePositionUpdated = events.subscribe("core.position.updated", event => {
            this.snapshot = Object.freeze({
                ...this.snapshot,
                currentPosition: Object.freeze({
                    lat: event.payload.lat,
                    lng: event.payload.lng
                }),
                lastUpdate: event.timestamp
            });
        });
    }

    public getSnapshot(): NavigationSnapshot {
        return this.snapshot;
    }

    public dispose(): void {
        this.unsubscribePositionUpdated();
    }

}
