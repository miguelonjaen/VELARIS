import React from 'react';
import { motion } from 'motion/react';
import { ShieldCheck, AlertTriangle, Info, BellOff, Bell, Zap, Activity, Trash2, Droplets, Thermometer, Fuel, Waves } from 'lucide-react';
import { VELARISAlarm, SecurityThresholds, AlarmSeverity } from '../shared/types';
import { cn } from '../lib/utils';

interface WatchdogPanelProps {
  alarms: VELARISAlarm[];
  alarmHistory: any[];
  thresholds: SecurityThresholds;
  onRemoveAlarm: (id: string) => void;
  onAddAlarm: (type: VELARISAlarm['type'], severity: AlarmSeverity, message: string, value: number) => void;
  isMuted: boolean;
  onMuteToggle: () => void;
}

export const WatchdogPanel: React.FC<WatchdogPanelProps> = ({ 
  alarms, 
  alarmHistory,
  thresholds, 
  onRemoveAlarm, 
  onAddAlarm,
  isMuted,
  onMuteToggle
}) => {
  const testSensors = [
    { label: 'Test Depth', type: 'depth' as const, msg: 'SIMULACRO: Profundidad Crítica 1.8m', value: 1.8, severity: 'critical' as const },
    { label: 'Test Engine', type: 'engine_temp' as const, msg: 'SIMULACRO: Temp Motor 105°C', value: 105, severity: 'critical' as const },
    { label: 'Test Fuel', type: 'fuel' as const, msg: 'SIMULACRO: Reserva Fuel 4%', value: 4, severity: 'critical' as const },
    { label: 'Test AIS', type: 'ais_collision' as const, msg: 'SIMULACRO: CPA Crítico 0.08 NM', value: 0.08, severity: 'critical' as const },
  ];

  const getAlarmIcon = (type: string) => {
    switch (type) {
      case 'depth': return <Activity size={14} />;
      case 'engine_temp': return <Zap size={14} />;
      case 'fuel': return <Droplets size={14} />;
      case 'ais_collision': return <AlertTriangle size={14} />;
      default: return <Info size={14} />;
    }
  };

  return (
    <div className="h-full w-full p-6 flex flex-col gap-6 overflow-y-auto custom-scrollbar pb-24">
      {/* Header ... */}
      <div className="bg-slate-900/40 border border-white/5 rounded-[40px] p-8 backdrop-blur-xl flex flex-col md:flex-row justify-between items-center gap-6">
        {/* ... existing header logic ... */}
        <div className="flex items-center gap-4">
          <div className="p-4 bg-emerald-500/20 rounded-3xl border border-emerald-500/50">
            <ShieldCheck className="text-emerald-400" size={32} />
          </div>
          <div>
            <h2 className="text-4xl font-black text-white tracking-tight uppercase">VELARIS Shield</h2>
            <p className="text-slate-400 font-mono text-sm uppercase tracking-widest">Protocolo de Seguridad Watchdog v2.4</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button 
            onClick={onMuteToggle}
            className={`px-6 py-3 rounded-2xl border flex items-center gap-2 transition-all font-black uppercase text-xs tracking-widest ${
              isMuted 
                ? 'bg-slate-800 border-slate-700 text-slate-400' 
                : 'bg-emerald-600 border-emerald-400 text-white shadow-lg shadow-emerald-900/40'
            }`}
          >
            {isMuted ? <BellOff size={18} /> : <Bell size={18} />}
            {isMuted ? 'Muted' : 'Audible'}
          </button>
          
          <div className="px-6 py-3 bg-slate-950/60 rounded-2xl border border-slate-800 flex items-center gap-2">
            <Activity className="text-cyan-400 animate-pulse" size={18} />
            <span className="text-xs font-black text-cyan-400 uppercase tracking-widest">Safe Ops Active</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Active Alarms List */}
        <div className="lg:col-span-2 bg-slate-950/40 border border-white/5 rounded-[40px] p-8 backdrop-blur-xl flex flex-col min-h-[400px]">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-xl font-black text-white flex items-center gap-2">
              <Zap className="text-amber-400" size={20} />
              Alertas Activas (Kernel)
            </h3>
            {alarms.length > 0 && (
              <span className="px-3 py-1 bg-red-500/20 text-red-400 text-[10px] font-black rounded-lg border border-red-500/50 animate-pulse">
                {alarms.length} DETECTADAS
              </span>
            )}
          </div>

          <div className="flex-1 space-y-4">
            {alarms.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center opacity-30 py-20">
                <ShieldCheck size={64} className="mb-4" />
                <p className="text-lg font-black uppercase tracking-widest text-center">Navegación Segura<br/><span className="text-xs font-mono">Sin amenazas inminentes</span></p>
              </div>
            ) : (
              alarms.map(alarm => (
                <motion.div 
                  key={alarm.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={`p-5 rounded-3xl border flex items-center justify-between gap-4 transition-all relative overflow-hidden ${
                    alarm.severity === 'critical' 
                      ? 'bg-red-950/40 border-red-500/30' 
                      : 'bg-amber-950/40 border-amber-500/30'
                  }`}
                >
                  <div className="flex items-center gap-4 relative z-10">
                    <div className={`p-3 rounded-2xl ${
                      alarm.severity === 'critical' ? 'bg-red-500 text-white' : 'bg-amber-500 text-white'
                    }`}>
                      {alarm.severity === 'critical' ? <AlertTriangle size={20} /> : <Info size={20} />}
                    </div>
                    <div>
                      <div className="flex items-center gap-2 opacity-50 text-[10px] font-black uppercase tracking-wider mb-1">
                        <span>{alarm.type.replace('_', ' ')}</span>
                        <span>•</span>
                        <span>{new Date(alarm.timestamp).toLocaleTimeString()}</span>
                      </div>
                      <p className="text-white font-bold leading-tight">{alarm.message}</p>
                    </div>
                  </div>
                  <button 
                    onClick={() => onRemoveAlarm(alarm.id)}
                    className="p-3 hover:bg-white/10 rounded-2xl transition-colors text-slate-400 hover:text-white relative z-10"
                  >
                    <Trash2 size={20} />
                  </button>
                </motion.div>
              ))
            )}
          </div>
        </div>

        {/* Control & Test Panel */}
        <div className="bg-slate-900/60 border border-white/5 rounded-[40px] p-8 backdrop-blur-xl space-y-8">
          <div>
            <h3 className="text-xl font-black text-white mb-6 uppercase tracking-tight">Simulacro de Emergencia</h3>
            <div className="grid grid-cols-1 gap-3">
              {testSensors.map(test => (
                <button
                  key={test.label}
                  onClick={() => onAddAlarm(test.type, test.severity, test.msg, test.value)}
                  className="w-full p-4 bg-slate-950 text-slate-300 rounded-2xl border border-slate-800 hover:border-red-500/50 hover:bg-red-500/10 transition-all text-sm font-bold flex items-center justify-between group"
                >
                  <span>{test.label}</span>
                  <Zap size={16} className="opacity-0 group-hover:opacity-100 text-red-500 transition-opacity" />
                </button>
              ))}
            </div>
          </div>

          <div className="pt-4 border-t border-white/5">
            <h3 className="text-xl font-black text-white mb-4 uppercase tracking-tight">Estado Watchdog</h3>
            <div className="space-y-4">
              <div className="flex justify-between items-center p-4 bg-black/30 rounded-2xl border border-white/5">
                <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">Nivel de Shield</span>
                <span className="text-emerald-400 font-black">MAXIMO</span>
              </div>
              <div className="flex justify-between items-center p-4 bg-black/30 rounded-2xl border border-white/5">
                <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">Tiempo Respuesta</span>
                <span className="text-cyan-400 font-mono">1.2ms</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Historical Log Section */}
      <div className="bg-slate-950/60 border border-white/5 rounded-[40px] p-8 backdrop-blur-xl">
        <h3 className="text-2xl font-black text-white mb-8 uppercase tracking-tight italic flex items-center gap-3">
          <Activity className="text-cyan-400" />
          Histórico de Alarmas (Sincronización Cloud)
        </h3>
        
        <div className="overflow-x-auto">
          <table className="w-full text-left border-separate border-spacing-y-3">
            <thead>
              <tr className="text-[10px] font-black text-slate-500 uppercase tracking-widest">
                <th className="px-6 py-4">Status</th>
                <th className="px-6 py-4">Evento</th>
                <th className="px-6 py-4">Valor</th>
                <th className="px-6 py-4">Timestamp</th>
                <th className="px-6 py-4 text-right">Referencia</th>
              </tr>
            </thead>
            <tbody>
              {alarmHistory.length === 0 ? (
                <tr>
                  <td colSpan={5} className="text-center py-20 text-slate-500 font-mono text-sm italic">
                    Esperando telemetría de red... No hay registros históricos.
                  </td>
                </tr>
              ) : (
                alarmHistory.map((log) => (
                  <tr 
                    key={log.id} 
                    className={cn(
                      "transition-colors group",
                      log.severity === 'critical' ? "bg-red-950/20 hover:bg-red-950/40" : "bg-black/20 hover:bg-black/40"
                    )}
                  >
                    <td className="px-6 py-4 first:rounded-l-2xl">
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                        log.severity === 'critical' ? 'bg-red-500/20 text-red-500' : 'bg-amber-500/20 text-amber-500'
                      }`}>
                        {getAlarmIcon(log.type)}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-sm font-bold text-white">{log.message}</div>
                      <div className="flex items-center gap-2">
                        <span className="text-[9px] font-black text-slate-500 uppercase">{log.type}</span>
                        {log.modulo_origen && (
                          <span className="text-[9px] font-mono text-cyan-500/70 border border-cyan-500/20 px-1 rounded bg-cyan-500/5">
                            {log.modulo_origen}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-xs font-mono font-bold text-cyan-400 bg-cyan-950/30 px-2 py-1 rounded-md border border-cyan-800/30">
                        {typeof log.value === 'number' ? log.value.toFixed(2) : '-'}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-xs font-mono text-slate-400">
                        {log.timestamp?.toDate ? log.timestamp.toDate().toLocaleString() : new Date(log.timestamp).toLocaleString()}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-right last:rounded-r-2xl font-mono text-[9px] text-slate-600">
                      ID: {log.id.substring(0, 8)}...
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
