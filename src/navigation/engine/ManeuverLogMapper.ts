import { ManeuverEvent } from "./ManeuverEngine";
import { LogEntry } from "@/shared/types";

export interface ManeuverLogContext {
    barcoId?: string | number;
    userId?: string;
    fecha?: string;
    tipoNavegacion?: "Libre" | "Planificada";
    destinoPlanificado?: string;
}

export function mapManeuverToLogEntry(
    event: ManeuverEvent,
    context: ManeuverLogContext = {}
): LogEntry {
    const title = getTitle(event);
    const description = getDescription(event);
    const entry: LogEntry = {
        id: `${event.type}-${event.timestamp}-${event.position.lat}-${event.position.lng}`,
        barco_id: context.barcoId ?? null,
        user_id: context.userId ?? "",
        fecha: context.fecha ?? new Date(event.timestamp).toISOString(),
        titulo: title,
        categoria: "Técnico",
        descripcion: description,
        is_auto: true,
        lat: event.position.lat,
        lng: event.position.lng
    };

    if (context.tipoNavegacion) {
        entry.tipo_navegacion = context.tipoNavegacion;
    }
    if (context.destinoPlanificado) {
        entry.destino_planificado = context.destinoPlanificado;
    }

    if ("courseAfter" in event) {
        entry.rumbo = event.courseAfter;
        entry.velocidad_gps = event.sog;
        entry.viento_nudos = event.windSpeed;
    }

    if (event.type === "WAYPOINT_REACHED" && event.waypointName) {
        entry.waypoints = event.waypointName;
    }

    return entry;
}

function getTitle(event: ManeuverEvent): string {
    switch (event.type) {
        case "COURSE_CHANGE":
            return "Cambio de rumbo";
        case "WAYPOINT_REACHED":
            return "Waypoint alcanzado";
        case "TACK":
            return "Virada";
        case "GYBE":
            return "Trasluchada";
    }
}

function getDescription(event: ManeuverEvent): string {
    switch (event.type) {
        case "COURSE_CHANGE":
            return `Rumbo cambiado de ${formatDegrees(event.courseBefore)} a ${formatDegrees(event.courseAfter)} (${formatSignedDegrees(event.deltaCourse)}).`;
        case "WAYPOINT_REACHED":
            return `Waypoint${event.waypointName ? ` "${event.waypointName}"` : ""} alcanzado a ${event.distanceToWaypointNm.toFixed(2)} NM.`;
        case "TACK":
            return `Virada: rumbo de ${formatDegrees(event.courseBefore)} a ${formatDegrees(event.courseAfter)} (${formatSignedDegrees(event.deltaCourse)}), viento ${formatDegrees(event.windDirection)} a ${event.windSpeed.toFixed(1)} kn.`;
        case "GYBE":
            return `Trasluchada: rumbo de ${formatDegrees(event.courseBefore)} a ${formatDegrees(event.courseAfter)} (${formatSignedDegrees(event.deltaCourse)}), viento ${formatDegrees(event.windDirection)} a ${event.windSpeed.toFixed(1)} kn.`;
    }
}

function formatDegrees(value: number): string {
    return `${Math.round(value).toString().padStart(3, "0")}°`;
}

function formatSignedDegrees(value: number): string {
    return `${value >= 0 ? "+" : ""}${value.toFixed(0)}°`;
}
