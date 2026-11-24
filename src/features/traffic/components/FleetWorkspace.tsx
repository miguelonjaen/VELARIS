import React from 'react';
import { Anchor, ArrowLeft, BadgeInfo, Camera, ChevronRight, Cog, Files, History, House, Plus, Radio, Sailboat, Settings2, ShieldCheck, Trash2, Wrench, Zap, Container } from 'lucide-react';
import type { ShipData } from '../../../shared/types';
import './fleetWorkspace.css';

export type FleetSection = 'general' | 'datos' | 'configuration' | 'electricity' | 'tanks' | 'propulsion' | 'electronics' | 'rigging' | 'safety' | 'mantenimiento' | 'documents' | 'history';
export const FLEET_SECTIONS = [
  {id:'general',label:'Resumen',icon:House},
  {id:'datos',label:'Identidad',icon:BadgeInfo},
  {id:'configuration',label:'Configuración',icon:Settings2},
  {id:'electricity',label:'Electricidad',icon:Zap},
  {id:'tanks',label:'Depósitos',icon:Container},
  {id:'propulsion',label:'Propulsión',icon:Cog},
  {id:'electronics',label:'Electrónica',icon:Radio},
  {id:'rigging',label:'Aparejo y velas',icon:Sailboat},
  {id:'safety',label:'Seguridad',icon:ShieldCheck},
  {id:'mantenimiento',label:'Mantenimiento',icon:Wrench},
  {id:'documents',label:'Documentos',icon:Files},
  {id:'history',label:'Historial',icon:History},
] as const;

interface Props {
  fleet: readonly ShipData[];
  ship: ShipData | null;
  activeShipId: string | null;
  section: FleetSection;
  selecting: boolean;
  photoUrl?: string;
  photoPending?: boolean;
  loadFailed?: boolean;
  repositoryOpen?: boolean;
  detailLabel?: string | null;
  onSelect: (id: string) => void;
  onSection: (section: FleetSection) => void;
  onAdd: () => void;
  onExit?: () => void;
  onLibrary: () => void;
  onPhoto: (file: File | null) => void;
  onDelete?: () => void;
  children: React.ReactNode;
}

/** Fleet-level navigation only; all mutations remain with the existing owner. */
export function FleetWorkspace({loadFailed,fleet,ship,activeShipId,section,selecting,photoUrl,photoPending,repositoryOpen,detailLabel,onSelect,onSection,onAdd,onExit,onLibrary,onPhoto,onDelete,children}:Props) {
  const sectionName=FLEET_SECTIONS.find(item=>item.id===section)?.label ?? 'Resumen';
  return <section className="fw-shell" aria-label="Operaciones de Flota">
    <header className="fw-topbar">
      <div className="fw-brand"><Sailboat size={35}/><h2>GAULOS <span>· Operaciones de Flota</span></h2>{onExit&&<button type="button" className="fw-exit-workspace" onClick={onExit}><ArrowLeft size={18}/><span>Volver a navegación</span></button>}</div>
      <label className="fw-vessel-selector"><span className={activeShipId?'fw-active-dot':'fw-idle-dot'}/><span>Barco activo:</span><select aria-label="Seleccionar embarcación activa" value={activeShipId ?? ''} disabled={selecting} onChange={event=>onSelect(event.target.value)}><option value="" disabled>Seleccionar embarcación</option>{fleet.map(vessel=><option key={vessel.id} value={vessel.id}>{vessel.nombre}</option>)}</select></label>
    </header>
    <div className="fw-layout">
      <aside className="fw-sidebar" aria-label="Secciones de la embarcación">
        <div className="fw-vessel-card">
          {ship && photoUrl ? <img src={photoUrl} alt={`Embarcación ${ship.nombre}`}/> : <div className="fw-photo-empty"><Sailboat size={70}/></div>}
          <div className="fw-vessel-caption"><h3>{ship?.nombre ?? 'Tu embarcación'}</h3><p>{ship ? [ship.marca,ship.modelo].filter(Boolean).join(' ') : 'Selecciona o añade una embarcación'}</p></div>
          {ship && <label className="fw-change-photo" title="Cambiar foto; guardar desde Identidad"><Camera size={17}/><span className="fw-sr-only">Cambiar foto de la embarcación</span><input type="file" accept="image/*" onChange={event=>onPhoto(event.target.files?.[0]??null)}/></label>}
        </div>
        {photoPending && <button className="fw-photo-pending" type="button" onClick={()=>onSection('datos')}>Foto pendiente · guardar en Identidad</button>}
        <nav className="fw-navigation">{FLEET_SECTIONS.map(({id,label,icon:Icon})=><button type="button" key={id} disabled={!ship} aria-current={!repositoryOpen&&section===id?'page':undefined} onClick={()=>onSection(id)}><Icon size={23}/><span>{label}</span></button>)}</nav>
        <div className="fw-sidebar-actions"><button type="button" onClick={onAdd}><Plus size={18}/>Añadir embarcación</button><button type="button" onClick={onLibrary} aria-pressed={repositoryOpen}><Files size={18}/>Biblioteca común</button>{onDelete && <button type="button" className="fw-delete-vessel" onClick={onDelete}><Trash2 size={16}/>Eliminar embarcación</button>}</div>
      </aside>
      <div className="fw-main">
        <nav className="fw-breadcrumb" aria-label="Ubicación en la embarcación"><span>{ship?.nombre ?? 'Flota'}</span><ChevronRight size={15}/><strong>{repositoryOpen?'Biblioteca común':sectionName}</strong>{!repositoryOpen&&detailLabel&&<><ChevronRight size={15}/><strong>{detailLabel}</strong></>}</nav>
        {ship || repositoryOpen ? children : <div className="fw-empty"><Anchor size={56}/><h3>{loadFailed?'Flota no disponible':fleet.length?'Selecciona una embarcación':'Registra tu primera embarcación'}</h3><p>{loadFailed ? 'La consulta ha fallado. Reintenta la carga antes de registrar otra embarcación.' : 'Sus equipos, documentos y configuración aparecerán aquí.'}</p><button disabled={loadFailed} type="button" onClick={onAdd}><Plus size={18}/>Añadir embarcación</button></div>}
      </div>
    </div>
  </section>;
}
