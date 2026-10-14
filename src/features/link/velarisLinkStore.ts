import { useSyncExternalStore } from 'react';
import type {
  LinkLogEvent,
  LinkPosition,
  LinkStatus,
  LinkTrackPoint,
  LinkTrackSummary,
  VelarisLinkApi
} from './velarisLinkTypes';

/**
 * Estado del renderer para VELARIS Link. Una sola suscripción IPC compartida por la carta,
 * la barra de estado, el panel y la bitácora. Es una vista: la fuente de verdad está en el
 * proceso principal (link/linkStore.js). Nada de esto entra en VelarisCore ni en TelemetryService.
 */
export interface VelarisLinkState {
  available: boolean;
  status: LinkStatus | null;
  positions: Record<string, LinkPosition>;
  tracks: Record<string, LinkTrackSummary>;
  points: Record<string, LinkTrackPoint[]>;
  events: LinkLogEvent[];
  /** Tracks dibujados en la carta (activos y el último terminado, salvo que el usuario cambie). */
  visibleTrackIds: string[];
  error: string | null;
}

const RECENT_TRACK_MS = 12 * 60 * 60 * 1000;

let state: VelarisLinkState = {
  available: false,
  status: null,
  positions: {},
  tracks: {},
  points: {},
  events: [],
  visibleTrackIds: [],
  error: null
};

const listeners = new Set<() => void>();
let started = false;
const userHidden = new Set<string>();
const userShown = new Set<string>();
const loadingPoints = new Set<string>();

function setState(patch: Partial<VelarisLinkState>) {
  state = { ...state, ...patch };
  for (const listener of listeners) listener();
}

function api(): VelarisLinkApi | null {
  return typeof window !== 'undefined' && window.velarisLink ? window.velarisLink : null;
}

function mergePoints(existing: LinkTrackPoint[] | undefined, incoming: LinkTrackPoint[]): LinkTrackPoint[] {
  const bySeq = new Map<number, LinkTrackPoint>();
  for (const point of existing ?? []) bySeq.set(point.seq, point);
  for (const point of incoming) if (!bySeq.has(point.seq)) bySeq.set(point.seq, point);
  return [...bySeq.values()].sort((a, b) => a.seq - b.seq);
}

function computeVisible(tracks: Record<string, LinkTrackSummary>): string[] {
  const all = Object.values(tracks);
  const latestFinished = all
    .filter((t) => t.state === 'FINISHED')
    .sort((a, b) => (b.endedAt ?? b.updatedAt) - (a.endedAt ?? a.updatedAt))[0];
  const now = Date.now();
  return all
    .filter((t) => {
      if (userHidden.has(t.trackId)) return false;
      if (userShown.has(t.trackId)) return true;
      if (t.state !== 'FINISHED') return now - t.updatedAt < RECENT_TRACK_MS || t.state === 'RECORDING';
      return t.trackId === latestFinished?.trackId;
    })
    .map((t) => t.trackId);
}

function ensurePoints(trackIds: string[]) {
  const link = api();
  if (!link) return;
  for (const trackId of trackIds) {
    if (state.points[trackId] || loadingPoints.has(trackId)) continue;
    loadingPoints.add(trackId);
    link.getTrackPoints(trackId)
      .then((points) => setState({ points: { ...state.points, [trackId]: mergePoints(state.points[trackId], points) } }))
      .catch((error: Error) => setState({ error: `No se pudieron cargar los puntos del track: ${error.message}` }))
      .finally(() => loadingPoints.delete(trackId));
  }
}

function applyTracks(tracks: Record<string, LinkTrackSummary>) {
  const visibleTrackIds = computeVisible(tracks);
  setState({ tracks, visibleTrackIds });
  ensurePoints(visibleTrackIds);
}

function start() {
  if (started) return;
  started = true;
  const link = api();
  if (!link) return;
  setState({ available: true });

  link.onStatus((status) => {
    const positions = { ...state.positions };
    for (const position of status.positions) {
      const current = positions[position.deviceId];
      if (!current || current.fix.t <= position.fix.t) positions[position.deviceId] = position;
    }
    setState({ status, positions });
  });
  link.onPosition((position) => {
    const current = state.positions[position.deviceId];
    if (current && current.fix.t >= position.fix.t) return;
    setState({ positions: { ...state.positions, [position.deviceId]: position } });
  });
  link.onTrack((summary) => applyTracks({ ...state.tracks, [summary.trackId]: summary }));
  link.onTrackPoints((update) => {
    const tracks = { ...state.tracks, [update.trackId]: update.summary };
    const visibleTrackIds = computeVisible(tracks);
    const points = visibleTrackIds.includes(update.trackId) && state.points[update.trackId]
      ? { ...state.points, [update.trackId]: mergePoints(state.points[update.trackId], update.points) }
      : state.points;
    setState({ tracks, points, visibleTrackIds });
    ensurePoints(visibleTrackIds);
  });
  link.onLogEvent((event) => {
    if (state.events.some((e) => e.eventId === event.eventId)) return;
    setState({ events: [event, ...state.events].sort((a, b) => b.at - a.at) });
  });

  link.getStatus().then((status) => {
    const positions: Record<string, LinkPosition> = {};
    for (const position of status.positions) positions[position.deviceId] = position;
    setState({ status, positions });
  }).catch((error: Error) => setState({ error: error.message }));
  link.listTracks().then((list) => {
    const tracks: Record<string, LinkTrackSummary> = {};
    for (const summary of list) tracks[summary.trackId] = summary;
    applyTracks({ ...tracks, ...state.tracks });
  }).catch((error: Error) => setState({ error: error.message }));
  link.listEvents().then((events) => {
    const known = new Set(state.events.map((e) => e.eventId));
    setState({ events: [...state.events, ...events.filter((e) => !known.has(e.eventId))].sort((a, b) => b.at - a.at) });
  }).catch((error: Error) => setState({ error: error.message }));
}

function subscribe(listener: () => void) {
  start();
  listeners.add(listener);
  return () => listeners.delete(listener);
}

const getSnapshot = () => state;

export function useVelarisLink(): VelarisLinkState {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

export function setTrackVisible(trackId: string, visible: boolean) {
  if (visible) {
    userShown.add(trackId);
    userHidden.delete(trackId);
  } else {
    userHidden.add(trackId);
    userShown.delete(trackId);
  }
  applyTracks(state.tracks);
}

export function velarisLinkApi(): VelarisLinkApi | null {
  return api();
}

/** Antigüedad de una posición según la hora de RECEPCIÓN en Desktop (no depende del reloj del móvil). */
export function positionAgeMs(position: LinkPosition, now = Date.now()): number {
  return Math.max(0, now - position.rx);
}

export const POSITION_STALE_MS = 15000;
export const POSITION_OBSOLETE_MS = 120000;

export function formatAge(ms: number): string {
  const s = Math.round(ms / 1000);
  if (s < 60) return `hace ${s} s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `hace ${m} min`;
  return `hace ${Math.floor(m / 60)} h ${m % 60} min`;
}
