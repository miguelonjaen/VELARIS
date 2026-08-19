import React from "react";
import { NavHudData } from "./NavHudData";

interface NavigationMetricsProps {
    navData: NavHudData;
}

export default function NavigationMetrics({
    navData
}: NavigationMetricsProps) {

    const data = [
        { label: "WP", value: navData.waypoint || "---" },
        { label: "DTW", value: `${navData.dtw.toFixed(1)} NM` },
        { label: "ETA", value: navData.eta || "--:--" },
        { label: "SOG", value: `${navData.sog.toFixed(1)} kt` },
        { label: "COG", value: `${Math.round(navData.cog)}°` },
        { label: "VMG", value: `${navData.vmg.toFixed(1)} kt` },
        { label: "DEPTH", value: `${navData.depth.toFixed(1)} m` },
        { label: "MODE", value: navData.mode.toUpperCase() }
    ];

    return (

        <div
            className="w-[980px] h-[64px]
                       rounded-xl
                       border border-white/10
                       bg-black/55
                       backdrop-blur-sm
                       flex"
        >

            {data.map((item, index) => (

                <React.Fragment key={item.label}>

                    <div className="flex-1 flex flex-col justify-center px-4">

                        <span
                            className="text-[9px]
                                       tracking-[0.28em]
                                       font-semibold
                                       uppercase
                                       text-slate-500"
                        >
                            {item.label}
                        </span>

                        <span
                            className="mt-1
                                       text-[20px]
                                       font-mono
                                       font-semibold
                                       text-white"
                        >
                            {item.value}
                        </span>

                    </div>

                    {index < data.length - 1 && (
                        <div className="w-px my-4 bg-white/5" />
                    )}

                </React.Fragment>

            ))}

        </div>

    );
}