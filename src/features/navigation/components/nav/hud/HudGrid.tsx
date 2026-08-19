import React from "react";

interface HudGridProps {
    children: React.ReactNode;
    className?: string;
}

export default function HudGrid({
    children,
    className
}: HudGridProps) {

    return (

        <div
    className={`
        relative
        w-full
        h-full
        overflow-hidden
        rounded-[32px]
        bg-[#05080c]
        ${className ?? ""}
    `}
>

            {/* Resplandor central */}

            <div
                className="
                    absolute
                    inset-0

                    bg-[radial-gradient(circle_at_center,rgba(34,211,238,.06),transparent_65%)]
                "
            />

            {/* Retícula horizontal */}

            <div
                className="
                    absolute
                    inset-0

                    bg-[linear-gradient(rgba(255,255,255,.025)_1px,transparent_1px)]

                    bg-[length:100%_48px]
                "
            />

            {/* Retícula vertical */}

            <div
                className="
                    absolute
                    inset-0

                    bg-[linear-gradient(90deg,rgba(255,255,255,.025)_1px,transparent_1px)]

                    bg-[length:48px_100%]
                "
            />

            {/* Viñeteado */}

            <div
                className="
                    absolute
                    inset-0

                    bg-[radial-gradient(circle,transparent_60%,rgba(0,0,0,.55)_100%)]
                "
            />

            {/* Contenido */}

            <div className="relative z-10 h-full">

                {children}

            </div>

        </div>

    );

}