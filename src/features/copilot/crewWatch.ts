export interface WatchCrewMember { id: string; nombre: string; rango: string }
export interface CrewWatchHistory { watchkeeperId: string; startedAt: number; endedAt: number; relievedBy: string }
export interface CrewWatchState {
  vesselId: string;
  currentWatchkeeperId: string | null;
  startedAt: number | null;
  plannedDurationMinutes: number;
  rotation: readonly string[];
  history: readonly CrewWatchHistory[];
}

export function createCrewWatchState(vesselId: string, crew: readonly WatchCrewMember[], durationMinutes = 240): CrewWatchState {
  if (!Number.isFinite(durationMinutes) || durationMinutes < 15 || durationMinutes > 720) throw new Error('La duración de guardia debe estar entre 15 y 720 minutos.');
  return { vesselId, currentWatchkeeperId: null, startedAt: null, plannedDurationMinutes: durationMinutes,
    rotation: crew.map(member => member.id), history: [] };
}

export function nextWatchkeeper(state: CrewWatchState): string | null {
  if (!state.rotation.length) return null;
  const index = state.currentWatchkeeperId ? state.rotation.indexOf(state.currentWatchkeeperId) : -1;
  return state.rotation[(index + 1 + state.rotation.length) % state.rotation.length] ?? null;
}

export function confirmWatchRelief(state: CrewWatchState, nextId: string, now: number, crew: readonly WatchCrewMember[]): CrewWatchState {
  if (!crew.some(member => member.id === nextId)) throw new Error('El relevo no pertenece a la tripulación de la travesía.');
  if (state.currentWatchkeeperId === nextId) throw new Error('El relevo debe ser una persona distinta.');
  const history = state.currentWatchkeeperId && state.startedAt !== null
    ? [...state.history, { watchkeeperId: state.currentWatchkeeperId, startedAt: state.startedAt, endedAt: now, relievedBy: nextId }].slice(-100)
    : state.history;
  return { ...state, currentWatchkeeperId: nextId, startedAt: now, history };
}

export function reliefDueAt(state: CrewWatchState): number | null {
  return state.startedAt === null ? null : state.startedAt + state.plannedDurationMinutes * 60_000;
}

export function crewWatchNotice(state: CrewWatchState, now: number, leadMinutes = 15): 'NONE' | 'DUE_SOON' | 'OVERDUE' {
  const due = reliefDueAt(state);
  if (due === null) return 'NONE';
  if (now >= due) return 'OVERDUE';
  return due - now <= leadMinutes * 60_000 ? 'DUE_SOON' : 'NONE';
}

export function loadCrewWatch(storage: Pick<Storage, 'getItem'>, vesselId: string): CrewWatchState | null {
  try {
    const value: unknown = JSON.parse(storage.getItem(`gaulos:crew-watch:v1:${vesselId}`) ?? 'null');
    if (!value || typeof value !== 'object' || (value as { vesselId?: unknown }).vesselId !== vesselId) return null;
    const state = value as CrewWatchState;
    return Array.isArray(state.rotation) && Array.isArray(state.history) ? state : null;
  } catch { return null; }
}

export function saveCrewWatch(storage: Pick<Storage, 'setItem'>, state: CrewWatchState): void {
  storage.setItem(`gaulos:crew-watch:v1:${state.vesselId}`, JSON.stringify({ ...state, history: state.history.slice(-100) }));
}
