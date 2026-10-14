import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Radar, Wind, Crosshair, Map, Layers, Navigation, Waves } from 'lucide-react';
import { cn } from '@lib/utils';

interface EncSource {
  name: string;
}

interface EncLayer {
  name: string;
  geometry: string;
  featureCount: number | null;
  extent: number[] | null;
  fields: string[];
}

interface EncInspection {
  sourceName: string;
  cellName: string;
  edition: string | null;
  updateNumber: string | null;
  updateApplicationDate: string | null;
  updateMode: 'APPLY';
  bounds: [number, number, number, number] | null;
  gdalVersion: string;
  layerCount: number;
  totalLayerFeatures: number;
  layers: EncLayer[];
}

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
  activeEncFilename: string | null;
  onToggleEncOverlay: (filename: string | null, bounds?: [number, number, number, number]) => void;
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
  activeEncFilename,
  onToggleEncOverlay,
}) => {
  const [encSources, setEncSources] = React.useState<EncSource[]>([]);
  const [encInspection, setEncInspection] = React.useState<EncInspection | null>(null);
  const [encLoading, setEncLoading] = React.useState(false);
  const [encError, setEncError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!isOpen) return;
    const controller = new AbortController();
    fetch('http://localhost:8089/api/enc-charts', { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error('No se pudo consultar el directorio de cartas.');
        const sources = await response.json() as EncSource[];
        setEncSources(sources);
        setEncError(null);
      })
      .catch((error: unknown) => {
        if (error instanceof Error && error.name === 'AbortError') return;
        setEncError(error instanceof Error ? error.message : 'Error al consultar las ENC.');
      });
    return () => controller.abort();
  }, [isOpen]);

  const inspectEnc = async (source: EncSource) => {
    setEncLoading(true);
    setEncError(null);
    setEncInspection(null);
    try {
      const response = await fetch(`http://localhost:8089/api/enc-charts/${encodeURIComponent(source.name)}/inspect`);
      const payload = await response.json() as EncInspection | { error?: string };
      if (!response.ok) {
        throw new Error('error' in payload && payload.error ? payload.error : 'No se pudo leer la ENC.');
      }
      setEncInspection(payload as EncInspection);
    } catch (error: unknown) {
      setEncError(error instanceof Error ? error.message : 'Error al inspeccionar la ENC.');
    } finally {
      setEncLoading(false);
    }
  };

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

              {/* Inspección S-57 informativa; nunca se conecta al renderizador de cartas. */}
              <div className="space-y-3 border-t border-white/10 pt-4">
                <p className="text-[8px] font-black text-slate-500 uppercase tracking-widest px-1">ENC S-57 · Inspección</p>
                <div className="rounded-xl border border-amber-500/30 bg-amber-950/30 p-3">
                  <p className="text-[9px] font-black uppercase tracking-wide text-amber-300">Vista informativa — no es una carta ECDIS</p>
                  <p className="mt-1 text-[8px] leading-relaxed text-amber-100/70">No usar para navegar ni para decisiones de seguridad.</p>
                </div>

                {encSources.length === 0 ? (
                  <p className="rounded-xl border border-white/5 bg-black/20 p-3 text-[9px] text-slate-500">
                    No hay ZIP o celdas .000 en el directorio de cartas seleccionado.
                  </p>
                ) : (
                  <div className="space-y-1">
                    {encSources.map((source) => (
                      <button
                        key={source.name}
                        type="button"
                        onClick={() => void inspectEnc(source)}
                        disabled={encLoading}
                        className="w-full truncate rounded-lg border border-white/10 bg-black/40 p-2 text-left text-[9px] text-slate-200 hover:border-cyan-500/40 disabled:opacity-50"
                      >
                        {source.name}
                      </button>
                    ))}
                  </div>
                )}

                {encLoading && <p className="text-[9px] text-cyan-300">Leyendo metadatos y capas con GDAL/OGR…</p>}
                {encError && <p role="alert" className="rounded-lg border border-red-500/20 bg-red-950/30 p-2 text-[9px] text-red-300">{encError}</p>}

                {encInspection && (
                  <div className="space-y-2 rounded-xl border border-white/10 bg-black/30 p-3">
                    <div className="space-y-1 text-[9px] text-slate-300">
                      <p className="break-all font-bold text-white">{encInspection.cellName}</p>
                      <p>Edición {encInspection.edition ?? '—'} · actualización {encInspection.updateNumber ?? '—'}</p>
                      <p>Fecha actualización: {encInspection.updateApplicationDate ?? '—'} · modo S-57: {encInspection.updateMode}</p>
                      <p>{encInspection.layerCount} capas · {encInspection.totalLayerFeatures} objetos · {encInspection.gdalVersion}</p>
                    </div>
                    <button
                      type="button"
                      disabled={!encInspection.bounds}
                      onClick={() => {
                        const isActive = activeEncFilename === encInspection.sourceName;
                        onToggleEncOverlay(
                          isActive ? null : encInspection.sourceName,
                          isActive ? undefined : encInspection.bounds ?? undefined
                        );
                        onClose();
                      }}
                      className="w-full rounded-lg border border-cyan-500/40 bg-cyan-500/10 px-3 py-2 text-[9px] font-black uppercase tracking-wide text-cyan-200 hover:bg-cyan-500/20 disabled:opacity-40"
                    >
                      {activeEncFilename === encInspection.sourceName ? 'Quitar ENC del mapa' : 'Mostrar ENC en mapa'}
                    </button>
                    <div className="max-h-64 space-y-1 overflow-y-auto border-t border-white/10 pt-2">
                      {encInspection.layers.map((layer) => (
                        <div key={layer.name} className="rounded-md bg-white/[0.03] px-2 py-1 text-[8px]">
                          <div className="flex justify-between gap-2 text-slate-200">
                            <span className="font-bold">{layer.name}</span>
                            <span className="text-right text-slate-500">{layer.featureCount ?? '—'} · {layer.geometry}</span>
                          </div>
                          {layer.fields.length > 0 && <p className="mt-0.5 break-words text-slate-600">{layer.fields.join(', ')}</p>}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
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
