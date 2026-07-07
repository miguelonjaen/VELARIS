import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';

import { supabase } from '../supabaseClient';
import logo from "@/assets/logo.png";

const AuthScreen = () => {
  const [isRegister, setIsRegister] = useState(false);
  
  // 1. Estados iniciales (dejamos que el useEffect mande)
  const [email, setEmail] = useState('miguelonjaen@hotmail.com');
  const [password, setPassword] = useState('22032203');
  
  const [nombre, setNombre] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [appVersion, setAppVersion] = useState('');

  // 2. FUNCIÓN DE CARGA BLINDADA
  useEffect(() => {
    const recuperar = () => {
      const sEmail = localStorage.getItem('VELARIS_email_dev');
      const sPass = localStorage.getItem('VELARIS_pass_dev');
      
      if (sEmail) setEmail(sEmail);
      if (sPass) setPassword(sPass);
    };

    // Intentamos cargar 3 veces en diferentes tiempos por si la app limpia al inicio
    recuperar();
    setTimeout(recuperar, 100); 
    setTimeout(recuperar, 500);
  }, []);

  const cargarVersion = async () => {
  try {
    const version = await window.VELARISAPI.getAppVersion();
    setAppVersion(version);
  } catch {
    setAppVersion('1.0.0');
  }
};

cargarVersion();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    // 3. GUARDADO CRÍTICO
    try {
      // console.log("💾 Escribiendo en localStorage...");
      localStorage.setItem('VELARIS_email_dev', email);
      localStorage.setItem('VELARIS_pass_dev', password);
      
      // Verificación inmediata
      const check = localStorage.getItem('VELARIS_email_dev');
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
        initial={{ opacity: 0 }}
        transition={{ duration: 0.5 }}
        animate={{ opacity: 1, scale: 1 }}
        className="w-full max-w-lg bg-slate-950 border border-cyan-500/20 rounded-3xl p-10 shadow-[0_0_60px_rgba(6,182,212,0.10)] relative overflow-hidden"
      >
        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-cyan-500 to-transparent"></div>
        
        <div className="flex flex-col items-center mb-10">
  <img
    src="/logo.png"
    alt="VELARIS"
    className="w-65 h-65 object-contain"
  />
  <h1 className="-mt-5 text-3xl font-black tracking-[0.18em] text-white">
    VELARIS
  </h1>
  <p className="mt-2 text-xs uppercase tracking-[0.35em] text-slate-500 font-medium">
  Professional Marine Navigation Suite
</p>

<p className="mt-4 text-[10px] text-slate-600 tracking-[0.25em] uppercase">
  Build {appVersion} • Stable
</p>
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
              className="w-full px-4 py-2.5 bg-slate-900 border border-slate-800 rounded-xl text-white text-sm outline-none focus:border-cyan-500/50 transition-all"
            />
          )}
          <input 
            type="email" required placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)}
            className="w-full px-4 py-2.5 bg-slate-900 border border-slate-800 rounded-xl text-white text-sm outline-none focus:border-cyan-500/50 transition-all"
          />
          <input 
            type="password" required placeholder="Contraseña" value={password} onChange={(e) => setPassword(e.target.value)}
            className="w-full px-4 py-2.5 bg-slate-900 border border-slate-800 rounded-xl text-white text-sm outline-none focus:border-cyan-500/50 transition-all"
          />
          <button 
            type="submit" disabled={loading}
            className="w-full py-2.5 hover:scale-[1.02] active:scale-[0.98] bg-cyan-600 hover:bg-cyan-500 disabled:bg-slate-800 text-white font-bold rounded-xl transition-all uppercase tracking-widest text-xs shadow-lg shadow-cyan-900/20"
          >
            {loading ? 'Procesando...' : (isRegister ? 'Registrarse' : 'Entrar')}
          </button>
        </form>

        <div className="mt-4 text-center">
          <button onClick={() => setIsRegister(!isRegister)} className="text-[10px] text-slate-500 font-bold uppercase tracking-widest hover:text-cyan-500 transition-colors">
            {isRegister ? '¿Ya tienes cuenta? Login' : 'Crear cuenta'}
          </button>
        </div>
      </motion.div>
    </div>
  );
};

export default AuthScreen;