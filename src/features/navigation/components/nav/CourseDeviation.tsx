import React from "react";

interface CourseDeviationProps {
  xte: number;       // Cross Track Error (NM)
  course: number;    // COG o rumbo
  limit?: number;    // Escala visible
}

export default function CourseDeviation({
  xte,
  course,
  limit = 0.05,
}: CourseDeviationProps) {

  const normalized = Math.max(-1, Math.min(1, xte / limit));

  const position = normalized * 120;

  const abs = Math.abs(normalized);

  const indicatorColor =
    abs < 0.40
      ? "#22d3ee"
      : abs < 0.80
      ? "#f59e0b"
      : "#ef4444";

  return (

    <div className="w-full rounded-3xl border border-white/10 bg-[#0b1118] p-8 shadow-[0_0_35px_rgba(0,0,0,.45)]">

      <div className="text-center">

        <div className="text-[11px] tracking-[0.35em] text-slate-500 uppercase">
          Course Deviation
        </div>

        <div className="mt-2 text-5xl font-light text-cyan-300">
          {course.toFixed(0)}°
        </div>

      </div>

      <svg
        viewBox="0 0 320 120"
        className="mt-8 w-full overflow-visible"
      >

        {/* Línea principal */}

        <line
          x1="40"
          y1="60"
          x2="280"
          y2="60"
          stroke="#334155"
          strokeWidth="2"
        />

        {/* Marcas */}

        {[40,100,160,220,280].map((x)=>(
          <line
            key={x}
            x1={x}
            y1={48}
            x2={x}
            y2={72}
            stroke="#64748b"
            strokeWidth="2"
          />
        ))}

        {/* Centro */}

        <line
          x1="160"
          y1="40"
          x2="160"
          y2="80"
          stroke="#22d3ee"
          strokeWidth="3"
        />

        {/* Indicador */}

        <g
          style={{
            transform:`translateX(${position}px)`,
            transition:"transform .35s ease"
          }}
        >

          <polygon
            points="160,26 152,42 168,42"
            fill={indicatorColor}
          />

        </g>

      </svg>

      <div className="mt-6 flex justify-between text-sm">

        <div>

          <div className="text-slate-500 uppercase tracking-[0.25em]">
            XTE
          </div>

          <div
            className="mt-1 text-3xl font-light"
            style={{color:indicatorColor}}
          >
            {Math.abs(xte).toFixed(2)} NM
          </div>

        </div>

        <div className="text-right">

          <div className="text-slate-500 uppercase tracking-[0.25em]">
            Status
          </div>

          <div
            className="mt-1 text-lg"
            style={{color:indicatorColor}}
          >
            {
              abs < .40
                ? "ON COURSE"
                : abs < .80
                ? "CORRECTING"
                : "OFF COURSE"
            }
          </div>

        </div>

      </div>

    </div>

  );

}