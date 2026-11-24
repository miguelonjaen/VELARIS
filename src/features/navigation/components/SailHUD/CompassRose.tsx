import React from "react";

interface Props {
  x: number;
  y: number;
  rotation: number;
}

export default function CompassRose({
  x,
  y,
  rotation,
}: Props) {
  return (
    <div
      className="absolute pointer-events-none"
      style={{
        left: x,
        top: y,
        transform: `translate(-50%, -50%) rotate(${rotation}deg)`,
      }}
    >
      <div className="w-8 h-8 border-2 border-cyan-400 rounded-full">
        <div className="absolute left-1/2 top-0 w-px h-8 bg-cyan-400 -translate-x-1/2" />
        <div className="absolute top-1/2 left-0 h-px w-8 bg-cyan-400 -translate-y-1/2" />
      </div>
    </div>
  );
}