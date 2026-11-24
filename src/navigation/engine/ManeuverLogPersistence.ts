import { ManeuverEvent } from "./ManeuverEngine";
import { ManeuverLogContext, mapManeuverToLogEntry } from "./ManeuverLogMapper";
import { LogEntry } from "@/shared/types";

export interface ManeuverLogInsertResult {
    data?: unknown;
    error?: unknown | null;
}

export type ManeuverLogEntry = LogEntry & {
    maneuverTimestamp?: number;
};

export type ManeuverLogWriter = (
    entry: ManeuverLogEntry
) => Promise<ManeuverLogInsertResult>;

export interface ManeuverLogPersistenceResult {
    attempted: number;
    persisted: number;
    failed: number;
}

export async function persistManeuverEvents(
    events: readonly ManeuverEvent[],
    context: ManeuverLogContext,
    writer: ManeuverLogWriter,
    persistedEventKeys: Set<string>,
    onError: (error: unknown, event: ManeuverEvent) => void = (error, event) => {
        console.error("App: failed to persist maneuver event", {
            eventType: event.type,
            timestamp: event.timestamp,
            error
        });
    }
): Promise<ManeuverLogPersistenceResult> {
    let persisted = 0;
    let failed = 0;

    for (const event of events) {
        const eventKey = getManeuverEventKey(event);
        if (persistedEventKeys.has(eventKey)) continue;

        const contextWithDate: ManeuverLogContext = {
            ...context,
            fecha: context.fecha?.slice(0, 10) ?? new Date().toISOString().slice(0, 10)
        };
        const logEntry: ManeuverLogEntry = {
            ...mapManeuverToLogEntry(event, contextWithDate),
            maneuverTimestamp: event.timestamp
        };

        try {
            const result = await writer(logEntry);
            if (result.error) {
                throw result.error;
            }

            persistedEventKeys.add(eventKey);
            persisted += 1;
        } catch (error) {
            failed += 1;
            onError(error, event);
        }
    }

    return {
        attempted: persisted + failed,
        persisted,
        failed
    };
}

function getManeuverEventKey(event: ManeuverEvent): string {
    const courseBefore = "courseBefore" in event ? event.courseBefore : undefined;
    const courseAfter = "courseAfter" in event ? event.courseAfter : undefined;
    const waypointId = "waypointId" in event ? event.waypointId : undefined;

    return [
        event.type,
        event.timestamp,
        event.position.lat,
        event.position.lng,
        courseBefore,
        courseAfter,
        waypointId
    ].join("|");
}
