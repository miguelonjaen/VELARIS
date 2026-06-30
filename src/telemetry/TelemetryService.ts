export class TelemetryService {

    constructor(
        // Dependencias
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

    private processGPS(data: any): void {}

    private processAIS(data: any): void {}

    private processWind(data: any): void {}

    private processDepth(data: any): void {}

    private processInvalid(data: any): void {}

}