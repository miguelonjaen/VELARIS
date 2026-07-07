/**
 * Trip Logger (Blackbox) Utility
 * Records vessel telemetry every 5 minutes for performance analysis
 */

export interface TripLogEntry {
  timestamp: number;           // Unix timestamp in milliseconds
  lat: number;
  lng: number;
  cog: number;                 // Course over ground (0-359°)
  sog: number;                 // Speed over ground in knots
  windDir: number;             // Wind direction (0-359°)
  windSpeed: number;           // Wind speed in knots
  depth: number;               // Water depth in meters
  heading?: number;            // Magnetic heading
  fuelLevel?: number;          // Fuel percentage
  waterLevel?: number;         // Water percentage
}

export interface TripSession {
  id: string;
  shipId: string;
  startTime: number;
  endTime?: number;
  destination?: string;
  entries: TripLogEntry[];
  isActive: boolean;
}

const LOGGING_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * TripLogger class manages local logging of vessel telemetry
 * Uses IndexedDB for persistent local storage (fallback to in-memory)
 */
export class TripLogger {
  private logInterval: NodeJS.Timeout | null = null;
  private currentSession: TripSession | null = null;
  private db: IDBDatabase | null = null;
  private readonly dbName = 'VELARISTripLogs';
  private readonly storeName = 'sessions';

  constructor() {
    this.initializeDB();
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
    destination?: string
  ): Promise<TripSession> {
    const sessionId = `trip_${shipId}_${Date.now()}`;
    
    this.currentSession = {
      id: sessionId,
      shipId,
      startTime: Date.now(),
      destination,
      entries: [],
      isActive: true
    };

    // Save to IndexedDB
    await this.saveSessionToDB(this.currentSession);

    return this.currentSession;
  }

  /**
   * End the current trip session
   */
  async endSession(): Promise<TripSession | null> {
    if (!this.currentSession) return null;

    this.currentSession.endTime = Date.now();
    this.currentSession.isActive = false;

    // Stop logging
    if (this.logInterval) {
      clearInterval(this.logInterval);
      this.logInterval = null;
    }

    // Save to IndexedDB
    await this.saveSessionToDB(this.currentSession);

    const session = this.currentSession;
    this.currentSession = null;

    return session;
  }

  /**
   * Add telemetry entry to current session
   */
  async addEntry(entry: Omit<TripLogEntry, 'timestamp'>): Promise<void> {
    if (!this.currentSession) return;

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
    getCurrentState: () => Omit<TripLogEntry, 'timestamp'>
  ): void {
    if (this.logInterval) {
      clearInterval(this.logInterval);
    }

    this.logInterval = setInterval(async () => {
      const state = getCurrentState();
      await this.addEntry(state);
    }, LOGGING_INTERVAL_MS);
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
  async getSessionsForShip(shipId: string): Promise<TripSession[]> {
    return new Promise((resolve) => {
      if (!this.db) {
        resolve([]);
        return;
      }

      const tx = this.db.transaction([this.storeName], 'readonly');
      const store = tx.objectStore(this.storeName);
      const request = store.getAll();

      request.onsuccess = () => {
        const sessions = (request.result as TripSession[]).filter(
          s => s.shipId === shipId
        );
        resolve(sessions);
      };

      request.onerror = () => {
        console.error('Failed to fetch sessions:', request.error);
        resolve([]);
      };
    });
  }

  /**
   * Get a specific session by ID
   */
  async getSession(sessionId: string): Promise<TripSession | null> {
    return new Promise((resolve) => {
      if (!this.db) {
        resolve(null);
        return;
      }

      const tx = this.db.transaction([this.storeName], 'readonly');
      const store = tx.objectStore(this.storeName);
      const request = store.get(sessionId);

      request.onsuccess = () => {
        resolve((request.result as TripSession) || null);
      };

      request.onerror = () => {
        console.error('Failed to fetch session:', request.error);
        resolve(null);
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
      csv += `${date},${entry.lat.toFixed(6)},${entry.lng.toFixed(6)},${entry.cog},${entry.sog.toFixed(1)},${entry.windDir},${entry.windSpeed.toFixed(1)},${entry.depth.toFixed(1)},${entry.heading || '-'},${entry.fuelLevel || '-'},${entry.waterLevel || '-'}\n`;
    });

    return csv;
  }

  /**
   * Save session to IndexedDB
   */
  private async saveSessionToDB(session: TripSession): Promise<void> {
    return new Promise((resolve) => {
      if (!this.db) {
        console.warn('IndexedDB not available, session not persisted');
        resolve();
        return;
      }

      const tx = this.db.transaction([this.storeName], 'readwrite');
      const store = tx.objectStore(this.storeName);
      const request = store.put(session);

      request.onsuccess = () => {
        resolve();
      };

      request.onerror = () => {
        console.error('Failed to save session:', request.error);
        resolve();
      };
    });
  }

  /**
   * Delete a session
   */
  async deleteSession(sessionId: string): Promise<void> {
    return new Promise((resolve) => {
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

    // Average speed
    const avgSOG = entries.reduce((sum, e) => sum + e.sog, 0) / entries.length;

    // Average wind
    const avgWindSpeed =
      entries.reduce((sum, e) => sum + e.windSpeed, 0) / entries.length;

    // Best VMG (Velocity Made Good in wind)
    const vmgValues = entries.map(e => {
      const angleToWind = Math.abs(e.cog - e.windDir);
      const vmg = e.sog * Math.cos((angleToWind * Math.PI) / 180);
      return Math.max(0, vmg);
    });
    const bestVMG = Math.max(...vmgValues);
    const avgVMG = vmgValues.reduce((a, b) => a + b) / vmgValues.length;

    // Duration
    const durationMs = (session.endTime || Date.now()) - session.startTime;
    const durationHours = durationMs / (1000 * 60 * 60);

    return {
      totalDistance,
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
