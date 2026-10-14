export type TelemetryMessage =
    | GPSTelemetry
    | HeadingTelemetry
    | AISTelemetry
    | WindTelemetry
    | DepthTelemetry
    | RawTelemetry
    | NmeaInvalidTelemetry;

export interface RawTelemetry {
    type: "RAW";
    line: string;
}

export interface NmeaInvalidTelemetry {
    type: "NMEA_INVALID";
    line: string;
    reason: string;
}

export interface GPSTelemetry {
    type: "GPS";
    lat: number;
    lng: number;
    sog: number;
    cog: number;
    heading?: number;
    timestamp?: string;
}

export interface HeadingTelemetry {
    type: "HEADING";
    heading: number;
    headingType: "true" | "magnetic";
}

export interface WindTelemetry {
    type: "WIND";
    speed: number;
    angle: number;
    reference?: "apparent" | "true";
}

export interface DepthTelemetry {
    type: "DEPTH";
    depth: number;
}

export interface AISTelemetry {
    type: "AIS";
    data: unknown;
}

export interface BaseTelemetry {
    type: string;
}
