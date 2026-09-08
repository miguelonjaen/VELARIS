import { describe, expect, it } from "vitest";
import {
    CourseChangeEvent,
    GybeEvent,
    ManeuverEvent,
    TackEvent,
    WaypointReachedEvent
} from "./ManeuverEngine";
import { ManeuverEventStore } from "./ManeuverEventStore";

const courseChange = (overrides: Partial<CourseChangeEvent> = {}): CourseChangeEvent => ({
    type: "COURSE_CHANGE",
    timestamp: 1_700_000_000_000,
    position: { lat: 36, lng: -4 },
    courseBefore: 90,
    courseAfter: 140,
    deltaCourse: 50,
    sog: 6,
    windDirection: 220,
    windSpeed: 14,
    ...overrides
});

const waypointReached = (overrides: Partial<WaypointReachedEvent> = {}): WaypointReachedEvent => ({
    type: "WAYPOINT_REACHED",
    timestamp: 1_700_000_001_000,
    position: { lat: 36.1, lng: -3.9 },
    waypointId: "wp-1",
    waypointName: "Harbor",
    distanceToWaypointNm: 0.01,
    ...overrides
});

const tack = (overrides: Partial<TackEvent> = {}): TackEvent => ({
    type: "TACK",
    timestamp: 1_700_000_002_000,
    position: { lat: 36.2, lng: -3.8 },
    courseBefore: 40,
    courseAfter: 320,
    deltaCourse: -80,
    sog: 6,
    windDirection: 0,
    windSpeed: 12,
    relativeWindBefore: -40,
    relativeWindAfter: 40,
    ...overrides
});

const gybe = (overrides: Partial<GybeEvent> = {}): GybeEvent => ({
    type: "GYBE",
    timestamp: 1_700_000_003_000,
    position: { lat: 36.3, lng: -3.7 },
    courseBefore: 120,
    courseAfter: 240,
    deltaCourse: 120,
    sog: 6,
    windDirection: 0,
    windSpeed: 12,
    relativeWindBefore: -120,
    relativeWindAfter: 120,
    ...overrides
});

describe("ManeuverEventStore", () => {
    it("starts empty", () => {
        const store = new ManeuverEventStore();

        expect(store.getAll()).toEqual([]);
        expect(store.size()).toBe(0);
    });

    it("adds and preserves an event", () => {
        const store = new ManeuverEventStore();
        const event = courseChange();

        store.add(event);

        expect(store.getAll()).toEqual([event]);
    });

    it("preserves insertion order", () => {
        const store = new ManeuverEventStore();
        const first = courseChange();
        const second = courseChange({
            timestamp: first.timestamp + 1_000
        });

        store.add(first);
        store.add(second);

        expect(store.getAll()).toEqual([first, second]);
    });

    it("filters events by type", () => {
        const store = new ManeuverEventStore();
        store.add(courseChange());
        store.add(tack());
        store.add(gybe());

        expect(store.getByType("TACK")).toEqual([tack()]);
        expect(store.getByType("COURSE_CHANGE")).toEqual([courseChange()]);
    });

    it("clears all events", () => {
        const store = new ManeuverEventStore();
        store.add(courseChange());
        store.clear();

        expect(store.size()).toBe(0);
        expect(store.getAll()).toEqual([]);
    });

    it("reports the correct size", () => {
        const store = new ManeuverEventStore();
        store.add(courseChange());
        store.add(waypointReached());

        expect(store.size()).toBe(2);
    });

    it("protects internal storage from array and event mutations", () => {
        const store = new ManeuverEventStore();
        store.add(courseChange());

        const events = store.getAll() as ManeuverEvent[];
        events.pop();
        events[0] = tack();
        const returnedEvent = store.getAll()[0] as CourseChangeEvent;
        returnedEvent.position.lat = 99;

        expect(store.size()).toBe(1);
        expect(store.getAll()[0]).toEqual(courseChange());
    });

    it("does not add an identical duplicate", () => {
        const store = new ManeuverEventStore();
        const event = courseChange();

        store.add(event);
        store.add({ ...event, position: { ...event.position } });

        expect(store.size()).toBe(1);
    });

    it("keeps distinct events with the same timestamp", () => {
        const store = new ManeuverEventStore();
        const timestamp = 1_700_000_010_000;

        store.add(courseChange({ timestamp, courseAfter: 140 }));
        store.add(courseChange({ timestamp, courseAfter: 150 }));

        expect(store.size()).toBe(2);
    });

    it("supports all maneuver event types", () => {
        const store = new ManeuverEventStore();
        store.add(courseChange());
        store.add(waypointReached());
        store.add(tack());
        store.add(gybe());

        expect(store.getByType("COURSE_CHANGE")).toHaveLength(1);
        expect(store.getByType("WAYPOINT_REACHED")).toHaveLength(1);
        expect(store.getByType("TACK")).toHaveLength(1);
        expect(store.getByType("GYBE")).toHaveLength(1);
        expect(store.size()).toBe(4);
    });
});
