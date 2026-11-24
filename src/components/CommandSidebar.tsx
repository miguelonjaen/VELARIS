import React from 'react';
import {
  Menu,
  LogOut,
  Navigation,
  Ship,
  Book,
  Package,
  BookOpen,
  User,
  Settings,
  ShieldAlert,
  Info,
  type LucideIcon,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
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
  /** Versión real de la aplicación (package.json). */
  appVersion?: string;
}

interface MenuItem {
  id: string;
  icon: LucideIcon;
  label: string;
  hint: string;
}

/**
 * Barra izquierda de navegación principal.
 *
 * Plegada ocupa un carril fijo (--vl-rail-w) dentro del flujo; al desplegarse
 * se superpone a la carta en lugar de empujarla, de modo que la carta no
 * cambia de tamaño ni se deforma al abrir o cerrar el menú.
 */
export const CommandSidebar: React.FC<CommandSidebarProps> = ({
  isSidebarOpen,
  setIsSidebarOpen,
  activeTab,
  setActiveTab,
  userProfile,
  t,
  onShowAbout,
  onSignOut,
  appVersion,
}) => {
  const groups: Array<{ id: string; title: string; items: MenuItem[] }> = [
    {
      id: 'nav',
      title: 'Navegación',
      items: [
        { id: 'control', icon: Navigation, label: t.command_center, hint: 'Carta, instrumentos y herramientas de navegación' },
      ],
    },
    {
      id: 'ops',
      title: 'Operaciones',
      items: [
        { id: 'fleet', icon: Ship, label: t.fleet_ops, hint: 'Gestión de flota, mantenimiento, sistemas auxiliares e instalaciones' },
        { id: 'logbook', icon: Book, label: t.logbook, hint: 'Bitácora, historial de navegación y registros de la embarcación' },
        { id: 'inventory', icon: Package, label: t.inventory, hint: 'Inventario y pertrechos del barco' },
        { id: 'guide', icon: BookOpen, label: t.guide, hint: 'Vademécum náutico' },
      ],
    },
    {
      id: 'system',
      title: 'Configuración',
      items: [
        { id: 'profile', icon: User, label: t.profile, hint: 'Perfil de usuario' },
        { id: 'config', icon: Settings, label: t.settings, hint: 'Fuentes de datos, umbrales y cartas' },
        ...(userProfile?.role === 'admin'
          ? [{ id: 'admin', icon: ShieldAlert, label: t.admin, hint: 'Administración (solo administradores)' }]
          : []),
      ],
    },
  ];

  const select = (id: string) => {
    setActiveTab(id);
    // El menú desplegado se superpone a la carta: se pliega tras elegir.
    if (isSidebarOpen) setIsSidebarOpen(false);
  };

  const RailButton = ({
    icon: Icon,
    label,
    hint,
    active = false,
    danger = false,
    onClick,
  }: {
    icon: LucideIcon;
    label: string;
    hint?: string;
    active?: boolean;
    danger?: boolean;
    onClick: () => void;
  }) => (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? 'page' : undefined}
      aria-label={hint ? `${label}. ${hint}` : label}
      className={cn(
        'group relative flex h-10 w-full items-center gap-3 rounded-xl outline-none transition-colors duration-150',
        'focus-visible:ring-2 focus-visible:ring-cyan-400/70',
        isSidebarOpen ? 'px-3' : 'justify-center',
        active
          ? 'bg-cyan-500/12 text-cyan-300'
          : danger
            ? 'text-slate-500 hover:bg-red-500/10 hover:text-red-400'
            : 'text-slate-400 hover:bg-white/5 hover:text-slate-100',
      )}
    >
      {active && <span className="absolute left-0 top-2 bottom-2 w-[3px] rounded-r-full bg-cyan-400" aria-hidden="true" />}
      <Icon className="h-[18px] w-[18px] shrink-0" aria-hidden="true" />
      {isSidebarOpen ? (
        <span className="truncate text-[10px] font-bold uppercase tracking-[0.14em]">{label}</span>
      ) : (
        <span className="vl-tip vl-tip-right" role="tooltip">
          {label}
          {hint && <small>{hint}</small>}
        </span>
      )}
    </button>
  );

  return (
    <div className="relative h-full shrink-0" style={{ width: 'var(--vl-rail-w)' }}>
      <AnimatePresence>
        {isSidebarOpen && (
          <motion.div
            key="rail-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setIsSidebarOpen(false)}
            className="fixed inset-0 z-(--vl-z-rail) bg-black/30"
            aria-hidden="true"
          />
        )}
      </AnimatePresence>

      <aside
        aria-label="Navegación principal"
        className="absolute inset-y-0 left-0 z-(--vl-z-rail) flex flex-col border-r border-white/[0.06] bg-[#060a12]/98 transition-[width] duration-200 ease-out"
        style={{ width: isSidebarOpen ? 'var(--vl-rail-w-open)' : 'var(--vl-rail-w)' }}
      >
        {/* Cabecera: identidad y control de despliegue */}
        <div className={cn('flex h-14 shrink-0 items-center border-b border-white/[0.06]', isSidebarOpen ? 'justify-between px-3' : 'justify-center')}>
          {isSidebarOpen && (
            <div className="flex min-w-0 items-center gap-2">
              <img src="./logo.png" alt="" className="h-9 w-9 object-contain" />
              <span className="truncate text-sm font-black uppercase tracking-[0.18em] text-white">GAULOS</span>
            </div>
          )}
          <button
            type="button"
            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
            aria-expanded={isSidebarOpen}
            aria-label={isSidebarOpen ? 'Plegar menú' : 'Desplegar menú'}
            title={isSidebarOpen ? 'Plegar menú' : 'Desplegar menú'}
            className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-300 outline-none transition-colors hover:bg-white/5 hover:text-cyan-300 focus-visible:ring-2 focus-visible:ring-cyan-400/70"
          >
            <Menu size={20} />
          </button>
        </div>

        {/* Secciones de la aplicación */}
        <nav className="flex-1 space-y-3 px-2 py-3">
          {groups.map((group, index) => (
            <div key={group.id} className="space-y-1">
              {isSidebarOpen ? (
                <p className="px-3 pb-0.5 text-[8px] font-black uppercase tracking-[0.2em] text-slate-600">{group.title}</p>
              ) : (
                index > 0 && <div className="mx-auto mb-2 h-px w-8 bg-white/[0.07]" role="separator" aria-label={group.title} />
              )}
              {group.items.map((item) => (
                <RailButton
                  key={item.id}
                  icon={item.icon}
                  label={item.label}
                  hint={item.hint}
                  active={activeTab === item.id}
                  onClick={() => select(item.id)}
                />
              ))}
            </div>
          ))}
        </nav>

        {/* Sesión */}
        <div className="shrink-0 space-y-1 border-t border-white/[0.06] p-2">
          {userProfile && isSidebarOpen && (
            <div className="mb-1 flex items-center gap-3 rounded-xl bg-black/40 p-2.5">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full border border-cyan-500/30 bg-cyan-500/20">
                {userProfile.photoUrl ? (
                  <img src={userProfile.photoUrl} alt="" className="h-full w-full object-cover" />
                ) : (
                  <span className="text-sm font-black text-cyan-400">{userProfile.name.charAt(0).toUpperCase()}</span>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-black text-white">{userProfile.name}</p>
                <p className="font-mono text-[9px] uppercase text-cyan-400/70">{userProfile.role.toUpperCase()}</p>
              </div>
            </div>
          )}
          <RailButton
            icon={Info}
            label="Acerca de GAULOS"
            hint={appVersion ? `Versión ${appVersion}` : undefined}
            onClick={onShowAbout}
          />
          <RailButton icon={LogOut} label="Cerrar sesión" danger onClick={onSignOut} />
        </div>
      </aside>
    </div>
  );
};
