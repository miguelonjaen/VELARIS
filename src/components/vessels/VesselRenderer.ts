import L from "leaflet";
import { createShipIcon } from "./createShipIcon";
import { ZoomStyleResolver } from "@/rendering/ZoomStyleResolver";

export interface VesselRenderData {
  lat: number;
  lng: number;

  cog: number;
  sog: number;

  risk: string;

  shipType?: string;

  selected?: boolean;
}

export class VesselRenderer {

  static render(
    vessel: VesselRenderData,
    zoom: number
): L.DivIcon {

    return createShipIcon({

    heading: vessel.cog,

    color: this.getRiskColor(vessel.risk),

    size: this.zoomResolver.getShipSize(zoom),

    });

  }

  private static getSize(vessel: VesselRenderData): number {

    return 32;

  }
  private static readonly zoomResolver = new ZoomStyleResolver();

  private static getRiskColor(risk: string): string {

    switch (risk) {

      case "DANGER":
        return "#ff3030";

      case "WARNING":
        return "#ffbf00";

      default:
        return "#45d483";

    }

  }

}