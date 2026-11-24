import React from "react";
import { cn } from "../../../lib/utils";

interface DockProps {
  children: React.ReactNode;
  className?: string;
}

/**
 * Barra derecha de herramientas. Ancho y separación vienen de las variables
 * de layout (--vl-dock-w, --vl-gap) para que los paneles y los controles de
 * la carta reserven exactamente el mismo espacio.
 * Sin overflow oculto: los tooltips se muestran a la izquierda de la barra.
 */
export default function Dock({ children, className }: DockProps) {
  return (
    <aside
      aria-label="Herramientas de navegación"
      className={cn(
        "zeus-compact-dock vl-surface absolute z-(--vl-z-dock) flex flex-col items-center gap-1 rounded-2xl py-2",
        className
      )}
      style={{
        top: "var(--vl-gap)",
        right: "var(--vl-gap)",
        width: "var(--vl-dock-w)",
        maxHeight: "calc(100% - var(--vl-gap) * 2)",
      }}
    >
      {children}
    </aside>
  );
}
