import React from 'react';
import { ShieldAlert, Ship } from 'lucide-react';
import { UserProfile, ShipData } from '../shared/types';

interface AdminPanelProps {
  userProfile: UserProfile | null;
  allUsers: any[];
  allShips: (ShipData & { capitan_email?: string })[];
}

const AdminPanel: React.FC<AdminPanelProps> = ({ userProfile, allUsers, allShips }) => {
  return (
    <div className="p-8 space-y-12 max-w-6xl mx-auto">
      <header className="space-y-2">
        <h1 className="text-3xl font-black text-white uppercase tracking-tighter">
          Bienvenido al Puente de Mando, Almirante {userProfile?.name || userProfile?.email}
        </h1>
        <p className="text-xs font-bold text-cyan-500 uppercase tracking-[0.3em]">Panel de Control de la Flota de Almirantazgo</p>
      </header>

      <section className="space-y-6">
        <div className="flex items-center gap-3">
          <ShieldAlert className="w-6 h-6 text-cyan-500" />
          <h2 className="text-2xl font-black text-white uppercase tracking-tighter">Gestión de Usuarios</h2>
        </div>
        <div className="bg-slate-950/50 border border-slate-800 rounded-3xl overflow-hidden">
          <table className="w-full text-left">
            <thead className="bg-slate-900/50 border-b border-slate-800">
              <tr>
                <th className="p-4 text-[10px] font-black text-slate-500 uppercase tracking-widest">Nombre</th>
                <th className="p-4 text-[10px] font-black text-slate-500 uppercase tracking-widest">Email</th>
                <th className="p-4 text-[10px] font-black text-slate-500 uppercase tracking-widest">Ubicación</th>
                <th className="p-4 text-[10px] font-black text-slate-500 uppercase tracking-widest">Fecha Registro</th>
              </tr>
            </thead>
            <tbody>
              {allUsers.map(u => (
                <tr key={u.id} className="border-b border-slate-800/50 hover:bg-slate-800/20 transition-all">
                  <td className="p-4 text-xs font-bold text-white uppercase">{u.name}</td>
                  <td className="p-4 text-xs font-bold text-slate-400">{u.email}</td>
                  <td className="p-4 text-xs font-bold text-slate-400 uppercase">{u.location || 'N/A'}</td>
                  <td className="p-4 text-xs font-bold text-slate-400">{new Date(u.created_at || '').toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="space-y-6">
        <div className="flex items-center gap-3">
          <Ship className="w-6 h-6 text-cyan-500" />
          <h2 className="text-2xl font-black text-white uppercase tracking-tighter">Flota Global</h2>
        </div>
        <div className="bg-slate-950/50 border border-slate-800 rounded-3xl overflow-hidden">
          <table className="w-full text-left">
            <thead className="bg-slate-900/50 border-b border-slate-800">
              <tr>
                <th className="p-4 text-[10px] font-black text-slate-500 uppercase tracking-widest">Barco</th>
                <th className="p-4 text-[10px] font-black text-slate-500 uppercase tracking-widest">Matrícula</th>
                <th className="p-4 text-[10px] font-black text-slate-500 uppercase tracking-widest">Capitán (Email)</th>
                <th className="p-4 text-[10px] font-black text-slate-500 uppercase tracking-widest">Dimensiones</th>
              </tr>
            </thead>
            <tbody>
              {allShips.map(s => (
                <tr key={s.id} className="border-b border-slate-800/50 hover:bg-slate-800/20 transition-all">
                  <td className="p-4">
                    <p className="text-xs font-black text-white uppercase">{s.name}</p>
                    <p className="text-[9px] font-bold text-slate-500 uppercase">{s.brand} {s.model}</p>
                  </td>
                  <td className="p-4 text-xs font-bold text-slate-400 uppercase">{s.registration}</td>
                  <td className="p-4 text-xs font-bold text-cyan-500">{s.capitan_email}</td>
                  <td className="p-4 text-xs font-bold text-slate-400">{s.length}m x {s.beam}m</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
};

export default AdminPanel;
