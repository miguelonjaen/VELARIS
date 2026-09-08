import { describe, expect, it } from "vitest";
import {
    CourseChangeEvent,
    GybeEvent,
    TackEvent,
    WaypointReachedEvent
} from "./ManeuverEngine";
import { mapManeuverToLogEntry } from "./ManeuverLogMapper";

const context = {
    barcoId: "boat-1",
    userId: "user-1",
    fecha: "2026-09-08T08:00:00.000Z",
    tipoNavegacion: "Libre" as const
};

const courseChange: CourseChangeEvent = {
    type: "COURSE_CHANGE",
    timestamp: 1_700_000_000_000,
    position: { lat: 36, lng: -4 },
    courseBefore: 90,
    courseAfter: 140,
    deltaCourse: 50,
    sog: 6,
    windDirection: 220,
    windSpeed: 14
};

const waypointReached: WaypointReachedEvent = {
    type: "WAYPOINT_REACHED",
    timestamp: 1_700_000_001_000,
    position: { lat: 36.1, lng: -3.9 },
    waypointId: "wp-1",
    waypointName: "Puerto",
    distanceToWaypointNm: 0.02
};

const tack: TackEvent = {
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
};

const gybe: GybeEvent = {
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
};

describe("ManeuverLogMapper", () => {
    it("maps COURSE_CHANGE to a technical automatic log entry", () => {
        const entry = mapManeuverToLogEntry(courseChange, context);

        expect(entry).toMatchObject({
            id: "COURSE_CHANGE-1700000000000-36--4",
            barco_id: "boat-1",
            user_id: "user-1",
            fecha: context.fecha,
            titulo: "Cambio de rumbo",
            categoria: "Técnico",
            is_auto: true,
            lat: 36,
            lng: -4,
            rumbo: 140,
            velocidad_gps: 6,
            viento_nudos: 14,
            tipo_navegacion: "Libre"
        });
        expect(entry.descripcion).toContain("090°");
        expect(entry.descripcion).toContain("140°");
        expect(entry.descripcion).toContain("+50°");
    });

    it("maps WAYPOINT_REACHED and includes the waypoint name", () => {
        const entry = mapManeuverToLogEntry(waypointReached);

        expect(entry.titulo).toBe("Waypoint alcanzado");
        expect(entry.categoria).toBe("Técnico");
        expect(entry.is_auto).toBe(true);
        expect(entry.lat).toBe(36.1);
        expect(entry.lng).toBe(-3.9);
        expect(entry.waypoints).toBe("Puerto");
        expect(entry.descripcion).toContain("Puerto");
        expect(entry.descripcion).toContain("0.02 NM");
    });

    it("maps TACK to Virada with navigation and wind data", () => {
        const entry = mapManeuverToLogEntry(tack);

        expect(entry.titulo).toBe("Virada");
        expect(entry.rumbo).toBe(320);
        expect(entry.velocidad_gps).toBe(6);
        expect(entry.viento_nudos).toBe(12);
        expect(entry.descripcion).toContain("040°");
        expect(entry.descripcion).toContain("320°");
        expect(entry.descripcion).toContain("000°");
    });

    it("maps GYBE to Trasluchada", () => {
        const entry = mapManeuverToLogEntry(gybe);

        expect(entry.titulo).toBe("Trasluchada");
        expect(entry.is_auto).toBe(true);
        expect(entry.descripcion).toContain("120°");
        expect(entry.descripcion).toContain("240°");
    });

    it("uses only available data when optional context is absent", () => {
        const entry = mapManeuverToLogEntry(courseChange);

        expect(entry.barco_id).toBeNull();
        expect(entry.user_id).toBe("");
        expect(entry.tipo_navegacion).toBeUndefined();
        expect(entry.destino_planificado).toBeUndefined();
        expect(entry.fecha).toBe(new Date(courseChange.timestamp).toISOString());
    });
});
