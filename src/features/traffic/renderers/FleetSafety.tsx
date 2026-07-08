import React from "react";
import { Circle } from "react-leaflet";

interface FleetSafetyProps {

    shipPosition: {
        lat: number;
        lng: number;
    } | null;

    simulatedAisTargets: any[];

}

export const FleetSafety: React.FC<FleetSafetyProps> = ({
    shipPosition,
    simulatedAisTargets
}) => {

    return (

        <>
        
      {/* Indicador de Riesgo de Colisión (Zona de Seguridad AIS) */}
      {shipPosition && (
        <Circle 
          center={[shipPosition.lat, shipPosition.lng]} 
          radius={500}
          pathOptions={{ 
            color: simulatedAisTargets.some(t => t.isCollisionRisk) ? '#ef4444' : '#06b6d4', 
            fillColor: simulatedAisTargets.some(t => t.isCollisionRisk) ? '#ef4444' : '#06b6d4', 
            fillOpacity: 0.05, 
            weight: 1, 
            dashArray: '5, 5' 
          }}
        />
      )}

        </>

    );

};