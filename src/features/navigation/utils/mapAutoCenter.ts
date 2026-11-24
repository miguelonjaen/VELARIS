/**
 * Decide si la carta debe centrarse automáticamente en la embarcación seleccionada.
 *
 * Se centra una sola vez por embarcación y solo cuando existe una posición válida
 * del núcleo. Si la embarcación se selecciona antes de que llegue la primera posición
 * (GPS real o simulado), el centrado debe producirse en cuanto la posición esté
 * disponible: el llamador tiene que volver a evaluar esta función también cuando
 * cambia la disponibilidad de posición, no solo cuando cambia la embarcación.
 */
export interface MapAutoCenterInput {
  selectedShipId: string | null;
  /** Posición del núcleo; null mientras no hay fix ni simulación. */
  position: { lat: number; lng: number } | null;
  /** Última embarcación sobre la que ya se centró la carta. */
  lastCenteredShipId: string | null;
  /**
   * Procedencia de la posición mostrada (p. ej. BOAT, DROID, SIMULATOR; null = núcleo).
   * Si cambia respecto al último centrado, se vuelve a centrar en la posición mostrada.
   */
  positionSource?: string | null;
  lastCenteredSource?: string | null;
}

export const hasValidMapPosition = (position: MapAutoCenterInput['position']): position is { lat: number; lng: number } =>
  position !== null
  && Number.isFinite(position.lat)
  && Number.isFinite(position.lng)
  && Math.abs(position.lat) <= 90
  && Math.abs(position.lng) <= 180;

/** Devuelve el centro [lat, lng] a aplicar o null si no procede centrar. */
export const getMapAutoCenterTarget = ({
  selectedShipId,
  position,
  lastCenteredShipId,
  positionSource = null,
  lastCenteredSource = null,
}: MapAutoCenterInput): [number, number] | null => {
  if (!selectedShipId) return null;
  if (!hasValidMapPosition(position)) return null;
  if (lastCenteredShipId === selectedShipId && positionSource === lastCenteredSource) return null;
  return [position.lat, position.lng];
};
