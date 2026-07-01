import { CoreEventPublisher, CoreUpdateSource } from "@/core/events/CoreEvents";

export class CoreState {

    constructor(
        private readonly events?: CoreEventPublisher
    ) {}

    public shipPosition: {
        lat: number;
        lng: number;
    } | null = null;

    public sog = 0;

    public cog = 0;

    public depth = 0;

    public wind = {
        speed: 0,
        angle: 0
    };

    public updatePosition(
        lat: number,
        lng: number,
        sog: number,
        cog: number,
        source: CoreUpdateSource = "system"
    ): void {

        this.shipPosition = {
            lat,
            lng
        };

        this.sog = sog;
        this.cog = cog;

        const timestamp = new Date().toISOString();

        this.events?.publish({
            name: "core.position.updated",
            timestamp,
            source,
            payload: {
                lat,
                lng
            }
        });

        this.events?.publish({
            name: "core.motion.updated",
            timestamp,
            source,
            payload: {
                sog,
                cog
            }
        });

    }

    public updateDepth(
        depth: number,
        source: CoreUpdateSource = "system"
    ): void {
        this.depth = depth;

        this.events?.publish({
            name: "core.depth.updated",
            timestamp: new Date().toISOString(),
            source,
            payload: {
                depth
            }
        });
    }

    public updateWind(
        speed: number,
        angle: number,
        source: CoreUpdateSource = "system"
    ): void {
        this.wind = {
            speed,
            angle
        };

        this.events?.publish({
            name: "core.wind.updated",
            timestamp: new Date().toISOString(),
            source,
            payload: {
                speed,
                angle
            }
        });
    }

}
