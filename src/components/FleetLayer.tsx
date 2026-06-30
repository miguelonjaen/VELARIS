import React from 'react';
import { Marker, Popup, Circle } from 'react-leaflet';
import L from 'leaflet';
import { ShipData } from '@/shared/types';
import { Wind, Zap, LayoutDashboard, Ship as ShipIcon, Anchor } from 'lucide-react';
import { Polyline } from 'react-leaflet';
import { calculateDistanceNM } from '../lib/aisMath';
import { createShipIcon } from "@/components/vessels/createShipIcon";
import { VesselRenderer } from "./vessels/VesselRenderer";
import { app } from "@/application";
import { FleetMarkers } from "./fleet/FleetMarkers";
import { FleetSafety } from "./fleet/FleetSafety";
import { FleetPrediction } from "./fleet/FleetPrediction";



interface FleetLayerProps {
  fleet: ShipData[];
  selectedShipId: string | null;
  shipPosition: { lat: number; lng: number } | null;
  simulatedAisTargets: any[];
}

// Helpers visuales extraídos para encapsular la responsabilidad de renderizado
const getShipIcon = (tipo?: string, size: string = "w-5 h-5") => {
  const className = `${size} text-cyan-400`;
  switch (tipo) {
    case 'Velero': return <Wind className={className} />;
    case 'Motora': return <Zap className={className} />;
    case 'Catamarán': return <LayoutDashboard className={className} />;
    case 'Yate': return <ShipIcon className={className} />;
    case 'Semirrígida': return <Anchor className={className} />;
    default: return <ShipIcon className={className} />;
  }
  
};


const getShipEmoji = (tipo?: string) => {
  switch (tipo) {
    case 'Velero': return '⛵';
    case 'Motora': return '🚤';
    case 'Catamarán': return '🛥️';
    case 'Yate': return '🚢';
    case 'Semirrígida': return '🛶';
    default: return '⚓';
  }
};

const getDefaultShipImage = (tipo?: string) => {
  switch (tipo) {
    case 'Velero': return 'https://images.unsplash.com/photo-1534447677768-be436bb09401?q=80&w=1000&auto=format&fit=crop';
    case 'Motora': return 'https://images.unsplash.com/photo-1567899378494-47b22a2ae96a?q=80&w=1000&auto=format&fit=crop';
    case 'Catamarán': return 'https://images.unsplash.com/photo-1516939884455-1445c8652f83?q=80&w=1000&auto=format&fit=crop';
    case 'Yate': return 'https://images.unsplash.com/photo-1569263979104-865ab7cd8d13?q=80&w=1000&auto=format&fit=crop';
    case 'Semirrígida': return 'https://images.unsplash.com/photo-1544551763-47a0159c9638?q=80&w=1000&auto=format&fit=crop';
    default: return 'https://images.unsplash.com/photo-1567899378494-47b22a2ae96a?q=80&w=1000&auto=format&fit=crop';
  }
};


export const FleetLayer: React.FC<FleetLayerProps> = ({
  fleet,
  selectedShipId,
  shipPosition,
  simulatedAisTargets,
}) => {
  const tacticalTargets = app.tactical.getTargets();

  
return (
  <>
    
    <FleetPrediction
    simulatedAisTargets={simulatedAisTargets}
/>
<FleetSafety

    shipPosition={shipPosition}

    simulatedAisTargets={simulatedAisTargets}
    

/>
    <FleetMarkers

    simulatedAisTargets={simulatedAisTargets}

    shipPosition={shipPosition}

    selectedShipId={selectedShipId}

    fleet={fleet}

/>




    </>
  );
};