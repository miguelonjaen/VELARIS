import React, { useState, useRef } from "react";
import {
  Search,
  X,
  Volume2,
  Flag,
  Radio,
  Lightbulb,
  Navigation,
  Info,
  Anchor,
  Wind,
  Layers,
  ChevronRight,
  Shield,
  RadioTower,
  Cloud,
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { cn } from "../lib/utils";
import { VADEMECUM_DATA, VademecumItem } from "../data/vademecumData";

type AudioContextConstructor = typeof AudioContext;
type AudioCapableWindow = Window &
  typeof globalThis & {
    webkitAudioContext?: AudioContextConstructor;
  };

interface VademecumProps {
  onClose: () => void;
}

const PUBLIC_BASE = import.meta.env.BASE_URL;
const FALLBACK_IMAGE = `${PUBLIC_BASE}barco-player.png`;

const resolvePublicAsset = (assetPath?: string, fallbackPath?: string): string => {
  const path = assetPath || fallbackPath;
  if (!path) return FALLBACK_IMAGE;
  if (/^https?:\/\//i.test(path)) return path;
  return `${PUBLIC_BASE}${path.replace(/^\/+/, "")}`;
};

const applyImageFallback = (event: React.SyntheticEvent<HTMLImageElement>): void => {
  const image = event.currentTarget;
  if (image.dataset.fallbackApplied === "true") return;
  image.dataset.fallbackApplied = "true";
  image.src = FALLBACK_IMAGE;
};

const getAudioContextConstructor = (): AudioContextConstructor | undefined => {
  const audioWindow = window as AudioCapableWindow;
  return audioWindow.AudioContext ?? audioWindow.webkitAudioContext;
};

const Vademecum: React.FC<VademecumProps> = ({ onClose }) => {
  const [activeSubTab, setActiveSubTab] = useState<string>("banderas");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedItem, setSelectedItem] = useState<VademecumItem | null>(null);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);

  const filteredData =
    VADEMECUM_DATA[activeSubTab]?.filter(
      (item) =>
        item.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (item.category &&
          item.category.toLowerCase().includes(searchQuery.toLowerCase())),
    ) || [];

  const getCategoryIcon = (cat: string) => {
    switch (cat.toLowerCase()) {
      case "acusticas":
        return <Volume2 className="w-4 h-4" />;
      case "banderas":
        return <Flag className="w-4 h-4" />;
      case "cabuyería":
        return <Anchor className="w-4 h-4" />;
      case "prioridades":
        return <Layers className="w-4 h-4" />;
      case "balizamiento":
        return <Shield className="w-4 h-4" />;
      case "beaufort":
        return <Wind className="w-4 h-4" />;
      case "nubes":
        return <Cloud className="w-4 h-4" />;
      case "radio":
        return <Radio className="w-4 h-4" />;
      default:
        return <Info className="w-4 h-4" />;
    }
  };
  const TopMark = ({ type }: { type: string | undefined }) => {
    if (!type) return null;

    // Clases comunes para el contenedor de la marca
    const baseClass =
      "absolute -top-2 left-1/2 -translate-x-1/2 w-6 h-6 flex items-center justify-center";

    return (
      <div className="absolute -top-4 z-20 flex justify-center w-full">
        {type.includes("Cilindro") && (
          <div className="w-4 h-6 bg-green-500 border border-black" />
        )}
        {type.includes("Cono") && type.includes("arriba") && (
          <div className="w-0 h-0 border-l-[10px] border-l-transparent border-r-[10px] border-r-transparent border-b-[16px] border-b-red-600" />
        )}
        {type.includes("2 Conos") && type.includes("bases") && (
          <div className="flex flex-col items-center">
            <div className="w-0 h-0 border-l-[8px] border-l-transparent border-r-[8px] border-r-transparent border-b-[12px] border-b-black" />
            <div className="w-0 h-0 border-l-[8px] border-l-transparent border-r-[8px] border-r-transparent border-t-[12px] border-t-black" />
          </div>
        )}
        {type.includes("Esfera") && (
          <div className="w-5 h-5 bg-red-600 rounded-full border border-black" />
        )}
        {/* Añade más condiciones aquí para otras formas */}
      </div>
    );
  };

  // Listado completo del Alfabeto Náutico de la OMI para la sección Radio
  const alfabetoOmi = [
    { l: "A", p: "Alfa" },
    { l: "B", p: "Bravo" },
    { l: "C", p: "Charlie" },
    { l: "D", p: "Delta" },
    { l: "E", p: "Echo" },
    { l: "F", p: "Foxtrot" },
    { l: "G", p: "Golf" },
    { l: "H", p: "Hotel" },
    { l: "I", p: "India" },
    { l: "J", p: "Juliet" },
    { l: "K", p: "Kilo" },
    { l: "L", p: "Lima" },
    { l: "M", p: "Mike" },
    { l: "N", p: "November" },
    { l: "O", p: "Oscar" },
    { l: "P", p: "Papa" },
    { l: "Q", p: "Quebec" },
    { l: "R", p: "Romeo" },
    { l: "S", p: "Sierra" },
    { l: "T", p: "Tango" },
    { l: "U", p: "Uniform" },
    { l: "V", p: "Victor" },
    { l: "W", p: "Whiskey" },
    { l: "X", p: "X-ray" },
    { l: "Y", p: "Yankee" },
    { l: "Z", p: "Zulu" },
  ];

  const stopAudio = () => {
    if (audioCtxRef.current) {
      try {
        audioCtxRef.current.close();
      } catch {}
      audioCtxRef.current = null;
    }
    setPlayingId(null);
  };

  const playAcousticSignal = (item: VademecumItem, e: React.MouseEvent) => {
    e.stopPropagation();
    if (playingId === item.id) {
      stopAudio();
      return;
    }
    stopAudio();
    if (!item.soundPattern || item.soundPattern.length === 0) return;

    const AudioCtx = getAudioContextConstructor();
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    audioCtxRef.current = ctx;
    setPlayingId(item.id);

    let t = ctx.currentTime + 0.05;
    let totalMs = 50;

    const playHorn = (startT: number, dur: number) => {
      const osc1 = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      const masterGain = ctx.createGain();
      osc1.type = "sawtooth";
      osc1.frequency.value = 155;
      osc2.type = "square";
      osc2.frequency.value = 232;
      const g1 = ctx.createGain();
      g1.gain.value = 0.65;
      const g2 = ctx.createGain();
      g2.gain.value = 0.22;
      osc1.connect(g1);
      osc2.connect(g2);
      g1.connect(masterGain);
      g2.connect(masterGain);
      masterGain.connect(ctx.destination);
      masterGain.gain.setValueAtTime(0, startT);
      masterGain.gain.linearRampToValueAtTime(0.55, startT + 0.06);
      masterGain.gain.setValueAtTime(0.55, startT + dur - 0.08);
      masterGain.gain.linearRampToValueAtTime(0, startT + dur);
      osc1.start(startT);
      osc1.stop(startT + dur + 0.1);
      osc2.start(startT);
      osc2.stop(startT + dur + 0.1);
    };

    const playBell = (startT: number) => {
      const freqs = [880, 2427, 4730, 7865];
      const amps = [0.45, 0.2, 0.12, 0.07];
      freqs.forEach((f, i) => {
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = "sine";
        osc.frequency.value = f;
        osc.connect(g);
        g.connect(ctx.destination);
        g.gain.setValueAtTime(amps[i], startT);
        g.gain.exponentialRampToValueAtTime(0.0001, startT + 1.8);
        osc.start(startT);
        osc.stop(startT + 1.9);
      });
    };

    const playGong = (startT: number) => {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(145, startT);
      osc.frequency.exponentialRampToValueAtTime(110, startT + 0.12);
      osc.connect(g);
      g.connect(ctx.destination);
      g.gain.setValueAtTime(0.55, startT);
      g.gain.exponentialRampToValueAtTime(0.0001, startT + 3.0);
      osc.start(startT);
      osc.stop(startT + 3.1);
    };

    for (const beat of item.soundPattern) {
      const gap = beat.gap ?? 0.35;
      if (beat.type === "short") {
        playHorn(t, 1.0);
        const step = 1.0 + gap;
        t += step;
        totalMs += step * 1000;
      } else if (beat.type === "long") {
        playHorn(t, 4.5);
        const step = 4.5 + gap;
        t += step;
        totalMs += step * 1000;
      } else if (beat.type === "bell") {
        playBell(t);
        t += gap;
        totalMs += gap * 1000;
      } else if (beat.type === "gong") {
        playGong(t);
        t += gap;
        totalMs += gap * 1000;
      }
    }

    setTimeout(() => {
      setPlayingId((prev) => (prev === item.id ? null : prev));
    }, totalMs + 400);
  };

  return (
    <div className="p-6 md:p-10 space-y-8 max-w-7xl mx-auto min-h-full flex flex-col bg-slate-950 text-slate-100">
      {/* Header */}
      <div className="flex justify-between items-center shrink-0">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-cyan-600 rounded-2xl flex items-center justify-center shadow-lg shadow-cyan-900/20">
            <Info className="w-6 h-6 text-white" />
          </div>
          <div>
            <h2 className="text-3xl font-black text-white uppercase tracking-tighter">
              Vademécum Náutico
            </h2>
            <p className="text-xs font-bold text-cyan-500 uppercase tracking-widest">
              Manual de Referencia Rápida Táctica
            </p>
          </div>
        </div>
        <button
          onClick={onClose}
          className="p-3 bg-slate-900 hover:bg-red-600 text-slate-400 hover:text-white rounded-xl transition-all border border-slate-800"
        >
          <X className="w-6 h-6" />
        </button>
      </div>

      {/* Controls */}
      <div className="flex flex-col md:flex-row gap-4 bg-slate-900/30 p-4 rounded-3xl border border-slate-800/50 backdrop-blur-md shrink-0">
        <div className="flex-1 flex gap-2 overflow-x-auto pb-2 md:pb-0 custom-scrollbar">
          {[
            "banderas",
            "cabuyería",
            "balizamiento",
            "beaufort",
            "nubes",
            "radio",
            "prioridades",
            "acusticas",
          ].map((cat) => (
            <button
              key={cat}
              onClick={() => {
                setActiveSubTab(cat);
                setSearchQuery("");
              }}
              className={cn(
                "px-5 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-3 whitespace-nowrap",
                activeSubTab === cat
                  ? "bg-cyan-600 text-white shadow-lg shadow-cyan-900/20 border border-cyan-500/30"
                  : "bg-slate-900 text-slate-500 hover:text-white hover:bg-slate-800 border border-slate-800/60",
              )}
            >
              {getCategoryIcon(cat)}
              {cat}
            </button>
          ))}
        </div>
        <div className="relative w-full md:w-80">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <input
            type="text"
            placeholder="Buscar parámetro táctico..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-3.5 bg-slate-950 border border-slate-800 rounded-2xl text-white text-xs outline-none focus:border-cyan-500/50 transition-all font-bold"
          />
        </div>
      </div>

      {/* Contenido Dinámico según Pestaña */}
      <div className="flex-1 overflow-y-auto custom-scrollbar pr-2 min-h-0">
        {/* 1. SECCIÓN BANDERAS: Código Internacional Completo */}
        {activeSubTab === "banderas" && (
          <div className="bg-slate-900/50 border border-slate-800 rounded-3xl overflow-hidden shadow-2xl">
            <table className="w-full text-left border-collapse">
              <thead className="bg-slate-950/80 sticky top-0 z-20 backdrop-blur-md">
                <tr className="border-b border-slate-800">
                  <th className="px-6 py-5 text-[10px] font-black text-cyan-400 uppercase tracking-widest">
                    Bandera
                  </th>
                  <th className="px-6 py-5 text-[10px] font-black text-cyan-400 uppercase tracking-widest">
                    Letra / Fonética
                  </th>
                  <th className="px-6 py-5 text-[10px] font-black text-cyan-400 uppercase tracking-widest">
                    Significado Principal
                  </th>
                  <th className="px-6 py-5 text-[10px] font-black text-cyan-400 uppercase tracking-widest text-center">
                    Código Morse
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/50">
                {filteredData.map((item) => (
                  <tr
                    key={item.id}
                    className="hover:bg-cyan-500/5 transition-colors group cursor-pointer"
                    onClick={() => setSelectedItem(item)}
                  >
                    <td className="px-6 py-4">
                      {/* Renderizado de bandera con color y bordes */}
                      <div
                        className={cn(
                          "w-14 h-9 rounded shadow-md border border-white/10 shrink-0 overflow-hidden relative",
                          item.color,
                        )}
                      >
                        {/* Clases internas simuladas para banderas complejas si no usan imágenes */}
                        <div className="absolute inset-0 opacity-20 bg-gradient-to-tr from-black/20 via-transparent to-white/10" />
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex flex-col">
                        <span className="text-sm font-black text-white uppercase group-hover:text-cyan-400 transition-colors">
                          {item.title}
                        </span>
                        <span className="text-[9px] text-slate-500 font-mono tracking-widest font-bold">
                          LETRA {item.title.substring(0, 1)}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <p className="text-xs text-slate-300 leading-tight max-w-xl font-medium">
                        {item.description}
                      </p>
                    </td>
                    <td className="px-6 py-4 text-center">
                      <span className="text-sm font-black text-cyan-400 font-mono bg-slate-950 px-3 py-1.5 rounded-lg border border-slate-800 tracking-widest">
                        {item.morse || "• —"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* 2. SECCIÓN CABUYERÍA: Nudos Marineros con Fotos Reales */}
        {activeSubTab === "cabuyería" && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 pb-8">
            {filteredData.map((item) => (
              <div
                key={item.id}
                onClick={() => setSelectedItem(item)}
                className="bg-slate-900/50 border border-slate-800 hover:border-cyan-500/30 rounded-[2rem] p-5 flex flex-col justify-between transition-all group shadow-xl cursor-pointer"
              >
                <div>
                  {/* Foto local del nudo con respaldo offline. */}
                  <div className="w-full h-44 bg-slate-950 rounded-2xl border border-slate-800/80 overflow-hidden mb-4 shadow-inner flex items-center justify-center relative">
                    <img
                      src={resolvePublicAsset(item.imageUrl, `nudos/${item.id}.png`)}
                      alt={item.title}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      onError={applyImageFallback}
                    />
                    <div className="absolute top-3 right-3 bg-slate-950/80 border border-slate-800 px-2.5 py-1 rounded-lg text-[9px] font-mono text-cyan-400 uppercase">
                      Cabuyería
                    </div>
                  </div>
                  <h3 className="text-base font-black text-white uppercase tracking-tight group-hover:text-cyan-400 transition-colors mb-2">
                    {item.title}
                  </h3>
                  <p className="text-xs text-slate-400 leading-relaxed font-sans line-clamp-3 italic">
                    "{item.description}"
                  </p>
                </div>
                <div className="mt-4 pt-3 border-t border-slate-800/60 flex items-center justify-between text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                  <span>Ver pasos de ejecución</span>
                  <ChevronRight className="w-4 h-4 text-cyan-600 group-hover:translate-x-1 transition-transform" />
                </div>
              </div>
            ))}
          </div>
        )}

        {/* 3. SECCIÓN BALIZAMIENTO: IALA Completa con Imágenes Oficiales */}
        {activeSubTab === "balizamiento" && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5 pb-8">
            {filteredData.map((item) => {
              const imageSrc = resolvePublicAsset(item.imageUrl, `balizas/${item.id}.png`);

              return (
                <div
                  key={item.id}
                  onClick={() => setSelectedItem(item)}
                  className="bg-slate-900/50 border border-slate-800 hover:border-cyan-500/40 rounded-[2rem] overflow-hidden flex flex-col cursor-pointer transition-all duration-200 group shadow-xl hover:shadow-cyan-900/20"
                >
                  {/* Imagen oficial IALA — SVG de Wikimedia Commons */}
                  <div className="relative bg-slate-950 flex items-center justify-center h-52 overflow-hidden">
                    <img
                      src={imageSrc}
                      alt={item.title}
                      className="h-full w-full object-contain p-4 group-hover:scale-105 transition-transform duration-300"
                      onError={(e) => {
                        // Si falla la imagen, ocultar y mostrar el color CSS de fondo
                        const target = e.target as HTMLImageElement;
                        target.style.display = "none";
                        if (target.parentElement) {
                          const fallback = target.parentElement.querySelector(
                            ".buoy-fallback",
                          ) as HTMLElement;
                          if (fallback) fallback.style.display = "flex";
                        }
                      }}
                    />
                    {/* Fallback CSS buoy (oculto por defecto) */}
                    <div className="buoy-fallback hidden absolute inset-0 items-center justify-center">
                      <div
                        className={cn(
                          "w-12 h-28 relative flex flex-col overflow-hidden shadow-2xl border border-white/10",
                          item.isSpherical ? "rounded-full" : "rounded-t-full",
                        )}
                      >
                        {item.isStriped ? (
                          <div className="absolute inset-0 flex">
                            <div className="flex-1 bg-red-600" />
                            <div className="flex-1 bg-white" />
                            <div className="flex-1 bg-red-600" />
                          </div>
                        ) : (
                          <>
                            <div
                              className={cn(
                                "flex-1",
                                item.colorTop || "bg-slate-950",
                              )}
                            />
                            <div
                              className={cn(
                                "h-8",
                                item.colorMiddle || "bg-slate-950",
                              )}
                            />
                            <div
                              className={cn(
                                "flex-1",
                                item.colorBottom || "bg-slate-950",
                              )}
                            />
                          </>
                        )}
                      </div>
                    </div>
                    {/* IALA badge */}
                    <div className="absolute top-2.5 right-2.5 bg-amber-950/90 border border-amber-700/60 px-2 py-0.5 rounded-md text-[8px] font-black text-amber-400 uppercase tracking-widest">
                      IALA A
                    </div>
                  </div>

                  {/* Info card */}
                  <div className="p-4 flex flex-col gap-2 flex-1 text-center">
                    <h3 className="text-sm font-black text-white uppercase tracking-tight group-hover:text-cyan-400 transition-colors leading-tight">
                      {item.title}
                    </h3>
                    <div className="space-y-1.5 text-left text-[10px] font-mono text-slate-400 border-t border-slate-800/70 pt-2 mt-1">
                      <p className="truncate">
                        <span className="text-cyan-500 font-bold">▲ </span>
                        {item.topMark || "—"}
                      </p>
                      <p className="truncate">
                        <span className="text-slate-500 font-bold">◉ </span>
                        {item.buoyColor || "—"}
                      </p>
                      <p className="text-amber-400 truncate">
                        <span className="text-slate-500">✦ </span>
                        {item.lightRitmo || "—"}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
        {/* 4. SECCIÓN BEAUFORT: Escala Completa de Fuerza de Viento 0 a 12 */}
        {activeSubTab === "beaufort" && (
          <div className="bg-slate-900/50 border border-slate-800 rounded-3xl overflow-hidden shadow-2xl mb-8">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse font-mono text-xs">
                <thead className="bg-slate-950/80 sticky top-0 z-20 backdrop-blur-md">
                  <tr className="border-b border-slate-800">
                    <th className="px-6 py-4 text-[10px] font-black text-cyan-400 uppercase tracking-widest text-center w-16">
                      Fuerza
                    </th>
                    <th className="px-6 py-4 text-[10px] font-black text-cyan-400 uppercase tracking-widest">
                      Denominación Oficial
                    </th>
                    <th className="px-6 py-4 text-[10px] font-black text-cyan-400 uppercase tracking-widest">
                      Velocidad (Nudos)
                    </th>
                    <th className="px-6 py-4 text-[10px] font-black text-cyan-400 uppercase tracking-widest">
                      Efectos Reales en la Mar
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/40">
                  {filteredData.map((item) => (
                    <tr
                      key={item.id}
                      className="hover:bg-cyan-500/5 transition-colors cursor-pointer"
                      onClick={() => setSelectedItem(item)}
                    >
                      <td className="px-6 py-4 font-black text-center bg-slate-950/40 text-amber-400 text-sm">
                        {item.symbol || item.id}
                      </td>
                      <td className="px-6 py-4 text-white font-sans font-bold uppercase tracking-tight">
                        {item.title}
                      </td>
                      <td className="px-6 py-4 text-cyan-300 font-bold">
                        {String(item.velocity || item.symbol || "0")}{" "}
                        Kts
                      </td>
                      <td className="px-6 py-4 text-slate-400 font-sans leading-tight text-[11px] italic">
                        "{item.description}"
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* 5. SECCIÓN RADIO: Telecomunicaciones, Alfabeto OMI y Llamadas de Emergencia */}
        {activeSubTab === "radio" && (
          <div className="space-y-8 pb-8">
            {/* Submódulo Alfabeto Fonético */}
            <div className="bg-slate-900/30 border border-slate-800 p-6 rounded-3xl">
              <h3 className="text-sm font-black text-cyan-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                <RadioTower className="w-4 h-4" /> Alfabeto Fonético
                Internacional (OMI / OTAN)
              </h3>
              <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-2">
                {alfabetoOmi.map((item) => (
                  <div
                    key={item.l}
                    className="bg-slate-950 border border-slate-850 p-2.5 rounded-xl flex items-center justify-between font-mono"
                  >
                    <span className="text-amber-400 font-black text-base">
                      {item.l}
                    </span>
                    <span className="text-xs text-slate-300 font-bold tracking-tight uppercase">
                      {item.p}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Submódulo de Llamadas Críticas de Radio VHF */}
            <div className="grid grid-cols-1 gap-4">
              <div className="bg-red-950/20 border border-red-500/30 p-6 rounded-[2rem] shadow-xl">
                <h3 className="text-sm font-black font-mono text-red-400 flex items-center gap-2 uppercase tracking-wide">
                  🚨 MAYDAY — Peligro Grave e Inminente (Canal 16)
                </h3>
                <p className="text-xs text-slate-300 mt-2 font-mono leading-relaxed bg-black/40 p-4 rounded-xl border border-red-900/30">
                  <span className="text-red-400 font-bold">
                    Estructura Fonética:
                  </span>{" "}
                  "MAYDAY, MAYDAY, MAYDAY. Aquí [Nombre del Buque] / Call Sign
                  [Indicativo]. Posición [Coordenadas o demora]. Naturaleza del
                  peligro: [Ej: Vía de agua descontrolada]. Cantidad de almas a
                  bordo: [Nº tripulantes]. Dispongo de balsas salvavidas.
                  Terminado."
                </p>
              </div>

              <div className="bg-amber-950/20 border border-amber-500/30 p-6 rounded-[2rem] shadow-xl">
                <h3 className="text-sm font-black font-mono text-amber-400 flex items-center gap-2 uppercase tracking-wide">
                  ⚠️ PAN PAN — Urgencia Médica o de Navegación (Canal 16)
                </h3>
                <p className="text-xs text-slate-300 mt-2 font-mono leading-relaxed bg-black/40 p-4 rounded-xl border border-amber-900/30">
                  <span className="text-amber-400 font-bold">
                    Estructura Fonética:
                  </span>{" "}
                  "PAN PAN, PAN PAN, PAN PAN. A todas las estaciones / Costera
                  Tarifa Radio. Aquí [Nombre del Buque]. Posición [Coordenadas].
                  Novedad de urgencia: [Ej: Pérdida total de gobierno sin deriva
                  peligrosa, requiere remolque]. Terminado."
                </p>
              </div>

              <div className="bg-blue-950/20 border border-blue-500/30 p-6 rounded-[2rem] shadow-xl">
                <h3 className="text-sm font-black font-mono text-blue-400 flex items-center gap-2 uppercase tracking-wide">
                  ⚓ SECURITE — Seguridad y Meteorología Avisos (Canal 16)
                </h3>
                <p className="text-xs text-slate-300 mt-2 font-mono leading-relaxed bg-black/40 p-4 rounded-xl border border-blue-900/30">
                  <span className="text-blue-400 font-bold">
                    Estructura Fonética:
                  </span>{" "}
                  "SECURITE, SECURITE, SECURITE. A todos los navegantes. Aquí
                  [Estación]. Peligro para la navegación detectado: [Ej:
                  Avistamiento de tronco flotando a la deriva a 2 millas del
                  puerto de Motril]. Escuchen canal 14 para desglose.
                  Terminado."
                </p>
              </div>
            </div>
          </div>
        )}

        {/* 5a. SECCIÓN NUBES: Clasificación Meteorológica */}
        {activeSubTab === "nubes" && (
          <div className="space-y-8 pb-8">
            {/* Altitude legend */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[
                {
                  label: "Alta",
                  range: "> 6.000 m",
                  color: "text-sky-300 border-sky-800 bg-sky-950/40",
                },
                {
                  label: "Media",
                  range: "2.000 – 6.000 m",
                  color: "text-cyan-300 border-cyan-800 bg-cyan-950/40",
                },
                {
                  label: "Baja",
                  range: "< 2.000 m",
                  color: "text-slate-300 border-slate-700 bg-slate-900/60",
                },
                {
                  label: "Vertical",
                  range: "300 – 12.000 m",
                  color: "text-amber-300 border-amber-800 bg-amber-950/40",
                },
              ].map((f) => (
                <div
                  key={f.label}
                  className={cn(
                    "border rounded-2xl px-4 py-3 text-center",
                    f.color,
                  )}
                >
                  <div className="text-xs font-black uppercase tracking-widest">
                    {f.label}
                  </div>
                  <div className="text-[10px] font-mono mt-0.5 opacity-70">
                    {f.range}
                  </div>
                </div>
              ))}
            </div>

            {/* Cloud cards grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredData.map((item) => {
                const familyColors: Record<string, string> = {
                  Alta: "text-sky-300   bg-sky-950/60   border-sky-800/60",
                  Media: "text-cyan-300  bg-cyan-950/60  border-cyan-800/60",
                  Baja: "text-slate-300 bg-slate-900/60 border-slate-700/60",
                  Vertical:
                    "text-amber-300 bg-amber-950/60 border-amber-800/60",
                };
                const familyColor =
                  familyColors[item.cloudFamily || "Baja"] || familyColors.Baja;
                const isPrecipAlert = item.precipitation?.startsWith("⚠️");

                return (
                  <motion.div
                    key={item.id}
                    layout
                    initial={{ opacity: 0, y: 16 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    onClick={() => setSelectedItem(item)}
                    className="bg-slate-900/50 border border-slate-800 hover:border-cyan-500/30 rounded-[2rem] overflow-hidden shadow-xl cursor-pointer transition-all group"
                  >
                    {/* Photo */}
                    <div className="relative h-44 bg-slate-950 overflow-hidden">
                      <img
                        src={resolvePublicAsset(item.imageUrl, `nubes/${item.id}.jpg`)}
                        alt={item.title}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                        onError={applyImageFallback}
                      />
                      {/* Gradient overlay */}
                      <div className="absolute inset-0 bg-gradient-to-t from-slate-900 via-slate-900/20 to-transparent" />
                      {/* Family badge */}
                      <div
                        className={cn(
                          "absolute top-3 left-3 px-2.5 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest border",
                          familyColor,
                        )}
                      >
                        {item.cloudFamily}
                      </div>
                      {/* Altitude badge */}
                      <div className="absolute top-3 right-3 bg-slate-950/80 border border-slate-700 px-2.5 py-1 rounded-lg text-[9px] font-mono text-slate-300">
                        {item.altitude}
                      </div>
                    </div>

                    {/* Content */}
                    <div className="p-5 space-y-3">
                      <div className="flex items-start justify-between gap-2">
                        <h3 className="text-base font-black text-white uppercase tracking-tight group-hover:text-cyan-400 transition-colors flex-1">
                          {item.title}
                        </h3>
                        {/* Altitude chip */}
                        <div
                          className={cn(
                            "shrink-0 px-2.5 py-1 rounded-xl text-[9px] font-black border flex items-center gap-1",
                            familyColor,
                          )}
                        >
                          <span>📏</span>
                          <span className="font-mono">{item.altitude}</span>
                        </div>
                      </div>
                      <p className="text-[11px] text-slate-400 leading-relaxed line-clamp-3 italic">
                        "{item.description}"
                      </p>
                      {/* Precipitation indicator */}
                      <div
                        className={cn(
                          "flex items-start gap-2 text-[10px] font-bold rounded-xl px-3 py-2 border",
                          isPrecipAlert
                            ? "text-amber-300 bg-amber-950/40 border-amber-800/50"
                            : "text-slate-500 bg-slate-900/40 border-slate-800/50",
                        )}
                      >
                        <span className="shrink-0">
                          {isPrecipAlert ? "⚠️" : "🌂"}
                        </span>
                        <span className="leading-tight">
                          {item.precipitation?.replace("⚠️ ", "")}
                        </span>
                      </div>
                      {/* Footer */}
                      <div className="flex items-center justify-between pt-2 border-t border-slate-800/60 text-[9px] font-bold text-slate-600 uppercase tracking-wider">
                        <span>Ver ficha completa</span>
                        <ChevronRight className="w-3 h-3 text-cyan-700 group-hover:translate-x-0.5 transition-transform" />
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </div>
        )}

        {/* 5b. SECCIÓN ACÚSTICAS: Señales COLREGS con Síntesis de Audio */}
        {activeSubTab === "acusticas" && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 pb-8">
            {filteredData.map((item) => {
              const isActive = playingId === item.id;
              return (
                <motion.div
                  key={item.id}
                  layout
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  onClick={() => setSelectedItem(item)}
                  className="bg-slate-900/50 border border-slate-800 hover:border-cyan-500/30 rounded-[2rem] p-5 flex flex-col gap-4 transition-all group shadow-xl cursor-pointer relative overflow-hidden"
                >
                  {/* Glow when playing */}
                  {isActive && (
                    <div className="absolute inset-0 rounded-[2rem] border-2 border-cyan-400/60 shadow-[0_0_30px_rgba(34,211,238,0.25)] pointer-events-none" />
                  )}

                  {/* Header */}
                  <div className="flex items-start justify-between">
                    <div className="space-y-1">
                      <span className="text-[8px] font-black text-cyan-500 uppercase tracking-[0.2em]">
                        {item.protocol?.split("—")[0].trim() || "COLREGS"}
                      </span>
                      <h3 className="text-sm font-black text-white uppercase tracking-tight group-hover:text-cyan-400 transition-colors leading-tight">
                        {item.title}
                      </h3>
                    </div>
                    <div className="text-lg font-mono text-slate-400 shrink-0 ml-2 tracking-widest">
                      {item.symbol}
                    </div>
                  </div>

                  {/* Pattern visualization */}
                  <div className="flex items-center gap-1.5 flex-wrap min-h-[20px]">
                    {item.soundPattern?.map((beat, i) => {
                      if (beat.type === "short")
                        return (
                          <motion.div
                            key={i}
                            animate={
                              isActive
                                ? { scale: [1, 1.4, 1], opacity: [0.5, 1, 0.5] }
                                : {}
                            }
                            transition={{
                              duration: 1.0,
                              delay: i * 0.15,
                              repeat: isActive ? Infinity : 0,
                            }}
                            className="w-3 h-3 rounded-full bg-cyan-500 shadow-[0_0_6px_rgba(34,211,238,0.8)]"
                          />
                        );
                      if (beat.type === "long")
                        return (
                          <motion.div
                            key={i}
                            animate={
                              isActive
                                ? {
                                    scaleX: [1, 1.05, 1],
                                    opacity: [0.5, 1, 0.5],
                                  }
                                : {}
                            }
                            transition={{
                              duration: 4.5,
                              delay: i * 0.1,
                              repeat: isActive ? Infinity : 0,
                            }}
                            className="w-10 h-3 rounded-sm bg-cyan-500 shadow-[0_0_6px_rgba(34,211,238,0.8)]"
                          />
                        );
                      if (beat.type === "bell")
                        return (
                          <motion.span
                            key={i}
                            animate={
                              isActive
                                ? { rotate: [-12, 12, -12], scale: [1, 1.2, 1] }
                                : {}
                            }
                            transition={{
                              duration: beat.gap ?? 0.35,
                              delay: i * (beat.gap ?? 0.35),
                              repeat: isActive ? Infinity : 0,
                            }}
                            className="text-base"
                          >
                            🔔
                          </motion.span>
                        );
                      if (beat.type === "gong")
                        return (
                          <motion.span
                            key={i}
                            animate={isActive ? { scale: [1, 1.3, 1] } : {}}
                            transition={{
                              duration: 0.4,
                              delay: i * 0.4,
                              repeat: isActive ? Infinity : 0,
                            }}
                            className="text-base"
                          >
                            🎵
                          </motion.span>
                        );
                      return null;
                    })}
                  </div>

                  {/* Description */}
                  <p className="text-[11px] text-slate-400 leading-relaxed line-clamp-2 italic flex-1">
                    "{item.description}"
                  </p>

                  {/* Footer: play button + detail link */}
                  <div className="flex items-center justify-between pt-3 border-t border-slate-800/60">
                    <button
                      onClick={(e) => playAcousticSignal(item, e)}
                      className={cn(
                        "flex items-center gap-2 px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all border",
                        isActive
                          ? "bg-cyan-500/20 text-cyan-300 border-cyan-500/50 shadow-[0_0_12px_rgba(34,211,238,0.3)]"
                          : "bg-slate-800 text-slate-400 border-slate-700 hover:bg-cyan-600/20 hover:text-cyan-300 hover:border-cyan-500/40",
                      )}
                    >
                      {isActive ? (
                        <>
                          <motion.div
                            animate={{ scale: [1, 1.3, 1] }}
                            transition={{ duration: 0.5, repeat: Infinity }}
                            className="w-2 h-2 rounded-full bg-cyan-400"
                          />
                          Detener
                        </>
                      ) : (
                        <>
                          <span className="text-sm">▶</span>
                          Escuchar
                        </>
                      )}
                    </button>
                    <span className="text-[9px] font-bold text-slate-600 uppercase tracking-wider flex items-center gap-1">
                      Ver ficha
                      <ChevronRight className="w-3 h-3 text-cyan-700 group-hover:translate-x-0.5 transition-transform" />
                    </span>
                  </div>
                </motion.div>
              );
            })}
          </div>
        )}

        {/* 6. COMODÍN PARA OTRAS CATEGORÍAS (Prioridades) */}
        {![
          "banderas",
          "cabuyería",
          "balizamiento",
          "beaufort",
          "nubes",
          "radio",
          "acusticas",
        ].includes(activeSubTab) && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 pb-8">
            <AnimatePresence mode="popLayout">
              {filteredData.map((item) => (
                <motion.div
                  key={item.id}
                  layout
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  onClick={() => setSelectedItem(item)}
                  className="bg-slate-900/50 border border-slate-800 rounded-[2rem] p-6 hover:border-cyan-500/30 transition-all group shadow-xl cursor-pointer relative overflow-hidden"
                >
                  <div className="flex items-start justify-between mb-4 relative z-10">
                    <div className="space-y-1">
                      <span className="text-[8px] font-black text-cyan-500 uppercase tracking-[0.2em]">
                        {item.category}
                      </span>
                      <h3 className="text-lg font-black text-white uppercase tracking-tight group-hover:text-cyan-400 transition-colors">
                        {item.title}
                      </h3>
                    </div>
                    {item.symbol && (
                      <div className="px-3 py-1 bg-slate-800 rounded-lg text-cyan-400 font-mono text-sm border border-slate-700 shrink-0">
                        {item.symbol}
                      </div>
                    )}
                  </div>
                  <p className="text-sm text-slate-400 leading-relaxed mb-4 line-clamp-2 italic">
                    "{item.description}"
                  </p>
                  <div className="flex items-center justify-between mt-4 pt-4 border-t border-slate-800/50 text-[9px] font-bold text-slate-500 uppercase tracking-widest">
                    <span>Analizar detalles</span>
                    <ChevronRight className="w-4 h-4 text-cyan-600 group-hover:translate-x-1 transition-transform" />
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        )}

        {/* Sin datos */}
        {filteredData.length === 0 && activeSubTab !== "radio" && (
          <div className="text-center py-20 flex flex-col items-center justify-center">
            <Search className="w-12 h-12 text-slate-800 mb-4 opacity-30" />
            <p className="text-slate-500 font-bold uppercase tracking-widest text-xs">
              No se encontraron resultados para "{searchQuery}"
            </p>
          </div>
        )}
      </div>

      {/* Detail Overlay (Modal de Consulta Táctica) */}
      <AnimatePresence>
        {selectedItem && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center p-4 md:p-10 pointer-events-none"
          >
            <div
              className="absolute inset-0 bg-slate-950/90 backdrop-blur-lg pointer-events-auto"
              onClick={() => setSelectedItem(null)}
            />
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
              className="w-full max-w-3xl bg-slate-900 border-2 border-slate-700 rounded-[2rem] overflow-hidden shadow-[0_0_100px_rgba(0,0,0,1)] pointer-events-auto flex flex-col max-h-[85vh] border-t-cyan-500 relative z-50"
            >
              {/* Cabecera del Modal */}
              <div
                className={cn(
                  "h-48 relative flex items-end p-10 shrink-0",
                  selectedItem.imageUrl
                    ? "bg-slate-900"
                    : selectedItem.color || "bg-slate-800",
                )}
              >
                {selectedItem.imageUrl && (
                  <img
                    src={resolvePublicAsset(selectedItem.imageUrl)}
                    alt={selectedItem.title}
                    className="absolute inset-0 w-full h-full object-cover object-center opacity-30"
                    onError={applyImageFallback}
                  />
                )}
                <div className="absolute inset-0 bg-black/60 z-0" />
                <button
                  onClick={() => setSelectedItem(null)}
                  className="absolute top-6 right-6 p-3 bg-black hover:bg-red-600 text-white rounded-full transition-all border-2 border-white/10 z-50 shadow-2xl"
                >
                  <X className="w-5 h-5" />
                </button>
                <div className="relative z-10 space-y-2 w-full">
                  <div className="flex items-center gap-3">
                    <div className="w-2.5 h-2.5 rounded-full bg-cyan-400 shadow-[0_0_10px_rgba(34,211,238,1)]" />
                    <span className="text-[10px] font-black text-white uppercase tracking-[0.4em]">
                      {selectedItem.category || activeSubTab}
                    </span>
                  </div>
                  <h3 className="text-4xl font-black text-white uppercase tracking-tighter leading-none">
                    {selectedItem.title}
                  </h3>
                </div>
              </div>

              {/* Contenido Desplegable */}
              <div className="flex-1 overflow-y-auto p-10 space-y-8 bg-slate-950 relative z-10 custom-scrollbar text-xs">
                <div className="space-y-3">
                  <h4 className="text-[10px] font-black text-cyan-500 uppercase tracking-[0.4em] flex items-center gap-2">
                    <div className="w-1.5 h-3 bg-cyan-500 rounded-sm" />
                    Especificación Náutica Oficial
                  </h4>
                  <p className="text-xl text-white font-bold leading-relaxed">
                    {selectedItem.description}
                  </p>
                </div>

                {/* Imagen de referencia en detalle (Nudos) */}
                {selectedItem.imageUrl && (
                  <div className="rounded-2xl overflow-hidden border border-slate-800 shadow-xl">
                    <img
                      src={resolvePublicAsset(selectedItem.imageUrl)}
                      alt={`${selectedItem.title} — fotografía de referencia`}
                      className="w-full object-contain max-h-72 bg-slate-950"
                      onError={applyImageFallback}
                    />
                    <div className="px-4 py-2 bg-slate-900 border-t border-slate-800 flex items-center justify-between">
                      <span className="text-[9px] text-slate-500 font-mono uppercase tracking-widest">
                        Fotografía de referencia
                      </span>
                      <span className="text-[9px] text-slate-600 font-mono">
                        Wikimedia Commons · Dominio Público
                      </span>
                    </div>
                  </div>
                )}

                {/* Submódulo Pasos de Cabuyería */}
                {selectedItem.steps && (
                  <div className="space-y-6 border-t border-slate-900 pt-6">
                    <h4 className="text-[10px] font-black text-cyan-500 uppercase tracking-[0.4em] flex items-center gap-2">
                      <div className="w-1.5 h-3 bg-cyan-500 rounded-sm" />
                      Protocolo de Ejecución Paso a Paso
                    </h4>
                    <div className="space-y-3">
                      {selectedItem.steps.map((step, i) => (
                        <div
                          key={i}
                          className="flex gap-4 items-start bg-slate-900/40 p-3 rounded-xl border border-slate-850"
                        >
                          <span className="w-8 h-8 rounded-xl bg-slate-950 flex items-center justify-center text-xs font-black text-cyan-400 shrink-0 border border-slate-800">
                            {i + 1}
                          </span>
                          <p className="text-slate-200 font-medium pt-1.5 leading-snug">
                            {step}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Info Extendida IALA */}
                {selectedItem.buoyColor && (
                  <div className="grid grid-cols-2 gap-4 border-t border-slate-900 pt-6">
                    <div className="bg-slate-900/60 border border-slate-800 p-6 rounded-2xl text-center">
                      <span className="text-[9px] font-black text-slate-500 uppercase mb-2 block tracking-widest">
                        Estructura Boya
                      </span>
                      <p className="text-sm font-black text-white uppercase">
                        {selectedItem.buoyColor}
                      </p>
                    </div>
                    <div className="bg-slate-900/60 border border-slate-800 p-6 rounded-2xl text-center">
                      <span className="text-[9px] font-black text-slate-500 uppercase mb-2 block tracking-widest">
                        Marca de Tope
                      </span>
                      <p className="text-sm font-black text-white uppercase">
                        {selectedItem.topMark}
                      </p>
                    </div>
                  </div>
                )}

                <div className="pt-6 flex justify-end">
                  <button
                    onClick={() => setSelectedItem(null)}
                    className="px-8 py-4 bg-cyan-600 text-white rounded-xl text-[10px] font-black uppercase tracking-[0.3em] hover:bg-cyan-500 transition-all shadow-lg border border-cyan-400/30 pointer-events-auto"
                  >
                    Entendido, Almirante
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default Vademecum;
