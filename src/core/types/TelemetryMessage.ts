export type TelemetryMessage =
    | WaterSpeedTelemetry
    | GPSTelemetry
    | HeadingTelemetry
    | AISTelemetry
    | WindTelemetry
    | DepthTelemetry
    | EngineRpmTelemetry
    | TransducerTelemetry
    | RawTelemetry
    | NmeaInvalidTelemetry;

/** $--RPM con estado válido (A). Revoluciones por minuto; negativas = atrás. */
export interface EngineRpmTelemetry {
    type: "ENGINE_RPM";
    /** "engine" (E) o "shaft" (S). */
    source: "engine" | "shaft";
    /** Número de motor/eje: 0 central o único, impar estribor, par babor. */
    engine: number;
    rpm: number;
}

/** Una medida de $--XDR: tipo de transductor, valor, unidad y nombre tal como llegan. */
export interface TransducerReading {
    /** C temperatura, P presión, U tensión, I corriente, V volumen, T tacómetro, … */
    kind: string;
    value: number;
    unit: string;
    name: string;
}

export interface TransducerTelemetry {
    type: "TRANSDUCER";
    readings: TransducerReading[];
}

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
    /**
     * Campos que la sentencia NMEA trae de verdad. Si falta, el emisor no lo
     * indica: lat/lng o sog/cog a 0 pueden ser relleno y no medidas.
     */
    fields?: {
        position: boolean;
        sog: boolean;
        cog: boolean;
    };
}

export interface HeadingTelemetry {
    type: "HEADING";
    heading: number;
    headingType: "true" | "magnetic";
    /**
     * Sentencia de origen. HDM ya es rumbo magnético; en HDG el valor es el del sensor y el
     * desvío no se aplica, así que no se trata como magnético verificado.
     */
    sentence?: "HDT" | "HDG" | "HDM";
}

export interface WindTelemetry {
    type: "WIND";
    speed: number;
    angle: number;
    reference?: "apparent" | "true";
    /** MWD: dirección geográfica verdadera; MWV: ángulo relativo a proa. */
    angleReference?: "relative" | "trueNorth";
}

export interface DepthTelemetry {
    type: "DEPTH";
    /** Metros. */
    depth: number;
    /**
     * Por debajo de qué se mide: quilla (DPT con offset negativo), superficie (DPT con offset
     * positivo) o sonda (DPT sin offset, DBT).
     */
    reference?: "keel" | "surface" | "transducer";
}

export interface AISTelemetry {
    type: "AIS";
    data: unknown;
}

export interface BaseTelemetry {
    type: string;
}

export interface WaterSpeedTelemetry { type: "WATER_SPEED"; knots: number; }
