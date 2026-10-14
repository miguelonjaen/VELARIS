import { CoreState } from "@/core/CoreState";
import { VelarisCore } from "@/core/VelarisCore";

export class TelemetryService {

    constructor(
        private readonly state: CoreState,
        private readonly core?: VelarisCore
    ) {}

    public process(data: any): void {

        switch (data.type) {

            case "GPS":
                this.processGPS(data);
                break;

            case "HEADING":
                this.processHeading(data);
                break;

            case "AIS":
                this.processAIS(data);
                break;

            case "WIND":
                this.processWind(data);
                break;

            case "DEPTH":
                this.processDepth(data);
                break;

            case "NMEA_INVALID":
                this.processInvalid(data);
                break;
        }
    }

    private processGPS(data: any): void {

        const hasPosition = data.lat !== undefined && data.lng !== undefined && Number.isFinite(data.lat) && Number.isFinite(data.lng);
        const lat = hasPosition ? data.lat : (this.state.shipPosition?.lat ?? 0);
        const lng = hasPosition ? data.lng : (this.state.shipPosition?.lng ?? 0);
        const sog = data.sog !== undefined && Number.isFinite(data.sog) ? data.sog : this.state.sog;
        const cog = data.cog !== undefined && Number.isFinite(data.cog) ? data.cog : this.state.cog;

        this.state.updatePosition(
            lat,
            lng,
            sog,
            cog
        );

        this.core?.updateVessel({
            ...(hasPosition ? { position: { lat: data.lat, lng: data.lng } } : {}),
            ...(data.sog !== undefined && Number.isFinite(data.sog) ? { sog: data.sog } : {}),
            ...(data.cog !== undefined && Number.isFinite(data.cog) ? { cog: data.cog } : {}),
            ...(data.heading !== undefined && Number.isFinite(data.heading)
                ? { heading: data.heading }
                : {})
        });

    }

    private processHeading(data: any): void {

        if (data.heading !== undefined && Number.isFinite(data.heading)) {
            this.core?.updateVessel({
                heading: data.heading
            });
        }

    }

    private processAIS(data: any): void {}

    private processWind(data: any): void {

        this.state.updateWind(
            data.speed,
            data.angle
        );

        this.core?.updateEnvironment({
            wind: {
                speed: data.speed,
                angle: data.angle
            }
        });

    }

    private processDepth(data: any): void {

        this.state.updateDepth(
            data.depth
        );

        this.core?.updateEnvironment({
            depth: data.depth
        });

    }

    private processInvalid(data: any): void {}
}
