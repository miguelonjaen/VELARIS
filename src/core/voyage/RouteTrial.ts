import { SimulationService, type SimulationPosition } from '../services/SimulationService';
import { NavigationEngine, type NavigationMetrics } from '../navigation/NavigationEngine';
import { calculateDistanceNM, calculateBearing } from '../../lib/utils';

export type TrialStatus = 'idle' | 'running' | 'paused' | 'waiting' | 'finished' | 'stopped';
export interface TrialEvent {
    readonly at: number;
    readonly title: string;
    readonly text: string;
    readonly position: SimulationPosition;
}
export interface TrialSnapshot {
    readonly status: TrialStatus;
    readonly position: SimulationPosition;
    readonly heading: number;
    readonly sog: number | null;
    readonly distanceNm: number;
    readonly waypointIndex: number;
    readonly waypointCount: number;
    readonly metrics: NavigationMetrics;
    readonly track: readonly SimulationPosition[];
    readonly startedAt: number;
}

/** Ensayo local. Nunca escribe en telemetría, navegación real ni comunicaciones NMEA. */
export class RouteTrial {
    private time = 0;
    private readonly movement = new SimulationService(() => this.time, 0.005);
    private readonly navigation = new NavigationEngine();
    private route: Array<[number, number]> = [];
    private position: SimulationPosition = { lat: 0, lng: 0 };
    private heading = 0;
    private nmeaSteering = false;
    private speed: number | null = null;
    private total = 0;
    private status: TrialStatus = 'idle';
    private track: SimulationPosition[] = [];
    private startedAt = 0;
    private lastTick = 0;
    private events: TrialEvent[] = [];
    private courseReference = 0;

    start(origin: SimulationPosition, waypoints: readonly SimulationPosition[], sog: number, now: number, headingTrue?: number): void {
        const valid = (p: SimulationPosition) => Number.isFinite(p.lat) && Math.abs(p.lat) <= 90
            && Number.isFinite(p.lng) && Math.abs(p.lng) <= 180;
        if (!valid(origin) || waypoints.length === 0 || waypoints.some(p => !valid(p))) throw new Error('Defina al menos un waypoint válido');
        if (!Number.isFinite(sog) || sog < 0 || sog > 200) throw new Error('SOG NMEA no válida');
        if (headingTrue !== undefined && (!Number.isFinite(headingTrue) || headingTrue < 0 || headingTrue > 360)) throw new Error('Heading verdadero NMEA no válido');
        this.nmeaSteering = headingTrue !== undefined;
        const points = waypoints.filter((point, i) => calculateDistanceNM(
            (i === 0 ? origin : waypoints[i - 1]).lat, (i === 0 ? origin : waypoints[i - 1]).lng, point.lat, point.lng
        ) > 0.005);
        if (points.length !== waypoints.length) throw new Error('Los puntos deben estar separados al menos 0,005 NM');
        this.route = [[origin.lat, origin.lng], ...points.map(p => [p.lat, p.lng] as [number, number])];
        this.position = { ...origin };
        this.heading = calculateBearing(origin.lat, origin.lng, points[0].lat, points[0].lng);
        if (headingTrue !== undefined) this.heading = headingTrue % 360;
        this.courseReference = this.heading;
        this.speed = sog; this.total = 0; this.status = 'running';
        this.track = [{ ...origin }]; this.startedAt = now; this.lastTick = now; this.time = now;
        this.events = []; this.movement.resetNavigation(1);
        this.movement.tick({ position: this.position, route: this.route, sog, speedMultiplier: 1 });
        this.log(now, 'Inicio de ensayo', `${points.length} waypoints. Posición virtual; SOG NMEA. ${this.nmeaSteering ? "Gobierno por heading NMEA, sin corriente ni abatimiento." : "Seguimiento automático de waypoints."}`);
    }

    tick(now: number, sog: number | null, headingTrue: number | null = null): TrialSnapshot | null {
        if (this.status === 'idle') return null;
        if (!Number.isFinite(now) || now <= this.lastTick) return this.snapshot();
        if (this.status !== 'running' && this.status !== 'waiting') return this.snapshot();
        const headingMissing = this.nmeaSteering && (headingTrue === null || !Number.isFinite(headingTrue) || headingTrue < 0 || headingTrue > 360);
        if (sog === null || !Number.isFinite(sog) || sog < 0 || sog > 200 || headingMissing) {
            if (this.status !== 'waiting') this.log(now, 'Ensayo en espera', 'SOG o heading NMEA caducado/no disponible. Sin movimiento virtual.');
            this.status = 'waiting'; this.speed = null; this.lastTick = now;
            this.movement.resetNavigation(this.movement.getWaypointIndex());
            return this.snapshot();
        }
        if (this.status === 'waiting') {
            this.log(now, 'Datos recuperados', 'El ensayo continúa sin recuperar tiempo de la interrupción.');
            this.status = 'running'; this.movement.resetNavigation(this.movement.getWaypointIndex());
        }
        if (this.nmeaSteering && headingTrue !== null) this.heading = headingTrue % 360;
        this.speed = sog;
        const elapsed = Math.max(0, Math.min(2_000, now - this.lastTick));
        this.time += elapsed; this.lastTick = now;
        const oldIndex = this.movement.getWaypointIndex();
        const next = this.movement.tick({ position: this.position, route: this.route, sog, speedMultiplier: 1,
            ...(this.nmeaSteering ? { headingTrue: this.heading } : {}) });
        if (this.movement.getWaypointIndex() !== oldIndex) this.log(now, 'Waypoint alcanzado', `WP ${oldIndex}. Continúa hacia WP ${this.movement.getWaypointIndex()}.`);
        if (next) {
            const segment = calculateDistanceNM(this.position.lat, this.position.lng, next.lat, next.lng);
            this.total += segment;
            this.position = { lat: next.lat, lng: next.lng };
            if (segment > 0 && !this.nmeaSteering) this.heading = next.cog;
            const last = this.track.at(-1);
            if (!last || calculateDistanceNM(last.lat, last.lng, next.lat, next.lng) >= 0.005) {
                this.track = [...this.track.slice(-19_999), { ...this.position }];
            }
            const turn = ((this.heading - this.courseReference + 540) % 360) - 180;
            if (Math.abs(turn) >= 30) {
                this.log(now, 'Cambio de rumbo virtual', `${this.courseReference.toFixed(0)}° → ${this.heading.toFixed(0)}°`);
                this.courseReference = this.heading;
            }
        }
        if (this.movement.hasReachedDestination()) {
            this.status = 'finished';
            this.track = [...this.track, { ...this.position }];
            this.log(now, 'Llegada del ensayo', `Ruta terminada. ${this.total.toFixed(2)} NM virtuales.`);
        }
        return this.snapshot();
    }
    pause(now: number): void {
        if (this.status === 'running' || this.status === 'waiting') {
            this.status = 'paused'; this.log(now, 'Ensayo pausado', 'Movimiento virtual detenido por el usuario.');
        }
    }
    resume(now: number): void {
        if (this.status !== 'paused') return;
        this.status = 'waiting'; this.lastTick = now;
        this.movement.resetNavigation(this.movement.getWaypointIndex());
        this.log(now, 'Ensayo reanudado', 'Esperando datos NMEA vigentes.');
    }
    stop(now: number): void {
        if (['running', 'waiting', 'paused'].includes(this.status)) {
            this.status = 'stopped'; this.log(now, 'Fin de ensayo', `${this.total.toFixed(2)} NM virtuales. Detenido por el usuario.`);
        }
    }
    drainEvents(): TrialEvent[] { const result = this.events; this.events = []; return result; }
    snapshot(): TrialSnapshot {
        const waypointIndex = this.movement.getWaypointIndex();
        return { status: this.status, position: { ...this.position }, heading: this.heading, sog: this.speed,
            distanceNm: this.total, waypointIndex, waypointCount: this.route.length - 1,
            startedAt: this.startedAt, track: this.track,
            metrics: this.navigation.calculate({ position: this.position, heading: this.heading, cog: this.heading,
                sog: this.speed ?? 0, activeWaypointIndex: waypointIndex,
                route: { waypoints: this.route.map((point, i) => ({ id: String(i), position: { lat: point[0], lng: point[1] }, radiusNm: 0.005 })) } }) };
    }
    private log(at: number, title: string, text: string): void {
        this.events.push({ at, title, text, position: { ...this.position } });
    }
}
