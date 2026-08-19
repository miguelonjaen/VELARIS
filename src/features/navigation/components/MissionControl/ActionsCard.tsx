import {
  Play,
  Square,
  Undo2,
  Trash2
} from "lucide-react";
import { motion } from "motion/react";

interface ActionsCardProps {
  onStart?: () => void;
  onStop?: () => void;
  onUndo?: () => void;
  onClear?: () => void;
  underway: boolean;
}

const ActionButton = ({
  icon: Icon,
  label,
  color,
  onClick
}: any) => (
  <motion.button
    whileHover={{ scale: 1.03 }}
    whileTap={{ scale: 0.98 }}
    onClick={onClick}
    className={`
      flex items-center gap-3
      rounded-2xl
      p-4
      border
      transition-all
      ${color}
    `}
  >
    <Icon size={20} />
    <span className="text-sm font-black tracking-[0.15em] uppercase">
      {label}
    </span>
  </motion.button>
);

export default function ActionsCard({
  underway,
  onStart,
  onStop,
  onUndo,
  onClear
}: ActionsCardProps) {

  return (

    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="mx-6 mb-6 rounded-3xl border border-cyan-500/15 bg-black/25 overflow-hidden"
    >

      <div className="px-4 py-2 border-b border-cyan-500/10">

        <div className="text-xl font-black text-white">
         Controls
        </div>

      </div>

      <div className="grid grid-cols-2 gap-1 p-1">

        {!underway ? (
  <ActionButton
    icon={Play}
    label="Start"
    onClick={onStart}
    color="
      bg-emerald-500/10
      border-emerald-500/20
      text-emerald-300
      hover:bg-emerald-500/20
    "
  />
) : (
  <ActionButton
    icon={Square}
    label="End"
    onClick={onStop}
    color="
      bg-red-500/10
      border-red-500/20
      text-red-300
      hover:bg-red-500/20
    "
  />
)}

        <ActionButton
          icon={Undo2}
          label="Undo WP"
          onClick={onUndo}
          color="
          bg-cyan-500/10
          border-cyan-500/20
          text-cyan-300
          hover:bg-cyan-500/20"
        />

        <ActionButton
          icon={Trash2}
          label="Clear"
          onClick={onClear}
          color="
          bg-amber-500/10
          border-amber-500/20
          text-amber-300
          hover:bg-amber-500/20"
        />

      </div>

    </motion.div>

  );
}