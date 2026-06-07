import React from 'react';
import { motion } from 'framer-motion';
import { Anchor, AlertTriangle, CheckCircle2, Waves } from 'lucide-react';
import { calculateBearing, calculateDistanceNM } from '../lib/utils';
import { cn } from '../lib/utils';

interface AnchorWatchPageProps {
  anchorPosition: { lat: number; lng: number } | null;
  shipPosition: { lat: number; lng: number } | null;
  swingRadius: number; // en metros
  currentAnchorDistance: number; // en metros
  isAnchorWatchActive: boolean;
  anchorTrend: 'stable' | 'drifting' | 'swinging';
}

export const AnchorWatchPage: React.FC<AnchorWatchPageProps> = ({
  anchorPosition,
  shipPosition,
  swingRadius,
  currentAnchorDistance,
  isAnchorWatchActive,
  anchorTrend,
}) => {
  if (!isAnchorWatchActive || !anchorPosition || !shipPosition) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-slate-500 text-center p-4">
        <Anchor className="w-12 h-12 mb-4" />
        <p className="text-sm font-bold uppercase tracking-widest">Monitor de Fondeo Inactivo</p>
        <p className="text-xs mt-2">Active el "Anchor Watch" para visualizar el borneo.</p>
      </div>
    );
  }

  // Escala para el SVG: el radio del círculo de borneo se mapea a un tamaño fijo en el SVG.
  // Por ejemplo, si el SVG tiene un tamaño de 200x200, el radio máximo visible será 100 unidades.
  const SVG_SIZE = 200;
  const SVG_CENTER = SVG_SIZE / 2;
  const MAX_DISPLAY_RADIUS = SVG_CENTER - 10; // Margen para que no toque los bordes

  // Calcular la posición relativa del barco en el SVG
  // La distancia se escala para que el swingRadius se ajuste al MAX_DISPLAY_RADIUS
  const scaleFactor = MAX_DISPLAY_RADIUS / swingRadius;
  const relativeDistance = currentAnchorDistance * scaleFactor;

  // Calcular el rumbo del barco respecto al ancla
  const bearingToAnchor = calculateBearing(
    anchorPosition.lat, anchorPosition.lng,
    shipPosition.lat, shipPosition.lng
  );

  // Convertir rumbo a coordenadas cartesianas para el SVG (0° es arriba, 90° derecha)
  // Leaflet y la mayoría de los sistemas usan 0° Norte (arriba), 90° Este (derecha)
  // SVG usa 0° Este (derecha), 90° Sur (abajo)
  // Ajustamos para que 0° (Norte) en el mapa sea 0° (arriba) en el SVG.
  // El ángulo en el SVG se mide desde el eje X positivo (derecha) en sentido horario.
  // Por lo tanto, un rumbo de 0° (Norte) debe apuntar hacia arriba (-90° o 270° en cartesiano).
  // Un rumbo de 90° (Este) debe apuntar a la derecha (0° en cartesiano).
  // Un rumbo de 180° (Sur) debe apuntar hacia abajo (90° en cartesiano).
  // Un rumbo de 270° (Oeste) debe apuntar a la izquierda (180° en cartesiano).
  const angleRad = (bearingToAnchor - 90) * (Math.PI / 180); // Ajuste para SVG

  const shipX = SVG_CENTER + relativeDistance * Math.cos(angleRad);
  const shipY = SVG_CENTER + relativeDistance * Math.sin(angleRad);

  const isCritical = anchorTrend === 'drifting' || currentAnchorDistance > swingRadius;

  return (
    <div className="flex flex-col items-center justify-center h-full p-4 space-y-4">
      <h3 className="text-xl font-black uppercase tracking-widest text-cyan-400">Monitor de Fondeo</h3>
      <div className="relative" style={{ width: SVG_SIZE, height: SVG_SIZE }}>
        <svg width={SVG_SIZE} height={SVG_SIZE} viewBox={`0 0 ${SVG_SIZE} ${SVG_SIZE}`} className="bg-black/20 rounded-full border border-white/10">
          {/* Círculo de borneo */}
          <circle
            cx={SVG_CENTER}
            cy={SVG_CENTER}
            r={MAX_DISPLAY_RADIUS}
            fill="none"
            stroke={isCritical ? 'rgba(239,68,68,0.5)' : 'rgba(6,182,212,0.5)'}
            strokeWidth="2"
            strokeDasharray={isCritical ? "5 5" : "none"}
          />
          {/* Centro del ancla */}
          <circle cx={SVG_CENTER} cy={SVG_CENTER} r="3" fill="white" />
          <text x={SVG_CENTER} y={SVG_CENTER + 10} textAnchor="middle" fill="white" fontSize="10" className="font-mono">⚓</text>

          {/* Posición del barco */}
          <motion.circle
            cx={shipX}
            cy={shipY}
            r="5"
            fill={isCritical ? 'red' : 'cyan'}
            animate={isCritical ? { scale: [1, 1.2, 1], opacity: [1, 0.7, 1] } : {}}
            transition={isCritical ? { duration: 1, repeat: Infinity } : {}}
          />
          <text x={shipX} y={shipY - 8} textAnchor="middle" fill="white" fontSize="10" className="font-mono">⛵</text>
        </svg>
        {isCritical && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: [0, 1, 0] }}
            transition={{ duration: 1.5, repeat: Infinity }}
            className="absolute inset-0 flex items-center justify-center pointer-events-none"
          >
            <AlertTriangle className="w-24 h-24 text-red-500 opacity-50" />
          </motion.div>
        )}
      </div>

      <div className="w-full text-center space-y-2">
        <p className="text-sm font-bold uppercase tracking-widest">
          Distancia al Ancla: <span className={cn("font-mono", isCritical ? "text-red-400" : "text-cyan-400")}>{currentAnchorDistance.toFixed(1)} m</span>
        </p>
        <p className="text-sm font-bold uppercase tracking-widest">
          Radio de Borneo: <span className="font-mono text-white">{swingRadius.toFixed(1)} m</span>
        </p>
        <p className={cn("text-lg font-black uppercase tracking-widest",
          anchorTrend === 'drifting' ? "text-red-500 animate-pulse" :
          anchorTrend === 'swinging' ? "text-amber-500" : "text-emerald-500"
        )}>
          Estado: {anchorTrend === 'drifting' ? '¡GARREANDO!' : anchorTrend === 'swinging' ? 'Borneando' : 'Estable'}
        </p>
      </div>
    </div>
  );
};