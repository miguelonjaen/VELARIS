import React from "react";
import { Marker } from "react-leaflet";
import L from "leaflet";

interface BoatLayerProps {
  shipPosition: {
    lat: number;
    lng: number;
  } | null;
  heading: number;
}

const BoatLayer: React.FC<BoatLayerProps> = ({
  shipPosition,
  heading
}) => {
  if (!shipPosition) return null;

  const normalizedHeading =
    ((heading % 360) + 360) % 360;

  const html = `
    <div
      style="
        width:34px;
        height:64px;
        transform:rotate(${normalizedHeading}deg);
        transform-origin:50% 50%;
        filter:drop-shadow(0 0 5px rgba(0,0,0,.65));
        pointer-events:none;
      "
    >
      <svg
        width="34"
        height="64"
        viewBox="0 0 34 64"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path
          d="
            M17 2
            C13 8 8 18 7 30
            C6 42 9 54 17 62
            C25 54 28 42 27 30
            C26 18 21 8 17 2
            Z
          "
          fill="#d7dde3"
          stroke="#111827"
          stroke-width="1.5"
        />

        <path
          d="
            M17 8
            C14 15 11 23 11 31
            C11 39 13 47 17 54
            C21 47 23 39 23 31
            C23 23 20 15 17 8
            Z
          "
          fill="#9ca3af"
          opacity="0.75"
        />

        <line
          x1="17"
          y1="7"
          x2="17"
          y2="56"
          stroke="#374151"
          stroke-width="1"
        />

        <path
          d="
            M17 2
            L12.5 13
            L17 10
            L21.5 13
            Z
          "
          fill="#f3f4f6"
        />

        <path
          d="
            M12 52
            Q17 58 22 52
            L20 58
            Q17 62 14 58
            Z
          "
          fill="#6b7280"
        />

        <circle
          cx="17"
          cy="32"
          r="3"
          fill="#111827"
          stroke="#22d3ee"
          stroke-width="1.5"
        />
      </svg>
    </div>
  `;

  return (
    <Marker
      position={[
        shipPosition.lat,
        shipPosition.lng
      ]}
      interactive={false}
      zIndexOffset={1001}
      icon={L.divIcon({
        className: "",
        html,
        iconSize: [34, 64],
        iconAnchor: [17, 32]
      })}
    />
  );
};

export default BoatLayer;