import L from "leaflet";
import shipMaster from "@/assets/graphics/blueprint/ship_master.svg?raw";
const svg = shipMaster
  .replace(/width="[^"]*"/, 'width="100%"')
  .replace(/height="[^"]*"/, 'height="100%"')
  .replace("<svg", '<svg style="display:block;width:100%;height:100%;"');
export interface CreateShipIconOptions {
  heading: number;
  color: string;
  size?: number;
}

export function createShipIcon({
  heading,
  color,
  size = 40,
}: CreateShipIconOptions) {
  console.log("Ship size:", size);
  return L.divIcon({
    className: "ship-icon",

    html: `
      <div
        style="
          width:${size}px;
          height:${size}px;
          transform:rotate(${heading}deg);
          transform-origin:center center;
          display:flex;
          align-items:center;
          justify-content:center;
          filter: drop-shadow(0 0 2px rgba(0,0,0,.45));
        "
      >

        ${svg}  

      </div>
    `,

    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}