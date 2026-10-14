import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Search, ShieldCheck, UserCheck, UserX } from 'lucide-react';
import { SupabaseClient } from '@supabase/supabase-js';
import { AdminUserView, UserProfile } from '../shared/types';
import { userRepository } from '../lib/supabaseRepository';
import { cn } from '../lib/utils';

interface PanelAlmirantazgoProps {
  supabase: SupabaseClient;
  currentUser: UserProfile;
}

const PRESENCE_STYLES = {
  conectado: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  'activo recientemente': 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  desconectado: 'bg-slate-800 text-slate-500 border-slate-700'
} as const;

const formatDate = (value?: string | null) =>
  value ? new Date(value).toLocaleString() : 'No disponible';

const PanelAlmirantazgo: React.FC<PanelAlmirantazgoProps> = ({ currentUser }) => {
  const [users, setUsers] = useState<AdminUserView[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingUserId, setSavingUserId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterPlan, setFilterPlan] = useState<'todos' | 'gratis' | 'plata' | 'oro'>('todos');
  const [error, setError] = useState<string | null>(null);

  const fetchAdminData = useCallback(async () => {
    if (currentUser.role !== 'admin') return;
    setLoading(true);
    setError(null);
    const { data, error: fetchError } = await userRepository.getAllUsers();
    if (fetchError) {
      setError(fetchError.message || 'No se pudo cargar la lista de usuarios.');
    } else {
      setUsers(data || []);
    }
    setLoading(false);
  }, [currentUser.role]);

  useEffect(() => {
    void fetchAdminData();
  }, [fetchAdminData]);

  const updatePlan = async (user: AdminUserView, plan: 'gratis' | 'plata' | 'oro') => {
    setSavingUserId(user.id);
    setError(null);
    const { error: updateError } = await userRepository.updateUserPlan(user.id, plan, user.cuenta_activa);
    if (updateError) {
      setError(updateError.message || 'No se pudo actualizar el plan.');
    } else {
      await fetchAdminData();
    }
    setSavingUserId(null);
  };

  const toggleAccount = async (user: AdminUserView) => {
    setSavingUserId(user.id);
    setError(null);
    const { error: updateError } = await userRepository.updateUserAccount(user.id, !user.cuenta_activa);
    if (updateError) {
      setError(updateError.message || 'No se pudo actualizar el estado de la cuenta.');
    } else {
      await fetchAdminData();
    }
    setSavingUserId(null);
  };

  const filteredUsers = useMemo(() => {
    const search = searchTerm.trim().toLowerCase();
    return users.filter(user => {
      const matchesSearch = !search ||
        (user.name || '').toLowerCase().includes(search) ||
        user.email.toLowerCase().includes(search);
      const matchesPlan = filterPlan === 'todos' || user.plan_nivel === filterPlan;
      return matchesSearch && matchesPlan;
    });
  }, [filterPlan, searchTerm, users]);

  if (currentUser.role !== 'admin') {
    return (
      <div className="p-8 text-center text-red-400 font-bold uppercase tracking-widest">
        Acceso administrativo denegado.
      </div>
    );
  }

  return (
    <div className="p-8 space-y-8 max-w-[1600px] mx-auto">
      <header className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 p-8 bg-gradient-to-br from-slate-900 to-black border border-amber-500/20 rounded-[32px]">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-amber-500/10 rounded-2xl flex items-center justify-center border border-amber-500/30">
            <ShieldCheck className="w-6 h-6 text-amber-500" />
          </div>
          <div>
            <h1 className="text-3xl font-black text-white uppercase tracking-tighter">Administración</h1>
            <p className="text-xs font-bold text-amber-500/70 uppercase tracking-[0.3em]">Usuarios, planes y acceso</p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-2xl font-black text-white">{users.length}</p>
          <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Usuarios registrados</p>
        </div>
      </header>

      {error && <div className="p-4 rounded-2xl border border-red-500/30 bg-red-500/10 text-sm text-red-300">{error}</div>}

      <div className="flex flex-col md:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500" />
          <input
            value={searchTerm}
            onChange={event => setSearchTerm(event.target.value)}
            placeholder="Buscar por nombre o email..."
            className="w-full bg-slate-900 border border-slate-800 p-4 pl-12 rounded-2xl text-white outline-none focus:border-cyan-500/50"
          />
        </div>
        <select
          value={filterPlan}
          onChange={event => setFilterPlan(event.target.value as typeof filterPlan)}
          className="bg-slate-900 border border-slate-800 p-4 rounded-2xl text-white uppercase text-xs font-bold"
        >
          <option value="todos">Todos los planes</option>
          <option value="gratis">Gratis</option>
          <option value="plata">Plata</option>
          <option value="oro">Oro</option>
        </select>
      </div>

      <div className="bg-slate-950/50 border border-slate-800 rounded-[32px] overflow-x-auto">
        <table className="w-full text-left min-w-[1100px]">
          <thead className="bg-slate-900/80 border-b border-slate-800">
            <tr>
              {['Usuario', 'Rol', 'Presencia', 'Registro', 'Último acceso', 'Plan', 'Cuenta', 'Acciones'].map(label => (
                <th key={label} className="p-4 text-[10px] font-black text-slate-500 uppercase tracking-widest">{label}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/50">
            {loading ? (
              <tr><td colSpan={8} className="p-16 text-center text-xs text-slate-500 uppercase tracking-widest">Cargando usuarios...</td></tr>
            ) : filteredUsers.map(user => (
              <tr key={user.id} className="hover:bg-slate-800/20">
                <td className="p-4">
                  <p className="font-black text-white">{user.name || 'Sin nombre'}</p>
                  <p className="text-xs text-slate-500">{user.email}</p>
                </td>
                <td className="p-4">
                  <span className={cn('inline-flex items-center gap-1 px-2 py-1 rounded-full border text-[10px] font-black uppercase', user.role === 'admin' ? 'text-amber-400 border-amber-500/30 bg-amber-500/10' : 'text-slate-400 border-slate-700')}>
                    {user.role === 'admin' && <ShieldCheck className="w-3 h-3" />}
                    {user.role}
                  </span>
                </td>
                <td className="p-4">
                  <span className={cn('px-2 py-1 rounded-full border text-[10px] font-black uppercase', PRESENCE_STYLES[user.presence_status])}>{user.presence_status}</span>
                </td>
                <td className="p-4 text-xs text-slate-400">{formatDate(user.created_at)}</td>
                <td className="p-4 text-xs text-slate-400">{formatDate(user.last_access_at)}</td>
                <td className="p-4">
                  <select
                    disabled={savingUserId === user.id}
                    value={user.plan_nivel}
                    onChange={event => void updatePlan(user, event.target.value as 'gratis' | 'plata' | 'oro')}
                    className="bg-slate-900 border border-slate-700 rounded-lg p-2 text-xs text-white uppercase"
                  >
                    <option value="gratis">Gratis</option>
                    <option value="plata">Plata</option>
                    <option value="oro">Oro</option>
                  </select>
                </td>
                <td className="p-4">
                  <span className={cn('text-xs font-bold uppercase', user.cuenta_activa ? 'text-emerald-400' : 'text-red-400')}>
                    {user.cuenta_activa ? 'Activa' : 'Desactivada'}
                  </span>
                </td>
                <td className="p-4">
                  <button
                    disabled={savingUserId === user.id || user.id === currentUser.id}
                    onClick={() => void toggleAccount(user)}
                    title={user.id === currentUser.id ? 'No puede desactivar su propia cuenta' : undefined}
                    className="p-2 rounded-lg border border-slate-700 text-slate-400 hover:text-white disabled:opacity-40"
                  >
                    {user.cuenta_activa ? <UserX className="w-4 h-4" /> : <UserCheck className="w-4 h-4" />}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default PanelAlmirantazgo;
