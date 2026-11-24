import { useEffect, useState } from "react";
import { useMap } from "react-leaflet";
import L from "leaflet";

export default function useBoatScreenPosition(
  shipPosition: { lat: number; lng: number } | null
) {
  const map = useMap();

  const [point, setPoint] = useState({ x: 0, y: 0 });

  useEffect(() => {
    if (!shipPosition) return;

    const update = () => {
      const p = map.latLngToContainerPoint(
        L.latLng(shipPosition.lat, shipPosition.lng)
      );

      setPoint({
        x: p.x,
        y: p.y,
      });
    };

    update();

    map.on("move", update);
    map.on("zoom", update);
    map.on("resize", update);

    return () => {
      map.off("move", update);
      map.off("zoom", update);
      map.off("resize", update);
    };
  }, [map, shipPosition]);

  return point;
}