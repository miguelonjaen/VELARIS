import { ManeuverEvent, ManeuverType } from "./ManeuverEngine";

export class ManeuverEventStore {
    private readonly events: ManeuverEvent[] = [];

    public add(event: ManeuverEvent): void {
        if (this.events.some(existing => this.isDuplicate(existing, event))) {
            return;
        }

        this.events.push(this.cloneEvent(event));
    }

    public getAll(): readonly ManeuverEvent[] {
        return this.events.map(event => this.cloneEvent(event));
    }

    public getByType(type: ManeuverType): readonly ManeuverEvent[] {
        return this.events
            .filter(event => event.type === type)
            .map(event => this.cloneEvent(event));
    }

    public clear(): void {
        this.events.length = 0;
    }

    public size(): number {
        return this.events.length;
    }

    private isDuplicate(first: ManeuverEvent, second: ManeuverEvent): boolean {
        if (first.type !== second.type
            || first.timestamp !== second.timestamp
            || first.position.lat !== second.position.lat
            || first.position.lng !== second.position.lng) {
            return false;
        }

        const firstCourseBefore = "courseBefore" in first ? first.courseBefore : undefined;
        const secondCourseBefore = "courseBefore" in second ? second.courseBefore : undefined;
        const firstCourseAfter = "courseAfter" in first ? first.courseAfter : undefined;
        const secondCourseAfter = "courseAfter" in second ? second.courseAfter : undefined;
        const firstWaypointId = "waypointId" in first ? first.waypointId : undefined;
        const secondWaypointId = "waypointId" in second ? second.waypointId : undefined;

        return firstCourseBefore === secondCourseBefore
            && firstCourseAfter === secondCourseAfter
            && firstWaypointId === secondWaypointId;
    }

    private cloneEvent(event: ManeuverEvent): ManeuverEvent {
        return {
            ...event,
            position: { ...event.position }
        };
    }
}
