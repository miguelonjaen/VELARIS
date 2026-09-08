import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Radar, Wind, Crosshair, Map, Layers, Navigation, Waves } from 'lucide-react';
import { cn } from '@lib/utils';

interface ZeusLayerMenuProps {
  isOpen: boolean;
  onClose: () => void;
  layersState: {
    showAIS: boolean;
    showWind: boolean;
    showWaves: boolean;
    showCurrent: boolean;
    collisionFilter: boolean;
  };
  setLayersState: React.Dispatch<React.SetStateAction<any>>;
  listaCartas: any[];
  cartasActivas: Record<string, boolean>;
  toggleCarta: (name: string) => void;
  cartasOpacity: Record<string, number>;
  setCartasOpacity: React.Dispatch<React.SetStateAction<Record<string, number>>>;
}

export const ZeusLayerMenu: React.FC<ZeusLayerMenuProps> = ({
  isOpen,
  onClose,
  layersState,
  setLayersState,
  listaCartas,
  cartasActivas,
  toggleCarta,
  cartasOpacity,
  setCartasOpacity,
}) => {
  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop táctico para cierre contextual */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 z-[6900] bg-black/20 backdrop-blur-[2px]"
          />

          {/* Panel Lateral Estilo Zeus 3S */}
          <motion.div
            initial={{ x: 400, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: 400, opacity: 0 }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className="absolute right-[72px] top-1/2 -translate-y-1/2 w-72 h-[600px] max-h-[85vh] bg-[#070b14]/95 backdrop-blur-2xl border border-white/10 rounded-[24px] shadow-[0_0_50px_rgba(0,0,0,0.5)] z-[7000] flex flex-col overflow-hidden"
          >
            {/* Cabecera Técnica */}
            <div className="p-4 border-b border-white/10 flex items-center justify-between bg-white/5">
              <div className="flex items-center gap-2">
                <Layers className="w-4 h-4 text-cyan-400" />
                <span className="text-[10px] font-black uppercase tracking-[0.2em] text-white">Configuración de Carta</span>
              </div>
              <button onClick={onClose} className="p-1 hover:bg-white/10 rounded-lg transition-colors text-slate-500 hover:text-white">
                <X size={16} />
              </button>
            </div>

            {/* Contenedor de Scroll para Configuración */}
            <div className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-6">
              
              {/* Sección: Superposiciones Inteligentes */}
              <div className="space-y-3">
                <p className="text-[8px] font-black text-slate-500 uppercase tracking-widest px-1">Superposiciones</p>
                <div className="grid gap-2">
                  {[
                    { id: 'showAIS', label: 'Objetivos AIS', icon: Radar, active: layersState.showAIS, color: 'text-amber-400' },
                    { id: 'showWind', label: 'Malla de Viento', icon: Wind, active: layersState.showWind, color: 'text-blue-400' },
                    { id: 'showWaves', label: 'Oleaje', icon: Waves, active: layersState.showWaves, color: 'text-sky-300' },
                    { id: 'showCurrent', label: 'Corriente', icon: Navigation, active: layersState.showCurrent, color: 'text-teal-300' },
                    { id: 'collisionFilter', label: 'Filtro CPA/TCPA', icon: Crosshair, active: layersState.collisionFilter, color: 'text-red-400' },
                  ].map((layer) => (
                    <button
                      key={layer.id}
                      onClick={() => setLayersState((prev: any) => ({ ...prev, [layer.id]: !prev[layer.id] }))}
                      className={cn(
                        "flex items-center justify-between p-3 rounded-xl border transition-all",
                        layer.active ? "bg-cyan-500/10 border-cyan-500/40 text-white" : "bg-black/40 border-white/5 text-slate-500"
                      )}
                    >
                      <div className="flex items-center gap-3">
                        <layer.icon size={14} className={layer.active ? layer.color : "text-slate-600"} />
                        <span className="text-[10px] font-bold uppercase">{layer.label}</span>
                      </div>
                      <div className={cn("w-2 h-2 rounded-full", layer.active ? "bg-cyan-400 shadow-[0_0_8px_#22d3ee]" : "bg-slate-800")} />
                    </button>
                  ))}
                </div>
              </div>

              {/* Sección: Cartografía MBTiles */}
              <div className="space-y-3">
                <p className="text-[8px] font-black text-slate-500 uppercase tracking-widest px-1">Cartografía Local (MBTiles)</p>
                <div className="space-y-2">
                  {listaCartas.length === 0 ? (
                    <div className="p-4 rounded-xl border border-white/5 bg-black/20 text-center">
                      <p className="text-[9px] text-slate-600 uppercase font-bold tracking-tighter italic">Servidor offline o sin cartas</p>
                    </div>
                  ) : (
                    listaCartas.map((chart) => (
                      <div key={chart.name} className="p-3 rounded-xl border border-white/10 bg-black/40 space-y-3">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-bold text-slate-200 truncate flex-1 pr-2">{chart.name.replace('.mbtiles', '')}</span>
                          <input
                            type="checkbox"
                            checked={cartasActivas[chart.name] || false}
                            onChange={() => toggleCarta(chart.name)}
                            className="w-4 h-4 rounded border-white/10 bg-slate-900 text-cyan-600 focus:ring-0 focus:ring-offset-0 cursor-pointer"
                          />
                        </div>
                        {cartasActivas[chart.name] && (
                          <div className="pt-2 border-t border-white/5">
                            <div className="flex justify-between text-[7px] text-slate-500 uppercase font-black mb-2 px-1">
                              <span>Opacidad</span>
                              <span className="text-cyan-400">{Math.round((cartasOpacity[chart.name] || 0.8) * 100)}%</span>
                            </div>
                            <input
                              type="range" min="0" max="1" step="0.05"
                              value={cartasOpacity[chart.name] || 0.8}
                              onChange={(e) => setCartasOpacity((prev) => ({ ...prev, [chart.name]: parseFloat(e.target.value) }))}
                              className="w-full h-1 bg-slate-800 rounded-full appearance-none accent-cyan-500 cursor-pointer"
                            />
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>

            {/* Pie de Panel Informnativo */}
            <div className="p-4 border-t border-white/5 bg-black/40">
              <p className="text-[8px] text-slate-600 font-mono leading-tight uppercase tracking-tighter">
                VELARIS Tactical Engine v2.1<br />
                B&G Zeus³S Emulation Layer
              </p>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};
