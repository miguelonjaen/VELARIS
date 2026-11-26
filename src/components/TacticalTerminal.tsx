import React, { useRef, useEffect, useState } from 'react';
import { Terminal, History, ChevronDown } from 'lucide-react';
import { motion } from 'motion/react';
import { cn } from '@lib/utils';
import type { SituationMonitorSnapshot } from '../features/copilot/vesselSituationService';
import type { WatchProfile } from '../features/copilot/watchProfileEngine';

interface Message {
  role: 'user' | 'ai';
  text: string;
  id?: string;
}

interface TacticalTerminalProps {
  messages: Message[];
  onClearHistory: () => void;
  onRequestBriefing: () => void;
  onOpenInventory: () => void;
  onOpenMaintenance: () => void;
  situation: SituationMonitorSnapshot | null;
  onAcknowledgeAlert: (alertId: string) => void;
  onWatchProfileChange: (profile: WatchProfile | null) => void;
  watchProfileOverride: WatchProfile | null;
  isIntMin: boolean;
  setIsIntMin: (val: boolean) => void;
}

export const TacticalTerminal: React.FC<TacticalTerminalProps> = ({
  messages,
  onClearHistory,
  onRequestBriefing,
  onOpenInventory,
  onOpenMaintenance,
  situation,
  onAcknowledgeAlert,
  onWatchProfileChange,
  watchProfileOverride,
  isIntMin,
  setIsIntMin
}) => {
  const terminalRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [isAutoScrollEnabled, setIsAutoScrollEnabled] = useState(true);
  const prevMessagesLength = useRef(0);

  const handleScroll = () => {
    if (!terminalRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = terminalRef.current;
    // Si el usuario sube manualmente, desactivamos el auto-scroll
    const isAtBottom = scrollHeight - scrollTop - clientHeight < 30;
    setIsAutoScrollEnabled(isAtBottom);
  };

  useEffect(() => {
    if (messages.length > prevMessagesLength.current) {
      if (isAutoScrollEnabled && messagesEndRef.current) {
        messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
      }
    }
    prevMessagesLength.current = messages.length;
  }, [messages, isAutoScrollEnabled]);

  return (
    <div
      className={cn(
        "absolute z-(--vl-z-chart-widget) overflow-hidden shadow-[0_0_30px_rgba(0,0,0,0.5)] flex flex-col min-h-0 border border-cyan-500/30",
        isIntMin
          ? "h-8 w-[var(--vl-weather-w)] rounded-full bg-[#050607]/90 backdrop-blur-md border-cyan-500/20"
          : "w-[var(--vl-weather-w)] max-w-[calc(100%_-_var(--vl-dock-reserve)_-_var(--vl-gap))] rounded-2xl bg-[#0a0f18]/95 backdrop-blur-xl"
      )}
      style={
        isIntMin
          // Minimizado: justo encima de la línea de comandos, en la esquina inferior izquierda.
          ? { left: 'var(--vl-gap)', bottom: 'calc(var(--vl-gap) * 2 + 36px)' }
          // Desplegado: columna izquierda, debajo del panel meteorológico; nunca lo tapa.
          : { left: 'var(--vl-gap)', top: 'calc(var(--vl-content-top) + 222px)', bottom: 'calc(var(--vl-gap) * 2 + 36px)' }
      }
    >
      <div
        className={cn(
  "flex items-center cursor-pointer select-none",
  isIntMin
    ? "h-full px-4 justify-start gap-3"
    : "px-4 py-3 bg-white/5 border-b border-white/5 justify-between"
)}
        onClick={() => setIsIntMin(!isIntMin)}
      >
        <div className="flex items-center gap-2.5 overflow-hidden">
          <div className={cn(
            "w-2 h-2 rounded-full bg-cyan-400 shadow-[0_0_8px_rgba(34,211,238,0.6)]",
            isIntMin && "animate-pulse"
          )} />
          {isIntMin ? (
            <span className="text-[9px] font-black text-cyan-400 tracking-[0.1em] uppercase">
              &gt; IA · {situation?.capability ?? 'SIN DATOS'} · {situation?.activeAnomalies ?? 0} AVISOS
            </span>
          ) : (
            <span className="text-[10px] font-black text-cyan-400 uppercase tracking-widest">TERMINAL TÁCTICO IA</span>
          )}
        </div>

        {!isIntMin && (
          <div className="flex gap-2">
            <button
              className="text-slate-500 hover:text-white transition-colors"
              onClick={(e) => {
                e.stopPropagation();
                onClearHistory();
              }}
              title="Borrar historial"
            >
              <History size={14} />
            </button>
            <button className="text-slate-500 hover:text-white transition-colors" onClick={(e) => { e.stopPropagation(); setIsIntMin(!isIntMin); }}>
              <motion.div animate={{ rotate: 180 }} transition={{ duration: 0.3 }}>
                <ChevronDown size={14} />
              </motion.div>
            </button>
          </div>
        )}
      </div>
      {!isIntMin && (
        <>
          <div className="border-b border-white/5 bg-slate-950/70 px-3 py-2 text-[9px] uppercase tracking-wide text-slate-300" aria-label="Situación operativa del buque">
            <div className="flex items-center justify-between gap-2">
              <span className={cn("font-black", situation?.capability === 'OPERATIVE' ? 'text-emerald-400' : situation?.capability === 'LIMITED' ? 'text-amber-300' : 'text-slate-400')}>
                {situation?.capability === 'OPERATIVE' ? 'OPERATIVO' : situation?.capability === 'LIMITED' ? 'CAPACIDAD LIMITADA' : 'SIN DATOS SUFICIENTES'}
              </span>
              <span>{situation ? `${Math.round(Math.min(situation.situation.confidence, situation.propulsion.confidence, situation.context.confidence) * 100)}% confianza` : '—'}</span>
            </div>
            <div className="mt-1 grid grid-cols-3 gap-1 text-[8px] text-slate-400">
              <span>Situación<br/><strong className="text-slate-200">{situation?.situation.value ?? 'UNKNOWN'}</strong></span>
              <span>Propulsión<br/><strong className="text-slate-200">{situation?.propulsion.value ?? 'UNKNOWN'}</strong></span>
              <span>Contexto<br/><strong className="text-slate-200">{situation?.context.value ?? 'NORMAL'}</strong></span>
            </div>
            {situation && (
              <div className="mt-1 rounded border border-white/10 bg-white/5 p-1 normal-case tracking-normal">
                <div className="flex items-center justify-between gap-2">
                  <span><strong className="text-cyan-300">Guardia: {situation.watchProfile.profile}</strong> · {situation.watchProfile.source === 'DECLARED' ? 'declarada' : 'automática'}</span>
                  {situation.watchProfile.modifiers.includes('SIMULATION') && <span className="rounded bg-violet-500/20 px-1 font-black text-violet-300">SIMULACIÓN</span>}
                </div>
                <p className="mt-0.5 text-slate-400">{situation.watchProfile.priorities.join(' · ')}</p>
                {situation.watchProfile.modifiers.length > 0 && <p className="mt-0.5 text-amber-200">{situation.watchProfile.modifiers.join(' · ')}</p>}
                <label className="mt-1 flex items-center justify-between gap-2 text-slate-400">Perfil
                  <select className="min-h-8 rounded border border-slate-600 bg-slate-950 px-1 text-[9px] text-slate-200"
                    value={watchProfileOverride ?? ''}
                    onChange={event => onWatchProfileChange(event.target.value ? event.target.value as WatchProfile : null)}>
                    <option value="">Automático</option>
                    {(['PORT','PRE_DEPARTURE','ENGINE_NAVIGATION','SAIL_NAVIGATION','MOTOR_SAILING','ANCHOR_WATCH','PORT_APPROACH','EMERGENCY','UNKNOWN'] as WatchProfile[]).map(profile => <option key={profile} value={profile}>{profile}</option>)}
                  </select>
                </label>
                {watchProfileOverride && situation.watchProfile.profile !== watchProfileOverride && <p className="mt-0.5 text-red-300">El perfil crítico automático prevalece sobre {watchProfileOverride}.</p>}
              </div>
            )}
            {situation && situation.activeAnomalies > 0 && (
              <details className="mt-1 normal-case tracking-normal">
                <summary className="cursor-pointer text-amber-300">{situation.activeAnomalies} anomalía(s) activa(s)</summary>
                <div className="mt-1 max-h-24 space-y-1 overflow-y-auto">
                  {situation.alerts.filter(alert => alert.status !== 'resolved').slice(0, 6).map(alert => (
                    <div key={alert.id} className="flex items-start justify-between gap-2 rounded bg-white/5 p-1">
                      <span><strong>{alert.priority}</strong> · {alert.message}</span>
                      {alert.status === 'active' && <button type="button" className="text-cyan-300" onClick={() => onAcknowledgeAlert(alert.id)}>Reconocer</button>}
                    </div>
                  ))}
                </div>
              </details>
            )}
          </div>
          <div className="flex flex-wrap gap-1.5 border-b border-white/5 bg-black/20 px-3 py-2">
            <button type="button" onClick={onRequestBriefing} className="min-h-8 rounded-md border border-cyan-500/30 px-2 text-[9px] font-black uppercase tracking-wider text-cyan-300 hover:bg-cyan-500/10">Actualizar informe</button>
            <button type="button" onClick={onOpenInventory} className="min-h-8 rounded-md border border-slate-600 px-2 text-[9px] font-bold uppercase text-slate-300 hover:bg-white/5">Inventario</button>
            <button type="button" onClick={onOpenMaintenance} className="min-h-8 rounded-md border border-slate-600 px-2 text-[9px] font-bold uppercase text-slate-300 hover:bg-white/5">Mantenimiento</button>
          </div>
          <div ref={terminalRef} onScroll={handleScroll} className="flex-1 min-h-0 overflow-y-auto p-4 space-y-4 custom-scrollbar bg-black/20">
            {messages.map((msg, idx) => (
              <div key={msg.id ?? idx} className={cn("whitespace-pre-line text-xs font-mono break-words p-2 rounded-lg", msg.role === 'ai' ? "text-emerald-400 bg-emerald-500/5" : "text-cyan-400 bg-cyan-500/5 border-l border-cyan-500/30")}>
                {msg.role === 'ai' ? `IA_OFFICER: ${msg.text}` : `> ${msg.text}`}
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>
        </>
      )}
    </div>
  );
};
