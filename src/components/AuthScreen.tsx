import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';

import { supabase } from '../supabaseClient';

const AuthScreen = () => {
  const [isRegister, setIsRegister] = useState(false);
  
  // 1. Estados iniciales (dejamos que el useEffect mande)
  const [email, setEmail] = useState('miguelonjaen@hotmail.com');
  const [password, setPassword] = useState('22032203');
  
  const [nombre, setNombre] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 2. FUNCIÓN DE CARGA BLINDADA
  useEffect(() => {
    const recuperar = () => {
      const sEmail = localStorage.getItem('smartship_email_dev');
      const sPass = localStorage.getItem('smartship_pass_dev');
      
      if (sEmail) setEmail(sEmail);
      if (sPass) setPassword(sPass);
    };

    // Intentamos cargar 3 veces en diferentes tiempos por si la app limpia al inicio
    recuperar();
    setTimeout(recuperar, 100); 
    setTimeout(recuperar, 500);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    // 3. GUARDADO CRÍTICO
    try {
      console.log("💾 Escribiendo en localStorage...");
      localStorage.setItem('smartship_email_dev', email);
      localStorage.setItem('smartship_pass_dev', password);
      
      // Verificación inmediata
      const check = localStorage.getItem('smartship_email_dev');
      console.log("✅ Verificación inmediata post-guardado:", check);

      if (isRegister) {
        const { data, error: signUpError } = await supabase.auth.signUp({ email, password });
        if (signUpError) throw signUpError;
        
        if (data.user) {
          const { error: saveError } = await supabase.from('usuarios').upsert([
            { 
              id: data.user.id, 
              email: email, 
              rol: 'capitan', 
              nombre: nombre || 'Nuevo Capitán',
              nombre_completo: nombre || 'Nuevo Capitán',
              updated_at: new Date()
            }
          ], { onConflict: 'id' });
          if (saveError) throw saveError;
          alert('Registro completado.');
          setIsRegister(false);
        }
      } else {
        const { error: authError } = await supabase.auth.signInWithPassword({ email, password });
        if (authError) throw authError;
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-slate-950 font-sans p-4">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="w-full max-w-lg bg-slate-950 border-2 border-cyan-500/30 rounded-3xl p-10 shadow-[0_0_80px_rgba(6,182,212,0.15)] relative overflow-hidden"
      >
        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-cyan-500 to-transparent"></div>
        
        <div className="flex flex-col items-center mb-6">
          <div className="mb-5 flex justify-center">
  <img
    src="/logo.png"
    alt="SmartShip Pro"
    className="w-90 h-90 object-contain drop-shadow-[0_0_20px_rgba(6,182,212,0.35)]"
  />
           </div>
          <h1 className="text-2xl font-black text-white tracking-tight">
   <span className="text-cyan-400"></span>
</h1>


        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-red-500 text-[10px] font-bold uppercase tracking-widest text-center">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-3">
          {isRegister && (
            <input 
              type="text" required placeholder="Nombre" value={nombre} onChange={(e) => setNombre(e.target.value)}
              className="w-full px-4 py-3 bg-slate-900 border border-slate-800 rounded-xl text-white text-sm outline-none focus:border-cyan-500/50 transition-all"
            />
          )}
          <input 
            type="email" required placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)}
            className="w-full px-4 py-3 bg-slate-900 border border-slate-800 rounded-xl text-white text-sm outline-none focus:border-cyan-500/50 transition-all"
          />
          <input 
            type="password" required placeholder="Contraseña" value={password} onChange={(e) => setPassword(e.target.value)}
            className="w-full px-4 py-3 bg-slate-900 border border-slate-800 rounded-xl text-white text-sm outline-none focus:border-cyan-500/50 transition-all"
          />
          <button 
            type="submit" disabled={loading}
            className="w-full py-3.5 bg-cyan-600 hover:bg-cyan-500 disabled:bg-slate-800 text-white font-bold rounded-xl transition-all uppercase tracking-widest text-xs shadow-lg shadow-cyan-900/20"
          >
            {loading ? 'Procesando...' : (isRegister ? 'Registrarse' : 'Entrar')}
          </button>
        </form>

        <div className="mt-4 text-center">
          <button onClick={() => setIsRegister(!isRegister)} className="text-[10px] text-slate-500 font-bold uppercase tracking-widest hover:text-cyan-500 transition-colors">
            {isRegister ? '¿Ya tienes cuenta? Login' : '¿Nuevo Capitán? Registro'}
          </button>
        </div>
      </motion.div>
    </div>
  );
};

export default AuthScreen;