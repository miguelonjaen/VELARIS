import React, { useEffect, useState } from 'react';
interface ProviderStatus { configured: boolean; model: string; source: string; encryptionAvailable: boolean; warning: string | null }
interface Result { ok: boolean; canceled?: boolean; error?: string; status?: ProviderStatus }
interface DesktopAI { getAIStatus?: () => Promise<Result>; importAIConfiguration?: () => Promise<Result> }
export default function OpenAIConfiguration(): React.ReactElement {
  const api = (window as unknown as { GAULOSAPI?: DesktopAI }).GAULOSAPI;
  const [status, setStatus] = useState<ProviderStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  useEffect(() => {
    let mounted = true;
    api?.getAIStatus?.().then(result => { if (mounted) { setStatus(result.status ?? null); if (!result.ok) setMessage(result.error ?? 'No se pudo consultar la configuración IA.'); } }).catch(() => { if (mounted) setMessage('No se pudo consultar la configuración IA.'); });
    return () => { mounted = false; };
  }, [api]);
  const importConfiguration = async (): Promise<void> => {
    if (!api?.importAIConfiguration) return;
    setBusy(true); setMessage('');
    try {
      const result = await api.importAIConfiguration();
      if (result.status) setStatus(result.status);
      setMessage(!result.ok ? result.error ?? 'No se pudo importar.' : result.canceled ? 'Importación cancelada.' : 'Clave guardada cifrada. Ya puedes consultar desde el Terminal Táctico.');
    } catch { setMessage('No se pudo importar la configuración OpenAI.'); }
    finally { setBusy(false); }
  };
  return <section className="mb-8 rounded-3xl border border-cyan-500/30 bg-slate-950/50 p-6">
    <h3 className="font-bold text-cyan-300">Oficial IA · OpenAI</h3>
    <p className="mt-2 text-sm text-slate-300">{status ? status.configured ? `Clave configurada · Modelo ${status.model}` : 'Falta configurar la clave OpenAI en este equipo.' : 'Configuración disponible en GAULOS Desktop 1.4.3.'}</p>
    <p className="mt-2 text-xs text-slate-400">Importa el archivo .env que contiene OPENAI_API_KEY. La clave se guarda cifrada en tu perfil y se conserva al actualizar. El archivo original no se modifica. La disponibilidad y cuota se comprueban al consultar; configurar una clave no verifica la conexión.</p>
    <button type="button" onClick={() => { void importConfiguration(); }} disabled={busy || !api?.importAIConfiguration || status?.encryptionAvailable === false} className="mt-4 rounded-xl border border-cyan-500/40 bg-cyan-500/10 px-4 py-3 text-sm font-bold text-cyan-200 disabled:opacity-40">{busy ? 'Importando…' : 'Importar clave desde .env'}</button>
    {status?.warning && <p className="mt-2 text-sm text-amber-300">{status.warning}</p>}
    <p aria-live="polite" className="mt-2 text-sm text-slate-300">{message}</p>
  </section>;
}
