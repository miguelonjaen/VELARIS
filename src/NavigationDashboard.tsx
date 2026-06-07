import React, { useState, useEffect } from 'react';
import { Compass, Navigation, Gauge, Waves, MapPin, Activity } from 'lucide-react';
import { motion } from 'motion/react';
import { cn } from '../../../lib/utils';
import { Language, translations } from '../../../i18n';
import { SensorQualityMap } from '../../../lib/sensorQuality';

interface NavData {
  lat: number;
  lng: number;
  heading: number;
  sog: number;
  depth: number;
}

interface Props {
  lang: Language;
  dataSource: Record<string, 'real' | 'simulated'>;
  setDataSource: (val: any) => void;
  sensorQuality?: SensorQualityMap;
}

export const NavigationDashboard: React.FC<Props> = ({ lang, dataSource, setDataSource, sensorQuality }) => {
  const t = translations[lang];
  const [navData, setNavData] = useState<NavData>({
    lat: 36.7215,
    lng: -3.5235,
    heading: 45,
    sog: 12.5,
    depth: 15.2
  });

  // Simulation Logic (Data Engine)
  useEffect(() => {
    const interval = setInterval(() => {
      setNavData(prev => {
        const next = { ...prev };
        
        if (dataSource.gps === 'simulated') {
          next.lat += (Math.random() - 0.5) * 0.0001;
          next.lng += (Math.random() - 0.5) * 0.0001;
        }
        
        if (dataSource.heading === 'simulated') {
          next.heading = (next.heading + (Math.random() - 0.5) * 2 + 360) % 360;
        }
        
        if (dataSource.sog === 'simulated') {
          next.sog = Math.max(0, Math.min(25, next.sog + (Math.random() - 0.5) * 0.5));
        }
        
        if (dataSource.depth === 'simulated') {
          next.depth = Math.max(2, Math.min(50, next.depth + (Math.random() - 0.5) * 0.2));
        }
        
        return next;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [dataSource]);

  const toggleDataSource = (sensor: string) => {
    setDataSource((prev: any) => ({
      ...prev,
      [sensor]: prev[sensor] === 'real' ? 'simulated' : 'real'
    }));
  };

  const NavCard = ({ icon: Icon, title, value, unit, sensor }: any) => {
    const quality = sensorQuality?.[sensor as keyof SensorQualityMap];
    const statusClass =
      quality?.status === 'excellent' || quality?.status === 'good'
        ? 'text-emerald-400'
        : quality?.status === 'stale'
          ? 'text-amber-400'
          : 'text-slate-500';

    return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-slate-900/50 backdrop-blur-md border border-slate-800/60 p-6 rounded-[2.5rem] shadow-2xl relative overflow-hidden group"
    >
      <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
        <Icon size={80} className="text-cyan-500" />
      </div>
      
      <div className="flex justify-between items-start mb-4">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-cyan-500/10 rounded-2xl text-cyan-500">
            <Icon size={20} />
          </div>
          <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em]">{title}</h3>
        </div>
        
        <button 
          onClick={() => toggleDataSource(sensor)}
          className={cn(
            "px-3 py-1 rounded-full text-[8px] font-black uppercase tracking-widest transition-all",
            dataSource[sensor] === 'simulated' 
              ? "bg-amber-500/20 text-amber-500 border border-amber-500/30" 
              : "bg-emerald-500/20 text-emerald-500 border border-emerald-500/30"
          )}
        >
          {dataSource[sensor] === 'simulated' ? t.sim_mode : t.real_mode}
        </button>
      </div>

      <div className="flex items-baseline gap-2">
        <span className="text-5xl font-black text-white tracking-tighter italic">
          {typeof value === 'number' ? value.toFixed(1) : value}
        </span>
        <span className="text-xs font-bold text-slate-500 uppercase tracking-widest">{unit}</span>
      </div>

      <div className="mt-6 h-1 w-full bg-slate-800/40 rounded-full overflow-hidden">
        <motion.div 
          initial={{ width: 0 }}
          animate={{ width: '100%' }}
          transition={{ duration: 1, repeat: Infinity }}
          className="h-full bg-cyan-500 shadow-[0_0_8px_rgba(6,182,212,0.5)]"
        />
      </div>
      {quality && (
        <div className="mt-3 flex items-center justify-between text-[8px] font-black uppercase tracking-widest">
          <span className={statusClass}>{quality.status}</span>
          <span className="text-slate-600">
            {quality.ageSeconds === null ? 'SIN DATO' : `${quality.ageSeconds.toFixed(0)}S`}
          </span>
        </div>
      )}
    </motion.div>
    );
  };

  return (
    <div className="p-10 space-y-10 w-full max-w-7xl mx-auto">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div className="space-y-2">
          <h2 className="text-5xl font-black text-white uppercase tracking-tighter italic">
            {t.nav_dashboard}
          </h2>
          <div className="flex items-center gap-3">
            <span className="h-0.5 w-12 bg-cyan-500 shadow-[0_0_8px_cyan]" />
            <p className="text-[10px] font-black text-cyan-500/80 uppercase tracking-[0.4em]">Integrated Tactical Navigation Suite</p>
          </div>
        </div>
        
        <div className="flex items-center gap-4 bg-black/40 border border-white/5 p-4 rounded-3xl">
          <div className="flex flex-col items-center px-4 border-r border-white/10">
            <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest leading-none mb-2">Vessel Heading</span>
            <div className="relative w-16 h-16 flex items-center justify-center">
              <Compass size={40} className="text-cyan-500/20" />
              <motion.div 
                animate={{ rotate: navData.heading }}
                className="absolute inset-0 flex items-center justify-center"
              >
                <Navigation size={24} className="text-cyan-500" />
              </motion.div>
            </div>
          </div>
          <div className="px-4">
             <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest leading-none mb-1 block">Satellite Links</span>
             <div className="flex gap-1">
               {[1,2,3,4,5].map(i => (
                 <div key={i} className={cn("w-1 h-3 rounded-sm", i < 5 ? "bg-emerald-500" : "bg-slate-800")} />
               ))}
             </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <NavCard 
          icon={MapPin} 
          title={t.gps_pos} 
          value={`${navData.lat.toFixed(4)}N`} 
          unit={`${navData.lng.toFixed(4)}W`}
          sensor="gps" 
        />
        <NavCard 
          icon={Compass} 
          title={t.heading} 
          value={navData.heading} 
          unit="°DEG" 
          sensor="heading"
        />
        <NavCard 
          icon={Gauge} 
          title={t.sog} 
          value={navData.sog} 
          unit={t.knots} 
          sensor="sog"
        />
        <NavCard 
          icon={Waves} 
          title={t.depth} 
          value={navData.depth} 
          unit={t.meters} 
          sensor="depth"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-black/30 border border-white/5 rounded-[2.5rem] p-10 relative overflow-hidden">
           <div className="absolute top-0 right-0 p-8">
             <Activity className="text-cyan-500/10" size={120} />
           </div>
           <h4 className="text-xs font-black text-slate-500 uppercase tracking-[0.3em] mb-8">NMEA 0183 Data Stream</h4>
           <div className="font-mono text-[10px] text-cyan-500/60 space-y-2">
             <p className="animate-pulse">$GPRMC,{new Date().toISOString().split('T')[1].split('.')[0] || '000000'},A,{navData.lat.toFixed(4)},N,{navData.lng.toFixed(4)},W,{navData.sog.toFixed(1)},{navData.heading.toFixed(1)},...</p>
             <p>$GPVTG,{navData.heading.toFixed(1)},T,,M,{navData.sog.toFixed(1)},N,,K,A*...</p>
             <p>$GPGGA,{new Date().toISOString().split('T')[1].split('.')[0] || '000000'},{navData.lat.toFixed(4)},N,{navData.lng.toFixed(4)},W,1,08,0.9,545.4,M,46.9,M,,*...</p>
             <p className="text-slate-700">// Simulation engine injecting coherent tactical noise //</p>
           </div>
        </div>
        <div className="bg-gradient-to-br from-cyan-600 to-blue-800 rounded-[2.5rem] p-10 text-white flex flex-col justify-between">
          <div>
            <h4 className="text-xs font-black uppercase tracking-[0.3em] opacity-60 mb-2">Operational Status</h4>
            <p className="text-3xl font-black tracking-tighter uppercase italic">Optimal Deployment</p>
          </div>
          <div className="space-y-4">
             <div className="flex justify-between items-center text-[10px] font-black uppercase tracking-widest border-b border-white/20 pb-2">
               <span>System Load</span>
               <span>14%</span>
             </div>
             <div className="flex justify-between items-center text-[10px] font-black uppercase tracking-widest border-b border-white/20 pb-2">
               <span>Signal Integrity</span>
               <span>99.8%</span>
             </div>
          </div>
        </div>
      </div>
    </div>
  );
};
