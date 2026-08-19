import React from "react";

interface DeviationScaleProps {
    xte: number;
}

export default function DeviationScale({
    xte
}: DeviationScaleProps) {

    const offset = Math.max(-220, Math.min(220, xte * 4000));
    const major = [0, 220, 440, 660, 880, 1100];
const minor = [110, 330, 550, 770, 990];

    return (

        <div className="w-[1100px] flex flex-col items-center">

            {/* PORT / STBD */}

            <div className="w-full flex justify-between mb-5">

                <span className="text-[11px] tracking-[0.45em] text-slate-500">
                    P O R T
                </span>

                <span className="text-[11px] tracking-[0.45em] text-slate-500">
                    S T B D
                </span>

            </div>

            <svg
                width="1100"
                height="110"
                viewBox="0 0 1100 90"
            >
                <defs>

    <linearGradient id="centerGlow" x1="0%" x2="100%">

        <stop offset="0%" stopColor="transparent"/>

        <stop offset="50%" stopColor="#22d3ee" stopOpacity="0.18"/>

        <stop offset="100%" stopColor="transparent"/>

    </linearGradient>

</defs>

                {/* Glow central */}

<rect
    x="400"
    y="41"
    width="300"
    height="8"
    rx="4"
    fill="url(#centerGlow)"
/>
<g transform={`translate(${-offset},0)`}
style={{
    transition: "transform 250ms ease-out"
}}>
    

                {/* Línea */}

                {/* Línea base */}

<line
    x1="0"
    y1="45"
    x2="1100"
    y2="45"
    stroke="rgba(255,255,255,.06)"
    strokeWidth="4"
/>

{/* Línea principal */}

<line
    x1="0"
    y1="45"
    x2="1100"
    y2="45"
    stroke="rgba(255,255,255,.30)"
    strokeWidth="2"
/>

                {/* Marcas principales */}

                {major.map(x => (

                    <line
                        key={x}
                        x1={x}
                        y1="22"
                        x2={x}
                        y2="68"
                        stroke="rgba(255,255,255,.45)"
                        strokeWidth="2"
                    />

                ))}

                {/* Marcas secundarias */}

                {minor.map(x => (

                    <line
                        key={x}
                        x1={x}
                        y1="34"
                        x2={x}
                        y2="56"
                        stroke="rgba(255,255,255,.25)"
                        strokeWidth="1.5"
                    />

                ))}

</g>

                {/* Eje central */}

<line
    x1="550"
    y1="12"
    x2="550"
    y2="78"
    stroke="#22d3ee"
    strokeWidth="2"
/>

{/* Punto central */}

<circle
    cx="550"
    cy="45"
    r="5"
    fill="#22d3ee"
    stroke="white"

strokeWidth="1"
/>
                {/* Barco */}



            </svg>

            {/* Escala */}

            <div className="w-full flex justify-between mt-2 text-sm text-slate-500">

                <span>0.05</span>

                <span>0.02</span>

                <span>ON TRACK</span>

                <span>0.02</span>

                <span>0.05</span>

            </div>

        </div>

    );

}