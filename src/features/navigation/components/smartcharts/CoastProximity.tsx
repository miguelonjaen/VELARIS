import { useEffect, useMemo, useRef, useState } from 'react';
import type { FeatureCollection, LineString, MultiLineString } from 'geojson';
import type { GeoPoint } from '../../../../core/navigation/GeoPoint';
import { coastDistanceMeters, coastLevel, type CoastLine, type CoastLevel } from '../../../../core/navigation/CoastProximity';
import catalog from './mediterranean/catalog.json';

type CoastCollection = FeatureCollection<LineString | MultiLineString, { kind: string }>;
const loaders = import.meta.glob<CoastCollection>('./mediterranean/sector-*.json', { import: 'default' });
const sectors = catalog.sectors.filter(sector => !sector.simplified);
const SETTINGS = 'VELARIS_coast_notice_settings';
const LOG = 'VELARIS_coast_notice_log';
function settings(): { enabled: boolean; threshold: number } {
    try {
        const value: unknown = JSON.parse(localStorage.getItem(SETTINGS) ?? 'null');
        if (value && typeof value === 'object' && 'enabled' in value && typeof value.enabled === 'boolean'
            && 'threshold' in value && typeof value.threshold === 'number' && value.threshold >= 50 && value.threshold <= 2000)
            return { enabled: value.enabled, threshold: value.threshold };
    } catch { /* Almacenamiento no disponible: valores visibles predeterminados. */ }
    return { enabled: true, threshold: 500 };
}
interface RecorderControl {
    state: 'idle' | 'recording' | 'paused' | 'pending';
    disabled: boolean;
    onStart: () => Promise<void>;
    onPause: () => Promise<void>;
    onResume: () => Promise<void>;
    onEnd: () => Promise<void>;
    onRecover: () => Promise<void>;
    onClosePending: () => Promise<void>;
}
export default function CoastProximity({ position, simulated, recorder }: { position: GeoPoint | null; simulated: boolean; recorder?: RecorderControl }) {
    const [recMenu, setRecMenu] = useState(false);
    const [recBusy, setRecBusy] = useState(false);
    const recLock = useRef(false);
    const [recError, setRecError] = useState<string | null>(null);
    const runRecording = async (action: () => Promise<void>): Promise<void> => {
        if (recLock.current) return;
        recLock.current = true; setRecBusy(true); setRecError(null);
        try { await action(); setRecMenu(false); }
        catch (error: unknown) { setRecError(error instanceof Error ? error.message : 'No se pudo guardar la grabación'); }
        finally { recLock.current = false; setRecBusy(false); }
    };
    const [config, setConfig] = useState(settings);
    const [expanded, setExpanded] = useState(false);
    const [sound, setSound] = useState(false);
    const audio = useRef<AudioContext | null>(null);
    const [audioError, setAudioError] = useState(false);
    const previous = useRef<{ mode: boolean; level: CoastLevel }>({ mode: simulated, level: 'clear' });
    const [level, setLevel] = useState<CoastLevel>('clear');
    const [storageError, setStorageError] = useState(false);
    const [data, setData] = useState<{ key: string; lines: CoastLine[]; failed: boolean }>({ key: '', lines: [], failed: false });
    // Se selecciona por posición del barco, independiente del encuadre y capas visibles.
    const selection = useMemo(() => {
        if (!position || Math.abs(position.lat) > 80) return [];
        const dy = (config.threshold + 500) / 111000, dx = dy / Math.cos(position.lat * Math.PI / 180);
        return sectors.filter(s => s.bbox[0] <= position.lng - dx && s.bbox[2] >= position.lng + dx
            && s.bbox[1] <= position.lat - dy && s.bbox[3] >= position.lat + dy);
    }, [position?.lat, position?.lng, config.threshold]);
    const key = selection.map(s => s.id).sort().join(':');
    useEffect(() => {
        let cancelled = false;
        if (!config.enabled || !key) return;
        const requested = sectors.filter(s => key.split(':').includes(s.id));
        Promise.all(requested.flatMap(s => s.resources).map(async filename => {
            const loader = loaders['./mediterranean/' + filename];
            if (!loader) throw new Error('Costa local no disponible');
            return loader();
        })).then(parts => {
            const lines: CoastLine[] = [];
            for (const part of parts) for (const feature of part.features) {
                if (feature.properties?.kind !== 'coastline') continue;
                if (feature.geometry.type === 'LineString') lines.push(feature.geometry.coordinates as [number, number][]);
                else if (feature.geometry.type === 'MultiLineString') lines.push(...feature.geometry.coordinates as [number, number][][]);
            }
            if (!cancelled) setData({ key, lines, failed: !lines.length });
        }).catch(() => { if (!cancelled) setData({ key, lines: [], failed: true }); });
        return () => { cancelled = true; };
    }, [key, config.enabled]);
    const distance = useMemo(() => config.enabled && position && key && data.key === key && !data.failed
        ? coastDistanceMeters(position, data.lines) : null, [position?.lat, position?.lng, key, data, config.enabled]);
    useEffect(() => {
        const old = previous.current;
        const next = distance === null ? 'clear' : coastLevel(distance, config.threshold, old.mode === simulated ? old.level : 'clear');
        setLevel(next);
        if (next !== old.level || simulated !== old.mode) {
            const entry = { timestamp: Date.now(), simulated, state: distance === null ? 'unavailable' : next, distanceMeters: distance,
                thresholdMeters: config.threshold, source: 'OSM/Geofabrik · experimental', position };
            try {
                const raw: unknown = JSON.parse(localStorage.getItem(LOG) ?? '[]');
                localStorage.setItem(LOG, JSON.stringify([entry, ...(Array.isArray(raw) ? raw.slice(0, 199) : [])]));
            } catch { setStorageError(true); }
            if (next !== 'clear' && sound && audio.current?.state === 'running') {
                const oscillator = audio.current.createOscillator(), gain = audio.current.createGain();
                oscillator.connect(gain); gain.connect(audio.current.destination);
                oscillator.frequency.value = next === 'critical' ? 880 : 660;
                gain.gain.setValueAtTime(0.12, audio.current.currentTime);
                gain.gain.exponentialRampToValueAtTime(0.001, audio.current.currentTime + 0.6);
                oscillator.start(); oscillator.stop(audio.current.currentTime + 0.6);
            }
        }
        previous.current = { mode: simulated, level: next };
    }, [distance, simulated, config.threshold, sound, position?.lat, position?.lng]);
    useEffect(() => () => { void audio.current?.close(); }, []);
    const changeConfig = (next: typeof config) => {
        setConfig(next);
        try { localStorage.setItem(SETTINGS, JSON.stringify(next)); } catch { setStorageError(true); }
    };
    const status = !config.enabled ? 'Desactivado' : !position ? 'Sin posición vigente'
        : !key ? 'Sin cobertura local suficiente' : data.key !== key ? 'Cargando costa…' : distance === null ? 'Costa no disponible'
        : (level === 'critical' ? 'MUY CERCA · ' : level === 'warning' ? 'PROXIMIDAD · ' : '') + (distance / 1852).toFixed(2) + ' NM a costa OSM';
    return <><div style={{ position: 'fixed', right: 108, bottom: 64, zIndex: 1100,
        maxWidth: 290, background: '#0b1724', color: level === 'clear' || distance === null ? '#cbd5e1' : '#fbbf24',
        border: '1px solid ' + (level === 'critical' && distance !== null ? '#ef4444' : '#334155'), borderRadius: 10, padding: 10, fontSize: 12 }}
        onClick={event => event.stopPropagation()} onDoubleClick={event => event.stopPropagation()} onWheel={event => event.stopPropagation()}
        onMouseDown={event => event.stopPropagation()} onPointerDown={event => event.stopPropagation()}>
        <button type="button" onClick={() => setExpanded(!expanded)} aria-expanded={expanded}>COSTA {simulated ? '· SIMULACIÓN' : ''} · ⚙</button>
        <div role={level !== 'clear' && distance !== null ? 'alert' : 'status'}>{status}</div>
        {expanded && <div style={{ display: 'grid', gap: 8, marginTop: 8 }}>
            <label><input type="checkbox" checked={config.enabled} onChange={e => changeConfig({ ...config, enabled: e.target.checked })} /> Aviso de proximidad</label>
            <label>Umbral <select value={config.threshold} onChange={e => changeConfig({ ...config, threshold: Number(e.target.value) })}>
                {[50,100,250,500,1000,2000].map(value => <option key={value} value={value}>{(value / 1852).toFixed(3)} NM</option>)}</select></label>
            <button type="button" onClick={async () => {
                if (sound) { setSound(false); return; }
                try {
                    audio.current ??= new AudioContext(); await audio.current.resume();
                    const running = audio.current.state === 'running';
                    setSound(running); setAudioError(!running);
                    if (running) {
                        const tone = audio.current.createOscillator(), gain = audio.current.createGain();
                        tone.connect(gain); gain.connect(audio.current.destination);
                        gain.gain.setValueAtTime(0.08, audio.current.currentTime);
                        gain.gain.exponentialRampToValueAtTime(0.001, audio.current.currentTime + 0.3);
                        tone.start(); tone.stop(audio.current.currentTime + 0.3);
                    }
                } catch { setSound(false); setAudioError(true); }
            }}>{sound ? 'Silenciar sonido' : 'Activar sonido'}</button>
            {audioError && <small role="alert">Audio no disponible; el aviso visual sigue activo.</small>}
            <button type="button" onClick={() => {
                try {
                    const blob = new Blob([localStorage.getItem(LOG) ?? '[]'], { type: 'application/json' });
                    const url = URL.createObjectURL(blob), link = document.createElement('a');
                    link.href = url; link.download = 'gaulos-avisos-costa.json'; link.click();
                    setTimeout(() => URL.revokeObjectURL(url), 1000);
                } catch { setStorageError(true); }
            }}>Exportar registro local</button>
            <small>OSM/Geofabrik · experimental. Distancia a línea de costa, no detección de tierra ni bajos. No sustituye carta náutica ni sonda. Registro local (200 eventos); no se envía a Supabase.</small>
            {storageError && <small role="alert">No se pudo guardar configuración o registro local.</small>}
        </div>}
    </div>
        {recorder && <div style={{ position: 'fixed', right: 12, bottom: 64, zIndex: 1101 }}
            onClick={event => event.stopPropagation()} onDoubleClick={event => event.stopPropagation()}
            onPointerDown={event => event.stopPropagation()} onMouseDown={event => event.stopPropagation()} onWheel={event => event.stopPropagation()}>
            <button type="button" disabled={recBusy || recorder.disabled} aria-expanded={recorder.state === 'idle' ? undefined : recMenu}
                aria-label={recorder.state === 'idle' ? 'Iniciar grabación de travesía libre' : 'Opciones de grabación de travesía'}
                onClick={() => { if (recorder.state === 'idle') void runRecording(recorder.onStart); else setRecMenu(value => !value); }}
                style={{ minHeight: 44, width: 80, padding: '8px 12px', borderRadius: 8, fontWeight: 700,
                    border: '1px solid #f87171', boxShadow: '0 4px 16px #0008',
                    background: recorder.state === 'paused' ? '#7f1d1d' : '#b91c1c', color: '#f8fafc', opacity: recBusy || recorder.disabled ? 0.5 : 1 }}>
                {recBusy ? 'Guardando…' : recorder.state === 'idle' ? '● REC' : recorder.state === 'recording' ? '● REC ▾' : recorder.state === 'paused' ? 'Ⅱ REC ▾' : 'REC ▾'}
            </button>
            {recMenu && recorder.state !== 'idle' && <div aria-label="Controles de grabación" style={{ position: 'absolute', right: 0, bottom: 'calc(100% + 8px)', display: 'grid', gap: 8, width: 230, padding: 10, borderRadius: 10, border: '1px solid #475569', background: '#0b1724', color: '#f8fafc', boxShadow: '0 4px 16px #0008' }}>
                <strong>{recorder.state === 'pending' ? 'Sesión pendiente · sin grabar' : recorder.state === 'paused' ? 'Grabación pausada' : 'Grabando travesía'}</strong>
                <button type="button" disabled={recBusy} style={{ minHeight: 44, border: '1px solid #64748b', borderRadius: 6 }}
                    onClick={() => void runRecording(recorder.state === 'pending' ? recorder.onRecover : recorder.state === 'paused' ? recorder.onResume : recorder.onPause)}>
                    {recorder.state === 'recording' ? 'Ⅱ Pausar grabación' : '● Reanudar grabación'}
                </button>
                <button type="button" disabled={recBusy} style={{ minHeight: 44, border: '1px solid #f87171', borderRadius: 6, color: '#fecaca' }}
                    onClick={() => void runRecording(recorder.state === 'pending' ? recorder.onClosePending : recorder.onEnd)}>
                    {recorder.state === 'pending' ? '■ Finalizar sin reanudar' : '■ Terminar travesía'}
                </button>
            </div>}
            {recError && <small role="alert" style={{ position: 'absolute', right: 0, top: 'calc(100% + 4px)', width: 230, padding: 8, background: '#0b1724', color: '#fca5a5' }}>{recError}</small>}
        </div>}
    </>;
}
