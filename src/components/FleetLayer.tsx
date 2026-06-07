import React from 'react';
import { Marker, Popup, Circle } from 'react-leaflet';
import L from 'leaflet';
import { ShipData } from '@/shared/types';
import { Wind, Zap, LayoutDashboard, Ship as ShipIcon, Anchor } from 'lucide-react';

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
  console.log('🚢 FleetLayer:', fleet);

return (
  <>
    {/* Marcadores de la Flota (Unidades Propias) */}
    {fleet.map(ship => {
      console.log('🚢 Ship:', ship);
      console.log(
  'POS',
  ship.nombre,
  [ship.lat || 36.7215, ship.lng || -3.5235]
);

      return (
        <Marker
          key={ship.id}
          position={[
            ship.lat || 36.7215,
            ship.lng || -3.5235
          ]}
          icon={L.icon({
            iconUrl: 'barco-player.png',
            iconSize: [25, 50],
            iconAnchor: [12.5, 25],
            popupAnchor: [0, -25],
            className: 'ship-tactical-render'
            
})}

        >
          <Popup className="custom-popup">
            <div className="bg-slate-950 border border-slate-800 rounded-2xl overflow-hidden p-0 w-56 shadow-2xl">
              <div className="relative h-28">
                <img 
                  src={ship.foto_url || getDefaultShipImage(ship.tipo_barco)} 
                  className="w-full h-full object-cover" 
                  referrerPolicy="no-referrer"
                />
                <div className="absolute top-2 left-2 bg-slate-950/90 backdrop-blur-md p-1.5 rounded-xl border border-slate-800 flex items-center gap-2">
                  {getShipIcon(ship.tipo_barco, "w-3.5 h-3.5")}
                  <span className="text-[8px] font-black text-white uppercase tracking-widest">{ship.tipo_barco}</span>
                </div>
              </div>
              <div className="p-4">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-lg">{getShipEmoji(ship.tipo_barco)}</span>
                  <p className="text-sm font-black text-white uppercase tracking-tighter truncate">{ship.nombre || 'Sin Nombre'}</p>
                </div>
                <p className="text-[10px] font-bold text-slate-500 uppercase">{ship.brand || ''} {ship.model || ''}</p>
                <div className="mt-3 pt-3 border-t border-slate-900 flex justify-between items-center">
                  <p className="text-[8px] font-black text-cyan-500 uppercase tracking-widest">{ship.registration || 'S/M'}</p>
                  <div className="flex gap-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                    <span className="text-[8px] font-bold text-slate-400 uppercase">Sistemas OK</span>
                  </div>
                </div>
              </div>
            </div>
          </Popup>
        </Marker>
       );
    })}
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