import React from "react";
import { cn } from "../../../lib/utils";

interface DockProps {
  children: React.ReactNode;
  className?: string;
}

export default function Dock({
  children,
  className
}: DockProps) {
  return (
    <aside
      className={cn(
        `
        absolute
        right-6
        top-24
        bottom-24
        w-[92px]

        flex
        flex-col
        items-center

        py-4

        rounded-[34px]

        border
        border-white/10

        bg-gradient-to-b
        from-[#11161d]/95
        via-[#0b0f14]/95
        to-[#050607]/96

        backdrop-blur-2xl

        shadow-[0_18px_50px_rgba(0,0,0,.65)]

        overflow-hidden

        z-[7000]
        `,
        className
      )}
    >
      {/* Brillo superior */}
      <div
        className="
          pointer-events-none
          absolute
          inset-0
          rounded-[34px]

          bg-gradient-to-b
          from-white/[0.05]
          via-transparent
          to-black/[0.20]
        "
      />

      {/* Borde interior */}
      <div
        className="
          pointer-events-none
          absolute
          inset-[1px]
          rounded-[33px]
          border
          border-white/[0.03]
        "
      />

      {children}
    </aside>
  );
}