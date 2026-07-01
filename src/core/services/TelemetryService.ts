import { CoreState } from "@/core/CoreState";

export class TelemetryService {

    constructor(
        private readonly state: CoreState
    ) {}

    public process(data: any): void {

        switch (data.type) {

            case "GPS":
                this.processGPS(data);
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

    this.state.updatePosition(
        data.lat,
        data.lng,
        data.sog,
        data.cog
    );

}
    private processAIS(data: any): void {}
    private processWind(data: any): void {

        this.state.updateWind(
            data.speed,
            data.angle
        );

    }

    private processDepth(data: any): void {

        this.state.updateDepth(
            data.depth
        );

    }

    private processInvalid(data: any): void {}
}
