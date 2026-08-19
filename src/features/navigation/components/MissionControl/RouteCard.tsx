import { MapPinned, Route } from "lucide-react";
import { motion } from "motion/react";
import { useMission } from "./MissionContext";

export default function RouteCard() {
  const mission = useMission();

  return (
    <motion.div
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      className="mx-5 mb-5 rounded-3xl border border-cyan-500/15 bg-black/25 backdrop-blur-md overflow-hidden"
    >
      <div className="px-4 py-2 border-b border-cyan-500/10 flex items-center gap-3">

        <div className="w-8 h-8 rounded-xl bg-cyan-500/10 flex items-center justify-center">
          <Route className="text-cyan-400" size={16} />
        </div>

        <div>
          <div className="text-[10px] tracking-[0.35em] uppercase text-slate-500 font-black">
            Active Route
          </div>

          <div className="text-lg font-black text-white">
            Navigation Plan
          </div>
        </div>

      </div>

      <div className="p-4 space-y-2">

        <div>

          <div className="text-[10px] uppercase tracking-[0.30em] text-slate-500 mb-2">
            Destination
          </div>

          <div className="text-xl font-black text-cyan-300">
            {mission.navPlan.targetName || "---"}
          </div>

        </div>

            <div className="grid grid-cols-3 gap-4 pt-2">

          <div className="rounded-2xl bg-cyan-500/5 border border-cyan-500/10 p-3 flex
flex-col
items-center
justify-center
text-center">

    <div className="text-[9px] uppercase tracking-[0.25em] text-slate-500">
        WP
    </div>

    <div className="mt-2 text-2xl font-black text-white">
        {mission.rutaActiva.length}
    </div>

          </div>

          <div className="rounded-2xl bg-cyan-500/5 border border-cyan-500/10 p-3 flex
flex-col
items-center
justify-center
text-center">

    <div className="text-[9px] uppercase tracking-[0.25em] text-slate-500">
        DTW
    </div>

    <div className="mt-2 text-2xl font-black text-white">
        {mission.navPlan.distanceNM.toFixed(1)}
    </div>

    <div className="text-[9px] text-cyan-400 mt-1">
        NM
    </div>


          </div>

          <div className="rounded-2xl bg-cyan-500/5 border border-cyan-500/10 p-3 flex
flex-col
items-center
justify-center
text-center">

            <div className="text-[9px] uppercase tracking-[0.25em] text-slate-500">
              ETA
            </div>

            <div className="mt-2 text-xl font-black text-white">
              {mission.navPlan.eta}
            </div>

          </div>

        </div>

      </div>
    </motion.div>
  );
}