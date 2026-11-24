import React from "react";
import { LucideIcon } from "lucide-react";
import { cn } from "../../../lib/utils";

type StatusIndicator =
    | "green"
    | "cyan"
    | "amber"
    | "blue"
    | "red";

/**
 * Tipo funcional del botón. Determina su marca visual:
 * - page:   cambia la pantalla principal (barra lateral cian a la izquierda cuando está activa).
 * - panel:  abre o cierra un panel (pequeño triángulo en la esquina).
 * - layer:  activa o desactiva una capa o función sobre la carta (testigo ON/OFF inferior).
 * - action: acción puntual (abre un diálogo).
 * - power:  control crítico, separado del resto.
 */
export type DockButtonKind = "page" | "panel" | "layer" | "action" | "power";

interface DockButtonProps {
    icon: LucideIcon;
    /** Etiqueta corta visible bajo el icono. */
    label?: string;
    /** Compatibilidad: etiqueta antigua mostrada al pasar el ratón. */
    hoverLabel?: string;
    /** Descripción completa para el tooltip (en español). */
    tooltip?: string;
    /** Detalle secundario del tooltip (estado, limitaciones). */
    tooltipDetail?: string;
    /** Lado en el que se despliega el tooltip. */
    tooltipSide?: "left" | "right";
    kind?: DockButtonKind;
    active?: boolean;
    danger?: boolean;
    rounded?: boolean;
    disabled?: boolean;
    size?: number;
    statusIndicator?: StatusIndicator;
    onClick?: () => void;
    className?: string;
    children?: React.ReactNode;
}

const ledColors: Record<StatusIndicator, string> = {
    green: "bg-green-400 shadow-[0_0_6px_rgba(74,222,128,.85)]",
    cyan: "bg-cyan-300 shadow-[0_0_6px_rgba(34,211,238,.85)]",
    amber: "bg-amber-400 shadow-[0_0_6px_rgba(251,191,36,.85)]",
    blue: "bg-blue-400 shadow-[0_0_6px_rgba(96,165,250,.85)]",
    red: "bg-red-500 shadow-[0_0_6px_rgba(239,68,68,.85)]",
};

export default function DockButton({
    icon: Icon,
    label,
    hoverLabel,
    tooltip,
    tooltipDetail,
    tooltipSide = "left",
    kind = "action",
    active = false,
    danger = false,
    rounded = false,
    disabled = false,
    size = 18,
    statusIndicator,
    onClick,
    className,
    children
}: DockButtonProps) {
    const text = label ?? hoverLabel;
    const tipTitle = tooltip ?? text;
    const ariaLabel = [tipTitle, tooltipDetail].filter(Boolean).join(". ");
    const isToggle = kind === "layer" || kind === "panel" || kind === "page";

    return (
        <button
            type="button"
            onClick={disabled ? undefined : onClick}
            title={ariaLabel || undefined}
            aria-label={ariaLabel || undefined}
            aria-pressed={isToggle && !disabled ? active : undefined}
            aria-disabled={disabled || undefined}
            className={cn(
                "group relative flex h-12 w-12 shrink-0 flex-col items-center justify-center gap-0.5 border outline-none transition-colors duration-150",
                "focus-visible:ring-2 focus-visible:ring-cyan-400/70",
                rounded ? "rounded-full" : "rounded-xl",
                disabled
                    ? "cursor-not-allowed border-white/5 bg-slate-900/40 text-slate-600"
                    : active
                        ? danger
                            ? "border-red-400/50 bg-red-500/15 text-red-200"
                            : "border-cyan-400/45 bg-cyan-500/15 text-cyan-100 shadow-[0_0_14px_rgba(34,211,238,.15)]"
                        : "border-white/5 bg-slate-900/70 text-slate-400 hover:border-white/15 hover:bg-slate-800/80 hover:text-white",
                className
            )}
        >
            <Icon size={size} aria-hidden="true" />
            {text && (
                <span className="max-w-full truncate px-0.5 text-[8px] font-bold uppercase leading-none tracking-[0.02em]">
                    {text}
                </span>
            )}

            {/* Marca de pantalla activa */}
            {kind === "page" && active && (
                <span className="absolute -left-[5px] top-2 bottom-2 w-[3px] rounded-full bg-cyan-400" aria-hidden="true" />
            )}

            {/* Marca de panel: triángulo en la esquina superior izquierda */}
            {kind === "panel" && (
                <span
                    aria-hidden="true"
                    className={cn(
                        "absolute left-1 top-1 h-0 w-0 border-r-[5px] border-t-[5px] border-r-transparent",
                        active ? "border-t-cyan-300" : "border-t-slate-600"
                    )}
                />
            )}

            {/* Testigo de capa: ON/OFF */}
            {kind === "layer" && (
                <span
                    aria-hidden="true"
                    className={cn(
                        "absolute bottom-[3px] h-[2px] w-5 rounded-full",
                        active ? "bg-cyan-300 shadow-[0_0_6px_rgba(34,211,238,.8)]" : "bg-slate-700"
                    )}
                />
            )}

            {/* LED de estado (sin animación continua para no distraer en navegación) */}
            {active && statusIndicator && !disabled && (
                <span
                    aria-hidden="true"
                    className={cn("absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full", ledColors[statusIndicator])}
                />
            )}

            {tipTitle && (
                <span className={cn("vl-tip", tooltipSide === "left" ? "vl-tip-left" : "vl-tip-right")} role="tooltip">
                    {tipTitle}
                    {tooltipDetail && <small>{tooltipDetail}</small>}
                </span>
            )}

            {children}
        </button>
    );
}
