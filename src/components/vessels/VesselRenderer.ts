import L from "leaflet";
import { createShipIcon } from "./createShipIcon";

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

  static render(vessel: VesselRenderData): L.DivIcon {

    return createShipIcon({
      heading: vessel.cog,
      color: this.getRiskColor(vessel.risk),
      size: this.getSize(vessel),
    });

  }

  private static getSize(vessel: VesselRenderData): number {

    return 32;

  }

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