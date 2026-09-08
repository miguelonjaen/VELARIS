import React, { useState } from 'react';
import { 
  Fuel,
  Droplets,
  Plus, 
  X, 
  Camera, 
  Navigation, 
  Loader2, 
  Activity,
  Anchor,
  Trash2,
  FileText,
  Wrench,
  Maximize,
  Gauge,
  LifeBuoy,
  ShieldAlert,
  Radio,
  Clock,
  History,
  CheckCircle2,
  Search,
  ShieldCheck,
  Send,
  Circle,
  Upload
} from 'lucide-react';
import { motion } from 'motion/react';
import { supabase } from '../../../supabaseClient';
import { ShipData, UserProfile } from '../../../shared/types';
import { cn } from '../../../lib/utils';

interface FleetManagerProps {
  fleet: ShipData[];
  userProfile?: UserProfile | null;
  selectedShipId: string | null;
  setSelectedShipId: (id: string | null) => void;
  showShipForm: boolean;
  setShowShipForm: (val: boolean) => void;
  newShip: any;
  setNewShip: (val: any) => void;
  handleAddShip: (e: any) => void;
  handleDeleteShip: (id: string) => void;
  isUploading: boolean;
  setShipPhoto: (file: File | null) => void;
  shipPhoto: File | null;
  handleCaptureLocation: () => void;
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
  selectedShipId,
  setSelectedShipId,
  showShipForm,
  setShowShipForm,
  newShip,
  setNewShip,
  handleAddShip,
  isUploading,
  setShipPhoto,
  shipPhoto,
  handleCaptureLocation,
  getShipIcon,
  getDefaultShipImage,
  selectedBarco,
  setSelectedBarco,
  fleetTab,
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
  const setActiveShip = (ship: ShipData) => {
    setSelectedShipId(ship.id);
    setSelectedBarco(ship);
    fetchMantenimiento(ship.id);
    setEditShipPhoto(null); // Limpiar previsualización al cambiar de unidad
    setFleetTab('datos');
  };

  const onDeleteClick = (e: React.MouseEvent, shipId: string) => {
    e.stopPropagation(); // Evitar seleccionar el barco al intentar borrarlo
    handleDeleteShip(shipId);
  };

  const [uploadingDoc, setUploadingDoc] = useState<string | null>(null);

  const handleDocUpload = async (docId: string, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedBarco) return;

    setUploadingDoc(docId);
    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${selectedBarco.id}_${docId}_${Date.now()}.${fileExt}`;
      const filePath = `docs/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('DOCUMENTACION')
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('DOCUMENTACION')
        .getPublicUrl(filePath);

      // Actualizar el estado local y marcar como chequeado
      const urlKey = `url_${docId.replace('docs_', '')}`;
      setSelectedBarco({ 
        ...selectedBarco, 
        [docId]: true,
        [urlKey]: publicUrl 
      });

    } catch (error) {
      console.error('Error subiendo documento:', error);
      alert('Error en la carga del documento técnico.');
    } finally {
      setUploadingDoc(null);
    }
  };

  const documentationFields = [
    { id: 'docs_certificado_navegabilidad', label: 'Certificado de Navegabilidad' },
    { id: 'docs_permiso_navegacion', label: 'Permiso de Navegación / Rol' },
    { id: 'docs_seguro_vigente', label: 'Póliza de Seguro y Recibo' },
    { id: 'docs_itb_vigente', label: 'I.T.B. (Inspección Técnica) al día' },
    { id: 'docs_dni_tripulacion', label: 'DNI/Pasaporte Tripulación' },
    { id: 'docs_titulacion_patron', label: 'Titulación Náutica Patrón' },
    { id: 'docs_leb_mmsi', label: 'Licencia de Radio (LEB) / MMSI' }
  ];

  return (
    <>
      <div className="p-10 space-y-12 w-full max-w-7xl mx-auto">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
          <div className="space-y-2">
            <h2 className="text-5xl font-black text-white uppercase tracking-tighter italic">Fleet Operations</h2>
            <div className="flex items-center gap-3">
              <span className="h-0.5 w-12 bg-cyan-500 shadow-[0_0_8px_cyan]" />
              <p className="text-[10px] font-black text-cyan-500/80 uppercase tracking-[0.4em]">Strategic Unit Deployment Manager</p>
            </div>
          </div>
          <button 
            onClick={() => setShowShipForm(true)}
            className="flex items-center gap-3 px-8 py-4 bg-cyan-600 hover:bg-cyan-400 text-black rounded-full transition-all font-black uppercase tracking-widest text-[11px] shadow-[0_0_20px_rgba(6,182,212,0.4)] active:scale-95 group"
          >
            <Plus className="w-4 h-4 group-hover:rotate-90 transition-transform" />
            Recruit New Vessel
          </button>
        </div>

        {/* Fleet Grid - Luxury Dashboard Aesthetic */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-8">
          {fleet.map((b) => (
            <motion.div 
              layoutId={`ship-${b.id}`}
              key={b.id} 
              onClick={() => setActiveShip(b)}
              className={cn(
                "group relative p-8 rounded-[2rem] border transition-all duration-500 text-left overflow-hidden h-64 flex flex-col justify-between cursor-pointer",
                selectedShipId === b.id 
                  ? "bg-cyan-950/40 border-cyan-500/50 shadow-[0_0_40px_rgba(6,182,212,0.15)] ring-1 ring-cyan-500/30" 
                  : "bg-white/5 border-white/10 hover:border-white/20 hover:bg-white/[0.07] shadow-2xl"
              )}
            >
              {/* Background Ship Icon Texture */}
              <div className="absolute -bottom-4 -right-4 text-white opacity-[0.03] group-hover:opacity-[0.07] transition-opacity scale-x-[-1] pointer-events-none">
                {getShipIcon(b.tipo_barco, "w-48 h-48")}
              </div>

              <div className="space-y-4 relative z-10">
                <div className="flex justify-between items-start">
                  <div className="flex gap-2">
                    <div className={cn(
                      "p-3 rounded-2xl border transition-colors",
                      selectedShipId === b.id ? "bg-cyan-500/20 border-cyan-500/40" : "bg-white/5 border-white/10"
                    )}>
                      {getShipIcon(b.tipo_barco, "w-6 h-6 text-cyan-400")}
                    </div>
                    {selectedShipId === b.id && (
                      <div className="px-2 py-1 h-fit rounded-lg bg-emerald-500/20 border border-emerald-500/50 text-[8px] font-black text-emerald-400 uppercase tracking-widest flex items-center">
                        Activo
                      </div>
                    )}
                  </div>
                  {(userProfile?.id === b.user_id || userProfile?.role === 'admin') && (
                    <button
                      onClick={(e) => onDeleteClick(e, b.id)}
                      className="p-2 opacity-0 group-hover:opacity-100 hover:bg-red-500/20 text-red-500 hover:text-red-400 rounded-lg transition-all"
                    >
                      <Trash2 size={16} />
                    </button>
                  )}
                </div>

                <div>
                  <p className="text-[10px] font-black text-cyan-500/60 uppercase tracking-widest mb-1">{b.modelo || b.tipo_barco || 'Unidad Tactical'}</p>
                  <h3 className="text-2xl font-black text-white uppercase italic tracking-tight truncate">{b.nombre || 'U.N.I.T. Null'}</h3>
                </div>
              </div>

              <div className="relative z-10">
                <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-black/40 border border-white/5 text-[9px] font-mono text-slate-500 tracking-tighter">
                  <Activity size={10} className="text-cyan-800" />
                  {b.matricula || '--- NO REGISTRY ---'}
                </div>
              </div>
              
              {/* Glow accent */}
              <div className={cn(
                "absolute top-0 right-0 w-32 h-32 bg-cyan-500/10 blur-[60px] rounded-full -mr-16 -mt-16 transition-opacity",
                selectedShipId === b.id ? "opacity-100" : "opacity-0 group-hover:opacity-100"
              )} />
            </motion.div>
          ))}
          
          {fleet.length === 0 && (
            <div className="col-span-full py-20 flex flex-col items-center justify-center border-2 border-dashed border-white/5 rounded-[2.5rem] bg-white/[0.02]">
              <Anchor size={48} className="text-white/10 mb-6" />
              <p className="text-slate-500 font-black uppercase tracking-[0.3em] text-xs">No strategic units available</p>
              <p className="text-slate-600 text-[10px] mt-2 font-bold uppercase">Initialize fleet deployment to commence operations</p>
            </div>
          )}
        </div>

        {selectedBarco && (
          <motion.div 
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            className="glass-panel rounded-[3rem] overflow-hidden border border-white/10 shadow-[0_40px_80px_rgba(0,0,0,0.5)] neon-glow"
          >
            {/* Nav Panels */}
            <div className="flex bg-black/40 p-3 gap-3 border-b border-white/5">
              {[
                { id: 'datos', label: 'Technical Profile', icon: <FileText size={14} /> },
                { id: 'mantenimiento', label: 'System Maintenance', icon: <Wrench size={14} /> }
              ].map((tab) => (
                <button 
                  key={tab.id}
                  onClick={() => setFleetTab(tab.id as any)} 
                  className={cn(
                    "flex-1 py-4 rounded-3xl font-black uppercase tracking-widest text-[11px] transition-all flex items-center justify-center gap-3",
                    fleetTab === tab.id 
                      ? "bg-white/10 text-white shadow-[inset_0_0_20px_rgba(255,255,255,0.05)] border border-white/10" 
                      : "text-slate-500 hover:text-slate-300 hover:bg-white/5"
                  )}
                >
                  {tab.icon}
                  {tab.label}
                </button>
              ))}
            </div>

            <div className="p-10">
              <div className="flex flex-col md:flex-row items-center gap-10 mb-12 p-8 bg-black/30 rounded-[2.5rem] border border-white/5 group">
                <div className="relative w-48 h-48 shrink-0">
                  <div className="w-full h-full rounded-[2.5rem] overflow-hidden border-4 border-white/5 shadow-2xl relative">
                    <img 
                      src={editShipPhoto ? URL.createObjectURL(editShipPhoto) : (selectedBarco.foto_url || getDefaultShipImage(selectedBarco.tipo_barco))} 
                      className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110" 
                      alt="Unit Avatar"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
                  </div>
                  <label 
                    htmlFor="edit-ship-photo"
                    className="absolute inset-0 flex items-center justify-center bg-cyan-900/40 backdrop-blur-sm opacity-0 group-hover:opacity-100 transition-all rounded-[2.5rem] cursor-pointer border-2 border-cyan-500/50"
                  >
                    <div className="text-center">
                      <Camera className="w-8 h-8 text-white mx-auto mb-2" />
                      <span className="text-[10px] font-black text-white uppercase tracking-widest">Update Imaging</span>
                    </div>
                  </label>
                  <input 
                    id="edit-ship-photo"
                    type="file"
                    accept="image/*"
                    onChange={(e) => setEditShipPhoto(e.target.files?.[0] || null)}
                    className="hidden"
                  />
                </div>
                <div className="text-center md:text-left flex-1">
                  <div className="flex flex-col md:flex-row md:items-end gap-4 mb-4">
                    <h3 className="text-4xl font-black text-white uppercase italic tracking-tighter">{selectedBarco.nombre}</h3>
                    <div className="flex gap-2 mb-1.5">
                      <div className="px-4 py-1.5 rounded-full bg-cyan-500/10 border border-cyan-500/20 text-[10px] font-black text-cyan-500 uppercase tracking-widest">
                        Operational Unity
                      </div>
                      <div className="px-4 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-[10px] font-black text-emerald-500 uppercase tracking-widest">
                        Activo
                      </div>
                    </div>
                  </div>
                  <p className="text-lg font-bold text-slate-500 uppercase tracking-[0.2em]">{selectedBarco.marca} • {selectedBarco.modelo}</p>
                  
                  {editShipPhoto && (
                    <div className="mt-6 flex items-center gap-4 animate-in fade-in slide-in-from-left-4">
                      <div className="px-4 py-2 bg-emerald-500 text-black rounded-xl font-black text-[10px] uppercase tracking-widest">
                        New Visual Data Staged
                      </div>
                      <button onClick={() => setEditShipPhoto(null)} className="text-red-500 text-[10px] font-black uppercase tracking-widest hover:underline">Discard</button>
                    </div>
                  )}
                </div>
              </div>

              {fleetTab === 'datos' ? (
                <form onSubmit={saveFichaTecnica} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                  {[
  { n: 'mmsi', l: 'Digital Identity (MMSI)', d: selectedBarco.mmsi, icon: <Radio size={14} /> },
  { n: 'ais', l: 'Strategic Transponder (AIS)', d: selectedBarco.ais, icon: <Activity size={14} /> },
  { n: 'ultimo_mantenimiento_motor', l: 'Propulsion Service', d: selectedBarco.ultimo_mantenimiento_motor, t: 'date', icon: <Gauge size={14} /> },
  { n: 'ultima_revision_balsa', l: 'Life Support System', d: selectedBarco.ultima_revision_balsa, t: 'date', icon: <LifeBuoy size={14} /> },
  { n: 'ultima_revision_extintores', l: 'Suppression Systems', d: selectedBarco.ultima_revision_extintores, t: 'date', icon: <ShieldAlert size={14} /> },
  { n: 'eslora', l: 'Hull Dimensions (LOA/m)', d: selectedBarco.eslora, t: 'number', icon: <Maximize size={14} /> },
  { n: 'puerto_base', l: 'Puerto Base', d: selectedBarco.puerto_base, icon: <Anchor size={14} /> },
  { n: 'puerto_base_lat', l: 'Latitud Puerto Base', d: selectedBarco.puerto_base_lat, t: 'number', icon: <Navigation size={14} /> },
  { n: 'puerto_base_lng', l: 'Longitud Puerto Base', d: selectedBarco.puerto_base_lng, t: 'number', icon: <Navigation size={14} /> }
].map(f => (
                    <div key={f.n} className="space-y-3 group">
                      <div className="flex items-center gap-2 px-2">
                        <span className="text-cyan-500 group-focus-within:animate-pulse">{f.icon}</span>
                        <label className="text-[10px] font-black text-slate-500 uppercase tracking-[0.3em]">{f.l}</label>
                      </div>
                      <input 
                        name={f.n} 
                        type={f.t || 'text'} 
                        value={f.d || ''} 
                        onChange={(e) => setSelectedBarco({...selectedBarco, [f.n]: e.target.value})}
                        className="w-full bg-white/5 border border-white/10 p-5 rounded-2xl text-white font-bold focus:border-cyan-500/50 focus:bg-white/[0.07] outline-none transition-all shadow-inner" 
                      />
                    </div>
                  ))}
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
                          value={selectedBarco.fuel_level || 0}
                          onChange={(e) => setSelectedBarco({ ...selectedBarco, fuel_level: parseInt(e.target.value) })}
                          className="flex-1 h-2 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-amber-500"
                        />
                        <span className="text-xl font-black text-amber-500 min-w-[3ch]">{selectedBarco.fuel_level || 0}%</span>
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
                          value={selectedBarco.water_level || 0}
                          onChange={(e) => setSelectedBarco({ ...selectedBarco, water_level: parseInt(e.target.value) })}
                          className="flex-1 h-2 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-cyan-500"
                        />
                        <span className="text-xl font-black text-cyan-500 min-w-[3ch]">{selectedBarco.water_level || 0}%</span>
                      </div>
                    </div>
                  </div>

                  {/* Documentation Checklist Section */}
                  <div className="col-span-full space-y-6 pt-6 border-t border-white/5">
                    <div className="flex items-center gap-3 px-2">
                      <FileText className="w-4 h-4 text-cyan-500" />
                      <h4 className="text-[10px] font-black text-white uppercase tracking-[0.2em]">Registro de Documentación Reglamentaria</h4>
                    </div>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                      {documentationFields.map(doc => (
                        <div key={doc.id} className="relative group">
                          <label className={cn(
                            "flex flex-col p-4 rounded-2xl border transition-all cursor-pointer",
                            selectedBarco[doc.id as keyof ShipData] 
                              ? "bg-emerald-500/10 border-emerald-500/30 text-white" 
                              : "bg-white/5 border-white/10 text-slate-500"
                          )}>
                            <div className="flex justify-between items-start mb-2">
                              <span className="text-[9px] font-black uppercase tracking-widest leading-relaxed pr-2">{doc.label}</span>
                              {uploadingDoc === doc.id ? (
                                <Loader2 className="w-4 h-4 text-cyan-500 animate-spin" />
                              ) : selectedBarco[doc.id as keyof ShipData] ? (
                                <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                              ) : (
                                <Upload className="w-4 h-4 text-slate-700 shrink-0" />
                              )}
                            </div>
                            
                            {selectedBarco[`url_${doc.id.replace('docs_', '')}` as keyof ShipData] && (
                              <div className="flex items-center gap-2 mt-2">
                                <a 
                                  href={selectedBarco[`url_${doc.id.replace('docs_', '')}` as keyof ShipData] as string} 
                                  target="_blank" 
                                  rel="noreferrer"
                                  className="text-[8px] font-black text-cyan-500 hover:text-cyan-400 uppercase tracking-widest bg-cyan-500/10 px-2 py-1 rounded-md"
                                >
                                  Ver Documento
                                </a>
                              </div>
                            )}
                            
                            <input 
                              type="file" 
                              className="hidden" 
                              accept=".pdf,image/*" 
                              onChange={(e) => handleDocUpload(doc.id, e)}
                              disabled={uploadingDoc !== null}
                            />
                          </label>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="col-span-full grid grid-cols-1 md:grid-cols-2 gap-8">
                    <div className="space-y-3">
                      <label className="text-[10px] font-black text-slate-500 uppercase tracking-[0.3em] ml-2">Secure Cloud Documentation Repository</label>
                      <input 
                        name="documentacion_url" 
                        value={selectedBarco.documentacion_url || ''} 
                        onChange={(e) => setSelectedBarco({...selectedBarco, documentacion_url: e.target.value})}
                        className="w-full bg-white/5 border border-white/10 p-5 rounded-2xl text-cyan-400 font-mono text-xs focus:border-cyan-500/50 outline-none" 
                        placeholder="https://secure-docs.nucleus.ai/vessel/..."
                      />
                    </div>
                    <div className="space-y-3">
                      <label className="text-[10px] font-black text-slate-500 uppercase tracking-[0.3em] ml-2">Operations Manual Binary (PDF)</label>
                      <input 
                        name="manual_pdf" 
                        value={selectedBarco.manual_pdf || ''} 
                        onChange={(e) => setSelectedBarco({...selectedBarco, manual_pdf: e.target.value})}
                        className="w-full bg-white/5 border border-white/10 p-5 rounded-2xl text-cyan-400 font-mono text-xs focus:border-cyan-500/50 outline-none" 
                        placeholder="https://manuals.nucleus.ai/v1/..."
                      />
                    </div>
                  </div>
                  <button 
                    disabled={isUploading}
                    type="submit" 
                    className="col-span-full relative overflow-hidden bg-white text-black p-6 rounded-2xl font-black uppercase tracking-[0.3em] text-[11px] hover:bg-cyan-500 hover:text-white transition-all shadow-2xl mt-8 flex items-center justify-center gap-3 disabled:opacity-50 group"
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
                        Update Tactical Dossier
                      </>
                    )}
                  </button>
                </form>
              ) : (
                <div className="space-y-12">
                  <form onSubmit={addMantenimiento as any} className="bg-black/20 p-8 rounded-[2rem] border border-white/5 grid grid-cols-1 md:grid-cols-4 gap-6 relative overflow-hidden">
                    <div className="absolute top-0 right-0 p-4 opacity-[0.02]">
                       <Wrench size={120} />
                    </div>
                    <div className="md:col-span-2 space-y-2">
                       <label className="text-[9px] font-black text-slate-600 uppercase tracking-widest ml-2">Task Protocol</label>
                       <input name="tarea" placeholder="Define maintenance objective..." required className="w-full bg-white/5 border border-white/10 p-5 rounded-2xl text-white font-bold outline-none focus:border-cyan-500/50" />
                    </div>
                    <div className="space-y-2">
                       <label className="text-[9px] font-black text-slate-600 uppercase tracking-widest ml-2">Timeline</label>
                       <input type="date" name="fecha" required className="w-full bg-white/5 border border-white/10 p-5 rounded-2xl text-white font-bold outline-none focus:border-cyan-500/50 text-xs" />
                    </div>
                    <div className="space-y-2">
                       <label className="text-[9px] font-black text-slate-600 uppercase tracking-widest ml-2">Engine Hours</label>
                       <input type="number" name="horas_motor_mantenimiento" placeholder="Hours" className="w-full bg-white/5 border border-white/10 p-5 rounded-2xl text-white font-bold outline-none focus:border-cyan-500/50" />
                    </div>
                    <button type="submit" className="md:col-span-4 bg-cyan-600 text-black p-5 rounded-2xl font-black uppercase tracking-widest text-[11px] hover:bg-cyan-500 transition-all shadow-lg active:scale-[0.98]">
                      Finalize & Record Maintenance Protocol
                    </button>
                  </form>

                  <div className="space-y-6">
                    <div className="flex items-center gap-4 px-2">
                      <History size={16} className="text-slate-500" />
                      <h4 className="text-xs font-black text-slate-400 uppercase tracking-[0.4em]">Service Registry History</h4>
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
                                  <span className="text-[10px] text-cyan-500 font-bold uppercase tracking-widest">Protocol Verified</span>
                                </div>
                              </div>
                            </div>
                            <div className="text-right">
                              <div className="text-2xl font-black text-white tracking-tighter leading-none">{h.horas_motor_mantenimiento}H</div>
                              <p className="text-[8px] font-black text-slate-600 uppercase tracking-widest mt-1">System Runtime</p>
                            </div>
                          </motion.div>
                        ))
                      ) : (
                        <div className="py-20 flex flex-col items-center justify-center border border-dashed border-white/5 rounded-[2rem] bg-white/[0.01]">
                          <Search size={32} className="text-slate-800 mb-4" />
                          <p className="text-[10px] font-black text-slate-700 uppercase tracking-[0.3em]">No maintenance archives found for this unit</p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </div>

      {/* Modal Form New Ship */}
      {showShipForm && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 md:p-8 bg-black/80 backdrop-blur-sm overflow-y-auto">
          <motion.form 
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            onSubmit={handleAddShip as any}
            className="bg-slate-950 border border-cyan-500/30 p-8 md:p-10 rounded-[40px] grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 w-full max-w-6xl shadow-2xl shadow-cyan-900/10 relative my-auto"
          >
            <button 
              type="button"
              onClick={() => setShowShipForm(false)}
              className="absolute top-6 right-6 p-2 bg-slate-900 hover:bg-slate-800 rounded-xl text-slate-400"
            >
              <X className="w-6 h-6" />
            </button>

            <div className="col-span-full mb-4">
              <h3 className="text-2xl font-black text-white uppercase italic">Botar Nueva Embarcación</h3>
              <p className="text-[10px] font-bold text-cyan-500 uppercase tracking-[0.2em]">Incorporación a la Flota Activa</p>
            </div>

            <div className="space-y-1">
              <label className="text-[8px] font-black text-slate-500 uppercase tracking-widest ml-2">
                Nombre del Barco <span className="text-red-500">*</span>
              </label>
              <input required placeholder="Ej: Estrella del Sur" value={newShip.nombre} onChange={e => setNewShip({...newShip, nombre: e.target.value})} className="w-full px-4 py-3 bg-slate-900 border border-slate-800 rounded-xl text-white text-xs outline-none focus:border-cyan-500/50" />
            </div>
            <div className="space-y-1">
              <label className="text-[8px] font-black text-slate-500 uppercase tracking-widest ml-2">
                Marca <span className="text-red-500">*</span>
              </label>
              <input required placeholder="Ej: Beneteau" value={newShip.marca} onChange={e => setNewShip({...newShip, marca: e.target.value})} className="w-full px-4 py-3 bg-slate-900 border border-slate-800 rounded-xl text-white text-xs outline-none focus:border-cyan-500/50" />
            </div>
            <div className="space-y-1">
              <label className="text-[8px] font-black text-slate-500 uppercase tracking-widest ml-2">
                Modelo <span className="text-red-500">*</span>
              </label>
              <input required placeholder="Ej: Oceanis 41" value={newShip.modelo} onChange={e => setNewShip({...newShip, modelo: e.target.value})} className="w-full px-4 py-3 bg-slate-900 border border-slate-800 rounded-xl text-white text-xs outline-none focus:border-cyan-500/50" />
            </div>
            <div className="space-y-1">
              <label className="text-[8px] font-black text-slate-500 uppercase tracking-widest ml-2">
                Matrícula <span className="text-red-500">*</span>
              </label>
              <input required placeholder="Ej: 7ª-BA-2-123-23" value={newShip.matricula} onChange={e => setNewShip({...newShip, matricula: e.target.value})} className="w-full px-4 py-3 bg-slate-900 border border-slate-800 rounded-xl text-white text-xs outline-none focus:border-cyan-500/50" />
            </div>
            <div className="space-y-1">
              <label className="text-[8px] font-black text-slate-500 uppercase tracking-widest ml-2">
                Eslora (m) <span className="text-red-500">*</span>
              </label>
              <input required type="number" step="0.1" placeholder="0.0" value={newShip.eslora} onChange={e => setNewShip({...newShip, eslora: e.target.value})} className="w-full px-4 py-3 bg-slate-900 border border-slate-800 rounded-xl text-white text-xs outline-none focus:border-cyan-500/50" />
            </div>
            <div className="space-y-1">
              <label className="text-[8px] font-black text-slate-500 uppercase tracking-widest ml-2">
                Manga (m) <span className="text-red-500">*</span>
              </label>
              <input required type="number" step="0.1" placeholder="0.0" value={newShip.manga} onChange={e => setNewShip({...newShip, manga: e.target.value})} className="w-full px-4 py-3 bg-slate-900 border border-slate-800 rounded-xl text-white text-xs outline-none focus:border-cyan-500/50" />
            </div>
            <div className="space-y-1">
              <label className="text-[8px] font-black text-slate-500 uppercase tracking-widest ml-2">
                Calado (m) <span className="text-red-500">*</span>
              </label>
              <input required type="number" step="0.1" placeholder="0.0" value={newShip.calado} onChange={e => setNewShip({...newShip, calado: e.target.value})} className="w-full px-4 py-3 bg-slate-900 border border-slate-800 rounded-xl text-white text-xs outline-none focus:border-cyan-500/50" />
            </div>
            <div className="space-y-1">
              <label className="text-[8px] font-black text-slate-500 uppercase tracking-widest ml-2">Tipo de Barco</label>
              <select 
                value={newShip.tipo_barco} 
                onChange={e => setNewShip({...newShip, tipo_barco: e.target.value})}
                className="w-full px-4 py-3 bg-slate-900 border border-slate-800 rounded-xl text-white text-xs outline-none focus:border-cyan-500/50 appearance-none"
              >
                <option value="Velero">Velero ⛵</option>
                <option value="Motora">Motora 🚤</option>
                <option value="Catamarán">Catamarán 🛥️</option>
                <option value="Yate">Yate 🚢</option>
                <option value="Semirrígida">Semirrígida 🛶</option>
              </select>
              {/* 🛥️ Marcador Táctico Inicial para el Mapa */}
<div className="space-y-1">
  <label className="text-[8px] font-black text-slate-500 uppercase tracking-widest ml-2">Marcador de Mapa</label>
  <div className="relative">
    <select 
      value={newShip.icono_url || 'barco-player.png'} 
      onChange={e => setNewShip({...newShip, icono_url: e.target.value})} 
      className="w-full px-4 py-3 bg-slate-900 border border-slate-800 rounded-xl text-white text-xs outline-none focus:border-cyan-500/50 appearance-none cursor-pointer"
    >
      <option value="barco-player.png">Velero Realista (Render GIMP)</option>
      <option value="barco-rojo.png">Velero de Flota Rojo</option>
      <option value="patrullera.png">Unidad de Vigilancia</option>
    </select>
    {/* Flecha estética decorativa para mantener el estilo visual */}
    <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-4 text-slate-500">
      <Navigation className="w-3 h-3 rotate-135" />
    </div>
  </div>
</div>
            </div>
            <div className="space-y-1">
              <label className="text-[8px] font-black text-slate-500 uppercase tracking-widest ml-2">MMSI</label>
              <input placeholder="Ej: 224000000" value={newShip.mmsi || ''} onChange={e => setNewShip({...newShip, mmsi: e.target.value})} className="w-full px-4 py-3 bg-slate-900 border border-slate-800 rounded-xl text-white text-xs outline-none focus:border-cyan-500/50" />
            </div>
            <div className="space-y-1">
              <label className="text-[8px] font-black text-slate-500 uppercase tracking-widest ml-2">AIS</label>
              <input placeholder="Ej: Clase A" value={newShip.ais || ''} onChange={e => setNewShip({...newShip, ais: e.target.value})} className="w-full px-4 py-3 bg-slate-900 border border-slate-800 rounded-xl text-white text-xs outline-none focus:border-cyan-500/50" />
            </div>
            <div className="space-y-1">
              <label className="text-[8px] font-black text-slate-500 uppercase tracking-widest ml-2">Mantenimiento Motor</label>
              <input type="date" value={newShip.ultimo_mantenimiento_motor || ''} onChange={e => setNewShip({...newShip, ultimo_mantenimiento_motor: e.target.value || null})} className="w-full px-4 py-3 bg-slate-900 border border-slate-800 rounded-xl text-white text-xs outline-none focus:border-cyan-500/50" />
            </div>
            <div className="space-y-1">
              <label className="text-[8px] font-black text-slate-500 uppercase tracking-widest ml-2">Revisión Balsa</label>
              <input type="date" value={newShip.ultima_revision_balsa || ''} onChange={e => setNewShip({...newShip, ultima_revision_balsa: e.target.value || null})} className="w-full px-4 py-3 bg-slate-900 border border-slate-800 rounded-xl text-white text-xs outline-none focus:border-cyan-500/50" />
            </div>
            <div className="space-y-1 md:col-span-2">
  <label className="text-[8px] font-black text-slate-500 uppercase tracking-widest ml-2">
    Foto de la Embarcación
  </label>

  <div className="relative group">
    <input
      id="ship-photo-upload"
      type="file"
      accept="image/*"
      onChange={e => setShipPhoto(e.target.files?.[0] || null)}
      className="w-full px-4 py-3 bg-slate-900 border border-slate-800 rounded-xl text-white text-xs outline-none focus:border-cyan-500/50"
    />

    {shipPhoto && (
      <div className="mt-2 text-[9px] text-cyan-400 font-mono truncate">
        {shipPhoto.name}
      </div>
    )}
  </div>
</div>

<div className="space-y-1 md:col-span-2">
  <label className="text-[8px] font-black text-slate-500 uppercase tracking-widest ml-2">
    Puerto Base
  </label>

  <div className="grid grid-cols-3 gap-2">
    <input
      type="text"
      placeholder="Ej: Puerto de Motril"
      value={newShip.puerto_base || ''}
      onChange={e =>
        setNewShip({
          ...newShip,
          puerto_base: e.target.value
        })
      }
      className="w-full px-4 py-3 bg-slate-900 border border-slate-800 rounded-xl text-white text-xs outline-none focus:border-cyan-500/50"
    />

    <input
      type="number"
      step="any"
      placeholder="Latitud"
      value={newShip.puerto_base_lat ?? ''}
      onChange={e =>
        setNewShip({
          ...newShip,
          puerto_base_lat:
            e.target.value === ''
              ? null
              : Number(e.target.value)
        })
      }
      className="w-full px-4 py-3 bg-slate-900 border border-slate-800 rounded-xl text-white text-xs outline-none focus:border-cyan-500/50"
    />

    <input
      type="number"
      step="any"
      placeholder="Longitud"
      value={newShip.puerto_base_lng ?? ''}
      onChange={e =>
        setNewShip({
          ...newShip,
          puerto_base_lng:
            e.target.value === ''
              ? null
              : Number(e.target.value)
        })
      }
      className="w-full px-4 py-3 bg-slate-900 border border-slate-800 rounded-xl text-white text-xs outline-none focus:border-cyan-500/50"
    />
  </div>
</div>

<div className="space-y-1 md:col-span-2">
  <label className="text-[8px] font-black text-slate-500 uppercase tracking-widest ml-2">
    </label>

  <div className="grid grid-cols-[1fr_1fr_auto] gap-2">
    <input
      type="number"
      step="any"
      value={newShip.lat}
      onChange={e =>
        setNewShip({
          ...newShip,
          lat:
            e.target.value === ''
              ? 0
              : Number(e.target.value)
        })
      }
      className="w-full px-4 py-3 bg-slate-900 border border-slate-800 rounded-xl text-white text-xs font-mono outline-none focus:border-cyan-500/50"
      placeholder="Latitud"
    />

    <input
      type="number"
      step="any"
      value={newShip.lng}
      onChange={e =>
        setNewShip({
          ...newShip,
          lng:
            e.target.value === ''
              ? 0
              : Number(e.target.value)
        })
      }
      className="w-full px-4 py-3 bg-slate-900 border border-slate-800 rounded-xl text-white text-xs font-mono outline-none focus:border-cyan-500/50"
      placeholder="Longitud"
    />

    <button
      type="button"
      onClick={handleCaptureLocation}
      className="px-4 py-3 bg-slate-800 hover:bg-slate-700 text-cyan-500 rounded-xl border border-slate-700 transition-all active:scale-90"
      title="Capturar ubicación actual"
    >
      <Navigation className="w-4 h-4" />
    </button>
  </div>
</div>
              <div className="flex gap-4">
                <button 
                  type="button"
                  onClick={() => setShowShipForm(false)}
                  className="px-8 py-3 bg-slate-900 text-slate-400 rounded-xl font-black uppercase tracking-widest text-[10px] hover:text-white"
                >
                  Cancelar
                </button>
                <button 
                  disabled={isUploading || !newShip.nombre || !newShip.marca || !newShip.modelo || !newShip.matricula || !newShip.eslora}
                  type="submit" 
                  className="px-8 py-3 bg-cyan-600 hover:bg-cyan-500 disabled:bg-slate-800 disabled:text-slate-500 text-white rounded-xl transition-all font-black uppercase tracking-widest text-[10px] flex items-center justify-center gap-2 shadow-lg shadow-cyan-900/20 active:scale-95 min-w-[160px]"
                >
                  {isUploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                  {isUploading ? 'Botando...' : 'Guardar Barco'}
                </button>
              </div>
          </motion.form>
        </div>
      )}
    </>
  );
};

export default FleetManager;
