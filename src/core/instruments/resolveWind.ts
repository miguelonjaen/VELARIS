import type { BoatInstrumentSnapshot } from './BoatInstrumentStore';
import type { ResolvedNavigationState } from '../navigation/SharedNavigationState';

export interface WindObservation {
    readonly instrumentMode?: boolean;
    readonly source: 'BOAT' | 'METEO' | 'NONE';
    readonly tws: number | null;
    readonly twa: number | null;
    readonly twd: number | null;
    readonly aws: number | null;
    readonly awa: number | null;
    readonly heading: number | null;
    readonly ageMs: number | null;
    readonly receivedAt: number | null;
}
const degrees = (v: number): number => ((v % 360) + 360) % 360;
export const shortestWindRotation = (previous: number, next: number): number =>
    previous + ((next - previous + 540) % 360 + 360) % 360 - 180;

/** MWV R y T son ángulos relativos diferentes. Nunca se alternan en un mismo canal. */
export function resolveWind(
    instruments: BoatInstrumentSnapshot,
    navigation: ResolvedNavigationState,
    meteo: { tws: number; twd: number; timestamp: number } | null,
    now: number
): WindObservation {
    const headingField = navigation.headingTrue;
    const heading = headingField.status === 'VALID' && headingField.source === 'BOAT' ? headingField.value : null;
    const real = instruments.windTrue;
    const apparent = instruments.windApparent;
    const direction = instruments.windDirectionTrue;
    if (direction) {
        return { source: 'BOAT', tws: direction.value.speedKn, twd: direction.value.directionDeg,
            twa: heading !== null ? degrees(direction.value.directionDeg - heading) : real?.value.angleDeg ?? null,
            aws: apparent?.value.speedKn ?? null, awa: apparent?.value.angleDeg ?? null,
            heading, ageMs: direction.ageMs, receivedAt: now - direction.ageMs };
    }
    if (real || apparent) {
        const ageMs = Math.min(real?.ageMs ?? Infinity, apparent?.ageMs ?? Infinity);
        return { source: 'BOAT', tws: real?.value.speedKn ?? null, twa: real?.value.angleDeg ?? null,
            twd: real && heading !== null ? degrees(heading + real.value.angleDeg) : null,
            aws: apparent?.value.speedKn ?? null, awa: apparent?.value.angleDeg ?? null,
            heading, ageMs, receivedAt: now - ageMs };
    }
    if (meteo && Number.isFinite(meteo.tws) && meteo.tws >= 0 && Number.isFinite(meteo.twd)) {
        return { source: 'METEO', tws: meteo.tws, twd: degrees(meteo.twd),
            twa: heading !== null ? degrees(meteo.twd - heading) : null,
            aws: null, awa: null, heading, ageMs: Math.max(0, now - meteo.timestamp), receivedAt: meteo.timestamp };
    }
    return { source: 'NONE', tws: null, twa: null, twd: null, aws: null, awa: null,
        heading, ageMs: null, receivedAt: null };
}
