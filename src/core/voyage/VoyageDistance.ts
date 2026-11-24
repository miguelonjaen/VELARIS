import type { ResolvedNavigationField } from '../navigation/SharedNavigationState';
import { calculateDistanceNM } from '../../lib/utils';

export interface VoyageDistanceState {
    readonly totalNm: number;
    readonly anchor: ResolvedNavigationField<'position'> | null;
    readonly lastReceivedAt?: number;
}

/** Distancia GPS acumulada. El umbral de 0,01 NM coincide con el track existente. */
export function accumulateVoyageDistance(
    state: VoyageDistanceState,
    position: ResolvedNavigationField<'position'>
): VoyageDistanceState {
    if (position.status !== 'VALID' || !position.value || position.receivedAt === null
        || (position.source !== 'BOAT' && position.source !== 'DROID')) {
        return { totalNm: state.totalNm, anchor: null };
    }
    const previous = state.anchor;
    if (!previous?.value || previous.receivedAt === null
        || previous.source !== position.source || previous.sourceId !== position.sourceId
        || position.receivedAt - (state.lastReceivedAt ?? previous.receivedAt) > 30_000) {
        return { totalNm: state.totalNm, anchor: position, lastReceivedAt: position.receivedAt };
    }
    if (position.receivedAt <= previous.receivedAt) return state;
    const distance = calculateDistanceNM(previous.value.lat, previous.value.lng, position.value.lat, position.value.lng);
    return Number.isFinite(distance) && distance >= 0.01
        ? { totalNm: state.totalNm + distance, anchor: position, lastReceivedAt: position.receivedAt }
        : { ...state, lastReceivedAt: position.receivedAt };
}
