import React, { useState, useMemo, useCallback } from 'react';
import { 
  ShieldAlert, 
  Zap, 
  Fuel, 
  Radio, 
  LifeBuoy, 
  CheckCircle2, 
  Circle, 
  Loader2, 
  Flag,
  Droplets,
  ShieldCheck,
  Stethoscope,
  FileText,
  Wind,
  Map as MapIcon,
  Anchor,
  Waves,
  Lightbulb,
  Volume2,
  Lock,
  Compass,
  AlertTriangle,
  Battery,
  FlameKindling,
  Wrench,
  Smartphone
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { SupabaseClient } from '@supabase/supabase-js';
import { cn } from '../lib/utils';

interface SafetyModalProps {
  show: boolean;
  userProfile: any;
  supabase: SupabaseClient;
  fleet: any[];
  onComplete: () => void;
  onDispatch: (levels: { fuel_level: number; water_level: number; oil_status: string }, crewOnBoard: any[]) => void;
  setAdvisorMessage: (msg: string) => void;
  selectedShipId: string | null;
}

const SafetyModal: React.FC<SafetyModalProps> = ({ 
  show, 
  userProfile, 
  supabase, 
  fleet,
  onComplete, 
  onDispatch,
  setAdvisorMessage,
  selectedShipId
}) => {
  const activeShip = useMemo(() => {
    return fleet.find(s => s.id === selectedShipId) || fleet[0];
  }, [fleet, selectedShipId]);

  const handleAutoCompleteChecklist = () => {

  setSafetyChecklist({
    chalecos: true,
    pirotecnia: true,
    extintores: true,
    botiquin: true,
    documentacion: true,
    radio_vhf: true,

    combustible_ok: true,
    agua_potable_ok: true,
    aceite_motor: true,
    correas: true,
    sentinas: true,
    grifos_fondo: true,
    baterias: true,
    luces_nav: true,
    timon: true,

    meteorologia: true,
    cartas: true,
    fondeo: true,

    aviso_tierra: true,
    objetos_sueltos: true,
    linternas: true
  });

  setLevels({
    fuel_level: 100,
    water_level: 100,
    oil_status: 'OK'
  });

};

  const [safetyChecklist, setSafetyChecklist] = useState({
    // Seguridad y Documentación
    chalecos: false,
    pirotecnia: false, // bengalas, espejo, bocina
    extintores: false, // contraincendios
    botiquin: false,
    documentacion: false,
    radio_vhf: false,
    
    // Motor y Casco
    combustible_ok: false,
    agua_potable_ok: false,
    aceite_motor: false,
    correas: false,
    sentinas: false,
    grifos_fondo: false,
    baterias: false,
    luces_nav: false,
    timon: false,
    
    // Navegación
    meteorologia: false,
    cartas: false,
    fondeo: false,
    
    // Último minuto
    aviso_tierra: false,
    objetos_sueltos: false,
    linternas: false
  });

  const [levels, setLevels] = useState({
    fuel_level: 0,
    water_level: 0,
    oil_status: 'OK' as 'OK' | 'Revisar'
  });

  // Sync levels with active ship and reset checklist when modal opens
  React.useEffect(() => {
    if (show) {
      if (activeShip) {
        setLevels({
          fuel_level: activeShip.fuel_level ?? 0,
          water_level: activeShip.water_level ?? 0,
          oil_status: 'OK'
        });
      }
      
      // Reset checklist for a fresh start
      setSafetyChecklist({
        chalecos: false,
        pirotecnia: false,
        extintores: false,
        botiquin: false,
        documentacion: false,
        radio_vhf: false,
        combustible_ok: false,
        agua_potable_ok: false,
        aceite_motor: false,
        correas: false,
        sentinas: false,
        grifos_fondo: false,
        baterias: false,
        luces_nav: false,
        timon: false,
        meteorologia: false,
        cartas: false,
        fondeo: false,
        aviso_tierra: false,
        objetos_sueltos: false,
        linternas: false
      });
    }
  }, [show, activeShip]);

  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisProgress, setAnalysisProgress] = useState(0);

  // Initial analysis effect with inventory auto-check
  React.useEffect(() => {
    if (show && !allChecked) {
      setIsAnalyzing(true);
      setAnalysisProgress(0);

      const performAnalysis = async () => {
        // Fetch current inventory to perform auto-checks
        const { data: inventoryData } = await supabase
          .from('inventario')
          .select('*')
          .eq('barco_id', activeShip?.id || selectedShipId);

        const items = inventoryData || [];

        const interval = setInterval(() => {
          setAnalysisProgress(prev => {
            if (prev >= 100) {
              clearInterval(interval);
              setIsAnalyzing(false);

              // Perform auto-checks based on inventory and levels
              const autoChecked: Partial<typeof safetyChecklist> = {};
              
              // 1. Security & Documentation
              if (items.some(i => (i.nombre.toLowerCase().includes('chaleco') || i.categoria === 'Seguridad') && i.cantidad >= 1)) {
                autoChecked.chalecos = true;
              }
              if (items.some(i => i.nombre.toLowerCase().includes('bengala') || i.nombre.toLowerCase().includes('pirotecnia') || i.nombre.toLowerCase().includes('señal'))) {
                autoChecked.pirotecnia = true;
              }
              if (items.some(i => i.nombre.toLowerCase().includes('extintor') || i.nombre.toLowerCase().includes('incendio'))) {
                autoChecked.extintores = true;
              }
              if (items.some(i => i.categoria === 'Botiquín' || i.nombre.toLowerCase().includes('botiquin'))) {
                autoChecked.botiquin = true;
              }
              
              // Use real boat documentation fields
              if (activeShip) {
                if (activeShip.docs_certificado_navegabilidad && 
                    activeShip.docs_permiso_navegacion && 
                    activeShip.docs_seguro_vigente) {
                  autoChecked.documentacion = true;
                }
                if (activeShip.docs_leb_mmsi) {
                  autoChecked.radio_vhf = true;
                }
              } else {
                // Fallback to inventory scan if no activeShip found (unlikely)
                if (items.some(i => i.nombre.toLowerCase().includes('documentacion') || i.nombre.toLowerCase().includes('seguro') || i.nombre.toLowerCase().includes('permiso'))) {
                  autoChecked.documentacion = true;
                }
                if (items.some(i => i.nombre.toLowerCase().includes('radio') || i.nombre.toLowerCase().includes('vhf'))) {
                  autoChecked.radio_vhf = true;
                }
              }

              // 2. Engine & Hull
              const currentFuel = activeShip?.fuel_level ?? levels.fuel_level;
              const currentWater = activeShip?.water_level ?? levels.water_level;

              // Explicitly set true/false based on thresholds
              autoChecked.combustible_ok = currentFuel > 30;
              autoChecked.agua_potable_ok = currentWater > 10;
              autoChecked.aceite_motor = levels.oil_status === 'OK';
              
              if (items.some(i => i.nombre.toLowerCase().includes('bateria') || i.nombre.toLowerCase().includes('electrico'))) {
                autoChecked.baterias = true;
              }
              if (items.some(i => i.nombre.toLowerCase().includes('luz') || i.nombre.toLowerCase().includes('navegacion'))) {
                autoChecked.luces_nav = true;
              }

              // 3. Navigation
              if (items.some(i => i.nombre.toLowerCase().includes('carta') || i.nombre.toLowerCase().includes('mapa'))) {
                autoChecked.cartas = true;
              }
              if (items.some(i => i.nombre.toLowerCase().includes('ancla') || i.nombre.toLowerCase().includes('fondeo') || i.nombre.toLowerCase().includes('molinete'))) {
                autoChecked.fondeo = true;
              }

              // 4. Last minute
              if (items.some(i => i.nombre.toLowerCase().includes('linterna'))) {
                autoChecked.linternas = true;
              }

              setSafetyChecklist(prev => ({ ...prev, ...autoChecked }));
              return 100;
            }
            return prev + 5;
          });
        }, 50);
      };

      performAnalysis();
    }
  }, [show]);

  const [isSavingChecklist, setIsSavingChecklist] = useState(false);
  const [crew, setCrew] = useState<any[]>([]);
  const [selectedCrewIds, setSelectedCrewIds] = useState<string[]>([]);
  const [showAddCrew, setShowAddCrew] = useState(false);
  const [newCrew, setNewCrew] = useState({ nombre: '', rango: 'Oficial' });

  // Fetch crew
  const fetchCrew = useCallback(async () => {
    if (!supabase || (!activeShip?.id && !selectedShipId)) return;

    const { data, error } = await supabase
      .from('tripulacion')
      .select('*')
      .eq('barco_id', activeShip?.id || selectedShipId);
    
    if (!error && data) {
      // Ensure captain is in the list if they have a profile
      const crewList = [...data];
      if (userProfile && !crewList.find(c => c.nombre === userProfile.name)) {
        crewList.unshift({
          id: 'captain-' + userProfile.id,
          nombre: userProfile.name,
          rango: 'Capitán',
          is_captain: true
        });
      }
      setCrew(crewList);
      
      // Auto-select captain only once
      if (userProfile && selectedCrewIds.length === 0) {
        const captain = crewList.find(c => c.nombre === userProfile.name);
        if (captain) {
          setSelectedCrewIds([captain.id]);
        }
      }
    }
  }, [supabase, activeShip?.id, selectedShipId, userProfile]);

  React.useEffect(() => {
    if (show) {
      fetchCrew();
    }
  }, [show, fetchCrew]);

  const handleAddCrew = async () => {
    if (!newCrew.nombre) return;
    
    const barcoIdReal = activeShip?.id || selectedShipId || null;
    
    const newMember = {
      nombre: newCrew.nombre,
      rango: newCrew.rango,
      barco_id: barcoIdReal,
      esta_a_bordo: true,
      activo_ahora: false
    };

    console.log('SafetyModal: Datos a enviar:', newMember);

    const { data, error } = await supabase
      .from('tripulacion')
      .insert([newMember])
      .select();

    if (error) {
      console.error('SafetyModal: Error al añadir tripulante', error);
      return;
    }

    if (data) {
      setCrew(prev => [...prev, data[0]]);
      setNewCrew({ nombre: '', rango: 'Oficial' });
      setShowAddCrew(false);
    }
  };

  const saveSafetyChecklist = async () => {
    console.log('SafetyModal: saveSafetyChecklist clicked');
    
    // Use real ID or null
    const effectiveShipId = activeShip?.id || selectedShipId || null;
    
    const crewOnBoard = crew.filter(c => selectedCrewIds.includes(c.id));

    if (!effectiveShipId) {
      setAdvisorMessage('Error: No se ha detectado una unidad válida para el despacho.');
      return;
    }

    setIsSavingChecklist(true);
    try {
      // Prepare data and clean UUIDs
      const payload = {
        barco_id: effectiveShipId,
        fuel_level: levels.fuel_level,
        water_level: levels.water_level,
        oil_status: levels.oil_status,
        is_navigating: true,
        updated_at: new Date().toISOString()
      };

      // Clean up placeholders if any (though we now use null)
      if (payload.barco_id === '1' || payload.barco_id === 'demo-ship') {
        payload.barco_id = null as any;
      }

      // Upsert to vessel_status
      const { error: upsertError } = await supabase
        .from('vessel_status')
        .upsert(payload, { onConflict: 'barco_id' });

      if (upsertError) throw upsertError;

      console.log('SafetyModal: Upsert successful, calling onDispatch');
      onDispatch(levels, crewOnBoard);
    } catch (error: any) {
      console.log('SafetyModal: Error during upsert', error);
      // Removed redundant onDispatch call here to prevent double logging
      setAdvisorMessage(`Aviso: Sincronización limitada, pero despacho autorizado.`);
      onDispatch(levels, crewOnBoard); // Still call it once if it failed but we want to proceed
    } finally {
      setIsSavingChecklist(false);
    }
  };

  const sections = useMemo(() => [
    {
      title: 'Seguridad y Documentación',
      items: [
        { id: 'chalecos', label: 'Chalecos (1x tripulante + fecha)', icon: LifeBuoy },
        { id: 'pirotecnia', label: 'Material Seguridad (Bengalas/Espejo)', icon: Flag },
        { id: 'extintores', label: 'Sistema Contraincendios', icon: FlameKindling },
        { id: 'botiquin', label: 'Botiquín Completo', icon: Stethoscope },
        { id: 'documentacion', label: 'Documentación del Barco', icon: FileText },
        { id: 'radio_vhf', label: 'Radio VHF Cargada y Operativa', icon: Radio },
      ]
    },
    {
      title: 'Motor y Casco',
      items: [
        { id: 'combustible_ok', label: 'Combustible (Travesía + Reserva)', icon: Fuel },
        { id: 'agua_potable_ok', label: 'Reserva Agua Potable', icon: Droplets },
        { id: 'aceite_motor', label: 'Nivel Aceite y Refrigerante', icon: Wrench },
        { id: 'correas', label: 'Correas y ausencia de fugas', icon: Zap },
        { id: 'sentinas', label: 'Sentinas Secas y Estanqueidad', icon: Waves },
        { id: 'grifos_fondo', label: 'Grifos de Fondo y Escotillas', icon: Lock },
        { id: 'baterias', label: 'Baterías y Sistema Eléctrico', icon: Battery },
        { id: 'luces_nav', label: 'Luces de Navegación', icon: Lightbulb },
        { id: 'timon', label: 'Prueba de Gobierno (Timón)', icon: Compass },
      ]
    },
    {
      title: 'Navegación y Meteorología',
      items: [
        { id: 'meteorologia', label: 'Parte Meteorológico Consultado', icon: Wind },
        { id: 'cartas', label: 'Cartas Náuticas (Físicas/Digitales)', icon: MapIcon },
        { id: 'fondeo', label: 'Fondeo (Ancla, Cabo, Molinete)', icon: Anchor },
      ]
    },
    {
      title: 'Check-list Último Minuto',
      items: [
        { id: 'aviso_tierra', label: 'Plan de Navegación Avisado', icon: Smartphone },
        { id: 'objetos_sueltos', label: 'Objetos Sueltos Asegurados', icon: AlertTriangle },
        { id: 'linternas', label: 'Linternas Estancas con Pilas', icon: Lightbulb },
      ]
    }
  ], [levels, safetyChecklist]);

  const allChecked = useMemo(() => Object.values(safetyChecklist).every(v => v), [safetyChecklist]);
  const isButtonDisabled = isSavingChecklist || selectedCrewIds.length === 0 || !allChecked;

  return (
    <AnimatePresence>
      {show && (
        <motion.div 
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-950/90 backdrop-blur-xl p-4 overflow-y-auto"
        >
          <motion.div 
            initial={{ scale: 0.9, y: 20 }} animate={{ scale: 1, y: 0 }}
            className="w-full max-w-lg bg-slate-900 border border-slate-800 rounded-[40px] p-8 space-y-6 shadow-2xl my-8"
          >
            <div className="text-center space-y-4">
              {activeShip && (
                <div className="relative w-full h-32 rounded-3xl overflow-hidden border border-slate-800 shadow-inner">
                  <img 
                    src={activeShip.foto_url || 'https://images.unsplash.com/photo-1567899378494-47b22a2ae96a?q=80&w=1000&auto=format&fit=crop'} 
                    alt={activeShip.nombre}
                    className="w-full h-full object-cover"
                    referrerPolicy="no-referrer"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-slate-900 via-transparent to-transparent" />
                  <div className="absolute bottom-3 left-4 flex items-center gap-2">
                    <span className="text-xs font-black text-white uppercase tracking-tighter">{activeShip.nombre}</span>
                    <span className="text-[8px] font-bold text-cyan-500 uppercase tracking-widest">{activeShip.matricula}</span>
                  </div>
                </div>
              )}
              <div className="w-16 h-16 bg-red-500/20 rounded-2xl flex items-center justify-center mx-auto border border-red-500/30">
                <ShieldAlert className="w-8 h-8 text-red-500" />
              </div>
              <h2 className="text-2xl font-black text-white uppercase tracking-tighter">Protocolo de Despacho</h2>
              <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest leading-relaxed">
                Verificación obligatoria de sistemas y niveles antes de activar navegación.
              </p>
            </div>

            <div className="space-y-6 max-h-[50vh] overflow-y-auto pr-2 custom-scrollbar">
              {isAnalyzing ? (
                <div className="py-20 flex flex-col items-center justify-center space-y-6">
                  <div className="relative w-24 h-24">
                    <svg className="w-full h-full rotate-[-90deg]">
                      <circle
                        cx="48" cy="48" r="44"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="8"
                        className="text-slate-800"
                      />
                      <circle
                        cx="48" cy="48" r="44"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="8"
                        strokeDasharray={2 * Math.PI * 44}
                        strokeDashoffset={2 * Math.PI * 44 * (1 - analysisProgress / 100)}
                        className="text-cyan-500 transition-all duration-300"
                        strokeLinecap="round"
                      />
                    </svg>
                    <div className="absolute inset-0 flex items-center justify-center">
                      <span className="text-xl font-black text-cyan-500">{analysisProgress}%</span>
                    </div>
                  </div>
                  <div className="text-center space-y-2">
                    <p className="text-[10px] font-black text-white uppercase tracking-[0.3em] animate-pulse">Analizando Inventario y Sistemas</p>
                    <p className="text-[8px] font-bold text-slate-500 uppercase tracking-widest">
                      {analysisProgress < 30 && "Verificando equipo de seguridad..."}
                      {analysisProgress >= 30 && analysisProgress < 60 && "Comprobando niveles de motor y casco..."}
                      {analysisProgress >= 60 && analysisProgress < 90 && "Sincronizando meteorología y cartas..."}
                      {analysisProgress >= 90 && "Finalizando diagnóstico táctico..."}
                    </p>
                  </div>
                </div>
              ) : (
                <>
                 <button
      onClick={handleAutoCompleteChecklist}
      className="w-full mb-4 py-3 rounded-xl bg-amber-500 text-white font-black uppercase tracking-wider hover:bg-amber-600 transition-all"
    >
      ⚡ AUTOCOMPLETAR CHECKLIST (SIMULACIÓN)
    </button>
                  {sections.map((section, idx) => (
                    <div key={idx} className="space-y-3">
                      <h3 className="text-[10px] font-black text-cyan-500 uppercase tracking-[0.2em] px-2">{section.title}</h3>
                      <div className="grid gap-2">
                        {section.items.map(item => (
                          <button 
                            key={item.id}
                            onClick={() => {
                              console.log('SafetyModal: Toggling', item.id);
                              setSafetyChecklist(prev => {
                                const next = { ...prev, [item.id]: !prev[item.id as keyof typeof safetyChecklist] };
                                console.log('SafetyModal: New checklist', next);
                                return next;
                              });
                            }}
                            className={cn(
                              "w-full flex items-center justify-between p-4 rounded-2xl border transition-all",
                              safetyChecklist[item.id as keyof typeof safetyChecklist] 
                                ? 'border-cyan-500 bg-cyan-950/20 text-white' 
                                : 'border-slate-800 bg-slate-950/50 text-slate-500'
                            )}
                          >
                            <div className="flex items-center gap-3">
                              <item.icon className={cn("w-4 h-4", safetyChecklist[item.id as keyof typeof safetyChecklist] ? 'text-cyan-400' : 'text-slate-700')} />
                              <span className="text-[10px] font-black uppercase tracking-widest">{item.label}</span>
                            </div>
                            {safetyChecklist[item.id as keyof typeof safetyChecklist] ? <CheckCircle2 className="w-4 h-4 text-cyan-400" /> : <Circle className="w-4 h-4 text-slate-800" />}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}

                  {/* Crew Management Section (Moved here, before Zarpar) */}
                  <div className="space-y-3 pt-4 border-t border-slate-800">
                    <div className="flex justify-between items-center px-2">
                      <h3 className="text-[10px] font-black text-cyan-500 uppercase tracking-[0.2em]">Tripulación a Bordo</h3>
                      <button 
                        onClick={() => setShowAddCrew(!showAddCrew)}
                        className="text-[8px] font-black text-white bg-slate-800 hover:bg-slate-700 px-3 py-1 rounded-full border border-slate-700 transition-all"
                      >
                        {showAddCrew ? 'Cerrar' : '+ Añadir Rápido'}
                      </button>
                    </div>

                    {showAddCrew && (
                      <div className="p-4 bg-slate-950/80 border border-slate-800 rounded-2xl space-y-3 animate-in fade-in slide-in-from-top-2">
                        <div className="grid grid-cols-2 gap-2">
                          <div className="space-y-1">
                            <label className="text-[8px] font-black text-slate-500 uppercase tracking-widest ml-1">
                              Nombre <span className="text-red-500">*</span>
                            </label>
                            <input 
                              type="text" 
                              placeholder="Nombre..."
                              value={newCrew.nombre}
                              onChange={(e) => setNewCrew(prev => ({ ...prev, nombre: e.target.value }))}
                              className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white outline-none focus:border-cyan-500/50"
                            />
                          </div>
                          <div className="space-y-1">
                            <label className="text-[8px] font-black text-slate-500 uppercase tracking-widest ml-1">Rango</label>
                            <select 
                              value={newCrew.rango}
                              onChange={(e) => setNewCrew(prev => ({ ...prev, rango: e.target.value }))}
                              className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white outline-none focus:border-cyan-500/50"
                            >
                              <option value="Oficial">Oficial</option>
                              <option value="Marinero">Marinero</option>
                              <option value="Invitado">Invitado</option>
                            </select>
                          </div>
                        </div>
                        <button 
                          onClick={handleAddCrew}
                          disabled={!newCrew.nombre}
                          className="w-full py-2 bg-cyan-600 hover:bg-cyan-500 disabled:bg-slate-800 disabled:text-slate-500 text-white text-[10px] font-black uppercase rounded-xl transition-all"
                        >
                          Añadir Tripulante
                        </button>
                      </div>
                    )}

                    <div className="grid gap-2">
                      {crew.length === 0 ? (
                        <p className="text-[9px] text-slate-500 text-center py-4 italic">No hay tripulación registrada</p>
                      ) : (
                        crew.map(member => (
                          <button 
                            key={member.id}
                            onClick={() => {
                              setSelectedCrewIds(prev => 
                                prev.includes(member.id) 
                                  ? prev.filter(id => id !== member.id) 
                                  : [...prev, member.id]
                              );
                            }}
                            className={cn(
                              "flex items-center justify-between p-4 rounded-2xl border transition-all",
                              selectedCrewIds.includes(member.id)
                                ? "border-emerald-500 bg-emerald-950/20 text-white"
                                : "border-slate-800 bg-slate-950/50 text-slate-500"
                            )}
                          >
                            <div className="flex items-center gap-3">
                              <div className={cn(
                                "w-8 h-8 rounded-full flex items-center justify-center text-xs font-black",
                                selectedCrewIds.includes(member.id) ? "bg-emerald-500 text-white" : "bg-slate-800 text-slate-500"
                              )}>
                                {member.nombre.charAt(0)}
                              </div>
                              <div className="text-left">
                                <p className="text-[10px] font-black uppercase tracking-tight">{member.nombre}</p>
                                <p className="text-[8px] font-bold opacity-50 uppercase tracking-widest">{member.rango}</p>
                              </div>
                            </div>
                            {selectedCrewIds.includes(member.id) ? (
                              <div className="flex items-center gap-2">
                                <span className="text-[8px] font-black uppercase text-emerald-500">A Bordo</span>
                                <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                              </div>
                            ) : (
                              <Circle className="w-4 h-4 text-slate-800" />
                            )}
                          </button>
                        ))
                      )}
                    </div>
                  </div>
                </>
              )}
            </div>

            <div className="pt-4 flex gap-3">
              <button 
                type="button"
                onClick={onComplete}
                className="flex-1 py-4 bg-slate-800 hover:bg-slate-700 text-slate-400 font-black rounded-2xl transition-all uppercase tracking-widest text-[10px]"
              >
                Cancelar
              </button>
              <button 
                type="button"
                disabled={isButtonDisabled}
                onClick={saveSafetyChecklist}
                className="flex-[2] py-4 bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-800 text-white font-black rounded-2xl transition-all uppercase tracking-widest text-[10px] shadow-xl shadow-emerald-900/40 flex items-center justify-center gap-3"
              >
                {isSavingChecklist ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
                Finalizar Checklist e Iniciar Travesía
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default SafetyModal;
