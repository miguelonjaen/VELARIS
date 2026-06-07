import React from 'react';
import { 
  User, 
  Camera, 
  Activity, 
  MapPin, 
  Anchor, 
  LifeBuoy, 
  ShieldAlert, 
  Loader2 
} from 'lucide-react';
import { UserProfile } from '../shared/types';
import TestSubidaFoto from './TestSubidaFoto';

interface ProfileEditorProps {
  userProfile: UserProfile | null;
  profileForm: any;
  setProfileForm: (val: any) => void;
  handleUpdateProfile: (e: any) => void;
  isUpdatingProfile: boolean;
  handleAvatarUpload: (e: any) => void;
  fetchProfile: (id: string) => void;
}

const ProfileEditor: React.FC<ProfileEditorProps> = ({
  userProfile,
  profileForm,
  setProfileForm,
  handleUpdateProfile,
  isUpdatingProfile,
  handleAvatarUpload,
  fetchProfile
}) => {
  return (
    <div className="p-8 w-full space-y-8">
      <div className="flex items-center gap-4 mb-8">
        <div className="w-16 h-16 bg-cyan-600 rounded-2xl flex items-center justify-center shadow-lg shadow-cyan-900/20">
          <User className="w-8 h-8 text-white" />
        </div>
        <div>
          <h2 className="text-3xl font-black text-white uppercase tracking-tighter">Perfil del Capitán</h2>
          <p className="text-xs font-bold text-cyan-500 uppercase tracking-widest">Gestión de Credenciales Náuticas</p>
        </div>
      </div>

      <form onSubmit={handleUpdateProfile as any} className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {/* Avatar Section */}
        <div className="md:col-span-2 flex flex-col items-center gap-6 p-8 bg-slate-950/50 border border-slate-800 rounded-3xl">
          <div className="relative group">
            <div className="w-32 h-32 rounded-full border-4 border-slate-800 overflow-hidden bg-slate-900 shadow-2xl transition-all group-hover:border-cyan-500/50">
              {profileForm.foto_perfil_url ? (
                <img src={profileForm.foto_perfil_url} alt="Avatar" className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <User className="w-12 h-12 text-slate-700" />
                </div>
              )}
            </div>
            <label className="absolute bottom-0 right-0 p-2.5 bg-cyan-600 hover:bg-cyan-500 text-white rounded-xl cursor-pointer shadow-xl transition-all hover:scale-110">
              <Camera className="w-5 h-5" />
              <input type="file" className="hidden" accept="image/*" onChange={handleAvatarUpload as any} />
            </label>
          </div>
          <div className="text-center">
            <p className="text-sm font-black text-white uppercase tracking-tighter">{userProfile?.name}</p>
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">{userProfile?.email}</p>
          </div>
          
          {/* Test Component for Verification */}
          {userProfile && (
            <TestSubidaFoto 
              userId={userProfile!.id} 
              onUploadSuccess={() => fetchProfile(userProfile!.id)} 
            />
          )}
        </div>

        {/* Personal Info */}
        <div className="space-y-6 p-8 bg-slate-950/50 border border-slate-800 rounded-3xl">
          <div className="flex items-center gap-2 mb-2">
            <Activity className="w-4 h-4 text-cyan-500" />
            <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest">Datos Personales</h3>
          </div>
          
          <div className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">
                Nombre Completo <span className="text-red-500">*</span>
              </label>
              <input 
                type="text" value={profileForm.nombre_completo} onChange={(e) => setProfileForm((prev: any) => ({ ...prev, nombre_completo: e.target.value }))}
                placeholder="Nombre y Apellidos"
                className="w-full px-4 py-3 bg-slate-900 border border-slate-800 rounded-xl text-white text-sm outline-none focus:border-cyan-500/50 transition-all"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">
                DNI / NIE <span className="text-red-500">*</span>
              </label>
              <input 
                type="text" value={profileForm.dni_nie} onChange={(e) => setProfileForm((prev: any) => ({ ...prev, dni_nie: e.target.value }))}
                placeholder="Documento de Identidad"
                className="w-full px-4 py-3 bg-slate-900 border border-slate-800 rounded-xl text-white text-sm outline-none focus:border-cyan-500/50 transition-all"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Fecha de Nacimiento</label>
              <input 
                type="date" value={profileForm.fecha_nacimiento} onChange={(e) => setProfileForm((prev: any) => ({ ...prev, fecha_nacimiento: e.target.value }))}
                className="w-full px-4 py-3 bg-slate-900 border border-slate-800 rounded-xl text-white text-sm outline-none focus:border-cyan-500/50 transition-all"
              />
            </div>
          </div>
        </div>

        {/* Location & Contact */}
        <div className="space-y-6 p-8 bg-slate-950/50 border border-slate-800 rounded-3xl">
          <div className="flex items-center gap-2 mb-2">
            <MapPin className="w-4 h-4 text-cyan-500" />
            <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest">Ubicación y Contacto</h3>
          </div>
          
          <div className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">
                Teléfono <span className="text-red-500">*</span>
              </label>
              <input 
                type="tel" value={profileForm.telefono} onChange={(e) => setProfileForm((prev: any) => ({ ...prev, telefono: e.target.value }))}
                placeholder="+34 000 000 000"
                className="w-full px-4 py-3 bg-slate-900 border border-slate-800 rounded-xl text-white text-sm outline-none focus:border-cyan-500/50 transition-all"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Nacionalidad</label>
              <input 
                type="text" value={profileForm.nacionalidad} onChange={(e) => setProfileForm((prev: any) => ({ ...prev, nacionalidad: e.target.value }))}
                placeholder="Ej: Española"
                className="w-full px-4 py-3 bg-slate-900 border border-slate-800 rounded-xl text-white text-sm outline-none focus:border-cyan-500/50 transition-all"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Dirección</label>
              <input 
                type="text" value={profileForm.direccion} onChange={(e) => setProfileForm((prev: any) => ({ ...prev, direccion: e.target.value }))}
                placeholder="Calle, número, piso..."
                className="w-full px-4 py-3 bg-slate-900 border border-slate-800 rounded-xl text-white text-sm outline-none focus:border-cyan-500/50 transition-all"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Población / Ciudad</label>
                <input 
                  type="text" value={profileForm.poblacion} onChange={(e) => setProfileForm((prev: any) => ({ ...prev, poblacion: e.target.value }))}
                  placeholder="Ciudad"
                  className="w-full px-4 py-3 bg-slate-900 border border-slate-800 rounded-xl text-white text-sm outline-none focus:border-cyan-500/50 transition-all"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Código Postal</label>
                <input 
                  type="text" value={profileForm.codigo_postal} onChange={(e) => setProfileForm((prev: any) => ({ ...prev, codigo_postal: e.target.value }))}
                  placeholder="00000"
                  className="w-full px-4 py-3 bg-slate-900 border border-slate-800 rounded-xl text-white text-sm outline-none focus:border-cyan-500/50 transition-all"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Provincia</label>
              <input 
                type="text" value={profileForm.provincia} onChange={(e) => setProfileForm((prev: any) => ({ ...prev, provincia: e.target.value }))}
                placeholder="Provincia"
                className="w-full px-4 py-3 bg-slate-900 border border-slate-800 rounded-xl text-white text-sm outline-none focus:border-cyan-500/50 transition-all"
              />
            </div>
          </div>
        </div>

        {/* Titulaciones */}
        <div className="space-y-6 p-8 bg-slate-950/50 border border-slate-800 rounded-3xl">
          <div className="flex items-center gap-2 mb-2">
            <Anchor className="w-4 h-4 text-cyan-500" />
            <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest">Titulaciones</h3>
          </div>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">
                Licencia Náutica <span className="text-red-500">*</span>
              </label>
              <select 
                value={profileForm.licencia_nautica} onChange={(e) => setProfileForm((prev: any) => ({ ...prev, licencia_nautica: e.target.value }))}
                className="w-full px-4 py-3 bg-slate-900 border border-slate-800 rounded-xl text-white text-sm outline-none focus:border-cyan-500/50 transition-all appearance-none"
              >
                <option value="">Seleccionar Licencia</option>
                <option value="Licencia de Navegación">Licencia de Navegación (Titulín)</option>
                <option value="PNB">PNB (Patrón de Navegación Básica)</option>
                <option value="PER">PER (Patrón de Embarcaciones de Recreo)</option>
                <option value="Patrón de Yate">Patrón de Yate</option>
                <option value="Capitán de Yate">Capitán de Yate</option>
              </select>
            </div>
            
            <div className="p-4 bg-cyan-950/20 border border-cyan-500/20 rounded-2xl">
              <p className="text-[9px] text-cyan-400 font-bold uppercase leading-relaxed">
                Asegúrese de que sus datos coincidan con su titulación oficial para la validez de los despachos.
              </p>
            </div>
          </div>
        </div>

        {/* Safety & Emergency Section */}
        <div className="md:col-span-2 space-y-6 p-8 bg-red-950/10 border border-red-500/30 rounded-3xl">
          <div className="flex items-center gap-2 mb-2">
            <LifeBuoy className="w-4 h-4 text-red-500" />
            <h3 className="text-xs font-black text-red-500 uppercase tracking-widest">Seguridad y Emergencia</h3>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">
                  Nombre de Contacto de Emergencia <span className="text-red-500">*</span>
                </label>
                <input 
                  type="text" value={profileForm.contacto_emergencia_nombre} onChange={(e) => setProfileForm((prev: any) => ({ ...prev, contacto_emergencia_nombre: e.target.value }))}
                  placeholder="Nombre completo"
                  className="w-full px-4 py-3 bg-slate-900 border border-slate-800 rounded-xl text-white text-sm outline-none focus:border-red-500/50 transition-all"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">
                  Teléfono de Emergencia <span className="text-red-500">*</span>
                </label>
                <input 
                  type="tel" value={profileForm.contacto_emergencia_telefono} onChange={(e) => setProfileForm((prev: any) => ({ ...prev, contacto_emergencia_telefono: e.target.value }))}
                  placeholder="+34 000 000 000"
                  className="w-full px-4 py-3 bg-slate-900 border border-slate-800 rounded-xl text-white text-sm outline-none focus:border-red-500/50 transition-all"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Grupo Sanguíneo</label>
                <select 
                  value={profileForm.grupo_sanguineo} onChange={(e) => setProfileForm((prev: any) => ({ ...prev, grupo_sanguineo: e.target.value }))}
                  className="w-full px-4 py-3 bg-slate-900 border border-slate-800 rounded-xl text-white text-sm outline-none focus:border-red-500/50 transition-all appearance-none"
                >
                  <option value="">Seleccionar Grupo</option>
                  <option value="A+">A+</option>
                  <option value="A-">A-</option>
                  <option value="B+">B+</option>
                  <option value="B-">B-</option>
                  <option value="AB+">AB+</option>
                  <option value="AB-">AB-</option>
                  <option value="O+">O+</option>
                  <option value="O-">O-</option>
                </select>
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Observaciones Médicas / Alergias</label>
              <textarea 
                value={profileForm.observaciones_medicas} onChange={(e) => setProfileForm((prev: any) => ({ ...prev, observaciones_medicas: e.target.value }))}
                placeholder="Indique alergias, medicación crónica o condiciones médicas relevantes..."
                className="w-full h-[calc(100%-24px)] px-4 py-3 bg-slate-900 border border-slate-800 rounded-xl text-white text-sm outline-none focus:border-red-500/50 transition-all resize-none"
              />
            </div>
          </div>
        </div>

        <div className="md:col-span-2 flex flex-col md:flex-row justify-between items-center pt-4 gap-4">
          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
            <span className="text-red-500">*</span> Campos obligatorios
          </p>
          <button 
            type="submit" 
            disabled={
              isUpdatingProfile || 
              !profileForm.nombre_completo || 
              !profileForm.dni_nie || 
              !profileForm.telefono || 
              !profileForm.licencia_nautica || 
              !profileForm.contacto_emergencia_nombre || 
              !profileForm.contacto_emergencia_telefono
            }
            className="px-10 py-4 bg-cyan-600 hover:bg-cyan-500 disabled:bg-slate-800 disabled:text-slate-500 text-white font-black rounded-2xl transition-all uppercase tracking-widest text-xs shadow-xl shadow-cyan-900/20 flex items-center gap-3"
          >
            {isUpdatingProfile ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldAlert className="w-4 h-4" />}
            Guardar Cambios
          </button>
        </div>
      </form>
    </div>
  );
};

export default ProfileEditor;
