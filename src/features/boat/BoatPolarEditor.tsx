import { useState } from 'react';
import { parseBoatPolar } from '../../core/navigation/BoatPolar';
import { loadBoatPolar, saveBoatPolar, removeBoatPolar } from './boatPolarStore';

export function BoatPolarEditor({ shipId }: { shipId: string }) {
    const [saved, setSaved] = useState(() => loadBoatPolar(shipId));
    const [text, setText] = useState(saved?.text ?? '');
    const [name, setName] = useState(saved?.name ?? '');
    const [message, setMessage] = useState('');
    const button = 'rounded-xl border border-cyan-400/30 px-4 py-2 text-xs font-bold text-cyan-200';
    const save = () => {
        try {
            saveBoatPolar(shipId, name, text); setSaved(loadBoatPolar(shipId));
            setMessage('Polar válida guardada. Las laylines requieren Vela, waypoint y viento verdadero dentro de su rango.');
        } catch (error: unknown) { setMessage(error instanceof Error ? error.message : 'No se pudo guardar la polar'); }
    };
    return <section className="col-span-full space-y-3 rounded-2xl border border-cyan-400/20 bg-black/20 p-5">
        <h3 className="text-sm font-bold text-cyan-300">Polares de vela</h3>
        <p className="text-xs text-slate-400">{saved ? `Configurada: ${saved.name || 'Polar del barco'} · ${saved.polar.windSpeeds[0]}–${saved.polar.windSpeeds.at(-1)} kn TWS` : 'Sin polar configurada: laylines y objetivos de rendimiento ocultos.'}</p>
        <p className="text-xs text-slate-400">Importe una tabla .pol, .csv o .tsv, o péguela. Cabecera TWA/TWS con velocidades de viento; primera columna TWA (0–180°); celdas con velocidad del barco. Todas las velocidades en nudos.</p>
        <input aria-label="Nombre o procedencia de la polar" value={name} onChange={event => setName(event.target.value)} placeholder="Modelo, velas o procedencia de la polar" className="w-full rounded-lg border border-white/10 bg-slate-900 p-3 text-sm text-white" />
        <input aria-label="Importar archivo de polares" type="file" accept=".pol,.csv,.tsv,.txt" className="text-xs text-slate-300" onChange={async event => {
            const file = event.target.files?.[0]; if (!file) return;
            try {
                if (file.size > 200000) throw new Error('Máximo 200 KB');
                const content = await file.text(); parseBoatPolar(content); setText(content); setName(file.name);
                setMessage('Archivo válido cargado. Pulse Guardar polar para aplicarlo.');
            } catch (error: unknown) { setMessage(error instanceof Error ? error.message : 'Archivo no válido'); }
            finally { event.target.value = ''; }
        }} />
        <textarea aria-label="Tabla de polares TWA TWS" value={text} onChange={event => setText(event.target.value)} rows={7} spellCheck={false} placeholder="Pegue aquí su tabla TWA/TWS" className="w-full rounded-lg border border-white/10 bg-slate-950 p-3 font-mono text-xs text-white" />
        <div className="flex flex-wrap gap-3">
            <button type="button" className={button} onClick={save}>Guardar polar</button>
            <button type="button" className={button} disabled={!saved} onClick={() => {
                try { removeBoatPolar(shipId); setSaved(null); setText(''); setName(''); setMessage('Polar retirada. Laylines ocultas.'); }
                catch { setMessage('No se pudo retirar la polar'); }
            }}>Quitar polar</button>
        </div>
        <p className="text-[11px] text-slate-500">Guardado local por barco en este equipo, independiente de Actualizar ficha. No se sube a Supabase. Sin extrapolar fuera del rango TWS ni corregir corriente o abatimiento.</p>
        {message && <p role="status" className="text-xs text-amber-200">{message}</p>}
    </section>;
}
