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

    private waypointIndex = 1;

    private destinationReached = false;

    public resetNavigation(waypointIndex = 1): void {
        this.waypointIndex = waypointIndex;
        this.destinationReached = false;
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
        const target = input.route[this.waypointIndex];

        if (!target) return null;

        const targetLat = target[0];
        const targetLng = target[1];
        const dLat = targetLat - input.position.lat;
        const dLng = targetLng - input.position.lng;
        const cog = (Math.atan2(dLng, dLat) * 180 / Math.PI + 360) % 360;
        const distance = Math.sqrt(
            dLat * dLat +
            dLng * dLng
        );

        this.destinationReached = false;

        if (distance < 0.001) {
            if (this.waypointIndex >= input.route.length - 1) {
                this.destinationReached = true;
                return null;
            }

            this.waypointIndex += 1;
            return null;
        }

        const factor = 0.01 * input.speedMultiplier;
        const nextLat = input.position.lat + dLat * factor;
        const nextLng = input.position.lng + dLng * factor;

        return {
            type: "GPS",
            lat: nextLat,
            lng: nextLng,
            sog: input.sog,
            cog
        };
    }
}
