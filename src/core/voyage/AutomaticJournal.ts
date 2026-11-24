import type { ResolvedNavigationState, ResolvedNavigationField } from '../navigation/SharedNavigationState';
import { accumulateVoyageDistance, type VoyageDistanceState } from './VoyageDistance';
import { courseDelta } from './VoyageMonitor';
import type { LogEntry } from '../../shared/types';

const valid = <T>(f: { status: string; value: T | null }): T | null => f.status === 'VALID' ? f.value : null;
const identity = (f: ResolvedNavigationField): string => `${f.source}:${f.sourceId}`;
type Course = { reference: number; identity: string; since: number | null; direction: number; lastAt: number; lastEvent: number };

/** Independent of track/trip lifecycle. Input must be a freshly resolved shared snapshot. */
export class AutomaticJournal {
    private lastPeriodic: number | null = null;
    private source: string | undefined;
    private hadGps = false;
    private lost = false;
    private distance: VoyageDistanceState = { totalNm: 0, anchor: null };
    private courses = new Map<string, Course>();

    constructor(private readonly shipId: string, private readonly captainId: string) {}

    entry(nav: ResolvedNavigationState, now: number, title: string, text: string, category = 'Navegación', key: string = crypto.randomUUID()): LogEntry {
        const p = valid(nav.position), sog = valid(nav.sog), cog = valid(nav.cog);
        const d = new Date(now);
        const provenance = ['position', 'sog', 'cog', 'headingTrue', 'headingMagnetic'].map(name => {
            const f = nav[name as keyof ResolvedNavigationState];
            return `${name}=${f.status === 'VALID' ? `${identity(f)} @${f.observedAt}` : 'sin dato'}`;
        }).join('; ');
        return {
            id: `auto:${key}`, barco_id: this.shipId, user_id: this.captainId, capitan_id: this.captainId,
            fecha: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`,
            created_at: d.toISOString(), time: d.toLocaleTimeString('es-ES'),
            titulo: `${Object.values(nav).some(f => f.status === 'VALID' && f.source === 'SIMULATOR') ? '[SIMULACIÓN] ' : ''}${title}`,
            descripcion: `${text} Hora ${d.toISOString()}. Posición ${p ? `${p.lat.toFixed(6)}, ${p.lng.toFixed(6)}` : 'no disponible'}. SOG ${sog ?? 'sin dato'} kn; COG ${cog ?? 'sin dato'}°. Distancia GPS real acumulada ${this.distance.totalNm.toFixed(3)} NM (desde apertura del registrador). ${provenance}`,
            categoria: category, is_auto: true, distancia_total: this.distance.totalNm,
            ...(p ? { lat: p.lat, lng: p.lng, latitud: p.lat, longitud: p.lng } : {}),
            ...(sog !== null ? { velocidad_gps: sog } : {}), ...(cog !== null ? { rumbo: cog } : {})
        };
    }

    tick(nav: ResolvedNavigationState, now: number): LogEntry[] {
        const entries: LogEntry[] = [];
        const position = valid(nav.position);
        this.distance = accumulateVoyageDistance(this.distance, nav.position);
        const source = position ? identity(nav.position) : 'UNKNOWN';
        if (this.source !== undefined && source !== this.source) {
            entries.push(this.entry(nav, now, 'Cambio de fuente GPS', `${this.source} → ${source}.`));
            this.courses.clear();
        }
        this.source = source;
        if (!position && this.hadGps && !this.lost) {
            this.lost = true;
            entries.push(this.entry(nav, now, 'Pérdida de GPS', 'Sin posición vigente; no se reutiliza el último fix.', 'Seguridad'));
        }
        if (position && this.lost) {
            this.lost = false;
            entries.push(this.entry(nav, now, 'GPS recuperado', 'Posición vigente disponible.'));
        }
        if (position) {
            this.hadGps = true;
            this.lastPeriodic ??= now;
            if (valid(nav.sog) !== null && valid(nav.cog) !== null && now - this.lastPeriodic >= 300_000) {
                entries.push(this.entry(nav, now, 'Situación periódica', 'Asiento automático cada 5 minutos con datos válidos.'));
                this.lastPeriodic = now;
            }
        } else this.courses.clear();

        for (const field of ['cog', 'headingTrue', 'headingMagnetic'] as const) {
            const f = nav[field], angle = valid(f), speed = valid(nav.sog);
            // COG at low speed is not a reliable course; HDG remains a separate reference.
            if (!position || angle === null || (field === 'cog' && (speed === null || speed < 1))) {
                this.courses.delete(field); continue;
            }
            const id = `${source}/${identity(f)}/${field === 'cog' ? identity(nav.sog) : ''}`;
            const at = f.receivedAt;
            if (at === null) continue;
            let state = this.courses.get(field);
            if (!state || state.identity !== id || at - state.lastAt > 5000) {
                state = { reference: angle, identity: id, since: null, direction: 0, lastAt: at, lastEvent: -Infinity };
                this.courses.set(field, state); continue;
            }
            if (at <= state.lastAt) continue; // repeated snapshots cannot sustain a manoeuvre
            state.lastAt = at;
            const delta = courseDelta(state.reference, angle), direction = Math.sign(delta);
            if (Math.abs(delta) < 30) { state.since = null; state.direction = 0; continue; }
            if (state.direction !== direction) { state.since = at; state.direction = direction; }
            state.since ??= at;
            if (at - state.since >= 30_000 && now - state.lastEvent >= 60_000) {
                const label = field === 'cog' ? 'COG' : field === 'headingTrue' ? 'HDG verdadero' : 'HDG magnético';
                entries.push(this.entry(nav, now, `Cambio de rumbo ${label}`, `${state.reference.toFixed(1)}° → ${angle.toFixed(1)}°; Δ ${delta.toFixed(1)}°, sostenido 30 s.`));
                state.reference = angle; state.since = null; state.lastEvent = now;
            }
        }
        return entries;
    }
}
