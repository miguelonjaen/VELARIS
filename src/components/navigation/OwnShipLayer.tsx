import React from 'react';
import { Marker, Popup } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet-rotatedmarker';

interface OwnShipLayerProps {
  shipPosition: { lat: number; lng: number } | null;
  shipName: string;
  heading?: number;
  iconSize?: number;
}

const OwnShipLayer: React.FC<OwnShipLayerProps> = ({
  shipPosition,
  shipName,
  heading = 0,
  iconSize = 36
}) => {
  if (!shipPosition) return null;
  const markerProps = {
  rotationAngle: heading,
  rotationOrigin: 'center center'
} as any;

  return (
    <Marker
    {...markerProps}
    position={[shipPosition.lat, shipPosition.lng]}
    icon={L.icon({
      iconUrl: 'barco-player.png',
      iconSize: [iconSize, iconSize],
      iconAnchor: [iconSize / 2, iconSize / 2],
      popupAnchor: [0, -iconSize / 2]
    })}
  >
      <Popup className="custom-popup">
        <div className="bg-slate-950 border border-slate-800 rounded-2xl p-4 w-48 shadow-2xl text-white">
          <p className="text-xs font-black text-emerald-400 uppercase tracking-widest mb-2 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            Buque Insignia
          </p>

          <p className="text-sm font-bold text-white uppercase tracking-tighter">
            {shipName}
          </p>

          <div className="mt-2 pt-2 border-t border-slate-900">
            <p className="text-[10px] text-slate-500 font-mono">
              LAT: {shipPosition.lat.toFixed(4)}
            </p>

            <p className="text-[10px] text-slate-500 font-mono">
              LNG: {shipPosition.lng.toFixed(4)}
            </p>

            <p className="text-[10px] text-cyan-400 font-mono mt-1">
              HDG: {Math.round(heading)}°
            </p>
          </div>
        </div>
      </Popup>
    </Marker>
  );
};

export default OwnShipLayer;