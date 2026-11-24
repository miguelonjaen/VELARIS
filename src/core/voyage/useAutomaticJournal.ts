import { useEffect, useRef, useState } from 'react';
import { app } from '../../application';
import { getTripLogger } from '../../lib/tripLogger';
import { logRepository } from '../../lib/supabaseRepository';
import type { LogEntry } from '../../shared/types';
import { AutomaticJournal } from './AutomaticJournal';

export function useAutomaticJournal(shipId: string | null, captainId: string | undefined, report: (message: string) => void): LogEntry[] {
    const [entries, setEntries] = useState<LogEntry[]>([]);
    const pendingRef = useRef(new Map<string, LogEntry>());
    const live = useRef({ report });
    live.current = { report };
    useEffect(() => {
        if (!shipId || !captainId) { setEntries([]); return; }
        const logger = getTripLogger(), detector = new AutomaticJournal(shipId, captainId);
        let stopped = false, busy = false, syncing = false, lastSync = -Infinity, revision = -1;
        const pending = pendingRef.current;
        const reached = new Set<string>();
        const offWaypoint = app.core.subscribe('WaypointReached', event => {
            const now = Date.now(), nav = app.navigationState.snapshot(now), core = app.core.getState();
            if (nav.position.status !== 'VALID' || !core.activeRoute) return;
            const index = event.payload.waypointIndex;
            const key = `${logger.getCurrentSession()?.id ?? core.activeRoute.id}:${index}`;
            if (reached.has(key)) return;
            reached.add(key);
            const e = detector.entry(nav, now, 'Waypoint alcanzado', `${core.activeRoute.waypoints[index]?.name ?? `WP ${index + 1}`} alcanzado por el detector de llegada (radio o cruce de perpendicular).`, 'Navegación', `wp:${key}`);
            pending.set(String(e.id), e);
        });
        const refresh = async () => {
            const sessions = await logger.getSessionsForShip(shipId, true);
            const logs = sessions.filter(s => s.id.startsWith('automatic:')).flatMap(s => (s.journal ?? []).map(e => e.payload as unknown as LogEntry));
            if (!stopped) setEntries(logs);
        };
        const tick = async () => {
            if (busy || stopped) return;
            busy = true;
            try {
                const now = Date.now(), nav = app.navigationState.snapshot(now);
                for (const e of detector.tick(nav, now)) pending.set(String(e.id), e);
                for (const [id, entry] of pending) {
                    await logger.appendAutomaticEntry(entry);
                    pending.delete(id);
                }
                if (revision !== logger.getAutomaticRevision()) {
                    await refresh(); revision = logger.getAutomaticRevision();
                }
                if (!syncing && now - lastSync >= 30_000) {
                    lastSync = now;
                    syncing = true;
                    // Keep the identity and original timestamp on every retry, including after restart.
                    void logger.syncJournal(shipId, async event => {
                        if (!event.payload) return;
                        const { id: _id, user_id: _user, lat: _lat, lng: _lng, time: _time, ...payload } = event.payload;
                        const { error } = await logRepository.insertEntryOnce(payload);
                        if (error) throw new Error(error.message);
                    }).catch((error: unknown) => {
                        if (!stopped) live.current.report(`Bitácora guardada localmente; copia en nube pendiente: ${error instanceof Error ? error.message : 'sin conexión'}`);
                    }).finally(() => { syncing = false; });
                }
            } catch (error: unknown) {
                if (!stopped) live.current.report(`Bitácora automática: ${error instanceof Error ? error.message : 'fallo de guardado'}. Registros pendientes conservados para reintento.`);
            } finally { busy = false; }
        };
        void tick();
        const timer = window.setInterval(() => { void tick(); }, 1000);
        return () => { stopped = true; offWaypoint(); window.clearInterval(timer); };
    }, [shipId, captainId]);
    return entries;
}
