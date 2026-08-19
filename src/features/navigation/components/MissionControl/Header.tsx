import { motion } from "motion/react";
import { Anchor, X } from "lucide-react";

interface HeaderProps {
    underway: boolean;
    onClose?: () => void;
}

export default function Header({ underway, onClose }: HeaderProps) {

  
  return (
    <div className="px-4 py-2 border-b border-cyan-500/10">

      <div className="flex items-center justify-between">

        <div className="flex items-center gap-2">

          <div
    className="
        w-10 h-10
        rounded-xl
        bg-cyan-500/10
        flex
        items-center
        justify-center
    "
>
    <img
        src="/logo3.png"
        alt="VELARIS"
        className="w-17 h-17 object-contain select-none"
        draggable={false}
    />
</div>

          <div>

            <div className="text-[10px] uppercase tracking-[0.25em] text-slate-500 font-black">
              Mission Actions
            </div>

            <div className="text-xl font-black text-white">
              Navigation Mission
            </div>

          </div>

        </div>

        <div className="flex items-center gap-3">

  <motion.div
    animate={{
      opacity: underway ? [1, .4, 1] : 1
    }}
    transition={{
      repeat: Infinity,
      duration: 1.5
    }}
    className={`
      px-3 py-1.5 rounded-full
      text-[10px]
      font-black
      tracking-[0.3em]
      uppercase
      ${
        underway
          ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
          : "bg-cyan-500/20 text-cyan-400 border border-cyan-500/30"
      }
    `}
  >
    {underway ? "UNDERWAY" : "READY"}
  </motion.div>

  <button
    onClick={onClose}
    className="
      w-10 h-10
      rounded-xl
      border border-cyan-500/20
      bg-cyan-500/5
      hover:bg-cyan-500/15
      transition-all
      flex items-center justify-center
      text-cyan-300
    "
    title="Cerrar"
  >
    <X size={16} />
  </button>

</div>

      </div>

    </div>
  );
}