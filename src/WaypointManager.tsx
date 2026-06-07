import React, { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Upload, MapPin, Trash2, Play, Download, FileText, Map, AlertCircle } from 'lucide-react';
import { parseGPX, GPXRoute, GPXWaypoint, exportRouteToGPX } from '../../../lib/gpxParser';
import { cn } from '../../../lib/utils';

interface WaypointManagerProps {
  onRouteLoaded: (route: GPXRoute) => void;
  isLoading?: boolean;
}

export const WaypointManager: React.FC<WaypointManagerProps> = ({
  onRouteLoaded,
  isLoading = false
}) => {
  const [routes, setRoutes] = useState<GPXRoute[]>([]);
  const [selectedRoute, setSelectedRoute] = useState<GPXRoute | null>(null);
  const [error, setError] = useState<string>('');
  const [isImporting, setIsImporting] = useState(false);

  const handleFileUpload = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      setError('');
      const file = event.target.files?.[0];
      
      if (!file) return;

      // Validate file extension
      if (!file.name.toLowerCase().endsWith('.gpx')) {
        setError('Solo se aceptan archivos .gpx');
        return;
      }

      setIsImporting(true);

      try {
        const content = await file.text();
        const parsed = parseGPX(content);

        if (parsed.routes.length === 0 && parsed.waypoints.length === 0) {
          setError('El archivo GPX no contiene rutas ni waypoints');
          setIsImporting(false);
          return;
        }

        setRoutes(parsed.routes);

        // Auto-select first route if available
        if (parsed.routes.length > 0) {
          setSelectedRoute(parsed.routes[0]);
          onRouteLoaded(parsed.routes[0]);
        }

        setError('');
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Error desconocido al parsear GPX';
        setError(errorMessage);
        console.error('GPX parsing error:', err);
      } finally {
        setIsImporting(false);
      }
    },
    [onRouteLoaded]
  );

  const handleSelectRoute = (route: GPXRoute) => {
    setSelectedRoute(route);
    onRouteLoaded(route);
  };

  const handleDeleteRoute = (index: number) => {
    const newRoutes = routes.filter((_, i) => i !== index);
    setRoutes(newRoutes);
    
    if (selectedRoute === routes[index]) {
      setSelectedRoute(newRoutes.length > 0 ? newRoutes[0] : null);
    }
  };

  const handleExportRoute = (route: GPXRoute) => {
    try {
      const gpxContent = exportRouteToGPX(route.name, route.waypoints);
      const blob = new Blob([gpxContent], { type: 'application/gpx+xml' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${route.name.replace(/\s+/g, '_')}.gpx`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError('Error al exportar ruta');
      console.error('Export error:', err);
    }
  };

  return (
    <div className="flex flex-col h-full bg-slate-950 rounded-2xl border border-white/10 overflow-hidden">
      {/* Header */}
      <div className="p-4 border-b border-white/5 bg-slate-900/50">
        <div className="flex items-center gap-2 mb-3">
          <Map className="w-4 h-4 text-cyan-400" />
          <h3 className="text-sm font-black text-white uppercase tracking-widest">Gestión de Waypoints</h3>
        </div>

        {/* Upload Section */}
        <div className="relative">
          <input
            type="file"
            accept=".gpx"
            onChange={handleFileUpload}
            disabled={isImporting}
            className="hidden"
            id="gpx-upload"
          />
          <label
            htmlFor="gpx-upload"
            className={cn(
              "flex items-center justify-center gap-2 px-4 py-3 rounded-xl border-2 border-dashed cursor-pointer transition-all",
              isImporting
                ? "border-cyan-500/30 bg-cyan-500/5"
                : "border-cyan-500/50 hover:border-cyan-400 bg-cyan-500/10 hover:bg-cyan-500/20"
            )}
          >
            <Upload className="w-4 h-4 text-cyan-400" />
            <span className="text-[10px] font-black text-cyan-400 uppercase tracking-widest">
              {isImporting ? 'Cargando...' : 'Importar GPX'}
            </span>
          </label>
        </div>
      </div>

      {/* Error Message */}
      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="px-4 py-3 bg-red-500/10 border-b border-red-500/20 flex items-start gap-2"
          >
            <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
            <p className="text-[9px] font-bold text-red-400 uppercase tracking-tight">{error}</p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Routes List */}
      <div className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-2">
        {routes.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center py-8">
            <FileText className="w-8 h-8 text-slate-600 mb-2" />
            <p className="text-[10px] font-bold text-slate-500 uppercase">Sin rutas cargadas</p>
            <p className="text-[8px] text-slate-600 mt-1">Importa un archivo GPX para comenzar</p>
          </div>
        ) : (
          routes.map((route, idx) => (
            <motion.div
              key={idx}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className={cn(
                "p-3 rounded-xl border transition-all cursor-pointer group",
                selectedRoute === route
                  ? "bg-cyan-600/20 border-cyan-500/50"
                  : "bg-slate-800/30 border-white/10 hover:border-cyan-500/30"
              )}
              onClick={() => handleSelectRoute(route)}
            >
              <div className="flex items-start justify-between mb-2">
                <div className="flex items-center gap-2 min-w-0">
                  <MapPin className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                  <div className="min-w-0">
                    <p className="text-[10px] font-black text-white uppercase tracking-tight truncate">
                      {route.name}
                    </p>
                    <p className="text-[8px] text-slate-500">
                      {route.waypoints.length} waypoint{route.waypoints.length !== 1 ? 's' : ''}
                      {route.distance && ` • ${route.distance.toFixed(1)} NM`}
                    </p>
                  </div>
                </div>

                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleExportRoute(route);
                    }}
                    className="p-1.5 hover:bg-cyan-600/30 rounded-lg transition-colors"
                    title="Exportar ruta"
                  >
                    <Download className="w-3 h-3 text-cyan-400" />
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeleteRoute(idx);
                    }}
                    className="p-1.5 hover:bg-red-600/30 rounded-lg transition-colors"
                    title="Eliminar ruta"
                  >
                    <Trash2 className="w-3 h-3 text-red-400" />
                  </button>
                </div>
              </div>

              {/* Waypoints Preview */}
              {selectedRoute === route && route.waypoints.length > 0 && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="mt-3 pt-3 border-t border-white/5 space-y-1.5"
                >
                  {route.waypoints.slice(0, 3).map((wp, wpIdx) => (
                    <div key={wpIdx} className="flex items-center justify-between text-[8px]">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <div className="w-1.5 h-1.5 rounded-full bg-cyan-400 shrink-0" />
                        <span className="text-slate-300 truncate">{wp.name}</span>
                      </div>
                      <span className="text-slate-600 font-mono whitespace-nowrap ml-2">
                        {wp.lat.toFixed(4)}°, {wp.lng.toFixed(4)}°
                      </span>
                    </div>
                  ))}
                  {route.waypoints.length > 3 && (
                    <p className="text-[8px] text-slate-600 italic pt-1">
                      +{route.waypoints.length - 3} más...
                    </p>
                  )}
                </motion.div>
              )}
            </motion.div>
          ))
        )}
      </div>

      {/* Footer - Action Button */}
      {selectedRoute && (
        <div className="p-4 border-t border-white/5 bg-slate-900/50">
          <button
            onClick={() => onRouteLoaded(selectedRoute)}
            disabled={isLoading}
            className="w-full py-3 bg-cyan-600 hover:bg-cyan-500 disabled:bg-slate-700 text-white rounded-xl font-black text-[10px] uppercase tracking-widest transition-all flex items-center justify-center gap-2 shadow-lg shadow-cyan-900/20"
          >
            <Play className="w-3.5 h-3.5" />
            {isLoading ? 'Cargando...' : 'Navegar Ruta'}
          </button>
        </div>
      )}
    </div>
  );
};

export default WaypointManager;
