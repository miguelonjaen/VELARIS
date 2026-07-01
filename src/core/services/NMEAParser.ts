import { TelemetryMessage } from "@/core/types/TelemetryMessage";

export class NMEAParser {

    public parse(line: string): TelemetryMessage {

        return {

            type: "RAW",

            line

        };

    }

}