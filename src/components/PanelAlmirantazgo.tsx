import React, { useState, useEffect } from 'react';
import { 
  ShieldCheck, 
  Users, 
  Ship, 
  ChevronDown, 
  ChevronUp, 
  CheckCircle2, 
  XCircle, 
  Search,
  Filter,
  CreditCard,
  Target
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { SupabaseClient } from '@supabase/supabase-js';
import { UserProfile, ShipData } from '../shared/types';
import { cn } from '../lib/utils';

interface PanelAlmirantazgoProps {
  supabase: SupabaseClient;
  currentUser: UserProfile;
}

interface AdminUserView extends UserProfile {
  total_barcos: number;
  barcos_list?: string[];
}

const PanelAlmirantazgo: React.FC<PanelAlmirantazgoProps> = ({ supabase, currentUser }) => {
  const [users, setUsers] = useState<AdminUserView[]>([]);
  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [expandedUser, setExpandedUser] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterPlan, setFilterPlan] = useState<'All' | 'gratis' | 'plata' | 'oro'>('All');

  const fetchAdminData = async () => {
    setLoading(true);
    try {
      console.log('[Admiralty] Interceptando datos de flota y suscripciones...');
      
      const { data: usuariosData, error: usuariosError } = await supabase
        .from('usuarios')
        .select(`
          id, nombre, email, rol, plan_nivel,
          barcos (id, nombre),
          suscripciones (id, plan_tactico, estado)
        `);

      if (usuariosError) throw usuariosError;

      if (usuariosData) {
        const usersToPatch: { usuario_id: string, plan_tactico: string, estado: string }[] = [];
        
        const formattedUsers = usuariosData.map((u: any) => {
          if (!u.suscripciones || u.suscripciones.length === 0) {
            usersToPatch.push({ usuario_id: u.id, plan_tactico: 'basico', estado: 'activo' });
          }
          return {
            ...u,
            nombre: u.nombre,
            total_barcos: u.barcos?.length || 0,
            barcos_list: u.barcos?.map((b: any) => b.nombre) || [],
            plan_tactico: u.suscripciones?.[0]?.plan_tactico || 'gratis'
          };
        });

        if (usersToPatch.length > 0) {
          console.log(`[Admiralty] Reparando ${usersToPatch.length} suscripciones faltantes...`);
          await supabase.from('suscripciones').insert(usersToPatch);
        }

        setUsers(formattedUsers as AdminUserView[]);
      }
    } catch (err) {
      console.error('Error fetching admin data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAdminData();
  }, []);

  const handleUpdatePlan = async (userId: string, newPlan: 'gratis' | 'plata' | 'oro') => {
    setIsSaving(true);
    try {
      const { error } = await supabase
        .from('usuarios')
        .update({ plan_nivel: newPlan })
        .eq('id', userId);

      if (error) throw error;
      
      setUsers(prev => prev.map(u => u.id === userId ? { ...u, plan_nivel: newPlan } : u));
    } catch (err: any) {
      console.error('Error updating plan:', err);
      alert('Fallo al actualizar nivel táctico.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleToggleSuscripcion = async (userId: string, currentStatus: boolean) => {
    setIsSaving(true);
    try {
      const { error } = await supabase
        .from('perfiles')
        .update({ suscripcion_activa: !currentStatus })
        .eq('id', userId);

      if (error) throw error;
      
      setUsers(prev => prev.map(u => u.id === userId ? { ...u, suscripcion_activa: !currentStatus } : u));
    } catch (err) {
      console.error('Error toggling subscription:', err);
      alert('Fallo al alterar estatus de suscripción.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleUpdateSubscription = async (userId: string, targetLevel: 'GRATIS' | 'PLATA' | 'ORO') => {
    setIsSaving(true);
    try {
      // Mapping logic
      let plan_nivel = '';
      let plan_tactico = '';
      
      switch (targetLevel) {
        case 'GRATIS':
          plan_nivel = 'gratis';
          plan_tactico = 'basico';
          break;
        case 'PLATA':
          plan_nivel = 'plata';
          plan_tactico = 'capitan';
          break;
        case 'ORO':
          plan_nivel = 'oro';
          plan_tactico = 'almirante';
          break;
      }

      console.log(`[Admiralty] Updating level for ${userId} to ${targetLevel} (${plan_nivel}/${plan_tactico})`);

      // 1. Update usuarios table
      const { error: userError } = await supabase
        .from('usuarios')
        .update({ plan_nivel })
        .eq('id', userId);

      if (userError) throw userError;

      // 2. Upsert suscripciones table
      const { error: subError } = await supabase
        .from('suscripciones')
        .upsert({ 
          usuario_id: userId, 
          plan_tactico: plan_tactico,
          estado: 'activo'
        }, { onConflict: 'usuario_id' });

      if (subError) throw subError;
      
      // Success: Refresh data
      await fetchAdminData();
    } catch (err: any) {
      console.error('Error táctico en handleUpdateSubscription:', err);
      alert('Error al actualizar nivel: ' + err.message);
    } finally {
      setIsSaving(false);
    }
  };

  const filteredUsers = users.filter(u => {
    const name = u.name || 'Comodoro';
    const email = u.email || '';
    const search = searchTerm.toLowerCase();
    const matchesSearch = name.toLowerCase().includes(search) || email.toLowerCase().includes(search);
    const matchesPlan = filterPlan === 'All' || u.plan_nivel === filterPlan;
    return matchesSearch && matchesPlan;
  });

  return (
    <div className="p-8 space-y-8 max-w-7xl mx-auto">
      {/* Header Almirante */}
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-6 p-10 bg-gradient-to-br from-slate-900 to-black border border-amber-500/20 rounded-[40px] relative overflow-hidden shadow-2xl">
        <div className="absolute top-0 right-0 p-12 opacity-5 pointer-events-none">
          <ShieldCheck className="w-64 h-64 text-amber-500" />
        </div>
        
        <div className="relative z-10 space-y-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-amber-500/10 rounded-2xl flex items-center justify-center border border-amber-500/30">
              <ShieldCheck className="w-6 h-6 text-amber-500" />
            </div>
            <h1 className="text-4xl font-black text-white uppercase tracking-tighter">Panel del Almirantazgo</h1>
          </div>
          <p className="text-xs font-bold text-amber-500/60 uppercase tracking-[0.4em] ml-1">Control Global de Flotas y Privilegios</p>
        </div>

        <div className="relative z-10 flex gap-4">
          {isSaving && (
            <div className="absolute -top-12 right-0 bg-amber-500 text-black px-4 py-1 rounded-full text-[10px] font-black uppercase animate-pulse">
              ⚓ Sincronizando con Supabase...
            </div>
          )}
          <div className="bg-slate-800/30 backdrop-blur-md p-6 rounded-3xl border border-white/5 text-center min-w-[140px]">
             <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">Usuarios</p>
             <p className="text-2xl font-black text-white">{users.length}</p>
          </div>
          <div className="bg-slate-800/30 backdrop-blur-md p-6 rounded-3xl border border-white/5 text-center min-w-[140px]">
             <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">Navíos Totales</p>
             <p className="text-2xl font-black text-white">{users.reduce((acc, u) => acc + u.total_barcos, 0)}</p>
          </div>
        </div>
      </header>

      {/* Toolbar Táctica */}
      <div className="flex flex-col md:flex-row gap-4">
        <div className="flex-1 relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500" />
          <input 
            type="text" 
            placeholder="Buscar por Comodoro o Email..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-slate-900 border border-slate-800 p-4 pl-12 rounded-2xl text-white outline-none focus:border-amber-500/50 transition-all font-bold placeholder:text-slate-600"
          />
        </div>
        <div className="flex gap-2">
          {['All', 'gratis', 'plata', 'oro'].map((plan) => (
            <button
              key={plan}
              onClick={() => setFilterPlan(plan as any)}
              className={cn(
                "px-6 py-4 rounded-2xl font-black uppercase tracking-widest text-[10px] border transition-all",
                filterPlan === plan 
                  ? "bg-amber-600 border-amber-500 text-white shadow-lg shadow-amber-900/20" 
                  : "bg-slate-950 border-slate-800 text-slate-500 hover:text-slate-300"
              )}
            >
              {plan === 'All' ? 'Todos' : plan}
            </button>
          ))}
        </div>
      </div>

      {/* Tabla de Almirantes */}
      <div className="bg-slate-950/50 border border-slate-800 rounded-[40px] overflow-hidden shadow-2xl">
        <table className="w-full text-left">
          <thead className="bg-slate-900/80 border-b border-slate-800">
            <tr>
              <th className="p-6 text-[10px] font-black text-slate-500 uppercase tracking-widest">Comodoro</th>
              <th className="p-6 text-[10px] font-black text-slate-500 uppercase tracking-widest text-center">Nivel Táctico</th>
              <th className="p-6 text-[10px] font-black text-slate-500 uppercase tracking-widest text-center">Unidades</th>
              <th className="p-6 text-[10px] font-black text-slate-500 uppercase tracking-widest text-center">Suscripción</th>
              <th className="p-6 text-[10px] font-black text-slate-500 uppercase tracking-widest text-right">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/50">
            {loading ? (
              <tr>
                <td colSpan={5} className="p-20 text-center">
                  <div className="flex flex-col items-center gap-4">
                    <Ship className="w-12 h-12 text-slate-800 animate-bounce" />
                    <p className="text-xs font-black text-slate-600 uppercase tracking-[0.3em]">Interceptor de Datos Activo...</p>
                  </div>
                </td>
              </tr>
            ) : filteredUsers.map((u) => (
              <React.Fragment key={u.id}>
                <tr className={cn(
                  "hover:bg-slate-800/20 transition-all group",
                  expandedUser === u.id && "bg-slate-800/10"
                )}>
                  <td className="p-6">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-full bg-slate-800 flex items-center justify-center font-black text-slate-400 group-hover:bg-amber-500/10 group-hover:text-amber-500 transition-colors">
                        {(u.name || 'C').charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <p className="text-sm font-black text-white uppercase italic">{u.nombre || 'Capitán'}</p>
                        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">{u.email || 'Sin Email Registrado'}</p>
                      </div>
                    </div>
                  </td>
                  <td className="p-6 text-center">
                    <span className={cn(
                      "text-[10px] font-black uppercase tracking-widest px-3 py-1 rounded-full border",
                      u.plan_nivel === 'oro' ? "bg-amber-500/10 text-amber-500 border-amber-500/20" :
                      u.plan_nivel === 'plata' ? "bg-cyan-500/10 text-cyan-500 border-cyan-500/20" :
                      "bg-slate-800 text-slate-500 border-slate-700"
                    )}>
                      {u.plan_nivel === 'oro' ? 'ALMIRANTE' : 
                       u.plan_nivel === 'plata' ? 'CAPITÁN' : 'BÁSICA'}
                    </span>
                  </td>
                  <td className="p-6 text-center">
                    <span className="inline-flex items-center gap-2 px-3 py-1 bg-slate-900 border border-slate-800 rounded-lg text-xs font-black text-white">
                      <Ship className="w-3 h-3 text-cyan-500" />
                      {u.total_barcos}
                    </span>
                  </td>
                  <td className="p-6 text-center">
                    <div className="flex justify-center">
                       <select 
                         disabled={isSaving}
                         value={u.plan_nivel?.toUpperCase() || 'GRATIS'}
                         onChange={(e) => handleUpdateSubscription(u.id, e.target.value as any)}
                         className="bg-slate-900 border border-slate-800 text-[10px] font-black uppercase tracking-widest p-2 rounded-xl text-white outline-none focus:border-amber-500/50 cursor-pointer"
                       >
                         <option value="GRATIS">⚓ BÁSICA</option>
                         <option value="PLATA">⚡ CAPITÁN</option>
                         <option value="ORO">🔱 ALMIRANTE</option>
                       </select>
                    </div>
                  </td>
                  <td className="p-6 text-right">
                    <button 
                      onClick={() => setExpandedUser(expandedUser === u.id ? null : u.id)}
                      className="p-3 bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded-xl text-slate-500 transition-all"
                    >
                      {expandedUser === u.id ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
                    </button>
                  </td>
                </tr>
                {/* Inspección de Hangar */}
                <AnimatePresence>
                  {expandedUser === u.id && (
                    <motion.tr
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      className="bg-black/40"
                    >
                      <td colSpan={5} className="p-8">
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                          <div className="col-span-full mb-2">
                             <h4 className="text-[10px] font-black text-amber-500 uppercase tracking-[0.3em]">Hangar del Comodoro</h4>
                          </div>
                          {u.barcos_list && u.barcos_list.length > 0 ? (
                            u.barcos_list.map((ship, idx) => (
                              <div key={idx} className="p-4 bg-slate-900 border border-slate-800 rounded-2xl flex items-center gap-3">
                                <div className="w-10 h-10 bg-slate-800 rounded-xl flex items-center justify-center">
                                  <Ship className="w-5 h-5 text-slate-500" />
                                </div>
                                <div>
                                  <p className="text-xs font-black text-white uppercase italic">{ship || 'Sin Nombre'}</p>
                                  <p className="text-[8px] font-bold text-cyan-500 uppercase tracking-widest font-mono">Estado: Activo</p>
                                </div>
                              </div>
                            ))
                          ) : (
                            <div className="col-span-full py-8 text-center bg-slate-900/50 rounded-2xl border border-dashed border-slate-800">
                               <p className="text-[10px] font-bold text-slate-600 uppercase tracking-widest">Sin unidades registradas</p>
                            </div>
                          )}
                        </div>
                      </td>
                    </motion.tr>
                  )}
                </AnimatePresence>
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>

      <footer className="p-8 bg-amber-500/5 border border-amber-500/10 rounded-3xl">
        <div className="flex items-center gap-4">
          <Target className="w-6 h-6 text-amber-500" />
          <p className="text-xs font-bold text-amber-200/60 leading-relaxed max-w-3xl uppercase tracking-tighter italic">
            "Ojo del Almirante: Todo cambio realizado en este panel afecta instantáneamente al Nivel de Acceso y privilegio de los Capitanes en el Teatro de Operaciones Global."
          </p>
        </div>
      </footer>
    </div>
  );
};

export default PanelAlmirantazgo;
