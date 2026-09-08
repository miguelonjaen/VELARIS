import { describe, expect, it, vi } from "vitest";
import {
    CourseChangeEvent,
    GybeEvent,
    TackEvent,
    WaypointReachedEvent
} from "./ManeuverEngine";
import { persistManeuverEvents } from "./ManeuverLogPersistence";

const events = [
    {
        type: "COURSE_CHANGE",
        timestamp: 1_700_000_000_000,
        position: { lat: 36, lng: -4 },
        courseBefore: 90,
        courseAfter: 140,
        deltaCourse: 50,
        sog: 6,
        windDirection: 220,
        windSpeed: 14
    } satisfies CourseChangeEvent,
    {
        type: "WAYPOINT_REACHED",
        timestamp: 1_700_000_001_000,
        position: { lat: 36.1, lng: -3.9 },
        waypointId: "wp-1",
        waypointName: "Puerto",
        distanceToWaypointNm: 0.02
    } satisfies WaypointReachedEvent,
    {
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
        relativeWindAfter: 40
    } satisfies TackEvent,
    {
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
        relativeWindAfter: 120
    } satisfies GybeEvent
];

describe("persistManeuverEvents", () => {
    it("maps and writes all four event types in chronological order", async () => {
        const writer = vi.fn().mockResolvedValue({ data: [], error: null });
        const persistedKeys = new Set<string>();

        const result = await persistManeuverEvents(
            events,
            {
                barcoId: "boat-1",
                userId: "user-1",
                tipoNavegacion: "Planificada",
                destinoPlanificado: "Puerto"
            },
            writer,
            persistedKeys
        );

        expect(result).toEqual({ attempted: 4, persisted: 4, failed: 0 });
        expect(writer).toHaveBeenCalledTimes(4);
        expect(writer.mock.calls.map(([entry]) => entry.titulo)).toEqual([
            "Cambio de rumbo",
            "Waypoint alcanzado",
            "Virada",
            "Trasluchada"
        ]);
        expect(writer.mock.calls[0][0]).toMatchObject({
            barco_id: "boat-1",
            user_id: "user-1",
            tipo_navegacion: "Planificada",
            destino_planificado: "Puerto"
        });
    });

    it("does not write an empty store", async () => {
        const writer = vi.fn();

        const result = await persistManeuverEvents([], {}, writer, new Set());

        expect(result).toEqual({ attempted: 0, persisted: 0, failed: 0 });
        expect(writer).not.toHaveBeenCalled();
    });

    it("does not persist a previously successful event twice", async () => {
        const writer = vi.fn().mockResolvedValue({ data: [], error: null });
        const persistedKeys = new Set<string>();

        await persistManeuverEvents([events[0]], {}, writer, persistedKeys);
        const retry = await persistManeuverEvents([events[0]], {}, writer, persistedKeys);

        expect(writer).toHaveBeenCalledTimes(1);
        expect(retry).toEqual({ attempted: 0, persisted: 0, failed: 0 });
    });

    it("continues with later events when one write fails", async () => {
        const writer = vi
            .fn()
            .mockResolvedValueOnce({ data: null, error: new Error("write failed") })
            .mockResolvedValueOnce({ data: [], error: null });
        const onError = vi.fn();

        const result = await persistManeuverEvents(
            events.slice(0, 2),
            {},
            writer,
            new Set(),
            onError
        );

        expect(result).toEqual({ attempted: 2, persisted: 1, failed: 1 });
        expect(writer).toHaveBeenCalledTimes(2);
        expect(onError).toHaveBeenCalledTimes(1);
    });
});
