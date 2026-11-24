import NavigationHUD from "./hud/NavigationHUD";
import { NavPlanData } from "./hud/NavPlanData";

interface NavPageProps {
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

export default function NavPage({

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


}: NavPageProps) {

    return (

        <div className="absolute inset-0">

            <NavigationHUD
    heading={heading}

    center={center}
    shipPosition={shipPosition}
    shipName={shipName}

    navPlan={navPlan}

    currentPath={currentPath}

    listaCartas={listaCartas}
    cartasActivas={cartasActivas}

    sog={sog}
cog={cog}
depth={depth}
autopilotMode={autopilotMode}
/>

        </div>

    );

}