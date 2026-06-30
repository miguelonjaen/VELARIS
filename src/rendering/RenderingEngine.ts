import { Vessel } from "@/tactical/contacts/Vessel";
import { VesselRenderData } from "./VesselRenderData";

export class RenderingEngine {

    public getVessels(
    vessels: Vessel[]
    ): VesselRenderData[] {

        return vessels.map(vessel => ({
    id: vessel.id,
    lat: vessel.lat,
    lng: vessel.lng,
    heading: vessel.cog,
    speed: vessel.sog,
    vesselType: "UNKNOWN",
    color: "#45d483",
    size: 32,
    selected: vessel.selected,
    visible: vessel.visible

        }));

    }

}