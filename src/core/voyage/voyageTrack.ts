import type { ResolvedNavigationField } from '../navigation/SharedNavigationState';
import { calculateDistanceNM } from '../../lib/utils';

export type TrackSegment = [number, number][];
export interface TrackCursor { source: string; sourceId: string | null; receivedAt: number }
export interface VoyageTrack { segments: TrackSegment[]; cursor: TrackCursor | null }
/** A reconnect, source switch or stale fix always opens a new segment. Never bridges missing water. */
export function appendVoyageTrack(track: VoyageTrack, field: ResolvedNavigationField<'position'>): VoyageTrack {
  if (field.status !== 'VALID' || !field.value || field.receivedAt === null
      || (field.source !== 'BOAT' && field.source !== 'DROID')) {
    return track.cursor ? { ...track, cursor: null } : track;
  }
  const cursor = { source: field.source, sourceId: field.sourceId, receivedAt: field.receivedAt };
  const old = track.cursor;
  if (old && old.source === cursor.source && old.sourceId === cursor.sourceId && cursor.receivedAt <= old.receivedAt) return track;
  const point: [number, number] = [field.value.lat, field.value.lng];
  if (!old || old.source !== cursor.source || old.sourceId !== cursor.sourceId || cursor.receivedAt - old.receivedAt > 30_000) {
    return { segments: [...track.segments, [point]], cursor };
  }
  const segment = track.segments.at(-1) ?? [];
  const last = segment.at(-1);
  if (last && calculateDistanceNM(...last, ...point) < 0.01) return { ...track, cursor };
  return { segments: [...track.segments.slice(0, -1), [...segment, point]], cursor };
}
