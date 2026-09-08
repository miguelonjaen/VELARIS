import { describe, expect, it } from "vitest";
import { ManeuverEngine, NavigationSample } from "./ManeuverEngine";

const sample = (cog: number, overrides: Partial<NavigationSample> = {}): NavigationSample => ({
    timestamp: 1_700_000_000_000,
    position: { lat: 36, lng: -4 },
    sog: 6,
    cog,
    windDirection: 220,
    windSpeed: 14,
    ...overrides
});

const waypoint = (overrides: Partial<NonNullable<NavigationSample["waypoint"]>> = {}) => ({
    id: "wp-1",
    lat: 36,
    lng: -4,
    radiusNm: 0.05,
    ...overrides
});

describe("ManeuverEngine", () => {
    it("does not emit an event for the first sample", () => {
        expect(new ManeuverEngine().process(sample(100))).toBeNull();
    });

    it("does not emit changes smaller than 30 degrees", () => {
        const engine = new ManeuverEngine();
        engine.process(sample(100));

        expect(engine.process(sample(129))).toBeNull();
    });

    it("emits a change of exactly 30 degrees", () => {
        const engine = new ManeuverEngine();
        engine.process(sample(100));

        expect(engine.process(sample(130))).toMatchObject({
            type: "COURSE_CHANGE",
            deltaCourse: 30
        });
    });

    it("emits a positive 60 degree change", () => {
        const engine = new ManeuverEngine();
        engine.process(sample(100));

        expect(engine.process(sample(160))).toMatchObject({
            courseBefore: 100,
            courseAfter: 160,
            deltaCourse: 60
        });
    });

    it("emits a negative 60 degree change", () => {
        const engine = new ManeuverEngine();
        engine.process(sample(160));

        expect(engine.process(sample(100))).toMatchObject({
            courseBefore: 160,
            courseAfter: 100,
            deltaCourse: -60
        });
    });

    it("handles a positive crossing of north without emitting below threshold", () => {
        const engine = new ManeuverEngine();
        engine.process(sample(350));

        expect(engine.process(sample(10))).toBeNull();
    });

    it("handles a negative crossing of north without emitting below threshold", () => {
        const engine = new ManeuverEngine();
        engine.process(sample(10));

        expect(engine.process(sample(350))).toBeNull();
    });

    it("emits a positive 50 degree crossing change", () => {
        const engine = new ManeuverEngine();
        engine.process(sample(350));

        expect(engine.process(sample(40))).toMatchObject({
            courseBefore: 350,
            courseAfter: 40,
            deltaCourse: 50
        });
    });

    it("emits a negative 50 degree crossing change", () => {
        const engine = new ManeuverEngine();
        engine.process(sample(40));

        expect(engine.process(sample(350))).toMatchObject({
            courseBefore: 40,
            courseAfter: 350,
            deltaCourse: -50
        });
    });

    it("includes current navigation and wind data in the event", () => {
        const engine = new ManeuverEngine();
        engine.process(sample(100));
        const current = sample(160, {
            timestamp: 1_700_000_001_000,
            position: { lat: 36.1234, lng: -3.9876 },
            sog: 8.5,
            windDirection: 275,
            windSpeed: 22
        });

        expect(engine.process(current)).toEqual({
            type: "COURSE_CHANGE",
            timestamp: current.timestamp,
            position: current.position,
            courseBefore: 100,
            courseAfter: 160,
            deltaCourse: 60,
            sog: 8.5,
            windDirection: 275,
            windSpeed: 22
        });
    });

    it("does not repeat an event when the next course remains unchanged", () => {
        const engine = new ManeuverEngine();
        engine.process(sample(100));

        expect(engine.process(sample(160))).not.toBeNull();
        expect(engine.process(sample(160))).toBeNull();
    });

    it("clears the previous reference on reset", () => {
        const engine = new ManeuverEngine();
        engine.process(sample(100));
        engine.reset();

        expect(engine.process(sample(160))).toBeNull();
    });

    it("ignores invalid samples without throwing or changing the reference", () => {
        const engine = new ManeuverEngine();
        engine.process(sample(100));

        expect(() => engine.process(sample(160, {
            sog: Number.NaN
        }))).not.toThrow();
        expect(engine.process(sample(120))).toBeNull();
    });

    it("does not reach a waypoint outside its radius", () => {
        const engine = new ManeuverEngine();

        expect(engine.process(sample(100, {
            waypoint: waypoint({ lat: 36.01 })
        }))).toBeNull();
    });

    it("reaches a waypoint inside its radius", () => {
        const engine = new ManeuverEngine();
        const event = engine.process(sample(100, {
            waypoint: waypoint()
        }));

        expect(event).toBeNull();
        const reached = engine.process(sample(100, {
            waypoint: waypoint()
        }));

        expect(reached).toMatchObject({
            type: "WAYPOINT_REACHED",
            waypointId: "wp-1",
            distanceToWaypointNm: 0
        });
    });

    it("reaches a waypoint on the radius boundary", () => {
        const engine = new ManeuverEngine();
        engine.process(sample(100));
        const boundaryLatitude = 36 + (0.05 / 3440.065) * 180 / Math.PI;

        const event = engine.process(sample(100, {
            position: { lat: boundaryLatitude, lng: -4 },
            waypoint: waypoint()
        }));

        expect(event?.type).toBe("WAYPOINT_REACHED");
    });

    it("emits waypoint reached only once while remaining inside the radius", () => {
        const engine = new ManeuverEngine();
        const waypointSample = { waypoint: waypoint() };
        engine.process(sample(100));

        expect(engine.process(sample(100, waypointSample))).toMatchObject({
            type: "WAYPOINT_REACHED"
        });
        expect(engine.process(sample(100, waypointSample))).toBeNull();
    });

    it("allows a new waypoint to be reached", () => {
        const engine = new ManeuverEngine();
        engine.process(sample(100));

        expect(engine.process(sample(100, {
            waypoint: waypoint()
        }) )?.type).toBe("WAYPOINT_REACHED");
        expect(engine.process(sample(100, {
            waypoint: waypoint({ id: "wp-2", name: "Second waypoint" })
        }) )).toMatchObject({
            type: "WAYPOINT_REACHED",
            waypointId: "wp-2",
            waypointName: "Second waypoint"
        });
    });

    it("ignores invalid waypoint data without throwing", () => {
        const engine = new ManeuverEngine();
        engine.process(sample(100));

        expect(() => engine.process(sample(100, {
            waypoint: waypoint({ lat: Number.NaN })
        }))).not.toThrow();
        expect(engine.process(sample(100))).toBeNull();
    });

    it("allows the same waypoint to be reached again after reset", () => {
        const engine = new ManeuverEngine();
        engine.process(sample(100));
        engine.process(sample(100, { waypoint: waypoint() }));
        engine.reset();

        expect(engine.process(sample(100))).toBeNull();
        expect(engine.process(sample(100, {
            waypoint: waypoint()
        }))?.type).toBe("WAYPOINT_REACHED");
    });

    it("includes waypoint identity, name, and valid distance", () => {
        const engine = new ManeuverEngine();
        engine.process(sample(100));

        const event = engine.process(sample(100, {
            waypoint: waypoint({ name: "Harbor entrance" })
        }));

        expect(event).toMatchObject({
            type: "WAYPOINT_REACHED",
            waypointId: "wp-1",
            waypointName: "Harbor entrance"
        });
        if (event?.type === "WAYPOINT_REACHED") {
            expect(Number.isFinite(event.distanceToWaypointNm)).toBe(true);
            expect(event.distanceToWaypointNm).toBeGreaterThanOrEqual(0);
        }
    });

    it("detects a tack when relative wind crosses the bow", () => {
        const engine = new ManeuverEngine();
        engine.process(sample(40, {
            windDirection: 0,
            windSpeed: 12,
            sog: 6
        }));

        const event = engine.process(sample(320, {
            windDirection: 0,
            windSpeed: 12,
            sog: 6
        }));

        expect(event).toMatchObject({
            type: "TACK",
            courseBefore: 40,
            courseAfter: 320,
            deltaCourse: -80,
            relativeWindBefore: -40,
            relativeWindAfter: 40
        });
    });

    it("detects a gybe when relative wind crosses the stern", () => {
        const engine = new ManeuverEngine();
        engine.process(sample(120, {
            windDirection: 0,
            windSpeed: 12,
            sog: 6
        }));

        const event = engine.process(sample(240, {
            windDirection: 0,
            windSpeed: 12,
            sog: 6
        }));

        expect(event).toMatchObject({
            type: "GYBE",
            courseBefore: 120,
            courseAfter: 240,
            deltaCourse: 120,
            relativeWindBefore: -120,
            relativeWindAfter: 120
        });
    });

    it("does not detect a tack without valid wind", () => {
        const engine = new ManeuverEngine();
        engine.process(sample(40, { windDirection: 0, windSpeed: 0 }));

        const event = engine.process(sample(320, { windDirection: 0, windSpeed: 0 }));

        expect(event?.type).toBe("COURSE_CHANGE");
    });

    it("does not detect a gybe below the minimum SOG", () => {
        const engine = new ManeuverEngine();
        engine.process(sample(120, {
            windDirection: 0,
            windSpeed: 12,
            sog: 0.4
        }));

        const event = engine.process(sample(240, {
            windDirection: 0,
            windSpeed: 12,
            sog: 0.4
        }));

        expect(event?.type).toBe("COURSE_CHANGE");
    });

    it("falls back to course change when there is no bow or stern crossing", () => {
        const engine = new ManeuverEngine();
        engine.process(sample(100, {
            windDirection: 0,
            windSpeed: 12,
            sog: 6
        }));

        const event = engine.process(sample(160, {
            windDirection: 0,
            windSpeed: 12,
            sog: 6
        }));

        expect(event?.type).toBe("COURSE_CHANGE");
    });

    it("does not classify a small course change as a maneuver", () => {
        const engine = new ManeuverEngine();
        engine.process(sample(40, {
            windDirection: 0,
            windSpeed: 12,
            sog: 6
        }));

        expect(engine.process(sample(50, {
            windDirection: 0,
            windSpeed: 12,
            sog: 6
        }))).toBeNull();
    });

    it("handles relative wind crossing zero and avoids repeated special events", () => {
        const engine = new ManeuverEngine();
        engine.process(sample(350, {
            windDirection: 0,
            windSpeed: 12,
            sog: 6
        }));

        const event = engine.process(sample(40, {
            windDirection: 0,
            windSpeed: 12,
            sog: 6
        }));

        expect(event?.type).toBe("TACK");
        expect(event && "relativeWindBefore" in event
            ? event.relativeWindBefore
            : null).toBe(10);
        expect(event && "relativeWindAfter" in event
            ? event.relativeWindAfter
            : null).toBe(-40);
        expect(engine.process(sample(40, {
            windDirection: 0,
            windSpeed: 12,
            sog: 6
        }))).toBeNull();
    });
});
