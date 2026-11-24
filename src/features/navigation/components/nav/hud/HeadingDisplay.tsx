import React from "react";

interface HeadingDisplayProps {
    heading?: number;
}

export default function HeadingDisplay({
    heading = 247
}: HeadingDisplayProps) {

    return (

        <div className="flex flex-col items-center">

            {/* Arco */}

            <svg
                width="240"
                height="50"
                viewBox="0 0 240 50"
            >

                <path
                    d="M20 40 Q120 5 220 40"
                    fill="none"
                    stroke="rgba(34,211,238,.35)"
                    strokeWidth="2"
                />

                {[40,80,120,160,200].map(x => (

                    <line
                        key={x}
                        x1={x}
                        y1="34"
                        x2={x}
                        y2="42"
                        stroke="rgba(255,255,255,.20)"
                        strokeWidth="1"
                    />

                ))}

            </svg>

            {/* Rumbo */}

            <div
                className="
                    -mt-2

                    text-[72px]

                    font-extralight

                    tracking-tight

                    text-cyan-300

                    drop-shadow-[0_0_18px_rgba(34,211,238,.18)]
                "
            >

                {heading.toFixed(0)}°

            </div>

            <div
                className="
                    mt-1

                    text-[11px]

                    uppercase

                    tracking-[0.35em]

                    text-slate-500
                "
            >

                H E A D I N G

            </div>

        </div>

    );

}