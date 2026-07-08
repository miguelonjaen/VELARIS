import React from "react";
import { LucideIcon } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { cn } from "../../../lib/utils";

type StatusIndicator =
    | "green"
    | "cyan"
    | "amber"
    | "blue"
    | "red";

interface DockButtonProps {
    icon: LucideIcon;
    active?: boolean;
    danger?: boolean;
    rounded?: boolean;
    hoverLabel? : string;
    size?: number;

    statusIndicator?: StatusIndicator;

    onClick?: () => void;
    className?: string;
    children?: React.ReactNode;
}

export default function DockButton({
    icon: Icon,
    hoverLabel,
    active = false,
    danger = false,
    rounded = false,
    size = 22,
    statusIndicator,
    onClick,
    className,
    children
}: DockButtonProps) {

    const ledColors = {
    green: "bg-green-400 shadow-[0_0_10px_rgba(74,222,128,.85)]",

    cyan: "bg-cyan-300 shadow-[0_0_10px_rgba(34,211,238,.85)]",

    amber: "bg-amber-400 shadow-[0_0_10px_rgba(251,191,36,.85)]",

    blue: "bg-blue-400 shadow-[0_0_10px_rgba(96,165,250,.85)]",

    red: "bg-red-500 shadow-[0_0_10px_rgba(239,68,68,.85)]",
};

    return (

        <button
            onClick={onClick}
            className={cn(

                "relative group",

                "w-[62px] h-[62px]",

                "flex items-center justify-center",

                rounded ? "rounded-full" : "rounded-[16px]",

                "border",

                "transition-all duration-300",

                danger
                    ? active
    ? `
      bg-gradient-to-b
      from-cyan-500/15
      via-slate-800
      to-slate-950

      border-cyan-400/40

      text-white

      shadow-[0_0_30px_rgba(34,211,238,.20)]
    `
    : `
      bg-gradient-to-b
      from-slate-800
      via-slate-900
      to-slate-950

      border-white/5
      ring-1
ring-white/[0.03]

      text-slate-400

      hover:text-white
      hover:border-white/10
      hover:-translate-y-[1px]
      hover:shadow-[0_0_16px_rgba(255,255,255,.05)]
    `

                    : active
    ? `
        bg-gradient-to-b
        from-cyan-500/15
        via-slate-800
        to-slate-950

        border-cyan-400/40

        text-white

       shadow-[0_8px_20px_rgba(0,0,0,.45),0_0_20px_rgba(34,211,238,.15)]
      `
    : `
        bg-gradient-to-b
        from-slate-800
        via-slate-900
        to-slate-950

        border-white/5

        text-slate-400

        hover:text-white

        hover:border-white/10

        shadow-[inset_0_1px_0_rgba(255,255,255,.04)]
hover:shadow-[inset_0_1px_0_rgba(255,255,255,.06),0_8px_18px_rgba(0,0,0,.35)]

        hover:-translate-y-[1px]
        hover:scale-[1.02]
      `
                
            )}
        >

           <div className="relative w-full h-full flex items-center justify-center overflow-hidden">

    {/* ICONO */}

    <div
        className={cn(
            "absolute inset-0 flex items-center justify-center transition-all duration-150",
            hoverLabel
                ? "opacity-100 group-hover:-translate-x-2 group-hover:-translate-x-2 scale-100 group-hover:scale-90"
                : ""
        )}
    >
        <div className="relative w-full h-full overflow-hidden">
            <div
    className="
        pointer-events-none
        absolute
        inset-0
        overflow-hidden
        rounded-[inherit]
    "
>
    <div
        className="
            absolute
            top-0
            -left-1/2

            h-full
            w-1/3

            rotate-12

            opacity-0

            bg-gradient-to-r
            from-transparent
            via-white/25
            to-transparent

            transition-all
            duration-300
            delay-100

            group-hover:left-[140%]
            group-hover:opacity-100
        "
    />
</div>

    {/* ICONO */}

    <div
        className="
            absolute
            inset-0

            flex
            items-center
            justify-center

            transition-all
            duration-150

            group-hover:-translate-x-2 group-hover:opacity-0
        "
    >
        <Icon size={size} />
    </div>

    

</div>
    </div>

    {/* TEXTO */}

    {hoverLabel && (

        <div
            className="
                absolute
                inset-0

                flex
                items-center
                justify-center

                text-[11px]
                font-semibold
                tracking-[0.18em]

                opacity-0
                scale-110

                transition-all
                duration-150

                group-hover:opacity-100
                group-hover:scale-100
            "
        >
            {hoverLabel}
        </div>

    )}

</div>

           {active && statusIndicator && (
    <motion.div
        animate={{
            opacity: [0.7, 1, 0.7],
            scale: [1, 1.15, 1],
        }}
        transition={{
            duration: 2,
            repeat: Infinity,
            ease: "easeInOut",
        }}
        className={cn(
            "absolute right-2 top-1/2 -translate-y-1/2 w-2 h-2 rounded-full z-50",
            ledColors[statusIndicator]
        )}
    />
)}

            {children}

        </button>

    );

}