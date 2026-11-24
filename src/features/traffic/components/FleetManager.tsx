import SafetyInventoryLinks from '../../../components/SafetyInventoryLinks';
import { supabase } from '../../../supabaseClient';
import { VESSEL_IDENTITY_FIELDS } from './vesselIdentity';
import { FleetWorkspace, type FleetSection } from './FleetWorkspace';
import type { InstrumentProvider } from './technical/sensorBindings';
import { TechnicalDossier, type TechnicalTab } from './technical/TechnicalDossier';
import type { QuickVessel } from './technical/model';
import { FleetDocumentation } from './FleetDocumentation';
import { DocumentLibrary } from './documents/DocumentLibrary';
import { BoatPolarEditor } from '../../boat/BoatPolarEditor';
import React, { useEffect, useMemo, useState } from 'react';
import { Fuel, Droplets, Navigation, Loader2, Activity, Anchor, FileText, Wrench, Maximize, Radio, History, CheckCircle2, Search, ShieldCheck } from 'lucide-react';
import { motion } from 'motion/react';
import { ShipData, UserProfile } from '../../../shared/types';

interface FleetManagerProps {
  fleetLoadError?: string | null;
  onRetryFleet?: () => void;
  onExitWorkspace?: () => void;
  getInstrumentFeed?: InstrumentProvider;
  fleet: ShipData[];
  userProfile?: UserProfile | null;
  selectedShipId: string | null;
  setSelectedShipId: (id: string | null) => void | Promise<boolean | void>;
  showShipForm: boolean;
  setShowShipForm: (val: boolean) => void;
  newShip: QuickVessel;
  setNewShip: (val: QuickVessel) => void;
  handleAddShip: (e: React.FormEvent) => void;
  handleDeleteShip: (id: string) => void;
  isUploading: boolean;
  setShipPhoto: (file: File | null) => void;
  shipPhoto: File | null;
  getShipIcon: (tipo?: string, size?: string) => React.ReactNode;
  getDefaultShipImage: (tipo?: string) => string;
  selectedBarco: any;
  setSelectedBarco: (val: any) => void;
  fleetTab: 'datos' | 'mantenimiento';
  setFleetTab: (val: 'datos' | 'mantenimiento') => void;
  fetchMantenimiento: (id: string | number) => void;
  saveFichaTecnica: (e: any) => void;
  addMantenimiento: (e: any) => void;
  historial: any[];
  editShipPhoto: File | null;
  setEditShipPhoto: (file: File | null) => void;
}

const FleetManager: React.FC<FleetManagerProps> = ({
  fleet,
  fleetLoadError,
  onRetryFleet,
  onExitWorkspace,
  getInstrumentFeed,
  selectedShipId,
  setSelectedShipId,
  showShipForm,
  setShowShipForm,
  newShip,
  setNewShip,
  handleAddShip,
  isUploading,
  getDefaultShipImage,
  selectedBarco,
  setSelectedBarco,
  setFleetTab,
  fetchMantenimiento,
  saveFichaTecnica,
  addMantenimiento,
  historial,
  editShipPhoto,
  setEditShipPhoto,
  userProfile,
  handleDeleteShip
}) => {
  const [dossierTab, setDossierTab] = useState<FleetSection>('general');
  const [selecting, setSelecting] = useState(false);
  const [technicalContext,setTechnicalContext] = useState<string | null>(null);
  const [selectionError, setSelectionError] = useState<string | null>(null);
  const setActiveShip = async (ship: ShipData) => {
    if (selecting) return;
    setSelecting(true); setSelectionError(null);
    try {
      const accepted = selectedShipId === ship.id ? true : await setSelectedShipId(ship.id);
      if (accepted === false) { setSelectionError('No se pudo cambiar de embarcación. Revisa el aviso de operaciones.'); return; }
    setDossierTab('general'); setTechnicalContext(null);
    setSelectedBarco(ship);
    fetchMantenimiento(ship.id);
    setEditShipPhoto(null); // Limpiar previsualización al cambiar de unidad
    setFleetTab('datos');
    } catch (error: unknown) { setSelectionError(error instanceof Error ? error.message : "No se pudo cambiar de embarcación"); } finally { setSelecting(false); }
  };


  // Hydrate the active vessel's dossier without changing navigation or overwriting edits on GPS updates.
  useEffect(() => {
    const active = fleet.find(ship => ship.id === selectedShipId);
    if (active && selectedBarco?.id !== active.id) {
      setSelectedBarco(active);
      fetchMantenimiento(active.id);
      setDossierTab('general');
    }
  }, [fleet, selectedShipId, selectedBarco?.id, setSelectedBarco, fetchMantenimiento]);
  const dossier = selectedBarco?.id === selectedShipId ? selectedBarco : null;
  const editPhotoPreview = useMemo(() => editShipPhoto ? URL.createObjectURL(editShipPhoto) : null, [editShipPhoto]);
  useEffect(() => () => { if (editPhotoPreview) URL.revokeObjectURL(editPhotoPreview); }, [editPhotoPreview]);

  const [showRepository, setShowRepository] = useState(false);

  const navigateSection = (section: FleetSection) => {
    setShowRepository(false);
    setTechnicalContext(null);
    setDossierTab(section);
    if (section === 'datos' || section === 'documents') setFleetTab('datos');
    if (section === 'mantenimiento' || section === 'history') setFleetTab('mantenimiento');
  };
  const technicalTab: TechnicalTab | null = dossierTab === 'general' || dossierTab === 'configuration' || dossierTab === 'electricity' || dossierTab === 'tanks' || dossierTab === 'propulsion' || dossierTab === 'electronics' || dossierTab === 'rigging' || dossierTab === 'safety' ? dossierTab : null;
  return <>
    {fleetLoadError && <div role="alert" className="fw-errors">{fleetLoadError} <button type="button" onClick={onRetryFleet}>Reintentar carga de flota</button></div>}
    <FleetWorkspace loadFailed={!!fleetLoadError} fleet={fleet} ship={dossier} activeShipId={selectedShipId} section={dossierTab}
      selecting={selecting} photoUrl={selectedBarco ? editPhotoPreview || selectedBarco.foto_url || getDefaultShipImage(selectedBarco.tipo_barco) : undefined}
      photoPending={!!editShipPhoto} repositoryOpen={showRepository} detailLabel={dossierTab==='electricity'?technicalContext:null}
      onSelect={id => { const vessel=fleet.find(ship=>ship.id===id); if(vessel) void setActiveShip(vessel); }}
      onSection={navigateSection} onExit={onExitWorkspace} onAdd={()=>setShowShipForm(true)} onPhoto={setEditShipPhoto}
      onLibrary={()=>setShowRepository(value=>!value)}
      onDelete={selectedBarco && (userProfile?.id===selectedBarco.user_id || userProfile?.role==='admin') ? ()=>handleDeleteShip(selectedBarco.id) : undefined}>
      {selectionError && <p role="alert" className="fw-errors">{selectionError}</p>}
      {showRepository ? <DocumentLibrary key={userProfile?.id || 'anonymous'} userId={userProfile?.id || ''}/> : dossier && <React.Fragment key={dossier.id}>
        {dossierTab === 'safety' && <section className="space-y-3 mb-6" aria-label="Inventario de seguridad de la embarcación">
          <h3 className="text-lg font-bold">Equipos del inventario · {dossier.nombre}</h3>
          <SafetyInventoryLinks key={dossier.id} shipId={dossier.id} supabase={supabase} initiallyExpanded />
          <p className="text-sm text-slate-400">Estos registros proceden de Inventario. Vincularlos no crea otra ficha ni añade equipos al mapa técnico situado debajo.</p>
        </section>}
        {technicalTab && <TechnicalDossier key={`${userProfile?.id}:${selectedBarco.id}`} shipId={String(selectedBarco.id)} userId={userProfile?.id ?? ''} tab={technicalTab} getInstrumentFeed={getInstrumentFeed} presentation="workspace" ship={dossier} onNavigate={navigateSection} onContextChange={setTechnicalContext}/>}
        {dossierTab === 'datos' && <section className="fw-identity"><h3>Identidad de la embarcación</h3>
                <form onSubmit={saveFichaTecnica}>
                  <details open className="fd-technical"><summary>Características principales de la embarcación</summary><div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {VESSEL_IDENTITY_FIELDS.map(field => (
                    <div key={field.key} className="space-y-3 group">
                      <div className="flex items-center gap-2 px-2">
                        <span className="text-cyan-500">{field.type === 'number' ? <Maximize size={14}/> : <Anchor size={14}/>}</span>
                        <label htmlFor={`vessel-${selectedBarco.id}-${field.key}`} className="text-[10px] font-black text-slate-500 uppercase tracking-[0.3em]">{field.label}</label>
                      </div>
                      <input id={`vessel-${selectedBarco.id}-${field.key}`} name={field.key} type={field.type}
                        required={field.required} min={field.min} max={field.max} step={field.step}
                        maxLength={field.maxLength} pattern={field.pattern} placeholder="Sin especificar"
                        value={selectedBarco[field.key] ?? ''}
                        onChange={event => setSelectedBarco({...selectedBarco,[field.key]:field.type === 'number' ? (event.target.value === '' ? null : event.target.valueAsNumber) : event.target.value})}
                        className="w-full bg-white/5 border border-white/10 p-5 rounded-2xl text-white font-bold focus:border-cyan-500/50 focus:bg-white/[0.07] outline-none transition-all shadow-inner"/>
                    </div>
                  ))}
                  <p className="col-span-full text-sm text-slate-400">Datos declarados de esta embarcación. Deja vacíos los valores desconocidos. Las capacidades de depósitos y los equipos se gestionan en Configuración y Depósitos.</p>
                  <BoatPolarEditor key={String(selectedBarco.id)} shipId={String(selectedBarco.id)} />
                  {/* 🛥️ NUEVO: Selector de Icono Náutico para el Mapa */}
<div className="space-y-3 group">
  <div className="flex items-center gap-2 px-2">
    <span className="text-cyan-500"><Navigation size={14} className="rotate-45" /></span>
    <label className="text-[10px] font-black text-slate-500 uppercase tracking-[0.3em]">Tactical Map Marker</label>
  </div>
  <select
    name="icono_url"
    value={selectedBarco.icono_url || 'barco-player.png'}
    onChange={(e) => setSelectedBarco({ ...selectedBarco, icono_url: e.target.value })}
    className="w-full bg-white/5 border border-white/10 p-5 rounded-2xl text-white font-bold focus:border-cyan-500/50 focus:bg-slate-900 outline-none transition-all shadow-inner appearance-none cursor-pointer"
  >
    <option value="barco-player.png" className="bg-slate-950 text-white">Velero Realista (Render GIMP)</option>
    <option value="barco-rojo.png" className="bg-slate-950 text-white">Velero de Flota Rojo</option>
    <option value="patrullera.png" className="bg-slate-950 text-white">Unidad de Vigilancia</option>
  </select>
</div>

                  {/* Niveles Críticos (Real Storage) */}
                  <div className="col-span-full grid grid-cols-1 md:grid-cols-2 gap-8 pt-6 border-t border-white/5">
                    <div className="space-y-4 p-6 bg-black/20 rounded-3xl border border-white/5">
                      <div className="flex items-center gap-3">
                        <Fuel className="w-4 h-4 text-amber-500" />
                        <h4 className="text-[10px] font-black text-white uppercase tracking-widest">Nivel de Combustible Actual</h4>
                      </div>
                      <div className="flex items-center gap-6">
                        <input
                          type="range" min="0" max="100"
                          value={selectedBarco.fuel_level ?? 0} aria-label="Nivel agregado manual heredado"
                          onChange={(e) => setSelectedBarco({ ...selectedBarco, fuel_level: parseInt(e.target.value) })}
                          className="flex-1 h-2 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-amber-500"
                        />
                        <span className="text-xl font-black text-amber-500 min-w-[3ch]">{selectedBarco.fuel_level == null ? 'Desconocido' : `${selectedBarco.fuel_level}% · Origen heredado sin verificar`}</span>
                      </div>
                    </div>

                    <div className="space-y-4 p-6 bg-black/20 rounded-3xl border border-white/5">
                      <div className="flex items-center gap-3">
                        <Droplets className="w-4 h-4 text-cyan-500" />
                        <h4 className="text-[10px] font-black text-white uppercase tracking-widest">Reserva de Agua Dulce</h4>
                      </div>
                      <div className="flex items-center gap-6">
                        <input
                          type="range" min="0" max="100"
                          value={selectedBarco.water_level ?? 0} aria-label="Nivel agregado manual heredado"
                          onChange={(e) => setSelectedBarco({ ...selectedBarco, water_level: parseInt(e.target.value) })}
                          className="flex-1 h-2 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-cyan-500"
                        />
                        <span className="text-xl font-black text-cyan-500 min-w-[3ch]">{selectedBarco.water_level == null ? 'Desconocido' : `${selectedBarco.water_level}% · Origen heredado sin verificar`}</span>
                      </div>
                    </div>
                  </div>

                  </div></details>
                  <button
                    disabled={isUploading}
                    type="submit"
                    className="fd-save w-full col-span-full relative overflow-hidden bg-white text-black p-6 rounded-2xl font-black uppercase tracking-[0.3em] text-[11px] hover:bg-cyan-500 hover:text-white transition-all shadow-2xl mt-8 flex items-center justify-center gap-3 disabled:opacity-50 group"
                  >
                    <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent -translate-x-full group-hover:animate-[shimmer_2s_infinite] pointer-events-none" />
                    {isUploading ? (
                      <>
                        <Loader2 className="w-5 h-5 animate-spin" />
                        <span>Synchronizing Data...</span>
                      </>
                    ) : (
                      <>
                        <ShieldCheck size={18} />
                        Guardar ficha y revisiones
                      </>
                    )}
                  </button>
                </form>
        </section>}
        {dossierTab === 'documents' && <>
          <FleetDocumentation ship={selectedBarco} userId={userProfile?.id || ''} onChange={patch=>setSelectedBarco({...selectedBarco,...patch})} onMaintenance={()=>navigateSection('mantenimiento')}/>
          <form onSubmit={saveFichaTecnica}><button disabled={isUploading} type="submit" className="fd-save w-full">{isUploading?'Guardando…':'Guardar revisiones de la ficha'}</button></form>
        </>}
        {(dossierTab === 'mantenimiento' || dossierTab === 'history') && <section className="fw-maintenance"><h3>{dossierTab === 'history' ? 'Historial de la embarcación' : 'Mantenimiento'}</h3>
                <div className="space-y-12">
                  {dossierTab === 'mantenimiento' && <form onSubmit={addMantenimiento as any} className="bg-black/20 p-8 rounded-[2rem] border border-white/5 grid grid-cols-1 md:grid-cols-4 gap-6 relative overflow-hidden">
                    <div className="absolute top-0 right-0 p-4 opacity-[0.02]">
                       <Wrench size={120} />
                    </div>
                    <div className="md:col-span-2 space-y-2">
                       <label className="text-[9px] font-black text-slate-600 uppercase tracking-widest ml-2">Tarea de mantenimiento</label>
                       <input name="tarea" placeholder="Describe la tarea realizada" required className="w-full bg-white/5 border border-white/10 p-5 rounded-2xl text-white font-bold outline-none focus:border-cyan-500/50" />
                    </div>
                    <div className="space-y-2">
                       <label className="text-[9px] font-black text-slate-600 uppercase tracking-widest ml-2">Fecha</label>
                       <input type="date" name="fecha" required className="w-full bg-white/5 border border-white/10 p-5 rounded-2xl text-white font-bold outline-none focus:border-cyan-500/50 text-xs" />
                    </div>
                    <div className="space-y-2">
                       <label className="text-[9px] font-black text-slate-600 uppercase tracking-widest ml-2">Horas de motor</label>
                       <input type="number" name="horas_motor_mantenimiento" placeholder="Horas" className="w-full bg-white/5 border border-white/10 p-5 rounded-2xl text-white font-bold outline-none focus:border-cyan-500/50" />
                    </div>
                    <button type="submit" className="md:col-span-4 bg-cyan-600 text-black p-5 rounded-2xl font-black uppercase tracking-widest text-[11px] hover:bg-cyan-500 transition-all shadow-lg active:scale-[0.98]">
                      Registrar mantenimiento
                    </button>
                  </form>}

                  <div className="space-y-6">
                    <div className="flex items-center gap-4 px-2">
                      <History size={16} className="text-slate-500" />
                      <h4 className="text-xs font-black text-slate-400 uppercase tracking-[0.4em]">Historial de mantenimiento</h4>
                    </div>
                    <div className="grid grid-cols-1 gap-4">
                      {historial.length > 0 ? (
                        historial.map(h => (
                          <motion.div
                            initial={{ opacity: 0, x: -10 }}
                            whileInView={{ opacity: 1, x: 0 }}
                            key={h.id}
                            className="p-6 bg-white/[0.03] border border-white/5 rounded-[1.5rem] flex justify-between items-center group hover:bg-white/[0.05] hover:border-white/10 transition-all"
                          >
                            <div className="flex items-center gap-6">
                              <div className="w-12 h-12 rounded-xl bg-white/5 flex items-center justify-center border border-white/5">
                                <CheckCircle2 size={20} className="text-emerald-500" />
                              </div>
                              <div>
                                <h4 className="font-black text-white uppercase text-md italic tracking-tight">{h.tarea}</h4>
                                <div className="flex items-center gap-3 mt-1">
                                  <span className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">{h.fecha}</span>
                                  <span className="w-1 h-1 rounded-full bg-slate-700" />
                                  <span className="text-[10px] text-cyan-500 font-bold uppercase tracking-widest">Registro manual</span>
                                </div>
                              </div>
                            </div>
                            <div className="text-right">
                              <div className="text-2xl font-black text-white tracking-tighter leading-none">{h.horas_motor_mantenimiento}H</div>
                              <p className="text-[8px] font-black text-slate-600 uppercase tracking-widest mt-1">Horas registradas</p>
                            </div>
                          </motion.div>
                        ))
                      ) : (
                        <div className="py-20 flex flex-col items-center justify-center border border-dashed border-white/5 rounded-[2rem] bg-white/[0.01]">
                          <Search size={32} className="text-slate-800 mb-4" />
                          <p className="text-[10px] font-black text-slate-700 uppercase tracking-[0.3em]">No hay mantenimientos registrados para esta embarcación</p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
        </section>}

      </React.Fragment>}
    </FleetWorkspace>
      {showShipForm && (
        <div className="fixed inset-0 z-(--vl-z-modal) flex items-center justify-center p-4 bg-black/80 overflow-y-auto">
          <form onSubmit={handleAddShip} role="dialog" aria-modal="true" aria-labelledby="quick-vessel-title" className="bg-slate-950 border border-cyan-500/30 p-8 rounded-3xl grid grid-cols-1 md:grid-cols-2 gap-6 w-full max-w-2xl my-auto text-white">
            <div className="col-span-full"><h3 id="quick-vessel-title" className="text-2xl font-bold">Nueva embarcación</h3><p className="text-slate-400 mt-2">Alta rápida. Completa después los equipos y la documentación.</p></div>
            {(['nombre', 'marca', 'modelo', 'matricula'] as const).map((field, index) => <label key={field} className="grid gap-2 text-sm">{['Nombre *', 'Marca *', 'Modelo *', 'Matrícula / identificador (opcional)'][index]}<input autoFocus={field === 'nombre'} required={field !== 'matricula'} maxLength={240} value={newShip[field]} onChange={e => setNewShip({ ...newShip, [field]: e.target.value })} className="w-full p-3 bg-slate-900 border border-slate-700 rounded-xl" /></label>)}
            <label className="grid gap-2 text-sm">Tipo *<select value={newShip.tipo_barco} onChange={e => setNewShip({ ...newShip, tipo_barco: e.target.value })} className="w-full p-3 bg-slate-900 border border-slate-700 rounded-xl">{['Velero', 'Motora', 'Catamarán', 'Yate', 'Semirrígida', 'Otro'].map(type => <option key={type}>{type}</option>)}</select></label>
            <div className="col-span-full flex gap-4"><button type="button" disabled={isUploading} onClick={() => setShowShipForm(false)} className="p-3 rounded-xl border border-slate-600">Cancelar</button><button type="submit" disabled={isUploading || !newShip.nombre.trim() || !newShip.marca.trim() || !newShip.modelo.trim()} className="p-3 rounded-xl bg-cyan-700 disabled:opacity-50">{isUploading ? 'Registrando…' : 'Registrar embarcación'}</button></div>
          </form>
        </div>
      )}
  </>;
};

export default FleetManager;
