import React from 'react';
import { Ship, Menu, LogOut, Command, Anchor, Book, Box, BookOpen, User, Settings, ShieldAlert } from 'lucide-react';
import { motion } from 'motion/react';
import { cn } from '@lib/utils';
import { UserProfile } from '@/shared/types';

interface CommandSidebarProps {
  isSidebarOpen: boolean;
  setIsSidebarOpen: (open: boolean) => void;
  activeTab: string;
  setActiveTab: (tab: any) => void;
  userProfile: UserProfile | null;
  t: any;
  onSignOut: () => void;
  lang: string;
  setLang: (lang: any) => void;
}

export const CommandSidebar: React.FC<CommandSidebarProps> = ({
  isSidebarOpen,
  setIsSidebarOpen,
  activeTab,
  setActiveTab,
  userProfile,
  t,
  onSignOut,
  lang,
  setLang
}) => {
  const menuItems = [
    { id: 'control', icon: Command, label: t.command_center },
    { id: 'fleet', icon: Anchor, label: t.fleet_ops },
    { id: 'logbook', icon: Book, label: t.logbook },
    { id: 'inventory', icon: Box, label: t.inventory },
    { id: 'guide', icon: BookOpen, label: t.guide },
    { id: 'profile', icon: User, label: t.profile },
    { id: 'config', icon: Settings, label: t.settings },
    ...(userProfile?.role === 'admin' ? [{ id: 'admin', icon: ShieldAlert, label: t.admin }] : [])
  ];

  return (
    <aside className={cn(
      "glass-panel z-[9000] flex flex-col transition-all duration-500 ease-in-out border-r border-white/5",
      isSidebarOpen ? "w-72" : "w-20"
    )}>
      <div className="p-4 flex items-center justify-between border-b border-white/5 h-16">
        {isSidebarOpen ? (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-cyan-600 flex items-center justify-center shadow-[0_0_15px_rgba(6,182,212,0.4)]">
              <Ship className="w-4 h-4 text-white" />
            </div>
            <div className="flex flex-col leading-none">
              <span className="text-sm font-black uppercase tracking-tighter text-white">SMART<span className="text-cyan-400">SHIP</span></span>
              <span className="text-[6px] font-mono text-cyan-400/60 uppercase tracking-[0.2em] font-bold">Command</span>
            </div>
          </motion.div>
        ) : (
          <div className="w-full flex justify-center"><Ship className="w-5 h-5 text-cyan-400" /></div>
        )}
        <button onClick={() => setIsSidebarOpen(!isSidebarOpen)} className="text-white hover:text-cyan-400 p-2">
          <Menu size={20} />
        </button>
      </div>

      <nav className="flex-1 px-2 py-4 space-y-1">
        {menuItems.map((item) => (
          <button
            key={item.id}
            onClick={() => setActiveTab(item.id)}
            className={cn(
              "w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-300 group relative",
              activeTab === item.id ? "bg-cyan-500/10 text-cyan-400" : "text-slate-500 hover:text-slate-200 hover:bg-white/5"
            )}
          >
            <item.icon className={cn("w-4 h-4", activeTab === item.id ? "text-cyan-400 animate-pulse" : "")} />
            {isSidebarOpen && <span className="font-bold text-[9px] tracking-widest uppercase truncate">{item.label}</span>}
            {activeTab === item.id && <div className="absolute left-0 top-1/4 bottom-1/4 w-0.5 bg-cyan-500 rounded-r-full" />}
          </button>
        ))}
      </nav>

      <div className="p-3 mt-auto border-t border-white/5 space-y-2">
        {userProfile && isSidebarOpen && (
          <div className="p-4 rounded-2xl bg-black/40 border border-white/5 flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-cyan-500/20 border border-cyan-500/30 flex items-center justify-center overflow-hidden shrink-0">
              {userProfile.photoUrl ? <img src={userProfile.photoUrl} alt="" className="w-full h-full object-cover" /> : 
                <span className="font-black text-xs text-cyan-400">{userProfile.name.charAt(0).toUpperCase()}</span>}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[10px] font-black text-white uppercase truncate">{userProfile.name}</p>
              <p className="text-[8px] font-mono text-cyan-400/60 uppercase">{t.admiral}</p>
            </div>
            <button onClick={onSignOut} className="text-slate-600 hover:text-red-500 transition-colors"><LogOut size={14} /></button>
          </div>
        )}
        {!isSidebarOpen && (
          <button onClick={onSignOut} className="w-full h-10 flex items-center justify-center text-slate-600 hover:text-red-500 transition-colors bg-white/5 rounded-xl"><LogOut size={16} /></button>
        )}
      </div>
    </aside>
  );
};