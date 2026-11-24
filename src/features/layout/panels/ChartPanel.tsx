import React from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { X, type LucideIcon } from 'lucide-react';
import { cn } from '../../../lib/utils';

/**
 * Panel flotante común para todo lo que se abre sobre la carta desde las
 * barras laterales (capas, objetivos AIS, misión...).
 *
 * Reglas de posicionamiento (ver variables --vl-* en index.css):
 * - Se ancla a la derecha, dejando libre la barra de herramientas (--vl-dock-reserve).
 * - Empieza por debajo de la banda Command Center (--vl-content-top).
 * - Su alto se ajusta al contenido y nunca supera el espacio útil disponible.
 * - Cabecera y pie fijos; solo el cuerpo se desplaza, así los botones de acción
 *   y el cierre siempre quedan visibles.
 *
 * El contenedor de referencia es el área de carta (elemento posicionado más
 * cercano), no la ventana: así el panel nunca invade las barras laterales.
 */
export interface ChartPanelProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  icon?: LucideIcon;
  /** Texto auxiliar a la derecha del título (p. ej. recuento). */
  meta?: React.ReactNode;
  /** Ancho preferido en px; se reduce si no cabe. */
  width?: number;
  /** Pie fijo (acciones). */
  footer?: React.ReactNode;
  /** Cierre al pulsar fuera del panel. Desactivado por defecto: la carta sigue operativa. */
  closeOnBackdrop?: boolean;
  /** Etiqueta accesible del panel. */
  ariaLabel?: string;
  className?: string;
  bodyClassName?: string;
  children: React.ReactNode;
}

export const ChartPanel: React.FC<ChartPanelProps> = ({
  isOpen,
  onClose,
  title,
  icon: Icon,
  meta,
  width = 320,
  footer,
  closeOnBackdrop = false,
  ariaLabel,
  className,
  bodyClassName,
  children,
}) => {
  React.useEffect(() => {
    if (!isOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {closeOnBackdrop && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={onClose}
              className="absolute inset-0 z-(--vl-z-panel) bg-black/15"
              aria-hidden="true"
            />
          )}
          <motion.section
            role="dialog"
            aria-label={ariaLabel ?? title}
            initial={{ x: 24, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: 24, opacity: 0 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
            className={cn(
              'vl-surface pointer-events-auto absolute z-(--vl-z-panel) flex flex-col overflow-hidden rounded-2xl',
              className,
            )}
            style={{
              top: 'var(--vl-content-top)',
              right: 'var(--vl-dock-reserve)',
              width: `min(${width}px, calc(100% - var(--vl-dock-reserve) - var(--vl-gap) * 2))`,
              maxHeight: 'calc(100% - var(--vl-content-top) - var(--vl-gap))',
            }}
          >
            <header className="flex h-11 shrink-0 items-center justify-between gap-2 border-b border-white/10 bg-white/[0.03] px-3">
              <div className="flex min-w-0 items-center gap-2">
                {Icon && <Icon className="h-4 w-4 shrink-0 text-cyan-400" aria-hidden="true" />}
                <h2 className="truncate text-[11px] font-black uppercase tracking-[0.16em] text-white">{title}</h2>
                {meta && <span className="shrink-0 font-mono text-[10px] text-slate-400">{meta}</span>}
              </div>
              <button
                type="button"
                onClick={onClose}
                title="Cerrar (Esc)"
                aria-label={`Cerrar ${title}`}
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-white/10 hover:text-white"
              >
                <X size={16} />
              </button>
            </header>
            <div className={cn('custom-scrollbar min-h-0 flex-1 overflow-y-auto', bodyClassName)}>{children}</div>
            {footer && <footer className="shrink-0 border-t border-white/10 bg-black/30">{footer}</footer>}
          </motion.section>
        </>
      )}
    </AnimatePresence>
  );
};

export default ChartPanel;
