import React from 'react';
import { Gauge } from 'lucide-react';

interface Props {
    zoom: number;
}

const MapControls: React.FC<Props> = ({ zoom }) => {

    return (

        <div className="absolute bottom-6 right-6 z-[6000]">

            <div className="bg-slate-950/80 backdrop-blur-md border border-white/10 px-3 py-1.5 rounded-xl flex items-center gap-2 shadow-lg">

                <Gauge className="w-3 h-3 text-cyan-400" />

                <span className="text-[10px] font-black text-white uppercase tracking-widest">

                    Zoom {zoom}

                </span>

            </div>

        </div>

    );

};

export default MapControls;