import { describe, expect, it } from "vitest";
import { NMEAParser } from "./NMEAParser";
import type {
    DepthTelemetry,
    GPSTelemetry,
    HeadingTelemetry,
    NmeaInvalidTelemetry,
    WindTelemetry
} from "@/core/types/TelemetryMessage";

function computeNmeaChecksum(sentenceWithoutDollarOrStar: string): string {
    let checksum = 0;
    for (let i = 0; i < sentenceWithoutDollarOrStar.length; i++) {
        checksum ^= sentenceWithoutDollarOrStar.charCodeAt(i);
    }
    return checksum.toString(16).toUpperCase().padStart(2, "0");
}

function buildSentence(payload: string): string {
    return `$${payload}*${computeNmeaChecksum(payload)}`;
}

describe("NMEAParser", () => {
    const parser = new NMEAParser();

    describe("RMC — Recommended Minimum Specific GPS Data", () => {
        it("parses valid RMC sentence with position, SOG, COG and timestamp", () => {
            // Lat: 36°30.0' N -> 36.5, Lon: 004°00.0' W -> -4.0, SOG: 6.5 kn, COG: 90.0°
            const sentence = buildSentence("GPRMC,123519,A,3630.0000,N,00400.0000,W,006.5,090.0,220926,001.0,W,A");
            const result = parser.parse(sentence) as GPSTelemetry;

            expect(result.type).toBe("GPS");
            expect(result.lat).toBeCloseTo(36.5, 5);
            expect(result.lng).toBeCloseTo(-4.0, 5);
            expect(result.sog).toBe(6.5);
            expect(result.cog).toBe(90.0);
            expect(result.heading).toBeUndefined();
            expect(result.timestamp).toBe("2026-09-22T12:35:19Z");
        });

        it("rejects RMC with status 'V' (Navigation receiver warning)", () => {
            const sentence = buildSentence("GPRMC,123519,V,3630.0000,N,00400.0000,W,006.5,090.0,220926,001.0,W,N");
            const result = parser.parse(sentence) as NmeaInvalidTelemetry;

            expect(result.type).toBe("NMEA_INVALID");
            expect(result.reason).toContain("status_warning");
        });

        it("correctly converts South and East coordinates", () => {
            // Lat: 34°15.0' S -> -34.25, Lon: 018°30.0' E -> +18.5
            const sentence = buildSentence("GNRMC,080000,A,3415.0000,S,01830.0000,E,10.2,180.0,150326,000.0,E,A");
            const result = parser.parse(sentence) as GPSTelemetry;

            expect(result.type).toBe("GPS");
            expect(result.lat).toBeCloseTo(-34.25, 5);
            expect(result.lng).toBeCloseTo(18.5, 5);
        });

        it("rejects RMC with invalid checksum", () => {
            const sentence = "$GPRMC,123519,A,3630.0000,N,00400.0000,W,006.5,090.0,220926,001.0,W,A*00";
            const result = parser.parse(sentence) as NmeaInvalidTelemetry;

            expect(result.type).toBe("NMEA_INVALID");
            expect(result.reason).toBe("checksum_mismatch");
        });
    });

    describe("GGA — Global Positioning System Fix Data", () => {
        it("parses valid GGA sentence and extracts position and timestamp without SOG/COG", () => {
            const sentence = buildSentence("GPGGA,123519,3630.0000,N,00400.0000,W,1,08,0.9,10.0,M,47.0,M,,");
            const result = parser.parse(sentence) as GPSTelemetry;

            expect(result.type).toBe("GPS");
            expect(result.lat).toBeCloseTo(36.5, 5);
            expect(result.lng).toBeCloseTo(-4.0, 5);
            expect(result.sog).toBe(0);
            expect(result.cog).toBe(0);
            expect(result.heading).toBeUndefined();
            expect(result.timestamp).toBe("12:35:19Z");
        });

        it("rejects GGA with fix quality 0 (Invalid / No fix)", () => {
            const sentence = buildSentence("GPGGA,123519,3630.0000,N,00400.0000,W,0,00,99.9,0.0,M,0.0,M,,");
            const result = parser.parse(sentence) as NmeaInvalidTelemetry;

            expect(result.type).toBe("NMEA_INVALID");
            expect(result.reason).toContain("no_fix");
        });
    });

    describe("VTG — Course Over Ground and Ground Speed", () => {
        it("parses VTG extracting true COG and SOG in knots", () => {
            const sentence = buildSentence("GPVTG,095.4,T,096.0,M,007.2,N,013.3,K,A");
            const result = parser.parse(sentence) as GPSTelemetry;

            expect(result.type).toBe("GPS");
            expect(result.cog).toBe(95.4);
            expect(result.sog).toBe(7.2);
            expect(result.lat).toBe(0);
            expect(result.lng).toBe(0);
            expect(result.heading).toBeUndefined();
        });

        it("converts km/h to knots when knots field is empty in VTG", () => {
            const sentence = buildSentence("GPVTG,180.0,T,,M,,N,18.52,K,A");
            const result = parser.parse(sentence) as GPSTelemetry;

            expect(result.type).toBe("GPS");
            expect(result.cog).toBe(180.0);
            expect(result.sog).toBeCloseTo(10.0, 2); // 18.52 km/h / 1.852 = 10.0 knots
        });
    });

    describe("HDT / HDG / HDM — Heading Sentences", () => {
        it("parses HDT as true heading", () => {
            const sentence = buildSentence("GPHDT,265.5,T");
            const result = parser.parse(sentence) as HeadingTelemetry;

            expect(result.type).toBe("HEADING");
            expect(result.heading).toBe(265.5);
            expect(result.headingType).toBe("true");
        });

        it("parses HDG as magnetic heading preserving magnetic type", () => {
            const sentence = buildSentence("HCHDG,265.5,0.0,E,1.5,W");
            const result = parser.parse(sentence) as HeadingTelemetry;

            expect(result.type).toBe("HEADING");
            expect(result.heading).toBe(265.5);
            expect(result.headingType).toBe("magnetic");
        });

        it("parses HDM as magnetic heading preserving magnetic type", () => {
            const sentence = buildSentence("HCHDM,045.0,M");
            const result = parser.parse(sentence) as HeadingTelemetry;

            expect(result.type).toBe("HEADING");
            expect(result.heading).toBe(45.0);
            expect(result.headingType).toBe("magnetic");
        });
    });

    describe("MWV — Wind Speed and Angle", () => {
        it("parses MWV apparent wind in knots", () => {
            const sentence = buildSentence("WIMWV,045.0,R,18.5,N,A");
            const result = parser.parse(sentence) as WindTelemetry;

            expect(result.type).toBe("WIND");
            expect(result.angle).toBe(45.0);
            expect(result.speed).toBe(18.5);
            expect(result.reference).toBe("apparent");
        });

        it("parses MWV true wind and converts m/s to knots", () => {
            // 10.0 m/s * 1.943844 = 19.44 knots
            const sentence = buildSentence("WIMWV,180.0,T,10.0,M,A");
            const result = parser.parse(sentence) as WindTelemetry;

            expect(result.type).toBe("WIND");
            expect(result.angle).toBe(180.0);
            expect(result.speed).toBeCloseTo(19.44, 2);
            expect(result.reference).toBe("true");
        });

        it("converts km/h to knots in MWV", () => {
            // 37.04 km/h / 1.852 = 20.0 knots
            const sentence = buildSentence("WIMWV,090.0,R,37.04,K,A");
            const result = parser.parse(sentence) as WindTelemetry;

            expect(result.type).toBe("WIND");
            expect(result.speed).toBeCloseTo(20.0, 1);
            expect(result.reference).toBe("apparent");
        });

        it("rejects MWV with invalid status 'V'", () => {
            const sentence = buildSentence("WIMWV,045.0,R,18.5,N,V");
            const result = parser.parse(sentence) as NmeaInvalidTelemetry;

            expect(result.type).toBe("NMEA_INVALID");
            expect(result.reason).toContain("invalid_status");
        });
    });

    describe("DPT & DBT — Depth Sentences", () => {
        it("parses DPT with depth and offset (keel offset)", () => {
            // 12.0m transducer depth - 1.5m keel offset = 10.5m depth under keel
            const sentence = buildSentence("SDDPT,12.0,-1.5,100.0");
            const result = parser.parse(sentence) as DepthTelemetry;

            expect(result.type).toBe("DEPTH");
            expect(result.depth).toBe(10.5);
        });

        it("parses DPT with depth without offset", () => {
            const sentence = buildSentence("SDDPT,14.2,,");
            const result = parser.parse(sentence) as DepthTelemetry;

            expect(result.type).toBe("DEPTH");
            expect(result.depth).toBe(14.2);
        });

        it("parses DBT taking exclusively the meters field", () => {
            const sentence = buildSentence("SDDBT,46.5,f,14.17,M,7.7,F");
            const result = parser.parse(sentence) as DepthTelemetry;

            expect(result.type).toBe("DEPTH");
            expect(result.depth).toBe(14.17);
        });
    });

    describe("Strict HDG vs COG Separation", () => {
        it("RMC with COG=270 produces cog=270 and undefined heading (never sets heading to 270)", () => {
            const sentence = buildSentence("GPRMC,120000,A,3600.0000,N,00400.0000,W,006.0,270.0,220926,,,A");
            const result = parser.parse(sentence) as GPSTelemetry;

            expect(result.type).toBe("GPS");
            expect(result.cog).toBe(270.0);
            expect(result.heading).toBeUndefined();
        });

        it("HDT with heading=265 produces HeadingTelemetry with heading=265 and headingType='true'", () => {
            const sentence = buildSentence("GPHDT,265.0,T");
            const result = parser.parse(sentence) as HeadingTelemetry;

            expect(result.type).toBe("HEADING");
            expect(result.heading).toBe(265.0);
            expect(result.headingType).toBe("true");
        });
    });

    describe("Robustness & Error Handling", () => {
        it("handles unknown sentences by returning RAW without throwing", () => {
            const sentence = buildSentence("GPXYZ,1,2,3,4");
            const result = parser.parse(sentence);

            expect(result.type).toBe("RAW");
            expect((result as any).line).toBe(sentence);
        });

        it("rejects non-string input safely", () => {
            const result = parser.parse(null as any) as NmeaInvalidTelemetry;
            expect(result.type).toBe("NMEA_INVALID");
        });

        it("rejects empty lines safely", () => {
            const result = parser.parse("   ") as NmeaInvalidTelemetry;
            expect(result.type).toBe("NMEA_INVALID");
        });

        it("rejects lines without starting delimiter", () => {
            const result = parser.parse("GPRMC,123519,A*23") as NmeaInvalidTelemetry;
            expect(result.type).toBe("NMEA_INVALID");
            expect(result.reason).toBe("missing_start_delimiter");
        });

        it("handles CR/LF gracefully", () => {
            const sentence = buildSentence("GPHDT,045.0,T") + "\r\n";
            const result = parser.parse(sentence) as HeadingTelemetry;

            expect(result.type).toBe("HEADING");
            expect(result.heading).toBe(45.0);
        });

        it("rejects invalid latitude/longitude ranges", () => {
            // Latitude 95° is out of [-90, 90]
            const sentence = buildSentence("GPRMC,120000,A,9500.0000,N,00400.0000,W,006.0,000.0,220926,,,A");
            const result = parser.parse(sentence) as NmeaInvalidTelemetry;

            expect(result.type).toBe("NMEA_INVALID");
            expect(result.reason).toBe("invalid_coordinates");
        });
    });
});
