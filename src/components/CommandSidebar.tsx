import React from 'react';
import { Menu, LogOut, Command, Anchor, Book, Box, BookOpen, User, Settings, ShieldAlert, Info } from 'lucide-react';
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
  onShowAbout: () => void;
}

export const CommandSidebar: React.FC<CommandSidebarProps> = ({
  isSidebarOpen,
  setIsSidebarOpen,
  activeTab, // Keep activeTab prop
  setActiveTab,
  userProfile,
  t,
  onShowAbout,
  onSignOut,
  lang,
  setLang
}) => {
  const menuItems = [
    { id: 'control', icon: Command, label: t.command_center }, // Keep control tab
    { id: 'fleet', icon: Anchor, label: t.fleet_ops },
    { id: 'logbook', icon: Book, label: t.logbook },
    { id: 'inventory', icon: Box, label: t.inventory },
    { id: 'guide', icon: BookOpen, label: t.guide },
    { id: 'profile', icon: User, label: t.profile },
    { id: 'config', icon: Settings, label: t.settings },
    ...(userProfile?.role === 'admin' ? [{ id: 'admin', icon: ShieldAlert, label: t.admin }] : [])
  ];

  return (
    <aside className={cn( // Adjusted width for collapsed state
      "glass-panel z-[9000] flex flex-col transition-all duration-300 ease-in-out border-r border-white/5", // Transition duration
      isSidebarOpen ? "w-72" : "w-[72px]" // Collapsed width between 72px and 80px
    )}>
      <div className="border-b border-white/5">
  {isSidebarOpen ? (
    <div className="px-5 h-20 flex items-center justify-between">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="flex items-center gap-3"
      >
        <img
          src="/logo.png"
          alt="VELARIS"
          className="w-16 h-16 object-contain"
          
        />
<div className="text-lg font-black tracking-[0.18em] text-white uppercase">
  VELARIS
</div>
      </motion.div>

      <button
        onClick={() => setIsSidebarOpen(false)}
        className="p-2 text-white hover:text-cyan-400 transition-colors"
      >
        <Menu size={20} />
      </button>
    </div>
  ) : (
    <div className="h-20 flex items-center justify-center">
      <button
        onClick={() => setIsSidebarOpen(true)}
        className="p-2 text-white hover:text-cyan-400 transition-colors"
      >
        <Menu size={22} />
      </button>
    </div>
  )}
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
              {isSidebarOpen && <span className="font-bold text-[9px] tracking-widest uppercase truncate">{item.label}</span>} {/* Conditionally render text */}
            {activeTab === item.id && <div className="absolute left-0 top-1/4 bottom-1/4 w-0.5 bg-cyan-500 rounded-r-full" />}
          </button>
        ))}
      </nav>

      <div className="p-3 mt-auto border-t border-white/5">

  {userProfile && isSidebarOpen && (

    <div className="p-4 rounded-2xl bg-black/40 border border-white/5">

      {/* Usuario */}

      <div className="flex items-center gap-3">

        <div className="w-12 h-12 rounded-full bg-cyan-500/20 border border-cyan-500/30 flex items-center justify-center overflow-hidden shrink-0">

          {userProfile.photoUrl ? (
            <img
              src={userProfile.photoUrl}
              alt=""
              className="w-full h-full object-cover"
            />
          ) : (
            <span className="font-black text-sm text-cyan-400">
              {userProfile.name.charAt(0).toUpperCase()}
            </span>
          )}

        </div>

        <div className="flex-1 min-w-0">

          <p className="text-xs font-black text-white truncate">
            {userProfile.name}
          </p>

          <p className="text-[9px] font-mono uppercase text-cyan-400/70">
            {userProfile.role.toUpperCase()}
          </p>

        </div>

      </div>

      {/* Separador */}

      <div className="my-4 border-t border-white/5"></div>

      {/* About */}

      <button
        onClick={onShowAbout}
        className="w-full flex items-center gap-3 px-2 py-2 rounded-xl text-slate-400 hover:text-cyan-400 hover:bg-white/5 transition-all"
      >
        <Info size={15} />

        <div className="flex flex-col items-start">
          <span className="text-[10px] font-bold uppercase tracking-widest">
            About VELARIS
          </span>

          <span className="text-[8px] text-slate-500">
            Build 1.1.4 • Stable
          </span>
        </div>

      </button>

      {/* Logout */}

      <button
        onClick={onSignOut}
        className="mt-3 w-full flex items-center justify-center gap-2 py-2 rounded-xl text-slate-500 hover:text-red-500 hover:bg-white/5 transition-all"
      >
        <LogOut size={15} />
        <span className="text-[10px] font-bold uppercase tracking-widest">
          Sign Out
        </span>
      </button>

    </div>

  )}

  {!isSidebarOpen && (
    <button
      onClick={onSignOut}
      className="w-full h-10 flex items-center justify-center text-slate-600 hover:text-red-500 transition-colors bg-white/5 rounded-xl"
    >
      <LogOut size={16} />
    </button>
  )}

</div>
    </aside>
  );
};