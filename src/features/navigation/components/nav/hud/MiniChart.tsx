import { TacticalMap } from "../../TacticalMap";

interface MiniChartProps {
  center: [number, number];
  shipPosition: { lat: number; lng: number } | null;
  shipName: string;
  navPlan: any;
  currentPath: [number, number][];
  listaCartas: any[];
  cartasActivas: Record<string, boolean>;
}

export default function MiniChart({
  center,
  shipPosition,
  shipName,
  navPlan,
  currentPath,
  listaCartas,
  cartasActivas,
}: MiniChartProps) {
  return (
    <div
      className="
        relative
        w-[280px]
        h-[190px]
        rounded-xl
        overflow-hidden
        border
        border-cyan-400/8
        bg-black/70
        backdrop-blur-sm
        shadow-[inset_0_0_0_1px_rgba(255,255,255,0.02)]
      "
    >
      <TacticalMap
        compact

        center={center}
        zoom={13}

        shipPosition={shipPosition}
        shipName={shipName}

        navPlan={navPlan}

        targetDestination={null}

        currentPath={currentPath}

        onMapClick={() => {}}
        onMapRightClick={() => {}}
        onDragStart={() => {}}

        isLaylinesActive={false}

        listaCartas={listaCartas}
        cartasActivas={cartasActivas}
      />
    </div>
  );
}