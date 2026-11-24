import { useEffect, useState } from "react";
import { motion } from "motion/react";

import Header from "./Header";
import RouteCard from "./RouteCard";
import VoyageCard from "./VoyageCard";
import ActionsCard from "./ActionsCard";

import { MissionContext } from "./MissionContext";
import { MissionState } from "./types";


interface MissionControlPanelProps {
  mission: MissionState;
  onClose?: () => void;
  onStart?: () => void;
  onStop?: () => void;
  onUndo?: () => void;
  onClear?: () => void;
}

export default function MissionControlPanel({
  mission,
  onClose,
  onStart,
  onStop,
  onUndo,
  onClear,
}: MissionControlPanelProps) {
  const [elapsed, setElapsed] = useState("00:00:00");

  useEffect(() => {
    const start = mission.startTime;

    if (!start) {
      setElapsed("00:00:00");
      return;
    }

    const updateElapsed = () => {
      const diff = Date.now() - start.getTime();

      const h = Math.floor(diff / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      const s = Math.floor((diff % 60000) / 1000);

      setElapsed(
        `${String(h).padStart(2, "0")}:${String(m).padStart(
          2,
          "0"
        )}:${String(s).padStart(2, "0")}`
      );
    };

    updateElapsed();

    const interval = setInterval(updateElapsed, 1000);

    return () => clearInterval(interval);
  }, [mission.startTime]);

  return (
    <MissionContext.Provider value={mission}>
      <motion.div
        initial={{ x: 24, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        transition={{ duration: 0.18, ease: "easeOut" }}
        role="dialog"
        aria-label="Panel de misión"
        className="vl-surface pointer-events-auto custom-scrollbar max-h-full w-full overflow-y-auto rounded-2xl"
      >
        <Header
    underway={mission.isTravesiaActive}
    onClose={onClose}
/>

        <RouteCard />

        <VoyageCard

          elapsed={elapsed}
        />

        <ActionsCard
          underway={mission.isTravesiaActive}
          onStart={onStart}
          onStop={onStop}
          onUndo={onUndo}
          onClear={onClear}
        />
      </motion.div>
    </MissionContext.Provider>
  );
}
