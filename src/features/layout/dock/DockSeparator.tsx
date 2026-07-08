import React from "react";

export default function DockSeparator() {
  return (
    <div className="relative w-10 h-4 my-2 flex items-center">
      <div className="absolute inset-x-0 h-px bg-white/10" />
      <div className="absolute left-1/2 -translate-x-1/2 w-4 h-px bg-cyan-400/30 blur-[1px]" />
    </div>
  );
}