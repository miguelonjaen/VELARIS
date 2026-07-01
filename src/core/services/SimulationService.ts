import { GPSTelemetry } from "@/core/types/TelemetryMessage";

export class SimulationService {

    public tick(
        lat: number,
        lng: number,
        sog: number,
        cog: number
    ): GPSTelemetry {

        return {
            type: "GPS",
            lat,
            lng,
            sog,
            cog
        };

    }

}