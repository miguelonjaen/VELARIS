export interface NavigationSample {
    timestamp: number;
    position: {
        lat: number;
        lng: number;
    };
    sog: number;
    cog: number;
    windDirection: number;
    windSpeed: number;
    waypoint?: WaypointDefinition;
}

export interface WaypointDefinition {
    id: string;
    lat: number;
    lng: number;
    name?: string;
    radiusNm?: number;
}

export type ManeuverType =
    | "COURSE_CHANGE"
    | "WAYPOINT_REACHED"
    | "TACK"
    | "GYBE";

export interface CourseChangeEvent {
    type: "COURSE_CHANGE";
    timestamp: number;
    position: {
        lat: number;
        lng: number;
    };
    courseBefore: number;
    courseAfter: number;
    deltaCourse: number;
    sog: number;
    windDirection: number;
    windSpeed: number;
}

export interface TackEvent {
    type: "TACK";
    timestamp: number;
    position: {
        lat: number;
        lng: number;
    };
    courseBefore: number;
    courseAfter: number;
    deltaCourse: number;
    sog: number;
    windDirection: number;
    windSpeed: number;
    relativeWindBefore: number;
    relativeWindAfter: number;
}

export interface GybeEvent {
    type: "GYBE";
    timestamp: number;
    position: {
        lat: number;
        lng: number;
    };
    courseBefore: number;
    courseAfter: number;
    deltaCourse: number;
    sog: number;
    windDirection: number;
    windSpeed: number;
    relativeWindBefore: number;
    relativeWindAfter: number;
}

export interface WaypointReachedEvent {
    type: "WAYPOINT_REACHED";
    timestamp: number;
    position: {
        lat: number;
        lng: number;
    };
    waypointId: string;
    waypointName?: string;
    distanceToWaypointNm: number;
}

export type ManeuverEvent =
    | CourseChangeEvent
    | WaypointReachedEvent
    | TackEvent
    | GybeEvent;

export interface ManeuverEngineOptions {
    courseChangeThresholdDeg?: number;
    tackBowZoneDeg?: number;
    gybeSternZoneDeg?: number;
    minimumSog?: number;
}

const DEFAULT_COURSE_CHANGE_THRESHOLD_DEG = 30;
const DEFAULT_TACK_BOW_ZONE_DEG = 60;
const DEFAULT_GYBE_STERN_ZONE_DEG = 60;
const DEFAULT_MINIMUM_SOG = 0.5;
const DEFAULT_WAYPOINT_RADIUS_NM = 0.05;
const EARTH_RADIUS_NM = 3440.065;

export class ManeuverEngine {
    private readonly courseChangeThresholdDeg: number;

    private readonly tackBowZoneDeg: number;

    private readonly gybeSternZoneDeg: number;

    private readonly minimumSog: number;

    private previousSample: NavigationSample | null = null;

    private reachedWaypointId: string | null = null;

    constructor(options: ManeuverEngineOptions = {}) {
        this.courseChangeThresholdDeg =
            Number.isFinite(options.courseChangeThresholdDeg)
                && (options.courseChangeThresholdDeg ?? 0) > 0
                ? options.courseChangeThresholdDeg as number
                : DEFAULT_COURSE_CHANGE_THRESHOLD_DEG;
        this.tackBowZoneDeg = this.getPositiveOption(
            options.tackBowZoneDeg,
            DEFAULT_TACK_BOW_ZONE_DEG
        );
        this.gybeSternZoneDeg = this.getPositiveOption(
            options.gybeSternZoneDeg,
            DEFAULT_GYBE_STERN_ZONE_DEG
        );
        this.minimumSog = this.getNonNegativeOption(
            options.minimumSog,
            DEFAULT_MINIMUM_SOG
        );
    }

    public reset(): void {
        this.previousSample = null;
        this.reachedWaypointId = null;
    }

    public process(sample: NavigationSample): ManeuverEvent | null {
        if (!this.isValidSample(sample)) {
            return null;
        }

        const normalizedSample: NavigationSample = {
            ...sample,
            cog: this.normalizeCourse(sample.cog),
            windDirection: this.normalizeCourse(sample.windDirection),
            position: { ...sample.position }
        };

        const previousSample = this.previousSample;
        this.previousSample = normalizedSample;

        if (!previousSample) {
            return null;
        }

        const waypointEvent = this.detectWaypointReached(normalizedSample);
        if (waypointEvent) {
            return waypointEvent;
        }

        const deltaCourse = this.calculateSignedCourseDelta(
            previousSample.cog,
            normalizedSample.cog
        );

        if (Math.abs(deltaCourse) < this.courseChangeThresholdDeg) {
            return null;
        }

        const specialManeuver = this.detectTackOrGybe(
            previousSample,
            normalizedSample,
            deltaCourse
        );
        if (specialManeuver) {
            return specialManeuver;
        }

        return {
            type: "COURSE_CHANGE",
            timestamp: normalizedSample.timestamp,
            position: { ...normalizedSample.position },
            courseBefore: previousSample.cog,
            courseAfter: normalizedSample.cog,
            deltaCourse,
            sog: normalizedSample.sog,
            windDirection: normalizedSample.windDirection,
            windSpeed: normalizedSample.windSpeed
        };
    }

    private detectTackOrGybe(
        previousSample: NavigationSample,
        currentSample: NavigationSample,
        deltaCourse: number
    ): TackEvent | GybeEvent | null {
        if (currentSample.sog < this.minimumSog
            || currentSample.windSpeed <= 0
            || previousSample.windSpeed <= 0) {
            return null;
        }

        const relativeWindBefore = this.calculateRelativeWind(
            previousSample.windDirection,
            previousSample.cog
        );
        const relativeWindAfter = this.calculateRelativeWind(
            currentSample.windDirection,
            currentSample.cog
        );

        if (this.isBowCrossing(relativeWindBefore, relativeWindAfter)) {
            return this.createTackEvent(
                currentSample,
                previousSample.cog,
                deltaCourse,
                relativeWindBefore,
                relativeWindAfter
            );
        }

        if (this.isSternCrossing(relativeWindBefore, relativeWindAfter)) {
            return this.createGybeEvent(
                currentSample,
                previousSample.cog,
                deltaCourse,
                relativeWindBefore,
                relativeWindAfter
            );
        }

        return null;
    }

    private createTackEvent(
        sample: NavigationSample,
        courseBefore: number,
        deltaCourse: number,
        relativeWindBefore: number,
        relativeWindAfter: number
    ): TackEvent {
        return {
            type: "TACK",
            timestamp: sample.timestamp,
            position: { ...sample.position },
            courseBefore,
            courseAfter: sample.cog,
            deltaCourse,
            sog: sample.sog,
            windDirection: sample.windDirection,
            windSpeed: sample.windSpeed,
            relativeWindBefore,
            relativeWindAfter
        };
    }

    private createGybeEvent(
        sample: NavigationSample,
        courseBefore: number,
        deltaCourse: number,
        relativeWindBefore: number,
        relativeWindAfter: number
    ): GybeEvent {
        return {
            type: "GYBE",
            timestamp: sample.timestamp,
            position: { ...sample.position },
            courseBefore,
            courseAfter: sample.cog,
            deltaCourse,
            sog: sample.sog,
            windDirection: sample.windDirection,
            windSpeed: sample.windSpeed,
            relativeWindBefore,
            relativeWindAfter
        };
    }

    private calculateRelativeWind(windDirection: number, cog: number): number {
        const relativeWind = this.normalizeCourse(windDirection)
            - this.normalizeCourse(cog);
        return ((relativeWind + 180) % 360 + 360) % 360 - 180;
    }

    private isBowCrossing(before: number, after: number): boolean {
        return Math.abs(before) <= this.tackBowZoneDeg
            && Math.abs(after) <= this.tackBowZoneDeg
            && this.hasOppositeSigns(before, after);
    }

    private isSternCrossing(before: number, after: number): boolean {
        const sternLimit = 180 - this.gybeSternZoneDeg;
        return Math.abs(before) >= sternLimit
            && Math.abs(after) >= sternLimit
            && this.hasOppositeSigns(before, after);
    }

    private hasOppositeSigns(before: number, after: number): boolean {
        return (before < 0 && after > 0) || (before > 0 && after < 0);
    }

    private getPositiveOption(value: number | undefined, fallback: number): number {
        return Number.isFinite(value) && (value ?? 0) > 0
            ? value as number
            : fallback;
    }

    private getNonNegativeOption(value: number | undefined, fallback: number): number {
        return Number.isFinite(value) && (value ?? 0) >= 0
            ? value as number
            : fallback;
    }

    private detectWaypointReached(sample: NavigationSample): WaypointReachedEvent | null {
        const waypoint = sample.waypoint;
        const radiusNm = waypoint?.radiusNm ?? DEFAULT_WAYPOINT_RADIUS_NM;

        if (!waypoint
            || typeof waypoint.id !== "string"
            || !Number.isFinite(waypoint.lat)
            || !Number.isFinite(waypoint.lng)
            || !Number.isFinite(radiusNm)
            || radiusNm <= 0) {
            return null;
        }

        const distanceToWaypointNm = this.calculateDistanceNm(
            sample.position.lat,
            sample.position.lng,
            waypoint.lat,
            waypoint.lng
        );
        if (distanceToWaypointNm > radiusNm
            || this.reachedWaypointId === waypoint.id) {
            return null;
        }

        this.reachedWaypointId = waypoint.id;

        return {
            type: "WAYPOINT_REACHED",
            timestamp: sample.timestamp,
            position: { ...sample.position },
            waypointId: waypoint.id,
            ...(waypoint.name ? { waypointName: waypoint.name } : {}),
            distanceToWaypointNm
        };
    }

    private calculateDistanceNm(
        fromLat: number,
        fromLng: number,
        toLat: number,
        toLng: number
    ): number {
        const latitude1 = fromLat * Math.PI / 180;
        const latitude2 = toLat * Math.PI / 180;
        const deltaLatitude = (toLat - fromLat) * Math.PI / 180;
        const deltaLongitude = (toLng - fromLng) * Math.PI / 180;
        const haversine = Math.sin(deltaLatitude / 2) ** 2
            + Math.cos(latitude1)
            * Math.cos(latitude2)
            * Math.sin(deltaLongitude / 2) ** 2;

        return EARTH_RADIUS_NM
            * 2
            * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
    }

    private normalizeCourse(course: number): number {
        return ((course % 360) + 360) % 360;
    }

    private calculateSignedCourseDelta(previous: number, current: number): number {
        return ((current - previous + 540) % 360) - 180;
    }

    private isValidSample(sample: NavigationSample): boolean {
        return Number.isFinite(sample?.timestamp)
            && Number.isFinite(sample?.position?.lat)
            && Number.isFinite(sample?.position?.lng)
            && Number.isFinite(sample?.sog)
            && Number.isFinite(sample?.cog)
            && Number.isFinite(sample?.windDirection)
            && Number.isFinite(sample?.windSpeed);
    }
}
