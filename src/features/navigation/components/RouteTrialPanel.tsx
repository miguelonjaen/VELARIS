import { Route } from 'lucide-react';
import { ChartPanel } from '../../layout/panels/ChartPanel';
import type { RouteTrialControl } from '../hooks/useRouteTrial';

export function RouteTrialPanel({ trial, onClose }: { trial: RouteTrialControl; onClose: () => void }) {
    const { confirmed, setConfirmed } = trial;
    const status = trial.snapshot?.status;
    const labels = { idle: 'Preparado', running: 'En marcha', waiting: 'Sin datos NMEA · en espera', paused: 'Pausado', finished: 'Completado', stopped: 'Detenido' };
    const button = 'rounded-lg border border-cyan-400/30 px-3 py-2 text-xs text-cyan-100 disabled:opacity-40';
    return <ChartPanel isOpen onClose={onClose} title="Ensayo de ruta" icon={Route} width={350} bodyClassName="max-h-[480px]">
        <div className="space-y-3 p-3 text-xs text-slate-300">
            <p className="rounded-lg bg-amber-500/10 p-2 text-amber-200">SIMULACIÓN · posición y rumbo virtuales. Sin órdenes al barco ni al simulador.</p>
            <label className="flex gap-2"><input type="checkbox" checked={trial.steerByHeading} disabled={trial.busy} onChange={event => trial.setSteerByHeading(event.target.checked)} />Gobierno por heading NMEA (HDT)</label>
            <p>{trial.steerByHeading ? 'HDT orienta y gobierna el barco virtual; SOG fija su avance. Modelo sin corriente ni abatimiento: COG virtual = HDT. El XTE se calcula respecto al tramo del ensayo. Si falta HDT o SOG, el movimiento espera.' : 'Seguimiento automático de waypoints: el rumbo virtual apunta a la ruta.'}</p>
            <p>La SOG NMEA recibida mueve el barco. Se admite Instrumentos del barco o Simulador visual; posición y velocidad deben compartir fuente. Viento, motor y demás lecturas siguen siendo los instrumentos recibidos; no se calcula una polar de vela.</p>
            <label className="flex gap-2"><input type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)} disabled={trial.busy} />Estoy usando NMEA Simulator X como origen de los instrumentos.</label>
            <div className="flex flex-wrap gap-2">
                <button className={button} disabled={trial.busy} onClick={() => trial.setEditing(!trial.editing)}>{trial.editing ? 'Terminar puntos' : 'Marcar waypoints'}</button>
                <button className={button} disabled={trial.busy || !trial.draft.length} onClick={trial.undo}>Deshacer</button>
                <button className={button} disabled={trial.busy || !trial.draft.length} onClick={trial.clear}>Limpiar</button>
            </div>
            <p>{trial.editing ? 'Pulse la carta en cada waypoint, en orden. Puede cerrar este panel mientras marca.' : `${trial.draft.length} waypoints definidos. La salida será la posición NMEA vigente al iniciar.`}</p>
            <ol className="max-h-28 overflow-y-auto font-mono text-[10px]">{trial.draft.map((point, index) => <li key={index}>WP {index + 1}: {point.lat.toFixed(5)}, {point.lng.toFixed(5)}</li>)}</ol>
            {trial.error && <p role="alert" className="text-rose-300">{trial.error}</p>}
            <p role="status" className="rounded-lg border border-slate-700 p-2">{trial.feedStatus}</p>
            {!trial.busy && trial.startIssue && <p className="text-amber-200">Para iniciar: {trial.startIssue}</p>}
            <div className="flex flex-wrap gap-2">
                <button className={button} disabled={trial.startIssue !== null || trial.busy} onClick={trial.start}>Iniciar ensayo</button>
                {trial.busy && <button className={button} onClick={status === 'paused' ? trial.resume : trial.pause}>{status === 'paused' ? 'Reanudar' : 'Pausar'}</button>}
                {trial.busy && <button className={button} onClick={trial.stop}>Detener</button>}
                {trial.snapshot && <button className={button} onClick={trial.exportTrack}>Exportar ensayo JSON</button>}
                {trial.snapshot && !trial.busy && <button className={button} onClick={trial.returnToGps}>Volver al GPS recibido</button>}
            </div>
            <p className="font-semibold text-cyan-300">{status ? labels[status] : 'Preparado'}</p>
            {trial.snapshot && <p>HDT virtual {trial.snapshot.heading.toFixed(1)}°T · XTE {trial.snapshot.metrics.xte?.distanceNm.toFixed(3) ?? '--'} NM · {trial.snapshot.metrics.xte?.side === 'right' ? 'Estribor' : trial.snapshot.metrics.xte?.side === 'left' ? 'Babor' : 'En derrota'}</p>}
            {trial.snapshot && <p>WP {trial.snapshot.waypointIndex}/{trial.snapshot.waypointCount} · {trial.snapshot.distanceNm.toFixed(2)} NM · SOG {trial.snapshot.sog?.toFixed(1) ?? '--'} kn</p>}
            <p>Track local en IndexedDB y eventos [ENSAYO] en Bitácora. El ensayo no continúa automáticamente después de cerrar la aplicación.</p>
        </div>
    </ChartPanel>;
}
