/**
 * Tipos del renderer para VELARIS Link. Reflejan exactamente lo que expone el preload
 * (electron-preload.js → window.velarisLink) a partir de link/linkServer.js y link/linkStore.js.
 * Contrato de red: ../../../../VELARIS-Link/PROTOCOL.md
 */

/** Posición GPS tal como la midió el dispositivo. `t` es la hora GPS del punto (ms epoch). */
export interface LinkFix {
  t: number;
  lat: number;
  lon: number;
  acc: number | null;
  sog: number | null;
  cog: number | null;
  hdg: number | null;
  /** Origen de la medida, p. ej. "phone_gps". Nunca son instrumentos del barco. */
  src: string;
}

/** Punto de track guardado: `seq` identifica el punto; `rx` es la hora de recepción en Desktop. */
export interface LinkTrackPoint extends LinkFix {
  seq: number;
  rx: number;
}

export interface LinkPosition {
  deviceId: string;
  deviceName: string;
  fix: LinkFix;
  trackId: string | null;
  /** Hora de recepción en Desktop (reloj local). */
  rx: number;
}

export type LinkTrackState = 'RECORDING' | 'PAUSED' | 'FINISHED' | 'UNKNOWN';

export interface LinkTrackSummary {
  trackId: string;
  deviceId: string;
  deviceName: string;
  name: string;
  state: LinkTrackState;
  startedAt: number;
  endedAt: number | null;
  lastSeq: number;
  contiguousSeq: number;
  maxSeq: number;
  pointCount: number;
  missing: number;
  complete: boolean;
  distanceNm: number;
  durationMs: number;
  updatedAt: number;
}

export type LinkEventKind =
  | 'TRACK_STARTED' | 'TRACK_PAUSED' | 'TRACK_RESUMED' | 'TRACK_FINISHED' | 'TRACK_RECOVERED'
  | 'GPS_LOST' | 'GPS_RECOVERED' | 'NOTE';

export interface LinkLogEvent {
  eventId: string;
  trackId: string | null;
  kind: LinkEventKind;
  auto: boolean;
  at: number;
  lat: number | null;
  lon: number | null;
  title: string;
  text: string;
  data: Record<string, unknown>;
  deviceId: string;
  deviceName: string;
  receivedAt: number;
}

export interface LinkDevice {
  deviceId: string;
  name: string;
  platform: string;
  pairedAt: number;
  lastSeenAt: number | null;
}

export interface LinkConnection {
  deviceId: string;
  deviceName: string;
  address: string;
  connectedAt: number;
  lastRx: number;
  /** Puntos/eventos que el dispositivo declara pendientes de enviar (sincronizando si > 0). */
  pending: number;
}

export interface LinkPendingPairing {
  requestId: string;
  deviceName: string;
  platform: string;
  address: string;
  requestedAt: number;
}

export interface LinkDiagnostic {
  at: number;
  level: 'info' | 'warn' | 'error';
  message: string;
}

export interface LinkStatus {
  enabled: boolean;
  running: boolean;
  desktopId: string;
  desktopName: string;
  port: number;
  discoveryPort: number;
  listening: string[];
  pairing: { code: string; expiresAt: number } | null;
  pending: LinkPendingPairing[];
  connections: LinkConnection[];
  devices: LinkDevice[];
  positions: LinkPosition[];
  lastError: string | null;
  diagnostics: LinkDiagnostic[];
}

export interface LinkTrackPointsUpdate {
  trackId: string;
  points: LinkTrackPoint[];
  summary: LinkTrackSummary;
}

type Unsubscribe = () => void;

/** API tipada expuesta por electron-preload.js. Solo existe dentro de Electron. */
export interface VelarisLinkApi {
  getStatus(): Promise<LinkStatus>;
  setEnabled(enabled: boolean): Promise<LinkStatus>;
  startPairing(): Promise<{ code: string; expiresAt: number }>;
  cancelPairing(): Promise<boolean>;
  approvePairing(requestId: string): Promise<boolean>;
  rejectPairing(requestId: string): Promise<boolean>;
  revokeDevice(deviceId: string): Promise<boolean>;
  listTracks(): Promise<LinkTrackSummary[]>;
  getTrackPoints(trackId: string): Promise<LinkTrackPoint[]>;
  listEvents(): Promise<LinkLogEvent[]>;
  onStatus(callback: (status: LinkStatus) => void): Unsubscribe;
  onPosition(callback: (position: LinkPosition) => void): Unsubscribe;
  onTrack(callback: (summary: LinkTrackSummary) => void): Unsubscribe;
  onTrackPoints(callback: (update: LinkTrackPointsUpdate) => void): Unsubscribe;
  onLogEvent(callback: (event: LinkLogEvent) => void): Unsubscribe;
}

declare global {
  interface Window {
    velarisLink?: VelarisLinkApi;
  }
}
