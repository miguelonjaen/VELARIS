/**
 * «Seguir barco» en la carta. Lógica pura (sin React ni Leaflet), para poder probarla.
 *
 * - Activar: centra la carta en la posición VÁLIDA Y ACTUAL del barco y la sigue.
 * - Desplazar la carta a mano (arrastrar) desactiva el seguimiento y lo indica: no se lucha
 *   contra el usuario. Se reactiva con el botón.
 * - Sin posición válida y actual no se mueve la carta (nunca a coordenadas inventadas ni caducadas).
 * - Solo se recentra si el barco se ha separado del centro al menos FOLLOW_RECENTER_THRESHOLD_PX:
 *   con la posición quieta no hay movimientos constantes.
 */

export const FOLLOW_RECENTER_THRESHOLD_PX = 2;
/** Duración del desplazamiento suave hacia la nueva posición (s). */
export const FOLLOW_PAN_DURATION_S = 0.6;

export interface FollowState {
    readonly following: boolean;
    /** El usuario desplazó la carta mientras se seguía al barco. */
    readonly suspendedByUser: boolean;
}

export type FollowEvent = "toggle" | "userPan";

export const INITIAL_FOLLOW_STATE: FollowState = { following: false, suspendedByUser: false };

export function followReducer(state: FollowState, event: FollowEvent): FollowState {
    switch (event) {
        case "toggle":
            return state.following ? { following: false, suspendedByUser: false } : { following: true, suspendedByUser: false };
        case "userPan":
            return state.following ? { following: false, suspendedByUser: true } : state;
        default:
            return state;
    }
}

export interface FollowPoint {
    readonly lat: number;
    readonly lng: number;
}

export const isValidFollowPosition = (position: FollowPoint | null | undefined): position is FollowPoint =>
    !!position
    && Number.isFinite(position.lat)
    && Number.isFinite(position.lng)
    && Math.abs(position.lat) <= 90
    && Math.abs(position.lng) <= 180
    && !(position.lat === 0 && position.lng === 0);

/**
 * ¿Hay que desplazar la carta? Solo siguiendo, con posición válida y actual, y si el barco está
 * a [offsetPx] píxeles o más del centro de la carta.
 */
export function shouldRecenter(following: boolean, position: FollowPoint | null | undefined, offsetPx: number | null): boolean {
    return following
        && isValidFollowPosition(position)
        && offsetPx !== null
        && Number.isFinite(offsetPx)
        && offsetPx >= FOLLOW_RECENTER_THRESHOLD_PX;
}

export interface FollowStatus {
    readonly active: boolean;
    readonly title: string;
    /** Texto breve bajo el botón cuando hace falta explicar el estado; null si no. */
    readonly note: string | null;
}

export function followStatus(state: FollowState, hasValidPosition: boolean): FollowStatus {
    if (state.following && hasValidPosition) {
        return { active: true, title: "Siguiendo al barco. Pulsa o desplaza la carta para dejar de seguirlo.", note: null };
    }
    if (state.following) {
        return { active: true, title: "Seguir barco: esperando una posición válida y actual del barco.", note: "Sin posición" };
    }
    if (state.suspendedByUser) {
        return { active: false, title: "Seguimiento suspendido al desplazar la carta. Pulsa para volver a seguir al barco.", note: "Suspendido" };
    }
    return { active: false, title: "Centrar la carta en el barco y seguirlo.", note: null };
}
