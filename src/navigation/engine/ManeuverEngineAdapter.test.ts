import { describe, expect, it } from "vitest";
import { ManeuverEngineAdapter } from "./ManeuverEngineAdapter";
import { NavigationSample } from "./ManeuverEngine";

const sample = (cog: number): NavigationSample => ({
    timestamp: 1_700_000_000_000,
    position: { lat: 36, lng: -4 },
    sog: 6,
    cog,
    windDirection: 220,
    windSpeed: 14
});

describe("ManeuverEngineAdapter", () => {
    it("does not emit an event for the first sample", () => {
        const adapter = new ManeuverEngineAdapter();

        expect(adapter.process(sample(100))).toBeNull();
    });

    it("delegates course changes of at least 30 degrees", () => {
        const adapter = new ManeuverEngineAdapter();
        adapter.process(sample(100));

        const event = adapter.process(sample(130));

        expect(event).toMatchObject({
            type: "COURSE_CHANGE",
            courseBefore: 100,
            courseAfter: 130,
            deltaCourse: 30
        });
    });

    it("returns the structured event produced by ManeuverEngine", () => {
        const adapter = new ManeuverEngineAdapter();
        adapter.process(sample(350));

        expect(adapter.process(sample(40))).toEqual({
            type: "COURSE_CHANGE",
            timestamp: 1_700_000_000_000,
            position: { lat: 36, lng: -4 },
            courseBefore: 350,
            courseAfter: 40,
            deltaCourse: 50,
            sog: 6,
            windDirection: 220,
            windSpeed: 14
        });
    });

    it("resets the delegated engine state", () => {
        const adapter = new ManeuverEngineAdapter();
        adapter.process(sample(100));
        adapter.reset();

        expect(adapter.process(sample(130))).toBeNull();
    });

    it("handles invalid samples safely", () => {
        const adapter = new ManeuverEngineAdapter();
        adapter.process(sample(100));

        expect(() => adapter.process({
            ...sample(160),
            position: { lat: Number.NaN, lng: -4 }
        })).not.toThrow();
        expect(adapter.process(sample(120))).toBeNull();
    });
});
