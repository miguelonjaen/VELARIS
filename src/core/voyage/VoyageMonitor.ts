/**
 * Travesía automática y acontecimientos de navegación para la bitácora. Lógica pura: recibe una
 * muestra por tick (una vez por segundo) y devuelve los acontecimientos que hay que registrar.
 * No escribe nada: la aplicación los registra con el mecanismo de bitácora existente.
 *
 * Fuente autorizada: SOLO datos vigentes de los instrumentos del barco (fuente BOAT del estado de
 * navegación compartido): puerto serie o TCP declarado «Instrumentos del barco». Un simulador
 * «solo visual» (SIMULATOR), el teléfono (DROID) o la meteorología nunca inician una travesía.
 *
 * Reglas (umbrales configurables en VoyageMonitorOptions):
 *  - Inicio automático: sin travesía activa, posición y SOG del barco vigentes durante startHoldMs
 *    con SOG ≥ startMinSogKn (se está navegando). Tras finalizar una travesía, no vuelve a iniciarse
 *    otra hasta que se recibe velocidad válida de barco detenido (evita reabrirla al instante).
 *  - Pérdida de señal: sin posición del barco vigente durante signalLossMs → una entrada; al volver,
 *    otra de recuperación. La travesía NO se cierra por una pérdida temporal.
 *  - Cierre automático: solo de una travesía iniciada automáticamente y tras autoEndAfterSignalLossMs
 *    sin datos del barco (política explícita para que no quede activa indefinidamente).
 *  - Cambio de rumbo: COG del barco alejado ≥ courseThresholdDeg del rumbo de referencia durante
 *    courseHoldMs, con SOG ≥ courseMinSogKn y al menos courseMinIntervalMs desde el anterior. Se
 *    compara con el rumbo de referencia (no muestra a muestra), así un giro gradual se detecta y
 *    las oscilaciones pequeñas no generan entradas.
 *  - Cambio de velocidad: |ΔSOG| ≥ speedThresholdKn sostenido speedHoldMs, con intervalo mínimo.
 *  - Cambio de fuente de la posición (barco, Droid, simulador): estable sourceChangeHoldMs.
 * Sin datos suficientes no se genera ningún acontecimiento de navegación.
 */

export type VoyagePositionSource = "BOAT" | "DROID" | "SIMULATOR";

export interface VoyagePoint {
    readonly lat: number;
    readonly lng: number;
}

export interface VoyageSample {
    /** Hora de pared (ms). */
    readonly now: number;
    /** Hay una travesía activa en la aplicación (iniciada a mano o automáticamente). */
    readonly voyageActive: boolean;
    /** Datos vigentes y válidos de los instrumentos del barco (fuente BOAT); null si no los hay. */
    readonly boatPosition: VoyagePoint | null;
    readonly boatSog: number | null;
    readonly boatCog: number | null;
    /** Fuente efectiva de la posición mostrada (BOAT > DROID > SIMULATOR); null si ninguna. */
    readonly positionSource: VoyagePositionSource | null;
    /** Descripción de la conexión del barco (p. ej. «TCP 127.0.0.1:10110 declarado como barco»). */
    readonly boatOrigin?: string | null;
}

export type VoyageEvent =
    | { readonly type: "VOYAGE_START"; readonly at: number; readonly position: VoyagePoint; readonly sog: number; readonly cog: number | null; readonly origin: string | null }
    | { readonly type: "SIGNAL_LOST"; readonly at: number; readonly lastPosition: VoyagePoint | null; readonly lastSeenAt: number | null }
    | { readonly type: "SIGNAL_RECOVERED"; readonly at: number; readonly position: VoyagePoint; readonly lostForMs: number }
    | { readonly type: "COURSE_CHANGE"; readonly at: number; readonly from: number; readonly to: number; readonly delta: number; readonly position: VoyagePoint; readonly sog: number }
    | { readonly type: "SPEED_CHANGE"; readonly at: number; readonly from: number; readonly to: number; readonly position: VoyagePoint; readonly cog: number | null }
    | { readonly type: "SOURCE_CHANGE"; readonly at: number; readonly from: VoyagePositionSource | null; readonly to: VoyagePositionSource | null; readonly position: VoyagePoint | null }
    | { readonly type: "VOYAGE_AUTO_END"; readonly at: number; readonly reason: string; readonly lastPosition: VoyagePoint | null };

export interface VoyageMonitorOptions {
    readonly autoStart: boolean;
    readonly startMinSogKn: number;
    readonly startHoldMs: number;
    readonly signalLossMs: number;
    readonly autoEndAfterSignalLossMs: number;
    readonly courseThresholdDeg: number;
    readonly courseHoldMs: number;
    readonly courseMinIntervalMs: number;
    readonly courseMinSogKn: number;
    readonly speedThresholdKn: number;
    readonly speedHoldMs: number;
    readonly speedMinIntervalMs: number;
    readonly sourceChangeHoldMs: number;
}

export const DEFAULT_VOYAGE_MONITOR_OPTIONS: VoyageMonitorOptions = {
    autoStart: true,
    startMinSogKn: 1.0,
    startHoldMs: 30_000,
    signalLossMs: 30_000,
    autoEndAfterSignalLossMs: 60 * 60_000,
    courseThresholdDeg: 30,
    courseHoldMs: 15_000,
    courseMinIntervalMs: 60_000,
    courseMinSogKn: 1.0,
    speedThresholdKn: 2.0,
    speedHoldMs: 30_000,
    speedMinIntervalMs: 120_000,
    sourceChangeHoldMs: 10_000
};

/** Tiempo que se espera a que la aplicación aplique un inicio pedido. */
const PENDING_ACTION_TIMEOUT_MS = 10_000;

const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);

export const isValidVoyagePoint = (point: VoyagePoint | null | undefined): point is VoyagePoint =>
    !!point && finite(point.lat) && finite(point.lng)
    && Math.abs(point.lat) <= 90 && Math.abs(point.lng) <= 180 && !(point.lat === 0 && point.lng === 0);

/** Diferencia angular con signo (−180..180) de a hacia b. */
export const courseDelta = (from: number, to: number): number => ((to - from + 540) % 360) - 180;

export class VoyageMonitor {
    private readonly options: VoyageMonitorOptions;

    private wasActive = false;
    private pendingStartAt: number | null = null;
    private pendingEnd = false;
    private startedByMonitor = false;
    /** Tras finalizar una travesía, el inicio automático espera a que el barco se detenga o se pierda la señal. */
    private rearmRequired = false;
    private moveSince: number | null = null;

    private lastValidAt: number | null = null;
    private lastPosition: VoyagePoint | null = null;
    private signalLost = false;
    private signalLostSince: number | null = null;
    private silentSince: number | null = null;

    private courseRef: number | null = null;
    private courseCandidateSince: number | null = null;
    private lastCourseEventAt: number | null = null;

    private speedRef: number | null = null;
    private speedCandidateSince: number | null = null;
    private lastSpeedEventAt: number | null = null;

    private stableSource: VoyagePositionSource | null | undefined = undefined;
    private pendingSource: VoyagePositionSource | null | undefined = undefined;
    private pendingSourceSince: number | null = null;

    constructor(options: Partial<VoyageMonitorOptions> = {}) {
        this.options = { ...DEFAULT_VOYAGE_MONITOR_OPTIONS, ...options };
    }

    /** true si la travesía activa la inició este monitor (solo esas se cierran automáticamente). */
    public get autoStarted(): boolean {
        return this.startedByMonitor;
    }

    /** true mientras la travesía activa está sin datos válidos de los instrumentos del barco. */
    public get isSignalLost(): boolean {
        return this.signalLost;
    }

    public tick(sample: VoyageSample): VoyageEvent[] {
        const o = this.options;
        const now = sample.now;
        const position = isValidVoyagePoint(sample.boatPosition) ? sample.boatPosition : null;
        const sog = finite(sample.boatSog) && sample.boatSog >= 0 && sample.boatSog <= 200 ? sample.boatSog : null;
        const cog = finite(sample.boatCog) && sample.boatCog >= 0 && sample.boatCog <= 360 ? sample.boatCog % 360 : null;
        const events: VoyageEvent[] = [];

        // Inicio pedido y aún no aplicado por la aplicación: se espera (sin tomarlo por un fin).
        if (this.pendingStartAt !== null) {
            if (sample.voyageActive) {
                this.pendingStartAt = null;
                this.wasActive = true;
            } else if (now - this.pendingStartAt < PENDING_ACTION_TIMEOUT_MS) {
                return events;
            } else {
                // La aplicación no inició la travesía: se vuelve al estado normal (podrá reintentarse).
                this.pendingStartAt = null;
                this.startedByMonitor = false;
                this.wasActive = false;
            }
        }
        // Cierre automático pedido: nada más hasta que la aplicación lo aplique.
        if (this.pendingEnd) {
            if (sample.voyageActive) return events;
            this.pendingEnd = false;
        }

        // Fin de una travesía (a mano o automática): se limpia el estado y se exige rearme.
        if (this.wasActive && !sample.voyageActive) {
            this.resetVoyageState();
            this.rearmRequired = true;
        }
        if (!this.wasActive && sample.voyageActive && !this.startedByMonitor) {
            // Travesía iniciada a mano: se registran sus acontecimientos, pero no se cierra sola.
            this.resetVoyageState();
        }
        this.wasActive = sample.voyageActive;

        if (position) {
            this.lastValidAt = now;
            this.lastPosition = position;
            this.silentSince = null;
        }

        if (!sample.voyageActive) {
            if (!o.autoStart) { this.moveSince = null; return events; }
            const moving = position !== null && sog !== null && sog >= o.startMinSogKn;
            if (this.rearmRequired) {
                if (position !== null && sog !== null && sog < o.startMinSogKn) this.rearmRequired = false;
                this.moveSince = null;
                return events;
            }
            if (!moving) {
                this.moveSince = null;
                return events;
            }
            this.moveSince ??= now;
            if (now - this.moveSince >= o.startHoldMs) {
                events.push({ type: "VOYAGE_START", at: now, position, sog, cog, origin: sample.boatOrigin ?? null });
                this.startedByMonitor = true;
                this.pendingStartAt = now;
                this.moveSince = null;
                this.courseRef = cog;
                this.speedRef = sog;
                this.lastCourseEventAt = now;
                this.lastSpeedEventAt = now;
                this.stableSource = sample.positionSource;
            }
            return events;
        }

        // --- Travesía activa ---
        if (!position) {
            // Silencio medido desde el último dato válido (o desde ahora si aún no hubo ninguno).
            this.silentSince ??= this.lastValidAt ?? now;
            if (!this.signalLost && now - this.silentSince >= o.signalLossMs) {
                this.signalLost = true;
                this.signalLostSince = this.silentSince;
                events.push({ type: "SIGNAL_LOST", at: now, lastPosition: this.lastPosition, lastSeenAt: this.lastValidAt });
            }
            if (this.signalLost && this.startedByMonitor && this.signalLostSince !== null
                && now - this.signalLostSince >= o.autoEndAfterSignalLossMs) {
                events.push({
                    type: "VOYAGE_AUTO_END",
                    at: now,
                    reason: `Sin datos de los instrumentos del barco durante ${Math.round(o.autoEndAfterSignalLossMs / 60_000)} min`,
                    lastPosition: this.lastPosition
                });
                this.resetVoyageState();
                this.rearmRequired = true;
                this.wasActive = false;
                this.pendingEnd = true;
            }
            this.courseCandidateSince = null;
            this.speedCandidateSince = null;
            this.trackSource(sample, now, null, events);
            return events;
        }

        if (this.signalLost) {
            events.push({ type: "SIGNAL_RECOVERED", at: now, position, lostForMs: now - (this.signalLostSince ?? now) });
            this.signalLost = false;
            this.signalLostSince = null;
            // Tras una interrupción se toman de nuevo las referencias (no se comparan datos separados por un hueco).
            this.courseRef = cog;
            this.speedRef = sog;
            this.courseCandidateSince = null;
            this.speedCandidateSince = null;
        }
        this.signalLostSince = null;

        this.trackCourse(now, position, sog, cog, events);
        this.trackSpeed(now, position, sog, cog, events);
        this.trackSource(sample, now, position, events);
        return events;
    }

    private trackCourse(now: number, position: VoyagePoint, sog: number | null, cog: number | null, events: VoyageEvent[]): void {
        const o = this.options;
        if (cog === null || sog === null || sog < o.courseMinSogKn) {
            this.courseCandidateSince = null;
            return;
        }
        if (this.courseRef === null) {
            this.courseRef = cog;
            return;
        }
        const delta = courseDelta(this.courseRef, cog);
        if (Math.abs(delta) < o.courseThresholdDeg) {
            this.courseCandidateSince = null;
            return;
        }
        this.courseCandidateSince ??= now;
        const held = now - this.courseCandidateSince >= o.courseHoldMs;
        const spaced = this.lastCourseEventAt === null || now - this.lastCourseEventAt >= o.courseMinIntervalMs;
        if (held && spaced) {
            events.push({ type: "COURSE_CHANGE", at: now, from: this.courseRef, to: cog, delta, position, sog });
            this.courseRef = cog;
            this.courseCandidateSince = null;
            this.lastCourseEventAt = now;
        }
    }

    private trackSpeed(now: number, position: VoyagePoint, sog: number | null, cog: number | null, events: VoyageEvent[]): void {
        const o = this.options;
        if (sog === null) {
            this.speedCandidateSince = null;
            return;
        }
        if (this.speedRef === null) {
            this.speedRef = sog;
            return;
        }
        if (Math.abs(sog - this.speedRef) < o.speedThresholdKn) {
            this.speedCandidateSince = null;
            return;
        }
        this.speedCandidateSince ??= now;
        const held = now - this.speedCandidateSince >= o.speedHoldMs;
        const spaced = this.lastSpeedEventAt === null || now - this.lastSpeedEventAt >= o.speedMinIntervalMs;
        if (held && spaced) {
            events.push({ type: "SPEED_CHANGE", at: now, from: this.speedRef, to: sog, position, cog });
            this.speedRef = sog;
            this.speedCandidateSince = null;
            this.lastSpeedEventAt = now;
        }
    }

    private trackSource(sample: VoyageSample, now: number, position: VoyagePoint | null, events: VoyageEvent[]): void {
        const source = sample.positionSource;
        if (this.stableSource === undefined) {
            this.stableSource = source;
            return;
        }
        if (source === this.stableSource) {
            this.pendingSource = undefined;
            this.pendingSourceSince = null;
            return;
        }
        if (this.pendingSource !== source) {
            this.pendingSource = source;
            this.pendingSourceSince = now;
            return;
        }
        if (this.pendingSourceSince !== null && now - this.pendingSourceSince >= this.options.sourceChangeHoldMs) {
            events.push({ type: "SOURCE_CHANGE", at: now, from: this.stableSource, to: source, position: position ?? this.lastPosition });
            this.stableSource = source;
            this.pendingSource = undefined;
            this.pendingSourceSince = null;
        }
    }

    private resetVoyageState(): void {
        this.startedByMonitor = false;
        this.signalLost = false;
        this.signalLostSince = null;
        this.silentSince = null;
        this.courseRef = null;
        this.courseCandidateSince = null;
        this.lastCourseEventAt = null;
        this.speedRef = null;
        this.speedCandidateSince = null;
        this.lastSpeedEventAt = null;
        this.stableSource = undefined;
        this.pendingSource = undefined;
        this.pendingSourceSince = null;
        this.moveSince = null;
    }
}
