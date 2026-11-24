import { trialStartFeed, trialSog, trialHeading, type TrialNmeaSource } from './routeTrialFeed';
import { useCallback, useEffect, useRef, useState } from 'react';
import { app } from '../../../application';
import { RouteTrial, type TrialSnapshot } from '../../../core/voyage/RouteTrial';
import { SharedNavigationState, NAVIGATION_FIELDS, type NavigationFreshnessPolicy } from '../../../core/navigation/SharedNavigationState';
import { TripLogger } from '../../../lib/tripLogger';
import type { LogEntry } from '../../../shared/types';
import type { SimulationPosition } from '../../../core/services/SimulationService';

const LOG_KEY = 'VELARIS_route_trial_log';
function loadDraft(shipId: string | null): SimulationPosition[] {
    if (!shipId) return [];
    try {
        const value: unknown = JSON.parse(localStorage.getItem(`VELARIS_route_trial_draft:${shipId}`) ?? '[]');
        return Array.isArray(value) ? value.filter((p: unknown): p is SimulationPosition =>
            typeof p === 'object' && p !== null && 'lat' in p && typeof p.lat === 'number' && Number.isFinite(p.lat) && Math.abs(p.lat) <= 90
            && 'lng' in p && typeof p.lng === 'number' && Number.isFinite(p.lng) && Math.abs(p.lng) <= 180).slice(0, 200) : [];
    } catch { return []; }
}
export const isRouteTrialEntryId = (id: string | number): boolean => String(id).startsWith('trial:');
const policy = Object.fromEntries(NAVIGATION_FIELDS.map(field => [field, {
    BOAT: { maxAgeMs: 5000, ageFrom: 'receivedAt' }, DROID: { maxAgeMs: 5000, ageFrom: 'receivedAt' },
    SIMULATOR: { maxAgeMs: 5000, ageFrom: 'receivedAt' }
}])) as unknown as NavigationFreshnessPolicy;

export function useRouteTrial(shipId: string | null) {
    const engine = useRef(new RouteTrial());
    const speedSource = useRef<TrialNmeaSource | null>(null);
    const [steerByHeading, setSteerByHeading] = useState(true);
    const [confirmed, setConfirmed] = useState(false);
    const [, setFeedTick] = useState(0);
    const [snapshot, setSnapshot] = useState<TrialSnapshot | null>(null);
    const [draft, setDraft] = useState<SimulationPosition[]>(() => loadDraft(shipId));
    const [editing, setEditing] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [logs, setLogs] = useState<LogEntry[]>(() => {
        try {
            const stored: unknown = JSON.parse(localStorage.getItem(LOG_KEY) ?? '[]');
            return Array.isArray(stored) ? stored.filter((v: unknown): v is LogEntry =>
                typeof v === 'object' && v !== null && 'id' in v && typeof v.id === 'string' && v.id.startsWith('trial:')
                && 'fecha' in v && typeof v.fecha === 'string' && 'descripcion' in v && typeof v.descripcion === 'string') : [];
        } catch { return []; }
    });
    const logsRef = useRef(logs);
    const sessionId = useRef('');
    const recorder = useRef<TripLogger | null>(null);
    const queue = useRef<Promise<void>>(Promise.resolve());
    const lastRecorded = useRef(0);
    const previousShip = useRef(shipId);
    const recordingShip = useRef(shipId);
    const busy = snapshot !== null && ['running', 'waiting', 'paused'].includes(snapshot.status);
    const publish = useCallback(() => {
        const next = engine.current.snapshot();
        setSnapshot(next);
        const events = engine.current.drainEvents();
        if (events.length) {
            const entries: LogEntry[] = events.map(event => ({
                id: `trial:${crypto.randomUUID()}`, barco_id: recordingShip.current, user_id: '',
                fecha: `${new Date(event.at).getFullYear()}-${String(new Date(event.at).getMonth() + 1).padStart(2, '0')}-${String(new Date(event.at).getDate()).padStart(2, '0')}`, created_at: new Date(event.at).toISOString(),
                titulo: `[ENSAYO] ${event.title}`, descripcion: `${event.text} Sesión ${sessionId.current}. Solo ensayo local.`,
                categoria: 'Simulación', is_auto: true, lat: event.position.lat, lng: event.position.lng
            }));
            const combined = [...entries.reverse(), ...logsRef.current].slice(0, 1000);
            logsRef.current = combined; setLogs(combined);
            try { localStorage.setItem(LOG_KEY, JSON.stringify(combined)); }
            catch { setError('No se pudo persistir la bitácora local del ensayo'); }
        }
        const logger = recorder.current;
        if (logger && (events.length > 0 || Date.now() - lastRecorded.current >= 5000)) {
            lastRecorded.current = Date.now();
            const instruments = app.boatInstruments.snapshot(Date.now());
            queue.current = queue.current.then(() => logger.addEntry({
                lat: next.position.lat, lng: next.position.lng, cog: next.heading, sog: next.sog,
                windDir: instruments.windDirectionTrue?.value.directionDeg ?? null,
                windSpeed: instruments.windDirectionTrue?.value.speedKn ?? instruments.windTrue?.value.speedKn ?? null,
                depth: instruments.depth?.value.meters ?? null
            })).catch((cause: unknown) => setError(`Registro local: ${cause instanceof Error ? cause.message : 'error de almacenamiento'}`));
        }
        if (logger && ['finished', 'stopped'].includes(next.status)) {
            recorder.current = null;
            queue.current = queue.current.then(async () => { await logger.endSession(); }).catch(() => setError('No se pudo cerrar el track local del ensayo'));
        }
    }, [shipId]);
    const publishRef = useRef(publish); publishRef.current = publish;
    useEffect(() => {
        const timer = window.setInterval(() => {
            const now = Date.now();
            const live = app.navigationState.snapshot(now);
            const sog = trialSog(live, speedSource.current);
            setFeedTick(value => value + 1);
            const next = engine.current.tick(now, sog, trialHeading(live, speedSource.current));
            if (next && (['running', 'waiting'].includes(next.status) || next.status === 'finished' && recorder.current !== null)) publishRef.current();
        }, 1000);
        return () => window.clearInterval(timer);
    }, []);
    useEffect(() => {
        if (shipId === previousShip.current) return;
        if (snapshot) { engine.current.stop(Date.now()); publishRef.current(); }
        engine.current = new RouteTrial();
        speedSource.current = null; setConfirmed(false);
        previousShip.current = shipId; setSnapshot(null); setDraft(loadDraft(shipId)); setEditing(false);
    }, [shipId]);
    useEffect(() => () => { const logger = recorder.current; if (logger) void queue.current.then(() => logger.endSession()); }, []);

    const saveDraft = (points: SimulationPosition[]) => {
        setDraft(points);
        if (shipId) {
            try { localStorage.setItem(`VELARIS_route_trial_draft:${shipId}`, JSON.stringify(points)); }
            catch { setError('No se pudo guardar la ruta local'); }
        }
    };
    const exportTrack = () => {
        if (!snapshot) return;
        const content = JSON.stringify({ kind: 'VELARIS_ROUTE_TRIAL', session: sessionId.current,
            shipId: recordingShip.current, snapshot, waypoints: draft,
            events: logsRef.current.filter(entry => entry.descripcion.includes(`Sesión ${sessionId.current}.`)) }, null, 2);
        const url = URL.createObjectURL(new Blob([content], { type: 'application/json' }));
        const anchor = document.createElement('a'); anchor.href = url;
        anchor.download = `GAULOS-ensayo-${sessionId.current}.json`; anchor.click();
        window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    };
    const start = () => {
        if (busy) return;
        try {
            if (!shipId) throw new Error('Seleccione un barco');
            const now = Date.now(); const nav = app.navigationState.snapshot(now);
            if (!confirmed) throw new Error('Confirme que utiliza NMEA Simulator X antes de iniciar');
            const feed = trialStartFeed(nav);
            if (!feed.ready) throw new Error(feed.reason);
            const heading = trialHeading(nav, feed.source);
            if (steerByHeading && heading === null) throw new Error('Falta heading verdadero NMEA vigente del mismo origen. Active HDT en el simulador.');
            engine.current.start(feed.position, draft, feed.sog, now, steerByHeading ? heading ?? undefined : undefined);
            speedSource.current = feed.source;
            sessionId.current = crypto.randomUUID(); recordingShip.current = shipId; setError(null); setEditing(false);
            const logger = new TripLogger(); recorder.current = logger;
            queue.current = queue.current.then(async () => {
                await logger.startSession(`trial:${shipId}`, `[ENSAYO] ${sessionId.current}`);
            }).catch((cause: unknown) => setError(`Registro local: ${cause instanceof Error ? cause.message : 'error de almacenamiento'}`));
            publish();
        } catch (cause: unknown) { setError(cause instanceof Error ? cause.message : 'No se pudo iniciar el ensayo'); }
    };
    const pause = () => { engine.current.pause(Date.now()); publish(); };
    const resume = () => { engine.current.resume(Date.now()); publish(); };
    const followNmea = () => { engine.current.stop(Date.now()); if (snapshot) publish(); setSnapshot(null); engine.current = new RouteTrial(); setEditing(false); };
    const stop = () => { engine.current.stop(Date.now()); publish(); };
    const addPoint = (lat: number, lng: number) => {
        if (!editing || busy) return;
        if (draft.length >= 200) { setError('Máximo 200 waypoints por ensayo'); return; }
        saveDraft([...draft, { lat, lng }]);
    };
    const navigation = snapshot ? (() => {
        const state = new SharedNavigationState(policy);
        const base = { source: 'SIMULATOR' as const, sourceId: 'route-trial', observedAt: Date.now(), receivedAt: Date.now(), observedAtFromSource: false };
        state.update({ ...base, field: 'position', value: snapshot.position });
        state.update({ ...base, field: 'cog', value: snapshot.heading });
        state.update({ ...base, field: 'headingTrue', value: snapshot.heading });
        if (snapshot.sog !== null) state.update({ ...base, field: 'sog', value: snapshot.sog });
        return state.snapshot();
    })() : null;
    const feed = trialStartFeed(app.navigationState.snapshot(Date.now()));
    const headingIssue = steerByHeading && feed.ready && trialHeading(app.navigationState.snapshot(Date.now()), feed.source) === null ? 'Active HDT: falta heading verdadero NMEA vigente del mismo origen' : null;
    const startIssue = !shipId ? 'Seleccione un barco' : !confirmed ? 'Confirme que utiliza el simulador' : !draft.length ? 'Marque al menos un waypoint' : !feed.ready ? feed.reason : headingIssue;
    const feedStatus = feed.ready ? `${feed.source === 'SIMULATOR' ? 'Simulador visual' : 'Instrumentos NMEA declarados'} · SOG ${feed.sog.toFixed(1)} kn${feed.sog === 0 ? ' · velocidad cero: el barco virtual no avanzará' : ''}` : feed.reason;
    return { steerByHeading, setSteerByHeading, snapshot, navigation, draft, editing, busy, error, logs, confirmed, setConfirmed, startIssue, feedStatus, followNmea, start, pause, resume, stop, addPoint, exportTrack,
        setEditing, undo: () => { if (!busy) saveDraft(draft.slice(0, -1)); },
        clear: () => { if (!busy) saveDraft([]); },
        returnToGps: () => { if (!busy) { setSnapshot(null); engine.current = new RouteTrial(); } } };
}
export type RouteTrialControl = ReturnType<typeof useRouteTrial>;
