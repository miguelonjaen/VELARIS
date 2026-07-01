export type TelemetryMessage =
    | GPSTelemetry
    | AISTelemetry
    | WindTelemetry
    | DepthTelemetry
    | RawTelemetry;

export interface RawTelemetry {
    type: "RAW";
    line: string;
}

export interface GPSTelemetry {
    type: "GPS";
    lat: number;
    lng: number;
    sog: number;
    cog: number;
}

export interface WindTelemetry {
    type: "WIND";
    speed: number;
    angle: number;
}

export interface DepthTelemetry {
    type: "DEPTH";
    depth: number;
}

export interface AISTelemetry {
    type: "AIS";
    data: unknown;
}