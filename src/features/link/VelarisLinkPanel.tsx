import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Smartphone, Link2, ShieldCheck, Trash2, Check, Ban, Eye, EyeOff, AlertTriangle } from 'lucide-react';
import { formatAge, setTrackVisible, useVelarisLink, velarisLinkApi } from './velarisLinkStore';
import type { LinkTrackSummary } from './velarisLinkTypes';

/** Panel «Dispositivos VELARIS Link»: activar el servidor, vincular, aceptar y gestionar dispositivos. */

const stateLabel: Record<LinkTrackSummary['state'], string> = {
  RECORDING: 'Grabando',
  PAUSED: 'En pausa',
  FINISHED: 'Finalizado',
  UNKNOWN: 'Sin metadatos'
};

export const VelarisLinkPanel: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const link = useVelarisLink();
  const api = velarisLinkApi();
  const status = link.status;
  const [now, setNow] = useState(() => Date.now());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const run = async (action: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (e) {
      setError(e instanceof Error ? e.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '') : String(e));
    } finally {
      setBusy(false);
    }
  };

  const tracks = Object.values(link.tracks).sort((a, b) => b.startedAt - a.startedAt);
  const pairingSeconds = status?.pairing ? Math.max(0, Math.round((status.pairing.expiresAt - now) / 1000)) : 0;
  const lanAddresses = status?.listening.filter((a) => a !== '127.0.0.1') ?? [];

  return (
    <div className="fixed inset-0 z-[9000] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div className="w-full max-w-3xl max-h-[90vh] overflow-y-auto bg-slate-950 border border-slate-800 rounded-3xl p-6 text-slate-100 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <Link2 className="w-6 h-6 text-fuchsia-400" />
            <h2 className="text-xl font-black uppercase tracking-tight">Dispositivos VELARIS Link</h2>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl hover:bg-slate-800" title="Cerrar"><X className="w-5 h-5" /></button>
        </div>

        {!api && (
          <p className="text-sm text-amber-400">VELARIS Link solo está disponible en la aplicación de escritorio (Electron).</p>
        )}

        {api && status && (
          <div className="space-y-6">
            <section className="rounded-2xl border border-slate-800 p-4 space-y-3">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="font-bold">Conexiones de VELARISdroid en la red local</p>
                  <p className="text-xs text-slate-400">
                    {status.running
                      ? `Escuchando en ${lanAddresses.length ? lanAddresses.join(', ') : 'ninguna red privada'} · puerto TCP ${status.port}`
                      : 'Desactivado: ningún dispositivo puede conectarse.'}
                  </p>
                </div>
                <button
                  disabled={busy}
                  onClick={() => run(() => api.setEnabled(!status.enabled))}
                  className={`px-4 py-2 rounded-xl text-xs font-black uppercase ${status.enabled ? 'bg-fuchsia-600 hover:bg-fuchsia-500' : 'bg-slate-800 hover:bg-slate-700'}`}
                >
                  {status.enabled ? 'Activado' : 'Activar'}
                </button>
              </div>
              {status.running && lanAddresses.length === 0 && (
                <p className="text-xs text-amber-400 flex gap-2"><AlertTriangle className="w-4 h-4 shrink-0" />No hay ninguna interfaz en una red privada (Wi-Fi/Ethernet). Conecta el ordenador a la Wi-Fi del barco.</p>
              )}
              {status.running && (
                <p className="text-[11px] text-slate-500">
                  Windows: la red Wi-Fi debe estar como <b>Privada</b> y el cortafuegos debe permitir VELARIS en redes privadas (TCP {status.port} entrante).
                  Anuncio automático por UDP {status.discoveryPort}. Nombre: {status.desktopName}.
                </p>
              )}
              {status.lastError && <p className="text-xs text-red-400">{status.lastError}</p>}
            </section>

            {status.running && (
              <section className="rounded-2xl border border-slate-800 p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <p className="font-bold">Vincular un teléfono</p>
                  {!status.pairing ? (
                    <button disabled={busy} onClick={() => run(() => api.startPairing())} className="px-4 py-2 rounded-xl bg-cyan-700 hover:bg-cyan-600 text-xs font-black uppercase">Vincular dispositivo</button>
                  ) : (
                    <button disabled={busy} onClick={() => run(() => api.cancelPairing())} className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-black uppercase">Cancelar</button>
                  )}
                </div>
                {status.pairing && (
                  <div className="text-center py-2">
                    <p className="text-xs text-slate-400">Introduce este código en VELARISdroid → Escritorio VELARIS</p>
                    <p className="text-5xl font-mono font-black tracking-[0.3em] text-cyan-300 my-2">{status.pairing.code}</p>
                    <p className="text-xs text-slate-500">Caduca en {pairingSeconds} s · un solo uso</p>
                  </div>
                )}
                {status.pending.map((request) => (
                  <div key={request.requestId} className="flex items-center justify-between rounded-xl bg-cyan-950/40 border border-cyan-800 p-3">
                    <div className="text-sm">
                      <p className="font-bold">¿Autorizar «{request.deviceName}»?</p>
                      <p className="text-xs text-slate-400">{request.platform} · {request.address}</p>
                    </div>
                    <div className="flex gap-2">
                      <button disabled={busy} onClick={() => run(() => api.approvePairing(request.requestId))} className="px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-xs font-black flex items-center gap-1"><Check className="w-4 h-4" />Aceptar</button>
                      <button disabled={busy} onClick={() => run(() => api.rejectPairing(request.requestId))} className="px-3 py-2 rounded-xl bg-red-700 hover:bg-red-600 text-xs font-black flex items-center gap-1"><Ban className="w-4 h-4" />Rechazar</button>
                    </div>
                  </div>
                ))}
              </section>
            )}

            <section className="rounded-2xl border border-slate-800 p-4 space-y-2">
              <p className="font-bold flex items-center gap-2"><ShieldCheck className="w-4 h-4 text-emerald-400" />Dispositivos autorizados</p>
              {status.devices.length === 0 && <p className="text-xs text-slate-500">Ninguno.</p>}
              {status.devices.map((device) => {
                const connection = status.connections.find((c) => c.deviceId === device.deviceId);
                const position = link.positions[device.deviceId];
                return (
                  <div key={device.deviceId} className="flex items-center justify-between rounded-xl bg-slate-900 p-3">
                    <div className="flex items-center gap-3">
                      <Smartphone className="w-5 h-5 text-fuchsia-400" />
                      <div className="text-sm">
                        <p className="font-bold">{device.name}</p>
                        <p className="text-xs text-slate-400">
                          {connection
                            ? connection.pending > 0
                              ? `Sincronizando · ${connection.pending} pendientes · ${connection.address}`
                              : `Conectado · ${connection.address}`
                            : device.lastSeenAt ? `Desconectado · visto ${formatAge(now - device.lastSeenAt)}` : 'Nunca conectado'}
                          {position && ` · posición recibida ${formatAge(now - position.rx)}`}
                        </p>
                      </div>
                    </div>
                    <button
                      disabled={busy}
                      onClick={() => { if (window.confirm(`¿Desvincular «${device.name}»? Tendrá que volver a emparejarse.`)) run(() => api.revokeDevice(device.deviceId)); }}
                      className="p-2 rounded-xl text-slate-400 hover:text-red-400 hover:bg-slate-800" title="Desvincular"
                    ><Trash2 className="w-4 h-4" /></button>
                  </div>
                );
              })}
            </section>

            <section className="rounded-2xl border border-slate-800 p-4 space-y-2">
              <p className="font-bold">Tracks recibidos</p>
              {tracks.length === 0 && <p className="text-xs text-slate-500">Todavía no se ha recibido ningún track.</p>}
              {tracks.map((track) => {
                const visible = link.visibleTrackIds.includes(track.trackId);
                return (
                  <div key={track.trackId} className="flex items-center justify-between rounded-xl bg-slate-900 p-3 text-sm">
                    <div>
                      <p className="font-bold">{track.name || 'Track sin nombre'} <span className="text-xs font-normal text-slate-400">· {track.deviceName}</span></p>
                      <p className="text-xs text-slate-400">
                        {stateLabel[track.state]} · {new Date(track.startedAt).toLocaleString('es-ES')} · {track.pointCount} puntos · {track.distanceNm.toFixed(2)} NM
                        {track.state === 'FINISHED' && (track.complete ? ' · completo' : ` · INCOMPLETO: faltan ${track.missing} puntos`)}
                        {track.state !== 'FINISHED' && track.missing > 0 && ` · faltan ${track.missing} por sincronizar`}
                      </p>
                    </div>
                    <button onClick={() => setTrackVisible(track.trackId, !visible)} className="p-2 rounded-xl hover:bg-slate-800" title={visible ? 'Ocultar en la carta' : 'Mostrar en la carta'}>
                      {visible ? <Eye className="w-4 h-4 text-fuchsia-400" /> : <EyeOff className="w-4 h-4 text-slate-500" />}
                    </button>
                  </div>
                );
              })}
            </section>

            <section className="rounded-2xl border border-slate-800 p-4">
              <p className="font-bold mb-2">Diagnóstico</p>
              <div className="max-h-40 overflow-y-auto font-mono text-[11px] space-y-0.5">
                {[...status.diagnostics].reverse().map((d, i) => (
                  <p key={i} className={d.level === 'error' ? 'text-red-400' : d.level === 'warn' ? 'text-amber-400' : 'text-slate-400'}>
                    {new Date(d.at).toLocaleTimeString('es-ES')} {d.message}
                  </p>
                ))}
              </div>
            </section>
          </div>
        )}

        {(error || link.error) && <p className="mt-4 text-sm text-red-400">{error ?? link.error}</p>}
      </div>
    </div>
  );
};

/** Indicador para la barra de estado: desactivado / esperando / conectado / sincronizando. */
export const VelarisLinkStatusChip: React.FC = () => {
  const link = useVelarisLink();
  const [open, setOpen] = useState(false);
  const pendingRequests = link.status?.pending.length ?? 0;
  // Una solicitud de vinculación nueva abre el panel para que se pueda aceptar o rechazar.
  useEffect(() => {
    if (pendingRequests > 0) setOpen(true);
  }, [pendingRequests]);
  if (!link.available) return null;
  const status = link.status;
  const connections = status?.connections ?? [];
  const pending = connections.reduce((sum, c) => sum + c.pending, 0);
  const awaiting = (status?.pending.length ?? 0) > 0;
  let label = 'LINK OFF';
  let dot = 'bg-slate-600';
  if (status?.running) {
    if (awaiting) { label = 'LINK: VINCULAR'; dot = 'bg-cyan-400 animate-pulse'; }
    else if (connections.length === 0) { label = 'LINK: SIN CONEXIÓN'; dot = 'bg-amber-500'; }
    else if (pending > 0) { label = `LINK: SINCRONIZANDO ${pending}`; dot = 'bg-cyan-400 animate-pulse'; }
    else { label = `LINK: CONECTADO ${connections.length}`; dot = 'bg-fuchsia-500 shadow-[0_0_8px_#d946ef]'; }
  }
  return (
    <>
      <button onClick={() => setOpen(true)} className="flex items-center gap-2 hover:opacity-80" title="Dispositivos VELARIS Link">
        <div className={`w-2 h-2 rounded-full ${dot}`} />
        <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">{label}</span>
      </button>
      {/* Portal: la barra de estado usa backdrop-filter, que confinaría un elemento fixed. */}
      {open && createPortal(<VelarisLinkPanel onClose={() => setOpen(false)} />, document.body)}
    </>
  );
};

export default VelarisLinkPanel;
