import { GPSTelemetry } from "@/core/types/TelemetryMessage";

export interface SimulationPosition {
    readonly lat: number;
    readonly lng: number;
}

export type SimulationRoutePoint = [number, number];

export interface DepthHistoryPoint {
    readonly time: number;
    readonly depth: number;
}

export interface EngineSimulationData {
    readonly rpm: number;
    readonly temp: number;
    readonly voltage: number;
    readonly fuel: number;
    readonly water: number;
}

export interface NavigationSimulationData {
    readonly xte: number;
    readonly dtw: number;
}

export interface SimulatedAisTarget {
    readonly id: string;
    readonly mmsi: string;
    readonly nombre: string;
    readonly lat: number;
    readonly lng: number;
    readonly sog: number;
    readonly cog: number;
}

export interface SimulatedAisTargetInput {
    readonly isTravesiaActive: boolean;
    readonly targetCount: number;
    readonly ownPosition: SimulationPosition | null;
    readonly maxTargets?: number;
}

export interface SimulationTickInput {
    readonly position: SimulationPosition;
    readonly route: readonly (readonly [number, number])[];
    readonly sog: number;
    readonly speedMultiplier: number;
}

export class SimulationService {

    private waypointIndex = 0;

    private destinationReached = false;

    private lastTickTimestamp: number | null = null;

    private initialPosition: SimulationPosition | null = null;

    private readonly arrivalRadiusNm = 0.05;

    public resetNavigation(waypointIndex = 0): void {
        this.waypointIndex = waypointIndex;
        this.destinationReached = false;
        this.lastTickTimestamp = null;
        this.initialPosition = null;
    }

    public hasReachedDestination(): boolean {
        return this.destinationReached;
    }

    public createLocalOffshoreRoute(
        origin: SimulationPosition,
        target: SimulationPosition,
        offshore = 0.04
    ): SimulationRoutePoint[] {
        return [
            [origin.lat, origin.lng],
            [origin.lat - offshore, origin.lng],
            [
                origin.lat - offshore,
                origin.lng + (target.lng - origin.lng) * 0.25
            ],
            [
                origin.lat - offshore,
                origin.lng + (target.lng - origin.lng) * 0.50
            ],
            [
                origin.lat - offshore,
                origin.lng + (target.lng - origin.lng) * 0.75
            ],
            [target.lat - offshore, target.lng],
            [target.lat, target.lng]
        ];
    }

    public createInitialDepthHistory(
        length = 20,
        now = Date.now()
    ): DepthHistoryPoint[] {
        return Array.from({ length }, (_, i) => ({
            time: now - (i * 1000),
            depth: 10 + Math.random()
        }));
    }

    public simulateDepth(previousDepth: number): number {
        return Math.max(0.5, previousDepth + (Math.random() - 0.5) * 0.8);
    }

    public appendDepthHistory(
        history: readonly DepthHistoryPoint[],
        depth: number,
        time = Date.now()
    ): DepthHistoryPoint[] {
        return [...history.slice(1), { time, depth }];
    }

    public maybeCreateAisTarget(input: SimulatedAisTargetInput): SimulatedAisTarget | null {
        if (!input.isTravesiaActive) return null;
        if (input.targetCount >= (input.maxTargets ?? 3)) return null;
        if (Math.random() <= 0.8) return null;

        const baseLat = input.ownPosition?.lat ?? 36.7215;
        const baseLng = input.ownPosition?.lng ?? -3.5235;
        const offsetLat = (Math.random() - 0.5) * 0.04;
        const offsetLng = (Math.random() - 0.5) * 0.04;

        return {
            id: 'target-' + Date.now(),
            mmsi: '224' + Math.floor(Math.random() * 999999),
            nombre: 'BUQUE CARGUERO ' + Math.floor(Math.random() * 100),
            lat: baseLat + offsetLat,
            lng: baseLng + offsetLng,
            sog: 6 + Math.random() * 14,
            cog: Math.floor(Math.random() * 360)
        };
    }

    public simulateNavigationData<T extends NavigationSimulationData>(previousData: T): T {
        return {
            ...previousData,
            xte: (previousData.xte || 0) + (Math.random() - 0.5) * 0.01,
            dtw: Math.max(0, (previousData.dtw || 0) - 0.001)
        };
    }

    public simulateEngineData(
        previousData: EngineSimulationData,
        isTravesiaActive: boolean
    ): EngineSimulationData {
        return {
            ...previousData,
            rpm: isTravesiaActive ? 2200 + Math.random() * 200 : 0,
            temp: isTravesiaActive ? Math.min(105, previousData.temp + 0.1) : Math.max(20, previousData.temp - 0.2),
            voltage: isTravesiaActive ? 14.2 + Math.random() * 0.2 : 12.6 + Math.random() * 0.1,
            fuel: isTravesiaActive ? Math.max(0, previousData.fuel - 0.01) : previousData.fuel,
            water: isTravesiaActive ? Math.max(0, previousData.water - 0.005) : previousData.water
        };
    }

    public tick(input: SimulationTickInput): GPSTelemetry | null {
        const now = Date.now();
        const elapsedSeconds = this.lastTickTimestamp === null
            ? 0
            : Number.isFinite(now) && Number.isFinite(this.lastTickTimestamp)
                ? Math.max(0, (now - this.lastTickTimestamp) / 1000)
                : 0;

        if (Number.isFinite(now)) {
            this.lastTickTimestamp = now;
        }

        if (!this.initialPosition) {
            this.initialPosition = {
                lat: input.position.lat,
                lng: input.position.lng
            };
        }

        const normalizeBearing = (bearing: number): number => {
            const normalized = ((bearing % 360) + 360) % 360;
            return Math.min(359.999, normalized);
        };

        const toRadians = (degrees: number): number => degrees * Math.PI / 180;
        const toDegrees = (radians: number): number => radians * 180 / Math.PI;
        const earthRadiusNm = 3440.065;

        const distanceNm = (
            fromLat: number,
            fromLng: number,
            toLat: number,
            toLng: number
        ): number => {
            const lat1 = toRadians(fromLat);
            const lat2 = toRadians(toLat);
            const deltaLat = toRadians(toLat - fromLat);
            const deltaLng = toRadians(toLng - fromLng);
            const haversine = Math.sin(deltaLat / 2) ** 2
                + Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLng / 2) ** 2;
            return earthRadiusNm * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
        };

        const bearingBetween = (
            fromLat: number,
            fromLng: number,
            toLat: number,
            toLng: number
        ): number => {
            const lat1 = toRadians(fromLat);
            const lat2 = toRadians(toLat);
            const deltaLng = toRadians(toLng - fromLng);
            return normalizeBearing(toDegrees(Math.atan2(
                Math.sin(deltaLng) * Math.cos(lat2),
                Math.cos(lat1) * Math.sin(lat2)
                    - Math.sin(lat1) * Math.cos(lat2) * Math.cos(deltaLng)
            )));
        };

        const validSog = Number.isFinite(input.sog) && input.sog > 0 ? input.sog : 0;
        const speedMultiplier = Number.isFinite(input.speedMultiplier) && input.speedMultiplier > 0
            ? input.speedMultiplier
            : 1;
        const simulatedSeconds = elapsedSeconds * speedMultiplier;
        let nextLat = input.position.lat;
        let nextLng = input.position.lng;
        let target = input.route[this.waypointIndex];

        if (!target) {
            this.destinationReached = true;
            return null;
        }

        let dtw = distanceNm(nextLat, nextLng, target[0], target[1]);
        if (dtw <= this.arrivalRadiusNm) {
            if (this.waypointIndex >= input.route.length - 1) {
                this.destinationReached = true;
                return null;
            }

            this.waypointIndex += 1;
            target = input.route[this.waypointIndex];
            if (!target) {
                this.destinationReached = true;
                return null;
            }
            dtw = distanceNm(nextLat, nextLng, target[0], target[1]);
        }

        const travelNm = validSog * simulatedSeconds / 3600;
        if (travelNm > 0 && dtw > 0) {
            const movementBearing = bearingBetween(nextLat, nextLng, target[0], target[1]);
            const angularDistance = travelNm / earthRadiusNm;
            const startLat = toRadians(nextLat);
            const startLng = toRadians(nextLng);
            const bearingRadians = toRadians(movementBearing);
            const destinationLat = Math.asin(
                Math.sin(startLat) * Math.cos(angularDistance)
                    + Math.cos(startLat) * Math.sin(angularDistance) * Math.cos(bearingRadians)
            );
            const destinationLng = startLng + Math.atan2(
                Math.sin(bearingRadians) * Math.sin(angularDistance) * Math.cos(startLat),
                Math.cos(angularDistance) - Math.sin(startLat) * Math.sin(destinationLat)
            );

            if (travelNm >= dtw) {
                nextLat = target[0];
                nextLng = target[1];
            } else {
                nextLat = toDegrees(destinationLat);
                nextLng = toDegrees(destinationLng);
            }
        }

        const btw = bearingBetween(nextLat, nextLng, target[0], target[1]);
        dtw = distanceNm(nextLat, nextLng, target[0], target[1]);
        const segmentStart = this.waypointIndex === 0
            ? this.initialPosition
            : input.route[this.waypointIndex - 1];
        const segmentStartLat = segmentStart?.lat ?? segmentStart?.[0] ?? nextLat;
        const segmentStartLng = segmentStart?.lng ?? segmentStart?.[1] ?? nextLng;
        const segmentLength = distanceNm(segmentStartLat, segmentStartLng, target[0], target[1]);
        const xte = segmentLength === 0
            ? 0
            : Math.abs(
                Math.asin(Math.min(1, Math.max(-1,
                    Math.sin(distanceNm(segmentStartLat, segmentStartLng, nextLat, nextLng) / earthRadiusNm)
                    * Math.sin(toRadians(
                        bearingBetween(segmentStartLat, segmentStartLng, nextLat, nextLng)
                        - bearingBetween(segmentStartLat, segmentStartLng, target[0], target[1])
                    ))
                ))) * earthRadiusNm
            );
        const etaHours = validSog > 0 ? dtw / validSog : 0;
        const cog = distanceNm(input.position.lat, input.position.lng, nextLat, nextLng) > 0
            ? bearingBetween(input.position.lat, input.position.lng, nextLat, nextLng)
            : btw;

        this.destinationReached = false;

        return {
            type: "GPS",
            lat: nextLat,
            lng: nextLng,
            sog: validSog,
            cog,
            nav: {
                btw,
                dtw,
                xte,
                eta: etaHours
            }
        } as any;
    }
}
