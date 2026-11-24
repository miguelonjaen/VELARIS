import type { MissionPlan } from '../core/voyage/missionPlan';
import { appendVoyageTrack, type VoyageTrack } from '../core/voyage/voyageTrack';
import type { ResolvedNavigationField } from '../core/navigation/SharedNavigationState';
import type { LogEntry } from '../shared/types';
/**
 * Trip Logger (Blackbox) Utility
 * Records vessel telemetry every 5 minutes for performance analysis
 */

export interface TripLogEntry {
  timestamp: number;           // Unix timestamp in milliseconds
  lat: number;
  lng: number;
  // null = sin lectura válida en ese instante (nunca se sustituye por un valor por defecto).
  cog: number | null;          // Course over ground (0-359°)
  sog: number | null;          // Speed over ground in knots
  windDir: number | null;      // Dirección del viento real medido por instrumentos (no Open-Meteo)
  windSpeed: number | null;    // Velocidad del viento real medido por instrumentos, nudos
  depth: number | null;        // Water depth in meters
  heading?: number;            // True heading (degrees)
  fuelLevel?: number;          // Fuel percentage
  waterLevel?: number;         // Water percentage
}

export interface VoyageCrewMember { id: string; nombre: string; rango: string }

export interface TripSession {
  id: string;
  shipId: string;
  startTime: number;
  endTime?: number;
  destination?: string;
  entries: TripLogEntry[];
  isActive: boolean;
  /** Paused recording is still an open formal voyage. */
  pausedAt?: number;
  mode?: 'Libre' | 'Ruta' | 'IA';
  plan?: MissionPlan;
  officer?: string;
  crew?: VoyageCrewMember[];
  officerId?: string;
  distanceNm?: number;
  waypointIndex?: number;
  routeArrivedAt?: number;
  track?: VoyageTrack;
  journal?: VoyageJournalEntry[];
}

export interface VoyageJournalEntry {
  id: string;
  at: number;
  title: string;
  text: string;
  cloudSaved: boolean;
  payload?: Record<string, unknown>;
}
export interface TripStartOptions {
  mode?: 'Libre' | 'Ruta' | 'IA';
  plan?: MissionPlan;
  officer?: string;
  crew?: VoyageCrewMember[];
  officerId?: string;
}

const LOGGING_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * TripLogger class manages local logging of vessel telemetry
 * Uses IndexedDB for persistent local storage (fallback to in-memory)
 */
export class TripLogger {
  private logInterval: NodeJS.Timeout | null = null;
  private currentSession: TripSession | null = null;
  private pendingSession: TripSession | null = null;
  private telemetryNotBefore = 0;
  private recordingTransition = false;
  private recordingCommit: Promise<void> = Promise.resolve();
  isRecording(): boolean {
    return Boolean(this.currentSession?.isActive && this.currentSession.pausedAt === undefined && !this.recordingTransition);
  }
  getTelemetryNotBefore(): number { return this.telemetryNotBefore; }
  private db: IDBDatabase | null = null;
  private readonly dbName = 'GAULOSTripLogs';
  private readonly storeName = 'sessions';

  private readonly ready: Promise<void>;
  private writes: Promise<void> = Promise.resolve();
  private opening: Promise<TripSession> | null = null;
  private persistenceError: string | null = null;
  private autoLoggingState: (() => Omit<TripLogEntry, 'timestamp'> | null) | null = null;
  private cloudSync: Promise<void> | null = null;
  private automaticWrites: Promise<void> = Promise.resolve();
  private automaticRevision = 0;
  getAutomaticRevision(): number { return this.automaticRevision; }

  /** Remove selected automatic journal entries without touching voyage telemetry or tracks. */
  async removeAutomaticJournalEntries(shipId: string, ids: readonly string[]): Promise<number> {
    const wanted = new Set(ids.filter(id => id.startsWith('auto:')));
    if (!wanted.size) return 0;
    await this.cloudSync?.catch(() => undefined);
    const operation = this.automaticWrites.catch(() => undefined).then(async () => {
      const sessions = await this.getSessionsForShip(shipId, true);
      let removed = 0;
      for (const session of sessions) {
        if (!session.id.startsWith('automatic:') || !session.journal?.length) continue;
        const before = session.journal.length;
        session.journal = session.journal.filter(entry => !wanted.has(entry.id));
        if (session.journal.length === before) continue;
        removed += before - session.journal.length;
        await this.saveSessionToDB(session);
      }
      if (removed) this.automaticRevision++;
      return removed;
    });
    this.automaticWrites = operation.then(() => undefined);
    return operation;
  }

  /** Standalone daily journal, never an active voyage and never truncates historical sessions. */
  appendAutomaticEntry(entry: LogEntry): Promise<void> {
    const operation = this.automaticWrites.catch(() => undefined).then(async () => {
      const id = `automatic:${entry.barco_id}:${entry.fecha}`;
      const session = await this.getSession(id) ?? {
        id, shipId: String(entry.barco_id), startTime: Date.parse(entry.created_at!), entries: [], isActive: false, journal: []
      };
      if (session.journal?.some(e => e.id === entry.id)) return;
      (session.journal ??= []).push({ id: String(entry.id), at: Date.parse(entry.created_at!), title: entry.titulo ?? '',
        text: entry.descripcion, cloudSaved: false, payload: { ...entry } });
      await this.saveSessionToDB(session);
      this.automaticRevision++;
    });
    this.automaticWrites = operation;
    return operation;
  }

  getPersistenceError(): string | null { return this.persistenceError; }
  async restoreSession(shipId: string): Promise<TripSession | null> {
    if (this.currentSession?.isActive && this.currentSession.shipId !== shipId)
      throw new Error('Finalice la travesía activa antes de cambiar de barco');
    if (this.currentSession?.isActive) return this.currentSession;
    if (this.pendingSession && this.pendingSession.shipId !== shipId)
      throw new Error('Finalice o reanude la travesía pendiente antes de cambiar de barco');
    const sessions = await this.getSessionsForShip(shipId);
    // An older open voyage must not be hidden by a newer completed voyage.
    const sorted = sessions.sort((a, b) => b.startTime - a.startTime);
    this.pendingSession = sorted.find(session => session.isActive) ?? null;
    return this.pendingSession ?? sorted[0] ?? null;
  }
  getPendingSession(): TripSession | null { return this.pendingSession; }

  /** Recovery is an explicit operator decision. No telemetry is accepted beforehand. */
  async resolvePendingSession(shipId: string, resume: boolean): Promise<TripSession> {
    const session = this.pendingSession;
    if (!session || session.shipId !== shipId || this.currentSession)
      throw new Error('La travesía pendiente no corresponde al barco seleccionado');
    const resolved = structuredClone(session);
    if (resolved.track) resolved.track.cursor = null;
    if (!resume) { resolved.isActive = false; resolved.endTime = Date.now(); }
    else delete resolved.pausedAt;
    await this.saveSessionToDB(resolved);
    this.pendingSession = null;
    if (resume) {
      this.telemetryNotBefore = Date.now();
      this.currentSession = resolved;
    }
    return resolved;
  }
  /** Pause state and its journal event commit together; a failed write changes neither. */
  async setRecordingPaused(paused: boolean, payload?: Record<string, unknown>): Promise<void> {
    const session = this.currentSession;
    if (!session?.isActive) throw new Error('No hay una travesía abierta');
    if (this.recordingTransition) throw new Error('Espere a guardar el cambio de grabación');
    if ((session.pausedAt !== undefined) === paused) return;
    if (payload?.barco_id !== undefined && payload.barco_id !== session.shipId)
      throw new Error('El asiento pertenece a otra embarcación');
    this.recordingTransition = true;
    try {
      const next = structuredClone(session), at = Date.now();
      if (paused) next.pausedAt = at; else delete next.pausedAt;
      if (next.track) next.track.cursor = null;
      const title = paused ? 'Pausa de grabación' : 'Reanudación de grabación';
      const text = `${title} confirmada por el operador. Sesión ${session.id}. Distancia GPS: ${(session.distanceNm ?? 0).toFixed(2)} NM. La pausa no finaliza la travesía.`;
      (next.journal ??= []).push({ id: crypto.randomUUID(), at, title, text, cloudSaved: false,
        payload: payload ? { ...payload, barco_id: session.shipId, titulo: title, descripcion: text,
          categoria: 'Navegación', created_at: new Date(at).toISOString(), fecha: new Date(at).toISOString().slice(0,10), is_auto: false } : undefined });
      this.recordingCommit = this.saveSessionToDB(next);
      await this.recordingCommit;
      Object.assign(session, next);
      if (!paused) delete session.pausedAt;
      if (!paused) this.telemetryNotBefore = Date.now();
    } finally { this.recordingTransition = false; }
  }
  async checkpoint(position: ResolvedNavigationField<'position'>, distanceNm: number): Promise<void> {
    const session = this.currentSession;
    if (!this.isRecording() || !session) return;
    if (position.receivedAt !== null && position.receivedAt < this.telemetryNotBefore) return;
    const old = session.track ?? { segments: [], cursor: null };
    const next = appendVoyageTrack(old, position);
    session.track = next;
    const changed = next.segments !== old.segments || session.distanceNm !== distanceNm;
    session.distanceNm = distanceNm;
    if (changed || this.persistenceError) await this.saveSessionToDB(session);
  }
  async addJournalEntry(title: string, text: string, payload?: Record<string, unknown>): Promise<VoyageJournalEntry | null> {
    if (!this.currentSession?.isActive) return null;
    if (this.recordingTransition) throw new Error('Espere a guardar el cambio de grabación');
    if (payload?.barco_id !== undefined && payload.barco_id !== this.currentSession.shipId)
      throw new Error('El asiento pertenece a otra embarcación');
    const entry: VoyageJournalEntry = { id: crypto.randomUUID(), at: Date.now(), title, text, cloudSaved: false, payload };
    (this.currentSession.journal ??= []).push(entry);
    await this.saveSessionToDB(this.currentSession);
    return entry;
  }
  async markCloudSaved(id: string, sessionId?: string): Promise<void> {
    await this.recordingCommit.catch(() => undefined);
    if (sessionId?.startsWith('automatic:')) {
      const operation = this.automaticWrites.catch(() => undefined).then(async () => {
        const session = await this.getSession(sessionId);
        const entry = session?.journal?.find(e => e.id === id);
        if (!session || !entry) return;
        entry.cloudSaved = true;
        await this.saveSessionToDB(session);
      });
      this.automaticWrites = operation;
      return operation;
    }
    const session = this.currentSession?.id === sessionId ? this.currentSession : sessionId ? await this.getSession(sessionId) : this.currentSession;
    const entry = session?.journal?.find(e => e.id === id);
    if (!entry || !session) return;
    entry.cloudSaved = true;
    await this.saveSessionToDB(session);
  }
  /** Synchronizes the canonical target; does not end the voyage at route arrival. */
  async synchronizeWaypoint(index: number, arrived = false): Promise<void> {
    const session = this.currentSession;
    if (!this.isRecording() || !session?.plan || !Number.isInteger(index)
        || index < 0 || index >= session.plan.waypoints.length) return;
    if (index === session.waypointIndex && (!arrived || session.routeArrivedAt !== undefined)
        && !this.persistenceError) return;
    session.waypointIndex = index;
    if (arrived && session.routeArrivedAt === undefined) session.routeArrivedAt = Date.now();
    await this.saveSessionToDB(session);
  }
  async advanceWaypoint(): Promise<number | null> {
    const session = this.currentSession;
    if (!session?.isActive || !session.plan) return null;
    const previous = session.waypointIndex ?? 0;
    const next = previous + 1;
    if (next >= session.plan.waypoints.length) return null;
    session.waypointIndex = next;
    try { await this.saveSessionToDB(session); }
    catch (cause) { session.waypointIndex = previous; throw cause; }
    return next;
  }
  /** Explicit retry for active and completed sessions. The callback must deduplicate by event identity. */
  syncJournal(shipId: string, send: (entry: VoyageJournalEntry) => Promise<void>): Promise<void> {
    if (this.cloudSync) return this.cloudSync;
    this.cloudSync = (async () => {
      const sessions = await this.getSessionsForShip(shipId, true);
      for (const stored of sessions) {
        const session = this.currentSession?.id === stored.id ? this.currentSession : stored;
        for (const entry of session.journal ?? []) {
          if (entry.cloudSaved || !entry.payload) continue;
          if (session.id.startsWith('automatic:') && entry.payload) {
            const { id: _id, user_id: _user, lat: _lat, lng: _lng, time: _time, ...payload } = entry.payload;
            await send({ ...entry, payload: { ...payload,
              latitud: payload.latitud ?? null, longitud: payload.longitud ?? null,
              velocidad_gps: payload.velocidad_gps ?? null, rumbo: payload.rumbo ?? null } });
          } else await send(entry);
          entry.cloudSaved = true;
          await this.markCloudSaved(entry.id, session.id);
        }
      }
    })().finally(() => { this.cloudSync = null; });
    return this.cloudSync;
  }

  constructor() {
    this.ready = this.initializeDB().catch((error: unknown) => {
      console.error('[TRIP] No se pudo abrir IndexedDB; registro solo en memoria', error);
    });
  }

  /**
   * Initialize IndexedDB for persistent local storage
   */
  private async initializeDB(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!window.indexedDB) {
        console.warn('IndexedDB not available, using in-memory storage');
        resolve();
        return;
      }

      const request = indexedDB.open(this.dbName, 1);

      request.onerror = () => {
        console.error('Failed to open IndexedDB:', request.error);
        reject(request.error);
      };

      request.onsuccess = () => {
        this.db = request.result;
        resolve();
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(this.storeName)) {
          db.createObjectStore(this.storeName, { keyPath: 'id' });
        }
      };
    });
  }

  /**
   * Start a new trip logging session
   */
  async startSession(
    shipId: string,
    destination?: string,
    options: TripStartOptions = {}
  ): Promise<TripSession> {
    if (this.opening) { const session = await this.opening; if (session.shipId !== shipId) throw new Error('Finalice la travesía activa antes de cambiar de barco'); return session; }
    this.opening = (async () => {
      if (this.pendingSession) throw new Error('Finalice o reanude la travesía pendiente antes de iniciar otra');
      if (this.currentSession?.isActive) {
        if (this.currentSession.shipId !== shipId) throw new Error('Finalice la travesía activa antes de cambiar de barco');
        return this.currentSession;
      }
      const session: TripSession = {
        id: `trip_${crypto.randomUUID()}`, shipId, startTime: Date.now(), destination,
        entries: [], isActive: true, ...structuredClone(options), distanceNm: 0, waypointIndex: 0, track: { segments: [], cursor: null }, journal: []
      };
      await this.saveSessionToDB(session);
      this.currentSession = session;
      return session;
    })().finally(() => { this.opening = null; });
    return this.opening;
  }

  /**
   * End the current trip session
   */
  async endSession(): Promise<TripSession | null> {
    if (this.recordingTransition) throw new Error('Espere a guardar el cambio de grabación');
    if (!this.currentSession) return null;

    const previousEnd = this.currentSession.endTime;
    this.currentSession.endTime = Date.now();
    this.currentSession.isActive = false;

    // Stop logging
    if (this.logInterval) {
      clearInterval(this.logInterval);
      this.logInterval = null;
    }

    try { await this.saveSessionToDB(this.currentSession); }
    catch (error) {
      this.currentSession.isActive = true;
      this.currentSession.endTime = previousEnd;
      if (this.autoLoggingState) this.setupAutoLogging(this.autoLoggingState);
      throw error;
    }

    const session = this.currentSession;
    this.currentSession = null;

    return session;
  }

  /**
   * Add telemetry entry to current session
   */
  async addEntry(entry: Omit<TripLogEntry, 'timestamp'>): Promise<void> {
    if (!this.isRecording() || !this.currentSession) return;

    const logEntry: TripLogEntry = {
      timestamp: Date.now(),
      ...entry
    };

    this.currentSession.entries.push(logEntry);

    // Save updated session to IndexedDB
    await this.saveSessionToDB(this.currentSession);
  }

  /**
   * Setup automatic logging interval
   */
  setupAutoLogging(
    getCurrentState: () => Omit<TripLogEntry, 'timestamp'> | null
  ): void {
    this.autoLoggingState = getCurrentState;
    if (this.logInterval) {
      clearInterval(this.logInterval);
    }

    const record = async (): Promise<void> => {
      try {
        const state = getCurrentState();
        if (state) await this.addEntry(state);
      } catch (error: unknown) {
        console.error('[TRIP] Error al guardar telemetría', error);
      }
    };
    // Guardar también el punto de salida: una travesía corta no debe quedar vacía.
    void record();
    this.logInterval = setInterval(() => { void record(); }, LOGGING_INTERVAL_MS);
  }

  /**
   * Stop automatic logging
   */
  stopAutoLogging(): void {
    if (this.logInterval) {
      clearInterval(this.logInterval);
      this.logInterval = null;
    }
  }

  /**
   * Get current session data
   */
  getCurrentSession(): TripSession | null {
    return this.currentSession;
  }

  /**
   * Get all sessions for a ship
   */
  async getSessionsForShip(shipId: string, includeAutomatic = false): Promise<TripSession[]> {
    await this.ready;
    await this.writes.catch(() => undefined);
    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error('IndexedDB no disponible'));
        return;
      }

      const tx = this.db.transaction([this.storeName], 'readonly');
      const store = tx.objectStore(this.storeName);
      const request = store.getAll();

      request.onsuccess = () => {
        const sessions = (request.result as TripSession[]).filter(
          s => s.shipId === shipId && (includeAutomatic || !s.id.startsWith('automatic:'))
        );
        resolve(sessions);
      };

      request.onerror = () => {
        reject(request.error ?? new Error('No se pudieron leer las travesías'));
      };
    });
  }

  /**
   * Get a specific session by ID
   */
  async getSession(sessionId: string): Promise<TripSession | null> {
    await this.ready;
    await this.writes.catch(() => undefined);
    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error('IndexedDB no disponible'));
        return;
      }

      const tx = this.db.transaction([this.storeName], 'readonly');
      const store = tx.objectStore(this.storeName);
      const request = store.get(sessionId);

      request.onsuccess = () => {
        resolve((request.result as TripSession) || null);
      };

      request.onerror = () => {
        reject(request.error ?? new Error('No se pudo leer la travesía'));
      };
    });
  }

  /**
   * Export session as JSON
   */
  async exportSessionJSON(sessionId: string): Promise<string | null> {
    const session = await this.getSession(sessionId);
    if (!session) return null;

    return JSON.stringify(session, null, 2);
  }

  /**
   * Export session as CSV
   */
  async exportSessionCSV(sessionId: string): Promise<string | null> {
    const session = await this.getSession(sessionId);
    if (!session) return null;

    let csv = 'Timestamp,Latitude,Longitude,COG(°),SOG(kts),WindDir(°),WindSpeed(kts),Depth(m),Heading(°),Fuel(%),Water(%)\n';

    session.entries.forEach(entry => {
      const date = new Date(entry.timestamp).toISOString();
      const fmt = (value: number | null | undefined, digits: number) =>
        typeof value === 'number' && Number.isFinite(value) ? value.toFixed(digits) : '-';
      csv += `${date},${entry.lat.toFixed(6)},${entry.lng.toFixed(6)},${fmt(entry.cog, 0)},${fmt(entry.sog, 1)},${fmt(entry.windDir, 0)},${fmt(entry.windSpeed, 1)},${fmt(entry.depth, 1)},${fmt(entry.heading, 0)},${fmt(entry.fuelLevel, 0)},${fmt(entry.waterLevel, 0)}\n`;
    });

    return csv;
  }

  /**
   * Save session to IndexedDB
   */
  private async saveSessionToDB(session: TripSession): Promise<void> {
    // Serialize immutable snapshots: late writes cannot reopen a closed session.
    const snapshot = structuredClone(session);
    const write = this.writes.catch(() => undefined).then(async () => {
      await this.ready;
      if (!this.db) throw new Error('IndexedDB no disponible: la travesía no está guardada');
      const db = this.db;
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction([this.storeName], 'readwrite');
        tx.objectStore(this.storeName).put(snapshot);
        tx.oncomplete = () => resolve();
        tx.onerror = tx.onabort = () => reject(tx.error ?? new Error('Guardado local abortado'));
      });
      this.persistenceError = null;
    }).catch((error: unknown) => {
      this.persistenceError = error instanceof Error ? error.message : 'Fallo de guardado local';
      throw error;
    });
    this.writes = write;
    return write;
  }

  /**
   * Delete a session
   */
  async deleteSession(sessionId: string): Promise<void> {
    await this.ready;
    await this.writes.catch(() => undefined);
    return new Promise((resolve, reject) => {
      if (!this.db) {
        resolve();
        return;
      }

      const tx = this.db.transaction([this.storeName], 'readwrite');
      const store = tx.objectStore(this.storeName);
      const request = store.delete(sessionId);

      request.onsuccess = () => {
        resolve();
      };

      request.onerror = () => {
        console.error('Failed to delete session:', request.error);
        resolve();
      };
    });
  }

  /**
   * Calculate performance metrics from a session
   */
  static calculateMetrics(session: TripSession) {
    if (session.entries.length === 0) {
      return null;
    }

    const entries = session.entries;

    // Distance traveled (approximate using Haversine)
    let totalDistance = 0;
    for (let i = 0; i < entries.length - 1; i++) {
      totalDistance += this.haversineDistance(
        entries[i].lat,
        entries[i].lng,
        entries[i + 1].lat,
        entries[i + 1].lng
      );
    }

    // Promedios solo sobre lecturas presentes (null = sin dato, no cero).
    const isNum = (v: number | null | undefined): v is number => typeof v === 'number' && Number.isFinite(v);
    const average = (values: number[]) => values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;

    // Average speed
    const avgSOG = average(entries.map(e => e.sog).filter(isNum));

    // Average wind
    const avgWindSpeed = average(entries.map(e => e.windSpeed).filter(isNum));

    // Best VMG (Velocity Made Good in wind): solo con SOG, COG y viento medidos.
    const vmgValues = entries
      .filter(e => isNum(e.sog) && isNum(e.cog) && isNum(e.windDir))
      .map(e => {
        const angleToWind = Math.abs((e.cog as number) - (e.windDir as number));
        const vmg = (e.sog as number) * Math.cos((angleToWind * Math.PI) / 180);
        return Math.max(0, vmg);
      });
    const bestVMG = vmgValues.length ? Math.max(...vmgValues) : null;
    const avgVMG = average(vmgValues);

    // Duration
    const durationMs = (session.endTime || Date.now()) - session.startTime;
    const durationHours = durationMs / (1000 * 60 * 60);

    return {
      totalDistance: session.distanceNm ?? totalDistance,
      avgSOG,
      avgWindSpeed,
      bestVMG,
      avgVMG,
      durationHours,
      entryCount: entries.length
    };
  }

  /**
   * Haversine distance calculation (in nautical miles)
   */
  private static haversineDistance(
    lat1: number,
    lng1: number,
    lat2: number,
    lng2: number
  ): number {
    const R = 6371; // Earth's radius in km
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLng = ((lng2 - lng1) * Math.PI) / 180;

    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos((lat1 * Math.PI) / 180) *
        Math.cos((lat2 * Math.PI) / 180) *
        Math.sin(dLng / 2) *
        Math.sin(dLng / 2);

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const distance = R * c; // Distance in km
    return distance * 0.539957; // Convert to nautical miles
  }
}

// Singleton instance
let tripLoggerInstance: TripLogger | null = null;

/**
 * Get or create the TripLogger singleton
 */
export function getTripLogger(): TripLogger {
  if (!tripLoggerInstance) {
    tripLoggerInstance = new TripLogger();
  }
  return tripLoggerInstance;
}
