/**
 * Estado de navegación compartido (Fase 2, primera pieza).
 *
 * Modelo tipado de datos de navegación con procedencia, validez e instantes de
 * observación y recepción, y selección de fuente POR CAMPO:
 *
 *   1. Instrumentos del barco (BOAT) cuando su dato es válido y reciente.
 *   2. GAULOSdroid (DROID) como respaldo automático cuando el dato del barco
 *      falta, es inválido o ha caducado.
 *   3. Simulador NMEA (SIMULATOR), con la prioridad más baja: solo se usa si
 *      ni el barco ni Droid tienen dato válido, y siempre identificado como
 *      simulación. Nunca pasa por delante de una fuente real. Es opcional: si la
 *      política de caducidad no lo configura, sus lecturas se rechazan.
 *   4. UNKNOWN cuando ninguna fuente tiene un dato válido. Nunca se devuelve un
 *      valor inventado ni predeterminado.
 *
 * Cada fuente se evalúa por separado en cada campo: el barco puede aportar el
 * rumbo mientras Droid aporta la posición. Cuando el dato del barco vuelve a ser
 * válido recupera la prioridad sin intervención, porque la selección se calcula
 * en cada lectura con el instante actual.
 *
 * Un mensaje retrasado (instante de observación anterior al ya almacenado para
 * esa fuente y ese campo) se rechaza: no sustituye a un dato más reciente por
 * haber llegado después. Si una lectura trae hora de origen y la otra solo hora
 * de recepción, no se comparan relojes distintos: se ordenan por recepción.
 *
 * Unidades y referencias: las mismas que ya usa GAULOS (TelemetryMessage y
 * GAULOS Link). Posición en grados decimales WGS84 {lat, lng}; SOG en nudos;
 * COG en grados verdaderos; rumbo verdadero y magnético en campos separados para
 * no mezclar referencias.
 *
 * Sin dependencias: lógica pura, sin React, Electron ni Supabase.
 */

import type { GeoPoint } from "./GeoPoint";

/**
 * Fuentes en orden de prioridad (la primera manda cuando su dato es válido).
 * BOAT > DROID no cambia; SIMULATOR va siempre la última.
 */
export const NAVIGATION_SOURCE_PRIORITY = ["BOAT", "DROID", "SIMULATOR"] as const;

export type NavigationSource = (typeof NAVIGATION_SOURCE_PRIORITY)[number];

/** Fuentes reales: su caducidad es obligatoria en la política. */
export const REAL_NAVIGATION_SOURCES = ["BOAT", "DROID"] as const;

/** Fuentes de simulación: nunca se presentan como datos reales. */
export const isSimulatedNavigationSource = (source: NavigationSource | null | undefined): boolean =>
    source === "SIMULATOR";

/** Valores por campo, en las unidades existentes de GAULOS. */
export interface NavigationFieldValues {
    /** Grados decimales WGS84. */
    readonly position: GeoPoint;
    /** Velocidad sobre el fondo, nudos. */
    readonly sog: number;
    /** Rumbo sobre el fondo, grados verdaderos (0..360). */
    readonly cog: number;
    /** Rumbo de proa verdadero, grados (0..360). */
    readonly headingTrue: number;
    /** Rumbo de proa magnético, grados (0..360). */
    readonly headingMagnetic: number;
}

export type NavigationFieldName = keyof NavigationFieldValues;

export const NAVIGATION_FIELDS: readonly NavigationFieldName[] = [
    "position",
    "sog",
    "cog",
    "headingTrue",
    "headingMagnetic"
];

/** Lectura entrante de una fuente para un campo. */
export interface NavigationReadingInput<F extends NavigationFieldName = NavigationFieldName> {
    readonly field: F;
    readonly source: NavigationSource;
    /** Identificador del emisor concreto (p. ej. "nmea", id del teléfono). */
    readonly sourceId: string;
    readonly value: NavigationFieldValues[F];
    /** Instante de la medida (ms desde la época). */
    readonly observedAt: number;
    /** Instante en que este equipo recibió la lectura (ms desde la época). */
    readonly receivedAt: number;
    /**
     * true si observedAt procede del emisor (hora GPS o de la medida);
     * false si no había hora de origen y se usó la de recepción.
     */
    readonly observedAtFromSource: boolean;
}

/** Lectura almacenada: incluye el resultado de validar el valor. */
export interface NavigationReading<F extends NavigationFieldName = NavigationFieldName>
    extends NavigationReadingInput<F> {
    readonly valid: boolean;
}

/** Desde qué instante se mide la antigüedad de una fuente. */
export type NavigationAgeReference = "observedAt" | "receivedAt";

export interface NavigationSourceFreshness {
    /** Antigüedad máxima (ms) para considerar el dato actual. */
    readonly maxAgeMs: number;
    readonly ageFrom: NavigationAgeReference;
}

/**
 * Caducidad por campo y fuente. Es obligatoria para las fuentes reales (BOAT y
 * DROID): el módulo no define umbrales propios para no inventar valores no
 * acordados. SIMULATOR es opcional; sin entrada, esa fuente queda desactivada.
 */
export type NavigationFreshnessPolicy = {
    readonly [F in NavigationFieldName]: {
        readonly BOAT: NavigationSourceFreshness;
        readonly DROID: NavigationSourceFreshness;
        readonly SIMULATOR?: NavigationSourceFreshness;
    };
};

export type NavigationRejectReason = "OUT_OF_ORDER" | "DUPLICATE" | "INVALID_TIMESTAMP" | "SOURCE_NOT_CONFIGURED";

export type NavigationUpdateResult =
    | { readonly accepted: true; readonly valid: boolean }
    | { readonly accepted: false; readonly reason: NavigationRejectReason };

/** Estado de una fuente concreta en un campo, en el instante evaluado. */
export type NavigationSourceStatus = "VALID" | "NO_DATA" | "INVALID" | "STALE";

export interface ResolvedNavigationField<F extends NavigationFieldName = NavigationFieldName> {
    readonly field: F;
    readonly status: "VALID" | "UNKNOWN";
    /** Solo con status VALID. */
    readonly value: NavigationFieldValues[F] | null;
    readonly source: NavigationSource | null;
    readonly sourceId: string | null;
    readonly observedAt: number | null;
    readonly receivedAt: number | null;
    readonly observedAtFromSource: boolean | null;
    /** Antigüedad usada para decidir (ms), según la política de la fuente elegida. */
    readonly ageMs: number | null;
    /** Diagnóstico de cada fuente: por qué se eligió o se descartó. */
    readonly sources: { readonly [S in NavigationSource]: NavigationSourceStatus };
}

export type ResolvedNavigationState = {
    readonly [F in NavigationFieldName]: ResolvedNavigationField<F>;
};

const isFiniteNumber = (value: unknown): value is number =>
    typeof value === "number" && Number.isFinite(value);

const isAngle = (value: unknown): boolean => isFiniteNumber(value) && value >= 0 && value <= 360;

/**
 * Validación de valores. Una posición 0,0 se considera inválida, igual que en
 * GAULOS Link (fixtures/invalid.json): algunos emisores la usan como «sin dato».
 */
const FIELD_VALIDATORS: { readonly [F in NavigationFieldName]: (value: NavigationFieldValues[F]) => boolean } = {
    position: (value) =>
        value !== null
        && typeof value === "object"
        && isFiniteNumber(value.lat)
        && isFiniteNumber(value.lng)
        && Math.abs(value.lat) <= 90
        && Math.abs(value.lng) <= 180
        && !(value.lat === 0 && value.lng === 0),
    sog: (value) => isFiniteNumber(value) && value >= 0,
    cog: isAngle,
    headingTrue: isAngle,
    headingMagnetic: isAngle
};

export function isValidNavigationValue<F extends NavigationFieldName>(
    field: F,
    value: NavigationFieldValues[F]
): boolean {
    return FIELD_VALIDATORS[field](value);
}

function assertPolicy(policy: NavigationFreshnessPolicy): void {
    const required: readonly NavigationSource[] = REAL_NAVIGATION_SOURCES;
    for (const field of NAVIGATION_FIELDS) {
        for (const source of NAVIGATION_SOURCE_PRIORITY) {
            const entry = policy[field]?.[source];
            if (!entry && !required.includes(source)) continue;
            if (!entry || !isFiniteNumber(entry.maxAgeMs) || entry.maxAgeMs <= 0
                || (entry.ageFrom !== "observedAt" && entry.ageFrom !== "receivedAt")) {
                throw new Error(`Política de caducidad incompleta para ${field}/${source}.`);
            }
        }
    }
}

type ReadingTable = {
    [F in NavigationFieldName]: Partial<Record<NavigationSource, NavigationReading<F>>>;
};

const copyValue = <F extends NavigationFieldName>(value: NavigationFieldValues[F]): NavigationFieldValues[F] =>
    (typeof value === "object" && value !== null ? { ...value } : value) as NavigationFieldValues[F];

export class SharedNavigationState {
    private readonly readings: ReadingTable = {
        position: {},
        sog: {},
        cog: {},
        headingTrue: {},
        headingMagnetic: {}
    };

    constructor(
        private readonly policy: NavigationFreshnessPolicy,
        private readonly clock: () => number = Date.now
    ) {
        assertPolicy(policy);
    }

    /**
     * Registra una lectura. Se rechaza si su instante de observación es anterior
     * (o igual) al ya almacenado para esa fuente y ese campo. Una lectura más
     * reciente con valor inválido se guarda como inválida: invalida la anterior
     * de esa fuente, de modo que no se sigue usando un valor ya superado.
     */
    public update<F extends NavigationFieldName>(input: NavigationReadingInput<F>): NavigationUpdateResult {
        if (!this.policy[input.field]?.[input.source]) {
            return { accepted: false, reason: "SOURCE_NOT_CONFIGURED" };
        }
        if (!isFiniteNumber(input.observedAt) || !isFiniteNumber(input.receivedAt)) {
            return { accepted: false, reason: "INVALID_TIMESTAMP" };
        }

        const table = this.readings[input.field] as Partial<Record<NavigationSource, NavigationReading<F>>>;
        const previous = table[input.source];
        if (previous) {
            // Solo se comparan instantes del mismo reloj: si una lectura trae hora de
            // origen y la otra solo hora de recepción, se ordenan por recepción.
            const sameClock = previous.observedAtFromSource === input.observedAtFromSource;
            const incoming = sameClock ? input.observedAt : input.receivedAt;
            const stored = sameClock ? previous.observedAt : previous.receivedAt;
            if (incoming < stored) return { accepted: false, reason: "OUT_OF_ORDER" };
            if (incoming === stored) return { accepted: false, reason: "DUPLICATE" };
        }

        const valid = isValidNavigationValue(input.field, input.value);
        table[input.source] = { ...input, value: copyValue(input.value), valid };
        return { accepted: true, valid };
    }

    /** Registra varias lecturas; devuelve el resultado de cada una en el mismo orden. */
    public ingest(inputs: readonly NavigationReadingInput[]): NavigationUpdateResult[] {
        return inputs.map((input) => this.update(input));
    }

    /** Selecciona la fuente de un campo en el instante indicado. */
    public resolve<F extends NavigationFieldName>(field: F, now: number = this.clock()): ResolvedNavigationField<F> {
        const table = this.readings[field] as Partial<Record<NavigationSource, NavigationReading<F>>>;
        const sources = {} as Record<NavigationSource, NavigationSourceStatus>;
        let chosen: { reading: NavigationReading<F>; ageMs: number } | null = null;

        for (const source of NAVIGATION_SOURCE_PRIORITY) {
            const reading = table[source];
            if (!reading) {
                sources[source] = "NO_DATA";
                continue;
            }
            if (!reading.valid) {
                sources[source] = "INVALID";
                continue;
            }
            const freshness = this.policy[field][source];
            if (!freshness) {
                sources[source] = "NO_DATA";
                continue;
            }
            const reference = freshness.ageFrom === "observedAt" ? reading.observedAt : reading.receivedAt;
            // A future reception/fix cannot establish navigation continuity.
            if (reading.receivedAt > now || reference > now) {
                sources[source] = "INVALID";
                continue;
            }
            const ageMs = now - reference;
            if (ageMs > freshness.maxAgeMs) {
                sources[source] = "STALE";
                continue;
            }
            sources[source] = "VALID";
            if (!chosen) chosen = { reading, ageMs };
        }

        if (!chosen) {
            return {
                field,
                status: "UNKNOWN",
                value: null,
                source: null,
                sourceId: null,
                observedAt: null,
                receivedAt: null,
                observedAtFromSource: null,
                ageMs: null,
                sources
            };
        }

        const { reading, ageMs } = chosen;
        return {
            field,
            status: "VALID",
            value: copyValue(reading.value),
            source: reading.source,
            sourceId: reading.sourceId,
            observedAt: reading.observedAt,
            receivedAt: reading.receivedAt,
            observedAtFromSource: reading.observedAtFromSource,
            ageMs,
            sources
        };
    }

    /** Selección de todos los campos con un mismo instante de referencia. */
    public snapshot(now: number = this.clock()): ResolvedNavigationState {
        return {
            position: this.resolve("position", now),
            sog: this.resolve("sog", now),
            cog: this.resolve("cog", now),
            headingTrue: this.resolve("headingTrue", now),
            headingMagnetic: this.resolve("headingMagnetic", now)
        };
    }

    /** Última lectura almacenada de una fuente (diagnóstico); no aplica caducidad. */
    public lastReading<F extends NavigationFieldName>(field: F, source: NavigationSource): NavigationReading<F> | null {
        const reading = (this.readings[field] as Partial<Record<NavigationSource, NavigationReading<F>>>)[source];
        return reading ? { ...reading, value: copyValue(reading.value) } : null;
    }
}
