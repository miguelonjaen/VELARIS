import React, { useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { Marker, useMap, useMapEvents } from "react-leaflet";
import L from "leaflet";
import {
  BOAT_ICON_HEADING_VAR,
  BOAT_ICON_HEIGHT,
  BOAT_ICON_SCALE_VAR,
  BOAT_ICON_WIDTH,
  boatIconScale,
  buildBoatIconHtml,
  normalizeHeading
} from "@/features/navigation/utils/boatIcon";

import { MapLightsContext } from '../../../../boat/useBoatLighting';

interface BoatLayerProps {
  shipPosition: {
    lat: number;
    lng: number;
  } | null;
  heading: number;
  /** true solo si la posición dibujada procede del simulador NMEA (fuente SIMULATOR). */
  simulated?: boolean;
}

/**
 * Embarcación propia. El tamaño sigue al zoom (ver utils/boatIcon). Rumbo y escala se aplican con
 * variables CSS sobre el elemento del marcador: el marcador no se recrea al girar ni al hacer zoom,
 * la escala acompaña a la animación de zoom de Leaflet y la posición y el centrado no cambian.
 */
const BoatLayer: React.FC<BoatLayerProps> = ({
  shipPosition,
  heading,
  simulated = false
}) => {
  const lights = useContext(MapLightsContext);
  const map = useMap();
  const [scale, setScale] = useState(() => boatIconScale(map.getZoom()));
  const markerRef = useRef<L.Marker | null>(null);
  const current = useRef({ scale, heading: normalizeHeading(heading) });
  current.current = { scale, heading: normalizeHeading(heading) };

  useMapEvents({
    // zoomanim da el zoom de destino al empezar la animación: el icono cambia a la vez que la carta.
    zoomanim: (event) => setScale(boatIconScale(event.zoom)),
    zoomend: () => setScale(boatIconScale(map.getZoom()))
  });

  const applyVars = useCallback((element: HTMLElement | undefined) => {
    if (!element) return;
    element.style.setProperty(BOAT_ICON_SCALE_VAR, String(current.current.scale));
    element.style.setProperty(BOAT_ICON_HEADING_VAR, `${current.current.heading}deg`);
  }, []);

  // Solo se recrea si cambia la fuente (marca SIM); rumbo y escala iniciales evitan un primer pintado erróneo.
  const icon = useMemo(
    () => L.divIcon({
      className: "",
      html: buildBoatIconHtml(simulated, current.current.heading, current.current.scale, lights),
      iconSize: [BOAT_ICON_WIDTH, BOAT_ICON_HEIGHT],
      // El ancla es el centro del casco: rotar o escalar nunca desplaza la posición.
      iconAnchor: [BOAT_ICON_WIDTH / 2, BOAT_ICON_HEIGHT / 2]
    }),
    [simulated, lights.port, lights.starboard, lights.stern, lights.masthead, lights.tricolor, lights.anchor, lights.fog, lights.simulated]
  );

  // Después de que react-leaflet aplique el icono (los efectos del Marker se ejecutan antes).
  useEffect(() => {
    applyVars(markerRef.current?.getElement());
  }, [scale, heading, icon, shipPosition, applyVars]);

  if (!shipPosition) return null;

  return (
    <Marker
      ref={markerRef}
      position={[
        shipPosition.lat,
        shipPosition.lng
      ]}
      interactive={false}
      zIndexOffset={1001}
      icon={icon}
      eventHandlers={{ add: (event) => applyVars((event.target as L.Marker).getElement()) }}
    />
  );
};

export default BoatLayer;
