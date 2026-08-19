import {
  Navigation2,
  Clock3
} from "lucide-react";
import { motion } from "motion/react";
import { useMission } from "./MissionContext";

export default function VoyageCard({
  elapsed,
}: {
  elapsed: string;
}) {

  const mission = useMission();

  return (
    <motion.div
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      className="mx-5 mb-5 rounded-3xl border border-cyan-500/15 bg-black/25 backdrop-blur-md overflow-hidden"
    >

      {/* HEADER */}

      <div className="px-5 py-3 border-b border-cyan-500/10 flex items-center justify-between">

        <div className="flex items-center gap-3">

          <div className="w-9 h-9 rounded-xl bg-cyan-500/10 flex items-center justify-center">

            <Navigation2
              className="text-cyan-400"
              size={17}
            />

          </div>

          <div>

            <div className="text-[10px] uppercase tracking-[0.25em] text-slate-500 font-black">
              Voyage
            </div>

            <div className="text-lg font-black text-white">
              Mission Status
            </div>

          </div>

        </div>

        <div
          className={`
            px-3 py-1.5
            rounded-full
            text-[10px]
            font-black
            tracking-[0.25em]
            uppercase
            ${
              mission.isTravesiaActive
                ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30"
                : "bg-cyan-500/15 text-cyan-400 border border-cyan-500/30"
            }
          `}
        >
          {mission.isTravesiaActive ? "UNDERWAY" : "READY"}
        </div>

      </div>

      {/* CONTENT */}

      <div className="p-5 space-y-5">

        {/* CAPTAIN / MODE */}

        <div className="grid grid-cols-2 gap-6">

          <div className="text-center">

            <div className="text-[9px] uppercase tracking-[0.25em] text-slate-500">
              Officer
            </div>

            <div className="mt-2 text-lg font-black text-white">
              {mission.currentOfficer?.nombre ?? "CAPTAIN"}
            </div>

          </div>

          <div className="text-center">

            <div className="text-[9px] uppercase tracking-[0.25em] text-slate-500">
              Mode
            </div>

            <div className="mt-2 text-lg font-black text-cyan-300">
              {mission.navigationMode || "IA"}
            </div>

          </div>

        </div>

        {/* STARTED / ELAPSED */}

        <div className="grid grid-cols-2 gap-6">

          <div className="text-center">

            <div className="text-[9px] uppercase tracking-[0.25em] text-slate-500">
              Start
            </div>

            <div className="mt-2 text-xl font-black text-white">
              {mission.startTime
                ? mission.startTime.toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  })
                : "--:--"}
            </div>

          </div>

          <div className="text-center">

            <div className="text-[9px] uppercase tracking-[0.25em] text-slate-500">
              Elapsed
            </div>

            <div className="mt-2 text-3xl font-black font-mono text-cyan-300">
              {elapsed}
            </div>

          </div>

        </div>

      </div>

    </motion.div>
  );
}