import HudGrid from "./HudGrid";
import HeadingDisplay from "./HeadingDisplay";
import DeviationScale from "./DeviationScale";
import MiniChart from "./MiniChart";
import NavigationMetrics from "./NavigationMetrics";
import { NavHudData } from "./NavHudData";
import { NavPlanData } from "./NavPlanData";
import { calculateVMG } from "./calculateVMG";

interface NavigationHUDProps {
    heading: number;

    center: [number, number];
    shipPosition: { lat: number; lng: number } | null;
    shipName: string;

    navPlan: NavPlanData;
    currentPath: [number, number][];

    listaCartas: any[];
    cartasActivas: Record<string, boolean>;

    sog: number;
    cog: number;
    depth: number;
    autopilotMode: string;
}

export default function NavigationHUD({
    heading,
    center,
    shipPosition,
    shipName,
    navPlan,
    currentPath,
    listaCartas,
    cartasActivas,

    sog,
    cog,
    depth,
    autopilotMode
}: NavigationHUDProps) {

    const navData: NavHudData = {
    waypoint: navPlan?.targetName || "---",
    dtw: navPlan?.distanceNM || 0,
    eta: navPlan?.eta || "--:--",
    sog,
    cog,
    vmg: calculateVMG(
    sog,
    cog,
    navPlan.btw
), 
    depth,
    mode: autopilotMode
};

    return (

        <HudGrid>

            {/* Heading */}

            <div className="absolute top-12 left-1/2 -translate-x-1/2">

                <HeadingDisplay heading={heading} />

            </div>

            {/* Aquí irá el CDI */}

            <div className="
absolute
top-[225px]
left-1/2
-translate-x-1/2

w-[760px]
flex
justify-center
items-center
">
    <DeviationScale xte={0.02} />
</div>

           

            {/* Mini mapa */}

            <div className="absolute left-8 top-8">

                <MiniChart
    center={center}
    shipPosition={shipPosition}
    shipName={shipName}
    navPlan={navPlan}
    currentPath={currentPath}
    listaCartas={listaCartas}
    cartasActivas={cartasActivas}
/>

            </div>

            {/* Barra inferior */}

            <div className="absolute left-1/2 bottom-10 -translate-x-1/2">

                <NavigationMetrics navData={navData} />

            </div>

        </HudGrid>

    );
}