import React from "react";
import { ShipData } from "@/shared/types";
import { Marker, Popup, Circle } from 'react-leaflet';
import L from 'leaflet';

import { Polyline } from 'react-leaflet';

import { VesselRenderer } from "../../../components/vessels/VesselRenderer";

import { calculateDistanceNM } from "@/lib/aisMath";
import { useMap } from "react-leaflet";



interface FleetMarkersProps {

    simulatedAisTargets: any[];

    shipPosition: {
        lat: number;
        lng: number;
    } | null;

    selectedShipId: string | null;

    fleet: ShipData[];
}

export const FleetMarkers: React.FC<FleetMarkersProps> = ({
    simulatedAisTargets,
    shipPosition
}) => {

  console.log("FleetMarkers:", simulatedAisTargets);

    return (

        <>
        {simulatedAisTargets.map((target) => {

          console.log("TARGET", target);

  const tcpaMinutes = target.tcpa ?? 0;

const tcpaDisplay =
  tcpaMinutes < 0
    ? 'PASSED'
    : tcpaMinutes >= 60
      ? `${Math.floor(tcpaMinutes / 60)}h ${Math.round(tcpaMinutes % 60)}m`
      : `${Math.round(tcpaMinutes)} min`;
      const map = useMap();

const zoom = map.getZoom();

  const predictionMinutes = 30;
  const riskColor =
    target.risk === 'danger'
      ? '#ef4444'
      : target.risk === 'caution'
      ? '#f59e0b'
      : '#22c55e';
  const distance =
  shipPosition
    ? calculateDistanceNM(
        shipPosition.lat,
        shipPosition.lng,
        target.lat,
        target.lng
      )
    : 0;

  const distanceNm =
    target.sog * (predictionMinutes / 60);

  const cogRad =
    (target.cog * Math.PI) / 180;
    const bowOffset = 0.00008;

const startLat =
  target.lat +
  bowOffset * Math.cos(cogRad);

const startLng =
  target.lng +
  bowOffset * Math.sin(cogRad);

  const futureLat =
    target.lat +
    (distanceNm * Math.cos(cogRad)) / 60;

  const futureLng =
    target.lng +
    (distanceNm * Math.sin(cogRad)) /
      (60 * Math.cos(target.lat * Math.PI / 180));

  return (
    <React.Fragment key={target.mmsi}>

      <Polyline
  positions={[
    [startLat, startLng],
    [futureLat, futureLng]
  ]}
  color={riskColor}
  weight={2}
  opacity={0.7}
/>

      <Marker
        position={[target.lat, target.lng]}
        icon={VesselRenderer.render(
          
    {
      
        lat: target.lat,
        lng: target.lng,

        cog: target.cog,
        sog: target.sog,

        risk: target.risk ?? "SAFE",

        shipType: target.shipType,
    },
    zoom
)}
      >
        <Popup>
  <div>
    <b>{target.nombre}</b>

    <br />
    MMSI: {target.mmsi}

    <br />
    DIST: {(target.distancia ?? 0).toFixed(2)} nm
    <br />
    CPA: {target.cpa?.toFixed(2) ?? '--'} nm
    <br />
<br />
RISK: {target.risk ?? 'SAFE'}

    <br />
    TCPA: {tcpaDisplay}
    <br />
    SOG: {target.sog} kt

    <br />
    COG: {target.cog}°
  </div>
</Popup>
      </Marker>

    </React.Fragment>
  );
})}

        </>

    );

};