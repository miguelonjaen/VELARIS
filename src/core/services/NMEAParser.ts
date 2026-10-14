import {
    DepthTelemetry,
    GPSTelemetry,
    HeadingTelemetry,
    NmeaInvalidTelemetry,
    RawTelemetry,
    TelemetryMessage,
    WindTelemetry
} from "@/core/types/TelemetryMessage";

const MPS_TO_KNOTS = 1.943844;
const KMH_TO_KNOTS = 1 / 1.852;
const FEET_TO_METERS = 0.3048;

export class NMEAParser {
    public parse(rawLine: string): TelemetryMessage {
        if (typeof rawLine !== "string") {
            return {
                type: "NMEA_INVALID",
                line: String(rawLine),
                reason: "non_string_input"
            };
        }

        const line = rawLine.trim();
        if (!line) {
            return {
                type: "NMEA_INVALID",
                line: rawLine,
                reason: "empty_line"
            };
        }

        if (!line.startsWith("$") && !line.startsWith("!")) {
            return {
                type: "NMEA_INVALID",
                line: rawLine,
                reason: "missing_start_delimiter"
            };
        }

        const starIndex = line.indexOf("*");
        let payload: string;

        if (starIndex !== -1) {
            payload = line.slice(1, starIndex);
            const checksumHex = line.slice(starIndex + 1, starIndex + 3);

            if (checksumHex.length < 2) {
                return {
                    type: "NMEA_INVALID",
                    line: rawLine,
                    reason: "invalid_checksum_format"
                };
            }

            const expectedChecksum = parseInt(checksumHex, 16);
            if (Number.isNaN(expectedChecksum)) {
                return {
                    type: "NMEA_INVALID",
                    line: rawLine,
                    reason: "invalid_checksum_hex"
                };
            }

            let calculatedChecksum = 0;
            for (let i = 0; i < payload.length; i++) {
                calculatedChecksum ^= payload.charCodeAt(i);
            }

            if (calculatedChecksum !== expectedChecksum) {
                return {
                    type: "NMEA_INVALID",
                    line: rawLine,
                    reason: "checksum_mismatch"
                };
            }
        } else {
            payload = line.slice(1);
        }

        const tokens = payload.split(",");
        const sentenceId = tokens[0]?.toUpperCase() ?? "";
        const sentenceType = sentenceId.length >= 3 ? sentenceId.slice(-3) : sentenceId;

        try {
            switch (sentenceType) {
                case "RMC":
                    return this.parseRMC(tokens, rawLine);
                case "GGA":
                    return this.parseGGA(tokens, rawLine);
                case "VTG":
                    return this.parseVTG(tokens, rawLine);
                case "HDT":
                    return this.parseHDT(tokens, rawLine);
                case "HDG":
                    return this.parseHDG(tokens, rawLine);
                case "HDM":
                    return this.parseHDM(tokens, rawLine);
                case "MWV":
                    return this.parseMWV(tokens, rawLine);
                case "DPT":
                    return this.parseDPT(tokens, rawLine);
                case "DBT":
                    return this.parseDBT(tokens, rawLine);
                default:
                    return {
                        type: "RAW",
                        line: rawLine
                    };
            }
        } catch (error) {
            return {
                type: "NMEA_INVALID",
                line: rawLine,
                reason: error instanceof Error ? error.message : "parsing_error"
            };
        }
    }

    private parseRMC(tokens: string[], rawLine: string): GPSTelemetry | NmeaInvalidTelemetry {
        // $xxRMC,time,status,lat,latHem,lon,lonHem,sog,cog,date,magVar,magVarHem,mode
        const time = tokens[1] ?? "";
        const status = tokens[2]?.toUpperCase() ?? "";
        const rawLat = tokens[3] ?? "";
        const latHem = tokens[4] ?? "";
        const rawLon = tokens[5] ?? "";
        const lonHem = tokens[6] ?? "";
        const rawSog = tokens[7] ?? "";
        const rawCog = tokens[8] ?? "";
        const date = tokens[9] ?? "";

        if (status !== "A") {
            return {
                type: "NMEA_INVALID",
                line: rawLine,
                reason: `status_warning: ${status}`
            };
        }

        const lat = this.parseCoordinate(rawLat, latHem, false);
        const lng = this.parseCoordinate(rawLon, lonHem, true);

        if (lat === null || lng === null) {
            return {
                type: "NMEA_INVALID",
                line: rawLine,
                reason: "invalid_coordinates"
            };
        }

        const sog = parseFloat(rawSog);
        const cog = parseFloat(rawCog);

        const timestamp = this.formatTimestamp(time, date);

        return {
            type: "GPS",
            lat,
            lng,
            sog: Number.isFinite(sog) && sog >= 0 ? sog : 0,
            cog: Number.isFinite(cog) && cog >= 0 ? cog % 360 : 0,
            ...(timestamp ? { timestamp } : {})
        };
    }

    private parseGGA(tokens: string[], rawLine: string): GPSTelemetry | NmeaInvalidTelemetry {
        // $xxGGA,time,lat,latHem,lon,lonHem,fixQuality,numSats,hdop,alt,altUnit,geoid,geoidUnit,dgpsAge,dgpsId
        const time = tokens[1] ?? "";
        const rawLat = tokens[2] ?? "";
        const latHem = tokens[3] ?? "";
        const rawLon = tokens[4] ?? "";
        const lonHem = tokens[5] ?? "";
        const rawFix = tokens[6] ?? "";

        const fixQuality = parseInt(rawFix, 10);
        if (Number.isNaN(fixQuality) || fixQuality <= 0) {
            return {
                type: "NMEA_INVALID",
                line: rawLine,
                reason: `no_fix: ${rawFix}`
            };
        }

        const lat = this.parseCoordinate(rawLat, latHem, false);
        const lng = this.parseCoordinate(rawLon, lonHem, true);

        if (lat === null || lng === null) {
            return {
                type: "NMEA_INVALID",
                line: rawLine,
                reason: "invalid_coordinates"
            };
        }

        const timestamp = this.formatTimestamp(time);

        return {
            type: "GPS",
            lat,
            lng,
            sog: 0,
            cog: 0,
            ...(timestamp ? { timestamp } : {})
        };
    }

    private parseVTG(tokens: string[], rawLine: string): GPSTelemetry | NmeaInvalidTelemetry {
        // $xxVTG,cogTrue,T,cogMag,M,sogKnots,N,sogKmh,K,mode
        const rawCogTrue = tokens[1] ?? "";
        const rawCogMag = tokens[3] ?? "";
        const rawSogKnots = tokens[5] ?? "";
        const rawSogKmh = tokens[7] ?? "";

        let cog = parseFloat(rawCogTrue);
        if (Number.isNaN(cog)) {
            cog = parseFloat(rawCogMag);
        }

        let sog = parseFloat(rawSogKnots);
        if (Number.isNaN(sog) && rawSogKmh) {
            const sogKmh = parseFloat(rawSogKmh);
            if (Number.isFinite(sogKmh)) {
                sog = sogKmh * KMH_TO_KNOTS;
            }
        }

        if (Number.isNaN(cog) && Number.isNaN(sog)) {
            return {
                type: "NMEA_INVALID",
                line: rawLine,
                reason: "invalid_vtg_data"
            };
        }

        return {
            type: "GPS",
            lat: 0,
            lng: 0,
            sog: Number.isFinite(sog) && sog >= 0 ? Number(sog.toFixed(2)) : 0,
            cog: Number.isFinite(cog) && cog >= 0 ? cog % 360 : 0
        };
    }

    private parseHDT(tokens: string[], rawLine: string): HeadingTelemetry | NmeaInvalidTelemetry {
        // $xxHDT,heading,T
        const rawHeading = tokens[1] ?? "";
        const heading = parseFloat(rawHeading);

        if (!Number.isFinite(heading) || heading < 0 || heading > 360) {
            return {
                type: "NMEA_INVALID",
                line: rawLine,
                reason: `invalid_heading: ${rawHeading}`
            };
        }

        return {
            type: "HEADING",
            heading: heading % 360,
            headingType: "true"
        };
    }

    private parseHDG(tokens: string[], rawLine: string): HeadingTelemetry | NmeaInvalidTelemetry {
        // $xxHDG,heading,dev,devHem,var,varHem
        const rawHeading = tokens[1] ?? "";
        const heading = parseFloat(rawHeading);

        if (!Number.isFinite(heading) || heading < 0 || heading > 360) {
            return {
                type: "NMEA_INVALID",
                line: rawLine,
                reason: `invalid_heading: ${rawHeading}`
            };
        }

        return {
            type: "HEADING",
            heading: heading % 360,
            headingType: "magnetic"
        };
    }

    private parseHDM(tokens: string[], rawLine: string): HeadingTelemetry | NmeaInvalidTelemetry {
        // $xxHDM,heading,M
        const rawHeading = tokens[1] ?? "";
        const heading = parseFloat(rawHeading);

        if (!Number.isFinite(heading) || heading < 0 || heading > 360) {
            return {
                type: "NMEA_INVALID",
                line: rawLine,
                reason: `invalid_heading: ${rawHeading}`
            };
        }

        return {
            type: "HEADING",
            heading: heading % 360,
            headingType: "magnetic"
        };
    }

    private parseMWV(tokens: string[], rawLine: string): WindTelemetry | NmeaInvalidTelemetry {
        // $xxMWV,angle,ref,speed,speedUnit,status
        const rawAngle = tokens[1] ?? "";
        const rawRef = tokens[2]?.toUpperCase() ?? "R";
        const rawSpeed = tokens[3] ?? "";
        const rawUnit = tokens[4]?.toUpperCase() ?? "N";
        const status = tokens[5]?.toUpperCase() ?? "";

        if (status !== "A") {
            return {
                type: "NMEA_INVALID",
                line: rawLine,
                reason: `invalid_status: ${status}`
            };
        }

        const angle = parseFloat(rawAngle);
        let speed = parseFloat(rawSpeed);

        if (!Number.isFinite(angle) || !Number.isFinite(speed) || angle < 0 || angle > 360 || speed < 0) {
            return {
                type: "NMEA_INVALID",
                line: rawLine,
                reason: "invalid_wind_data"
            };
        }

        if (rawUnit === "M") {
            speed *= MPS_TO_KNOTS;
        } else if (rawUnit === "K") {
            speed *= KMH_TO_KNOTS;
        }

        const reference: "apparent" | "true" = rawRef === "T" ? "true" : "apparent";

        return {
            type: "WIND",
            speed: Number(speed.toFixed(2)),
            angle: angle % 360,
            reference
        };
    }

    private parseDPT(tokens: string[], rawLine: string): DepthTelemetry | NmeaInvalidTelemetry {
        // $xxDPT,depth,offset,maxRange
        const rawDepth = tokens[1] ?? "";
        const rawOffset = tokens[2] ?? "";

        const depthBelowTransducer = parseFloat(rawDepth);
        if (!Number.isFinite(depthBelowTransducer) || depthBelowTransducer < 0) {
            return {
                type: "NMEA_INVALID",
                line: rawLine,
                reason: `invalid_depth: ${rawDepth}`
            };
        }

        const offset = parseFloat(rawOffset);
        const finalDepth = Number.isFinite(offset)
            ? Math.max(0, depthBelowTransducer + offset)
            : depthBelowTransducer;

        return {
            type: "DEPTH",
            depth: Number(finalDepth.toFixed(2))
        };
    }

    private parseDBT(tokens: string[], rawLine: string): DepthTelemetry | NmeaInvalidTelemetry {
        // $xxDBT,depthFeet,f,depthMeters,M,depthFathoms,F
        const rawFeet = tokens[1] ?? "";
        const rawMeters = tokens[3] ?? "";

        let depthMeters = parseFloat(rawMeters);
        if (Number.isNaN(depthMeters)) {
            const depthFeet = parseFloat(rawFeet);
            if (Number.isFinite(depthFeet)) {
                depthMeters = depthFeet * FEET_TO_METERS;
            }
        }

        if (!Number.isFinite(depthMeters) || depthMeters < 0) {
            return {
                type: "NMEA_INVALID",
                line: rawLine,
                reason: `invalid_depth: ${rawMeters}`
            };
        }

        return {
            type: "DEPTH",
            depth: Number(depthMeters.toFixed(2))
        };
    }

    private parseCoordinate(raw: string, hem: string, isLongitude: boolean): number | null {
        if (!raw || !hem) return null;
        const trimmedRaw = raw.trim();
        const trimmedHem = hem.trim().toUpperCase();

        const dotIndex = trimmedRaw.indexOf(".");
        const splitIndex = dotIndex !== -1 ? dotIndex - 2 : trimmedRaw.length - 2;
        if (splitIndex <= 0) return null;

        const degPart = parseFloat(trimmedRaw.slice(0, splitIndex));
        const minPart = parseFloat(trimmedRaw.slice(splitIndex));

        if (!Number.isFinite(degPart) || !Number.isFinite(minPart) || minPart < 0 || minPart >= 60) {
            return null;
        }

        let decimal = degPart + minPart / 60;

        if (trimmedHem === "S" || trimmedHem === "W") {
            decimal = -decimal;
        } else if (trimmedHem !== "N" && trimmedHem !== "E") {
            return null;
        }

        if (isLongitude) {
            if (decimal < -180 || decimal > 180) return null;
        } else {
            if (decimal < -90 || decimal > 90) return null;
        }

        return Number(decimal.toFixed(7));
    }

    private formatTimestamp(rawTime: string, rawDate?: string): string | undefined {
        if (!rawTime) return undefined;
        const timeClean = rawTime.trim();
        if (timeClean.length < 6) return undefined;

        const hours = timeClean.slice(0, 2);
        const minutes = timeClean.slice(2, 4);
        const seconds = timeClean.slice(4, 6);

        if (rawDate && rawDate.trim().length === 6) {
            const dateClean = rawDate.trim();
            const day = dateClean.slice(0, 2);
            const month = dateClean.slice(2, 4);
            const yearTwoDigits = parseInt(dateClean.slice(4, 6), 10);
            const fullYear = yearTwoDigits >= 70 ? 1900 + yearTwoDigits : 2000 + yearTwoDigits;

            return `${fullYear}-${month}-${day}T${hours}:${minutes}:${seconds}Z`;
        }

        return `${hours}:${minutes}:${seconds}Z`;
    }
}