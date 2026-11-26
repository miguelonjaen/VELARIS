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

export function configureCrewWatch(
  state: CrewWatchState,
  rotation: readonly string[],
  plannedDurationMinutes: number,
  crew: readonly WatchCrewMember[]
): CrewWatchState {
  if (!Number.isInteger(plannedDurationMinutes) || plannedDurationMinutes < 15 || plannedDurationMinutes > 720)
    throw new Error('La duración de guardia debe estar entre 15 y 720 minutos.');
  const crewIds = new Set(crew.map(member => member.id));
  if (!rotation.length || rotation.some(id => !crewIds.has(id)) || new Set(rotation).size !== rotation.length)
    throw new Error('La rotación debe contener tripulantes válidos sin duplicados.');
  return { ...state, rotation: [...rotation], plannedDurationMinutes };
}

export function moveCrewInRotation(state: CrewWatchState, memberId: string, direction: -1 | 1): CrewWatchState {
  const index = state.rotation.indexOf(memberId);
  const target = index + direction;
  if (index < 0 || target < 0 || target >= state.rotation.length) return state;
  const rotation = [...state.rotation];
  [rotation[index], rotation[target]] = [rotation[target], rotation[index]];
  return { ...state, rotation };
}

export function reconcileCrewWatch(state: CrewWatchState, crew: readonly WatchCrewMember[]): CrewWatchState {
  const ids = new Set(crew.map(member => member.id));
  const rotation = [...state.rotation.filter(id => ids.has(id)), ...crew.map(member => member.id).filter(id => !state.rotation.includes(id))];
  return { ...state, rotation, currentWatchkeeperId: state.currentWatchkeeperId && ids.has(state.currentWatchkeeperId) ? state.currentWatchkeeperId : null,
    startedAt: state.currentWatchkeeperId && ids.has(state.currentWatchkeeperId) ? state.startedAt : null };
}

export function loadCrewWatch(storage: Pick<Storage, 'getItem'>, vesselId: string): CrewWatchState | null {
  try {
    const value: unknown = JSON.parse(storage.getItem(`gaulos:crew-watch:v1:${vesselId}`) ?? 'null');
    if (!value || typeof value !== 'object' || (value as { vesselId?: unknown }).vesselId !== vesselId) return null;
    const state = value as CrewWatchState;
    return Array.isArray(state.rotation) && Array.isArray(state.history) && Number.isInteger(state.plannedDurationMinutes)
      && state.plannedDurationMinutes >= 15 && state.plannedDurationMinutes <= 720 ? state : null;
  } catch { return null; }
}

export function saveCrewWatch(storage: Pick<Storage, 'setItem'>, state: CrewWatchState): void {
  storage.setItem(`gaulos:crew-watch:v1:${state.vesselId}`, JSON.stringify({ ...state, history: state.history.slice(-100) }));
}
