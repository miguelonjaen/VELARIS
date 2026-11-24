import React from "react";

/** Separador entre grupos funcionales de la barra de herramientas. */
export default function DockSeparator({ label }: { label?: string }) {
  return (
    <div className="flex w-full flex-col items-center py-1" role="separator" aria-label={label}>
      <div className="h-px w-9 bg-white/10" />
      {label && (
        <span className="mt-1 text-[7px] font-bold uppercase tracking-[0.18em] text-slate-600">{label}</span>
      )}
    </div>
  );
}
