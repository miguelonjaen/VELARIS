import { describeManualBoatEvent, parseManualBoatEvent } from '../features/boat/boatOperationsModel';
import { deleteLogbookEntries, logbookDate, isPersistentLogEntry, excludedLogbookIds, excludeLogbookIds } from '../lib/logbookDeletion';
import { getTripLogger } from '../lib/tripLogger';
import { repairDisplayText } from '../lib/textEncoding';
import { isRouteTrialEntryId } from '../features/navigation/hooks/useRouteTrial';
import React, { useState, useEffect } from 'react';
import { 
  DollarSign, 
  Zap, 
  Book, 
  Plus, 
  Fuel, 
  Navigation, 
  Anchor, 
  Loader2,
  Bot,
  AlertCircle,
  Wind,
  Settings,
  MapPin,
  AlertTriangle,
  Filter,
  Calendar,
  Edit2,
  Trash2,
  Save,
  X,
  Compass,
  Activity,
  Droplets,
  Clock
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { SupabaseClient } from '@supabase/supabase-js';
import { LogEntry, UserProfile, ShipData } from '../shared/types';
import { cn } from '../lib/utils';
import { useGaulosLink } from '../features/link/gaulosLinkStore';
import { isLinkEntryId, linkEventToLogEntry } from '../features/link/linkLogbook';

interface LogbookProps {
  userProfile: UserProfile;
  supabase: SupabaseClient;
  fleet: ShipData[];
  selectedShipId: string | number | null;
  setAdvisorMessage: (msg: string) => void;
  logEntries: LogEntry[];
  localTrialEntries?: LogEntry[];
  setLogEntries: React.Dispatch<React.SetStateAction<LogEntry[]>>;
  saveLogEntry: (titulo: string, descripcion: string, categoria?: string) => Promise<void>;
  onClearAdvisor?: () => void;
  isEngineOn?: boolean;
  propulsionAutomatic?: boolean;
  onDeclarePropulsion?: (value: boolean) => Promise<void>;
  setIsEngineOn?: (val: boolean) => void;
}

type FilterType = 'all' | 'manual' | 'auto' | 'alerts';

const Logbook: React.FC<LogbookProps> = ({ 
  userProfile, 
  supabase, 
  fleet,
  selectedShipId, 
  setAdvisorMessage,
  logEntries,
  localTrialEntries = [],
  setLogEntries,
  saveLogEntry,
  onClearAdvisor,
  isEngineOn,
  propulsionAutomatic = false,
  onDeclarePropulsion,
  setIsEngineOn
}) => {
  // Eventos de GAULOS Link (tracks de GAULOSdroid) guardados localmente: se muestran junto a la
  // bitácora de Supabase sin mezclarse con su estado ni con sus operaciones de edición y borrado.
  const linkState = useGaulosLink();
  const isAutomaticLocal = (id: LogEntry['id']) => String(id).startsWith('auto:');
  const [exclusionRevision, setExclusionRevision] = useState(0);
  const exclusions = React.useMemo(() => excludedLogbookIds(selectedShipId), [selectedShipId, exclusionRevision]);
  const visibleEntries = React.useMemo(() => {
    const linked = linkState.events.map((event) => linkEventToLogEntry(event, selectedShipId));
    const time = (entry: LogEntry) => new Date(entry.created_at || entry.fecha).getTime() || 0;
    const local = localTrialEntries.filter(entry => String(entry.barco_id) === String(selectedShipId));
    // Prefer durable local identities; a confirmed cloud copy represents the same event.
    const key = (e: LogEntry) => `${e.barco_id}|${e.created_at}|${e.titulo}`;
    const localKeys = new Set(local.map(key));
    return [...logEntries.filter(e => !localKeys.has(key(e))), ...linked, ...local]
      .filter(entry => !exclusions.has(String(entry.id)))
      .sort((a, b) => time(b) - time(a));
  }, [logEntries, linkState.events, selectedShipId, localTrialEntries, exclusions]);

  const today = new Date();
  const localToday = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  
  const [filter, setFilter] = useState<FilterType>('all');
  const [selectedDate, setSelectedDate] = useState<string>(localToday);
  const [availableDates, setAvailableDates] = useState<string[]>([]);
  const displayDates = React.useMemo(() => Array.from(new Set([
    ...availableDates.filter(date => visibleEntries.some(entry => logbookDate(entry) === date)),
    ...visibleEntries.map(entry => logbookDate(entry))
  ].filter(Boolean))).sort().reverse(), [availableDates, visibleEntries]);
  const [showArchive, setShowArchive] = useState(false);
  const [editingEntryId, setEditingEntryId] = useState<string | number | null>(null);
  const [editDescription, setEditDescription] = useState('');
  const [isAddingLog, setIsAddingLog] = useState(false);
  const [newLogEntry, setNewLogEntry] = useState({
    titulo: '',
    categoria: 'Técnico',
    descripcion: '',
    horas_motor: 0,
    viento_nudos: 0,
    velocidad_gps: 0,
    rumbo: 0,
    fecha: localToday
  });

  const fetchLogEntries = async () => {
    if (!selectedShipId) return;
    try {
      console.log('Logbook: Fetching entries for barco_id:', selectedShipId);
      const { data, error } = await supabase
        .from('bitacora')
        .select('*')
        .eq('barco_id', selectedShipId)
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      if (data) {
        setLogEntries(data);
      }
    } catch (err) {
      console.error('Logbook: Error fetching log entries:', err);
    }
  };

  const fetchAvailableDates = async () => {
    if (!selectedShipId) return;
    try {
      const { data, error } = await supabase
        .from('bitacora')
        .select('fecha, created_at')
        .eq('barco_id', selectedShipId)
        .order('created_at', { ascending: false });
      
      if (error) throw error;

      if (data) {
        const dates = Array.from(new Set(data.map(d => logbookDate(d))));
        setAvailableDates(dates);
      }
    } catch (err) {
      console.error('Error fetching available dates:', err);
    }
  };

  useEffect(() => {
    fetchLogEntries();
    fetchAvailableDates();

    if (!selectedShipId) return;

    // Real-time subscription filtered by barco_id
    const channel = supabase
      .channel(`bitacora_ship_${selectedShipId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'bitacora',
          filter: `barco_id=eq.${selectedShipId}`
        },
        (payload) => {
          console.log('Realtime bitacora update for ship:', payload);
          fetchLogEntries();
          fetchAvailableDates();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [selectedShipId, supabase]);

  const [pendingDelete, setPendingDelete] = useState<{shipId: string | number; entries: LogEntry[]; label: string} | null>(null);
  const [deleteError, setDeleteError] = useState('');
  const [deleting, setDeleting] = useState(false);
  const deleteLock = React.useRef(false);
  const requestDelete = (date: string | null, id?: LogEntry['id']) => {
    if (selectedShipId === null || deleteLock.current) return;
    const entries = visibleEntries.filter(entry => String(entry.barco_id) === String(selectedShipId)
      && (date ? logbookDate(entry) === date : String(entry.id) === String(id)));
    setDeleteError('');
    if (!entries.length) {
      setDeleteError('No hay registros de bitácora en esta selección.');
      return;
    }
    setPendingDelete({ shipId: selectedShipId, entries, label: date ? `del día ${date}` : 'seleccionado' });
  };
  const handleDeleteEntry = (id: LogEntry['id']) => requestDelete(null, id);
  const handleDeleteDay = (date: string) => requestDelete(date);
  const confirmDelete = async () => {
    if (!pendingDelete || deleteLock.current) return;
    const { shipId, entries } = pendingDelete;
    if (String(selectedShipId) !== String(shipId)) {
      setPendingDelete(null);
      setDeleteError('La embarcación ha cambiado. Selecciona de nuevo los registros.');
      return;
    }
    deleteLock.current = true;
    setDeleting(true);
    setDeleteError('');
    try {
      const selectedKeys = new Set(entries.map(entry => `${entry.created_at}|${entry.titulo}`));
      const cloudIds = [...new Set(logEntries.filter(entry => String(entry.barco_id) === String(shipId)
        && isPersistentLogEntry(entry.id)
        && (entries.some(selected => String(selected.id) === String(entry.id))
          || selectedKeys.has(`${entry.created_at}|${entry.titulo}`)))
        .map(entry => entry.id))];
      const localIds = [...new Set(entries.filter(entry => !isPersistentLogEntry(entry.id)).map(entry => String(entry.id)))];
      const autoIds = localIds.filter(id => id.startsWith('auto:'));
      // Remove automatic retry sources before deleting their cloud copies.
      if (autoIds.length) await getTripLogger().removeAutomaticJournalEntries(String(shipId), autoIds);
      let deleted: LogEntry['id'][] = [];
      if (cloudIds.length) {
        deleted = await deleteLogbookEntries(supabase, shipId, cloudIds);
        if (deleted.length !== cloudIds.length) {
          throw new Error(`Borrado parcial en Supabase: ${deleted.length} de ${cloudIds.length}. Reintenta para completar.`);
        }
      }
      // Link events and trial logs remain in their original stores; only the logbook view is excluded.
      excludeLogbookIds(shipId, localIds);
      setExclusionRevision(value => value + 1);
      const ids = new Set(deleted.map(String));
      setLogEntries(previous => previous.filter(entry => String(entry.barco_id) !== String(shipId) || !ids.has(String(entry.id))));
      setPendingDelete(null);
      setAdvisorMessage(`${entries.length} registros retirados de la bitácora.`);
      void fetchAvailableDates();
    } catch (cause: unknown) {
      const message = cause instanceof Error ? cause.message : 'Error desconocido';
      setDeleteError(`No se pudo completar el borrado: ${message}`);
      setAdvisorMessage(`No se pudo completar el borrado: ${message}`);
    } finally {
      deleteLock.current = false;
      setDeleting(false);
    }
  };

  const [showWatchChangeModal, setShowWatchChangeModal] = useState(false);
  const [watchChangeData, setWatchChangeData] = useState({
    oficial_entrante: '',
    estado_sistemas: 'Novedades: Ninguna, Motores OK'
  });

  const handleWatchChange = async () => {
    if (!watchChangeData.oficial_entrante) return;

    const description = `Oficial Saliente: ${userProfile?.name || 'Usuario Actual'}\nOficial Entrante: ${watchChangeData.oficial_entrante}\nEstado: ${watchChangeData.estado_sistemas}`;
    
    await handleAddLogEntry(undefined, {
      titulo: 'Cambio de Guardia',
      categoria: 'Operativo',
      descripcion: description
    });

    setShowWatchChangeModal(false);
    setWatchChangeData({ oficial_entrante: '', estado_sistemas: 'Novedades: Ninguna, Motores OK' });
  };

  const handleUpdateEntry = async (id: string | number) => {
    try {
      const { error } = await supabase
        .from('bitacora')
        .update({ descripcion: editDescription })
        .eq('id', id)
        .eq('barco_id', selectedShipId);
        
      if (error) throw error;

      setAdvisorMessage('Registro actualizado en la caja negra.');
      setEditingEntryId(null);
      fetchLogEntries();
    } catch (err: unknown) {
      console.error('Error updating log entry:', err);
      const errorMessage = err instanceof Error ? err.message : 'Error desconocido';
      setAdvisorMessage(`Fallo en actualización: ${errorMessage}`);
    }
  };

  const handleAddLogEntry = async (e?: React.FormEvent, overrideEntry?: any) => {
    if (e) e.preventDefault();
    const effectiveProfileId = userProfile?.id || 'demo-user';
    
    // Encontrar el barco activo para obtener su ID real
    const activeShip = fleet.find(s => s.id === selectedShipId) || fleet[0];
    const barcoIdReal = activeShip ? activeShip.id : selectedShipId;
    
    setIsAddingLog(true);

    const now = new Date();
    const entryToInsert = overrideEntry || {
      barco_id: barcoIdReal,
      capitan_id: effectiveProfileId,
      titulo: newLogEntry.titulo || newLogEntry.categoria || 'Registro Manual',
      descripcion: newLogEntry.descripcion,
      categoria: newLogEntry.categoria || 'Técnico',
      ubicacion_texto: 'Puerto de Motril',
      horas_motor: Number(newLogEntry.horas_motor || 0),
      created_at: now.toISOString(),
      fecha: now.toISOString().slice(0, 10),
      viento_nudos: newLogEntry.viento_nudos || null,
      velocidad_gps: newLogEntry.velocidad_gps || null,
      rumbo: newLogEntry.rumbo ? Number(newLogEntry.rumbo) : null,
      latitud: 36.7215, // Default Motril
      longitud: -3.5235
    };

    if (overrideEntry) {
      entryToInsert.barco_id = entryToInsert.barco_id || barcoIdReal;
      entryToInsert.capitan_id = entryToInsert.capitan_id || effectiveProfileId;
      entryToInsert.created_at = entryToInsert.created_at || now.toISOString();
      entryToInsert.latitud = entryToInsert.latitud || 36.7215;
      entryToInsert.longitud = entryToInsert.longitud || -3.5235;
    }

    // Optimismo: Añadir al estado local inmediatamente
    const tempEntry: LogEntry = {
      id: 'temp-' + Date.now(),
      ...entryToInsert,
      fecha: now.toISOString().split('T')[0],
      user_id: effectiveProfileId
    } as any;
    
    setLogEntries(prev => [tempEntry, ...prev]);

    try {
      const { error } = await supabase
        .from('bitacora')
        .insert([entryToInsert]);

      if (error) throw error;

      setAdvisorMessage('Entrada de bitácora registrada, Capitán.');
      setNewLogEntry({
        titulo: '',
        categoria: 'Técnico',
        descripcion: '',
        horas_motor: 0,
        viento_nudos: 0,
        velocidad_gps: 0,
        rumbo: 0,
        fecha: localToday
      });
      
      fetchLogEntries();
      fetchAvailableDates();
    } catch (err: unknown) {
      console.error('Error adding log entry to Supabase:', err);
      const errorMessage = err instanceof Error ? err.message : 'Error desconocido';
      setAdvisorMessage(`Error en bitácora: ${errorMessage}`);
      // Revertir optimismo si falla
      fetchLogEntries();
    } finally {
      setIsAddingLog(false);
    }
  };

  const totalExpense = logEntries.reduce((acc, entry) => acc + ((entry.litros_repostados || 0) * (entry.precio_litro || 0)), 0);

  const getEntryIcon = (entry: LogEntry) => {
    const text = (entry.descripcion || entry.texto || '').toLowerCase();
    const cat = (entry.categoria || '').toLowerCase();
    const title = (entry.titulo || '').toLowerCase();

    if (cat.includes('seguridad') || title.includes('alerta') || text.includes('alerta') || text.includes('mob')) return <AlertTriangle className="w-5 h-5" />;
    if (text.includes('hito') || text.includes('millas')) return <MapPin className="w-5 h-5" />;
    if (text.includes('motor') || text.includes('propulsión: motor')) return <Settings className="w-5 h-5" />;
    if (text.includes('vela') || text.includes('propulsión: vela')) return <Wind className="w-5 h-5" />;
    if (title.includes('despacho') || text.includes('travesía finalizada') || text.includes('cierre')) return <Anchor className="w-5 h-5" />;
    if (cat === 'repostaje' || cat === 'gasto') return <Fuel className="w-5 h-5" />;
    if (title === 'evento automático') return <Bot className="w-5 h-5" />;
    return <Navigation className="w-5 h-5" />;
  };

  const getEntryColor = (entry: LogEntry) => {
    const text = (entry.descripcion || entry.texto || '').toLowerCase();
    const cat = (entry.categoria || '').toLowerCase();
    const title = (entry.titulo || '').toLowerCase();

    if (cat.includes('seguridad') || title.includes('alerta') || text.includes('alerta') || text.includes('mob')) return 'bg-red-500/20 text-red-400 border-red-500/30';
    if (text.includes('hito') || text.includes('millas')) return 'bg-purple-500/20 text-purple-400 border-purple-500/30';
    if (text.includes('motor') || text.includes('propulsión: motor')) return 'bg-amber-500/20 text-amber-400 border-amber-500/30';
    if (text.includes('vela') || text.includes('propulsión: vela')) return 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30';
    if (title.includes('despacho') || text.includes('travesía finalizada') || text.includes('cierre')) return 'bg-blue-500/20 text-blue-400 border-blue-500/30';
    if (cat === 'repostaje' || cat === 'gasto') return 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30';
    if (title === 'evento automático') return 'bg-slate-700/50 text-slate-300 border-slate-600';
    return 'bg-slate-800 text-slate-400 border-slate-700';
  };

  const filteredEntries = visibleEntries.filter(entry => {
    const isAuto = entry.is_auto === true || entry.titulo === 'Evento Automático' || entry.titulo === 'Despacho de Travesía' || entry.titulo === 'Cierre de Travesía' || entry.titulo === 'Cambio de Guardia';
    const isAlert = (entry.categoria || '').toLowerCase().includes('seguridad') || (entry.titulo || '').toLowerCase().includes('alerta');
    
    if (filter === 'manual') return !isAuto;
    if (filter === 'auto') return isAuto;
    if (filter === 'alerts') return isAlert;
    return true; // 'all'
  });

  // Group entries by date
  const groupedEntries = filteredEntries.reduce((groups: { [key: string]: LogEntry[] }, entry) => {
    const date = logbookDate(entry);
    if (!groups[date]) {
      groups[date] = [];
    }
    groups[date].push(entry);
    return groups;
  }, {});

  const sortedDates = Object.keys(groupedEntries).sort((a, b) => b.localeCompare(a));

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6 }}
      className="p-4 md:p-8 space-y-8 w-full max-w-none bg-slate-950 min-h-screen pointer-events-auto"
    >
      {deleteError && <p role="alert" className="p-4 border border-red-500 rounded-xl text-red-300">{deleteError}</p>}
      {pendingDelete && <div className="fixed inset-0 z-[200] bg-black/80 flex items-center justify-center p-4">
        <section role="dialog" aria-modal="true" aria-labelledby="log-delete-title" className="bg-slate-900 border border-slate-600 rounded-2xl p-6 max-w-lg text-white"
          onKeyDown={event => {
            if (event.key === 'Escape' && !deleting) setPendingDelete(null);
            if (event.key === 'Tab') {
              const buttons = event.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)');
              const first = buttons[0], last = buttons[buttons.length - 1];
              if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
              else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
            }
          }}>
          <h3 id="log-delete-title" className="text-xl font-bold">Confirmar eliminación</h3>
          <p className="my-4">Eliminar {pendingDelete.entries.length} registros de bitácora {pendingDelete.label} de la embarcación {fleet.find(ship => String(ship.id) === String(pendingDelete.shipId))?.nombre || pendingDelete.shipId}. Esta acción no se puede deshacer. Se conservan tracks, travesías y datos originales de navegación. Los eventos locales se excluyen de la vista de bitácora.</p>
          {deleteError && <p role="alert" className="text-red-300">{deleteError}</p>}
          <div className="flex gap-4 mt-4">
            <button type="button" autoFocus disabled={deleting} onClick={() => setPendingDelete(null)} className="px-4 py-3 rounded-xl bg-slate-700">Cancelar</button>
            <button type="button" disabled={deleting} onClick={() => void confirmDelete()} className="px-4 py-3 rounded-xl bg-red-700">{deleting ? 'Eliminando…' : 'Eliminar registros'}</button>
          </div>
        </section>
      </div>}
      <div className="flex flex-col gap-12">
        {/* List - History ABOVE */}
        <div className="space-y-8 w-full">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 px-2">
            <div className="flex items-center gap-3">
              <Book className="w-6 h-6 text-cyan-500" />
              <h2 className="text-2xl font-black text-white uppercase tracking-tighter">Historial Técnico (Caja Negra)</h2>
            </div>
            
            <div className="flex items-center gap-2">
              <button
                disabled={propulsionAutomatic}
                title={propulsionAutomatic ? 'Selección automática según RPM de los instrumentos' : 'Selección manual de propulsión'}

                onClick={async () => {
                  if (onDeclarePropulsion) { await onDeclarePropulsion(!isEngineOn); return; }
                  if (setIsEngineOn) {
                    setIsEngineOn(!isEngineOn);
                    await saveLogEntry(
                      '⚙️ MOTOR', 
                      `Propulsión: Motor ${!isEngineOn ? 'Encendido' : 'Apagado'}. Régimen de crucero.`, 
                      'Técnico'
                    );
                    setAdvisorMessage(`Motor ${!isEngineOn ? 'Encendido' : 'Apagado'} - Orden procesada.`);
                  } else {
                    await saveLogEntry('⚙️ MOTOR', 'Propulsión: Motor Encendido. Régimen de crucero.', 'Técnico');
                    setAdvisorMessage('Evento de Motor registrado.');
                  }
                }}
                className={cn(
                  "px-3 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all border",
                  isEngineOn 
                    ? "bg-amber-600 text-white border-amber-500 shadow-lg shadow-amber-900/40" 
                    : "bg-amber-600/20 text-amber-500 border-amber-500/30 hover:bg-amber-600 hover:text-white"
                )}
              >
                ⚙️ Motor
              </button>
              <button
                disabled={propulsionAutomatic}
                title={propulsionAutomatic ? 'Selección automática según RPM de los instrumentos' : 'Selección manual de propulsión'}

                onClick={async () => {
                  if (onDeclarePropulsion) { await onDeclarePropulsion(false); return; }
                  if (setIsEngineOn && isEngineOn) {
                    setIsEngineOn(false);
                  }
                  await saveLogEntry('⛵ VELA', 'Propulsión: Navegando a Vela. Motores apagados.', 'Técnico');
                  setAdvisorMessage('Evento de Vela registrado.');
                }}
                className={cn(
                  "px-3 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all border",
                  !isEngineOn 
                    ? "bg-cyan-600 text-white border-cyan-500 shadow-lg shadow-cyan-900/40"
                    : "bg-cyan-600/20 text-cyan-500 border-cyan-500/30 hover:bg-cyan-600 hover:text-white"
                )}
              >
                ⛵ Vela
              </button>
              <button 
                onClick={() => setShowWatchChangeModal(true)}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-sm font-black uppercase tracking-widest transition-all flex items-center gap-2 shadow-lg shadow-emerald-900/20"
              >
                <Clock className="w-4 h-4" />
                Registrar Relevo
              </button>
              <input 
                type="date" 
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="px-4 py-2 bg-slate-900 border border-slate-800 rounded-xl text-white text-sm outline-none focus:border-cyan-500/50 transition-all"
              />
              <button 
                onClick={() => setShowArchive(!showArchive)}
                className={cn(
                  "px-4 py-2 rounded-xl text-sm font-black uppercase tracking-widest transition-all flex items-center gap-2",
                  showArchive ? "bg-cyan-600 text-white" : "bg-slate-900 border border-slate-800 text-slate-400 hover:text-white"
                )}
              >
                <Calendar className="w-4 h-4" />
                Archivo
              </button>
            </div>
          </div>

          {showArchive && (
            <motion.div 
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="bg-slate-900/50 border border-slate-800 p-4 rounded-2xl flex flex-wrap gap-2"
            >
              {displayDates.length === 0 ? (
                <p className="text-sm text-slate-500">No hay fechas en el archivo.</p>
              ) : (
                displayDates.map(date => (
                  <button
                    key={date}
                    onClick={() => {
                      setSelectedDate(date);
                      setShowArchive(false);
                    }}
                    className={cn(
                      "px-3 py-1.5 rounded-lg text-xs font-bold transition-all",
                      selectedDate === date 
                        ? "bg-cyan-600 text-white" 
                        : "bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-white"
                    )}
                  >
                    {new Date(date).toLocaleDateString()}
                  </button>
                ))
              )}
            </motion.div>
          )}
          
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 px-2">
            {/* Filters */}
            <div className="flex items-center gap-2 bg-slate-900/50 p-1.5 rounded-2xl border border-slate-800 overflow-x-auto w-full sm:w-auto">
              {[
                { id: 'all', label: 'Todos' },
                { id: 'manual', label: 'Manual' },
                { id: 'auto', label: 'Automático' },
                { id: 'alerts', label: 'Alertas' }
              ].map(f => (
                <button
                  key={f.id}
                  onClick={() => setFilter(f.id as FilterType)}
                  className={cn(
                    "px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap",
                    filter === f.id 
                      ? "bg-cyan-600 text-white shadow-lg shadow-cyan-900/20" 
                      : "text-slate-500 hover:text-slate-300 hover:bg-slate-800/50"
                  )}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          <div className="relative space-y-12 before:absolute before:inset-0 before:ml-5 before:-translate-x-px md:before:mx-auto md:before:translate-x-0 before:h-full before:w-0.5 before:bg-gradient-to-b before:from-transparent before:via-slate-800 before:to-transparent">
            <AnimatePresence mode="popLayout">
              {sortedDates.map((dateStr) => (
                <div key={dateStr} className="space-y-8 relative z-10">
                  {/* Date Header with Delete Option */}
                  <div className="flex items-center justify-between bg-slate-900/80 backdrop-blur-md p-4 rounded-2xl border border-slate-800 shadow-xl sticky top-0 z-20">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 bg-cyan-500/20 rounded-lg flex items-center justify-center border border-cyan-500/30">
                        <Calendar className="w-4 h-4 text-cyan-500" />
                      </div>
                      <span className="text-sm font-black text-white uppercase tracking-widest">
                        {new Date(dateStr).toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
                      </span>
                    </div>
                    <button 
                      onClick={() => handleDeleteDay(dateStr)}
                      className="flex items-center gap-2 px-4 py-2 bg-red-500/10 hover:bg-red-500/20 text-red-500 rounded-xl transition-all border border-red-500/20 group"
                    >
                      <Trash2 className="w-4 h-4 group-hover:scale-110 transition-transform" />
                      <span className="text-[10px] font-black uppercase tracking-widest">Borrar este día</span>
                    </button>
                  </div>

                  <div className="space-y-8">
                    {groupedEntries[dateStr].map((entry, index) => {
                      const isAuto = entry.is_auto === true || entry.is_auto || entry.titulo === 'Evento Automático' || entry.titulo === 'Despacho de Travesía' || entry.titulo === 'Cierre de Travesía' || entry.titulo === 'Cambio de Guardia' || entry.categoria === 'Técnico';
                      const isMob = (entry.categoria === 'SEGURIDAD CRÍTICA' || entry.categoria === 'Seguridad' || entry.titulo === 'EMERGENCIA MOB') && (entry.texto?.includes('MOB') || entry.descripcion?.includes('MOB'));
                      const entryDate = new Date(entry.created_at || entry.fecha || new Date());
                      
                      return (
                        <motion.div 
                          key={entry.id} 
                          initial={{ opacity: 0, y: 20 }} 
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, scale: 0.95 }}
                          transition={{ delay: index * 0.05 }}
                          className="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group is-active"
                        >
                          {/* Timeline Dot */}
                          <div className={cn(
                            "flex items-center justify-center w-10 h-10 rounded-full border-4 border-slate-950 shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2 shadow-xl z-10",
                            getEntryColor(entry)
                          )}>
                            {getEntryIcon(entry)}
                          </div>

                          {/* Card */}
                          <div className="w-[calc(100%-4rem)] md:w-[calc(50%-3rem)] p-4 rounded-3xl border bg-slate-950/50 backdrop-blur-sm transition-all hover:bg-slate-900/80 border-slate-800">
                            <div className="flex items-center justify-between mb-2">
                              <div className="flex items-center gap-2">
                                <span className={cn(
                                  "text-[9px] font-black uppercase tracking-widest px-2 py-1 rounded-lg",
                                  isAuto ? "bg-slate-800 text-slate-400" : "bg-cyan-950/30 text-cyan-500"
                                )}>
                                  {isAuto ? 'Sistema' : 'Manual'}
                                </span>
                                <span className="text-[10px] font-bold text-slate-500 uppercase">
                                  {entry.time || entryDate.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}
                                </span>
                              </div>
                              <div className="flex items-center gap-2">
                                {(isLinkEntryId(entry.id) || isRouteTrialEntryId(entry.id) || isAutomaticLocal(entry.id) || parseManualBoatEvent(entry.descripcion)) ? (
                                  <span className="text-[9px] font-black uppercase tracking-widest px-2 py-1 rounded-lg bg-fuchsia-950/40 text-fuchsia-400" title={parseManualBoatEvent(entry.descripcion) ? "Declaración manual del patrón; no confirma ejecución física" : isAutomaticLocal(entry.id) ? "Bitácora automática guardada en este equipo" : isRouteTrialEntryId(entry.id) ? "Ensayo virtual guardado en este equipo; sin sincronizar con el barco" : "Recibido de GAULOSdroid por GAULOS Link; guardado en este equipo"}>
                                    {parseManualBoatEvent(entry.descripcion) ? (isAutomaticLocal(entry.id) ? "Manual · local" : "Manual · registrado") : isAutomaticLocal(entry.id) ? "Automático · local" : isRouteTrialEntryId(entry.id) ? "Ensayo · local" : "Link · local"}
                                  </span>
                                ) : (
                                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                  <button 
                                    onClick={() => {
                                      setEditingEntryId(entry.id);
                                      setEditDescription(entry.texto || entry.descripcion || '');
                                    }}
                                    className="p-1 text-slate-500 hover:text-cyan-400 transition-colors"
                                    title="Editar"
                                  >
                                    <Edit2 className="w-3 h-3" />
                                  </button>
                                  <button 
                                    onClick={() => handleDeleteEntry(entry.id)}
                                    className="p-1 text-slate-500 hover:text-red-500 transition-colors"
                                    title="Borrar"
                                  >
                                    <Trash2 className="w-3 h-3" />
                                  </button>
                                </div>
                                )}
                              </div>
                            </div>

                            <h4 className={cn(
                              "text-sm font-black uppercase tracking-tight mb-1",
                              isMob ? "text-red-500" : "text-white"
                            )}>
                              {repairDisplayText(entry.titulo || entry.categoria || '')}
                            </h4>

                            {editingEntryId === entry.id ? (
                              <div className="mb-3 space-y-2">
                                <textarea 
                                  value={editDescription}
                                  onChange={(e) => setEditDescription(e.target.value)}
                                  className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-white text-xs outline-none focus:border-cyan-500/50 transition-all min-h-[60px] resize-none"
                                />
                                <div className="flex gap-2 justify-end">
                                  <button 
                                    onClick={() => setEditingEntryId(null)}
                                    className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg transition-colors"
                                  >
                                    <X className="w-3 h-3" />
                                  </button>
                                  <button 
                                    onClick={() => handleUpdateEntry(entry.id)}
                                    className="p-1.5 bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg transition-colors"
                                  >
                                    <Save className="w-3 h-3" />
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <p className={cn(
                                "text-xs leading-relaxed mb-3",
                                isMob ? "text-red-400 font-bold" : "text-slate-400"
                              )}>
                                {repairDisplayText(describeManualBoatEvent(entry.texto || entry.descripcion || ''))}
                              </p>
                            )}

                            {/* Footer Metadata - Technical Columns Only */}
                            <div className="flex flex-wrap items-center gap-3 pt-3 border-t border-slate-800/50">
                              {entry.viento_nudos != null && (
                                <div className="flex items-center gap-1.5 text-blue-400">
                                  <Wind className="w-3 h-3" />
                                  <span className="text-[9px] font-black uppercase tracking-widest">{entry.viento_nudos} kts</span>
                                </div>
                              )}
                              {entry.velocidad_gps != null && entry.velocidad_gps > 0 && (
                                <div className="flex items-center gap-1.5 text-amber-500">
                                  <Activity className="w-3 h-3" />
                                  <span className="text-[9px] font-black uppercase tracking-widest">{Number(entry.velocidad_gps).toFixed(1)} kn</span>
                                </div>
                              )}
                              {entry.rumbo != null && (
                                <div className="flex items-center gap-1.5 text-purple-400">
                                  <Compass className="w-3 h-3" />
                                  <span className="text-[9px] font-black uppercase tracking-widest">{entry.rumbo}°</span>
                                </div>
                              )}
                              {(entry.latitud != null || entry.lat != null) && (
                                <div className="flex items-center gap-1.5 text-slate-500">
                                  <MapPin className="w-3 h-3" />
                                  <span className="text-[9px] font-black uppercase tracking-widest">
                                    {(entry.latitud || entry.lat)?.toFixed(4)}, {(entry.longitud || entry.lng)?.toFixed(4)}
                                  </span>
                                </div>
                              )}
                              {entry.propulsion_objetivo && (
                                <div className="flex items-center gap-1.5 text-cyan-400">
                                  <Zap className="w-3 h-3" />
                                  <span className="text-[9px] font-black uppercase tracking-widest">{entry.propulsion_objetivo}</span>
                                </div>
                              )}
                              {entry.distancia_total != null && (
                                <div className="flex items-center gap-1.5 text-emerald-400">
                                  <Navigation className="w-3 h-3" />
                                  <span className="text-[9px] font-black uppercase tracking-widest">{entry.distancia_total} mn</span>
                                </div>
                              )}
                              {entry.eta && (
                                <div className="flex items-center gap-1.5 text-white">
                                  <Settings className="w-3 h-3" />
                                  <span className="text-[9px] font-black uppercase tracking-widest">ETA: {entry.eta}</span>
                                </div>
                              )}
                            </div>
                            {entry.configuracion_velas && (
                              <div className="mt-2 p-2 bg-slate-900/50 rounded-lg border border-slate-800">
                                <p className="text-[9px] font-black text-cyan-500 uppercase tracking-widest mb-1">Configuración de Velas</p>
                                <p className="text-[10px] text-slate-300 italic">{entry.configuracion_velas}</p>
                              </div>
                            )}
                          </div>
                        </motion.div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </AnimatePresence>

            {filteredEntries.length === 0 && (
              <div className="p-12 text-center space-y-4 bg-slate-950/20 border border-dashed border-slate-800 rounded-3xl relative z-10">
                <Filter className="w-12 h-12 text-slate-800 mx-auto" />
                <p className="text-xs font-bold text-slate-600 uppercase tracking-widest">No hay registros técnicos.</p>
              </div>
            )}
          </div>
        </div>

        {/* Form - History BELOW */}
        <div className="w-full space-y-6">
          <div className="bg-slate-950/50 border border-slate-800 p-8 md:p-12 rounded-[40px] space-y-8 shadow-2xl">
            <div className="flex items-center gap-4 mb-2">
              <div className="w-12 h-12 bg-cyan-500/20 rounded-2xl flex items-center justify-center border border-cyan-500/30">
                <Plus className="w-6 h-6 text-cyan-500" />
              </div>
              <div>
                <h3 className="text-xl font-black text-white uppercase tracking-tighter">Nueva Entrada Técnica</h3>
                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Registro manual de sensores y eventos</p>
              </div>
            </div>
            <form onSubmit={handleAddLogEntry} className="space-y-8">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">
                    Título del Evento <span className="text-red-500">*</span>
                  </label>
                  <input 
                    type="text" 
                    value={newLogEntry.titulo} 
                    onChange={(e) => setNewLogEntry(prev => ({ ...prev, titulo: e.target.value }))}
                    placeholder="Ej: Cambio de Velas / Revisión Motor"
                    className="w-full px-5 py-4 bg-slate-900 border border-slate-800 rounded-2xl text-white text-sm outline-none focus:border-cyan-500/50 transition-all"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">
                    Categoría <span className="text-red-500">*</span>
                  </label>
                  <select 
                    value={newLogEntry.categoria} onChange={(e) => setNewLogEntry(prev => ({ ...prev, categoria: e.target.value }))}
                    className="w-full px-5 py-4 bg-slate-900 border border-slate-800 rounded-2xl text-white text-sm outline-none focus:border-cyan-500/50 transition-all appearance-none cursor-pointer"
                  >
                    <option value="Técnico">Técnico</option>
                    <option value="Navegación">Navegación</option>
                    <option value="Seguridad">Seguridad</option>
                    <option value="Mantenimiento">Mantenimiento</option>
                  </select>
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Viento (Nudos)</label>
                  <input 
                    type="number" 
                    value={newLogEntry.viento_nudos} 
                    onChange={(e) => setNewLogEntry(prev => ({ ...prev, viento_nudos: Number(e.target.value) }))}
                    className="w-full px-5 py-4 bg-slate-900 border border-slate-800 rounded-2xl text-white text-sm outline-none focus:border-cyan-500/50 transition-all"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Rumbo (°)</label>
                  <input 
                    type="number" 
                    value={newLogEntry.rumbo} 
                    onChange={(e) => setNewLogEntry(prev => ({ ...prev, rumbo: Number(e.target.value) }))}
                    className="w-full px-5 py-4 bg-slate-900 border border-slate-800 rounded-2xl text-white text-sm outline-none focus:border-cyan-500/50 transition-all"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Velocidad GPS (kn)</label>
                  <input 
                    type="number" step="0.1"
                    value={newLogEntry.velocidad_gps} 
                    onChange={(e) => setNewLogEntry(prev => ({ ...prev, velocidad_gps: Number(e.target.value) }))}
                    className="w-full px-5 py-4 bg-slate-900 border border-slate-800 rounded-2xl text-white text-sm outline-none focus:border-cyan-500/50 transition-all"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Horas Motor</label>
                  <input 
                    type="number" step="0.1" value={newLogEntry.horas_motor} onChange={(e) => setNewLogEntry(prev => ({ ...prev, horas_motor: Number(e.target.value) }))}
                    className="w-full px-5 py-4 bg-slate-900 border border-slate-800 rounded-2xl text-white text-sm outline-none focus:border-cyan-500/50 transition-all"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">
                  Descripción del Evento <span className="text-red-500">*</span>
                </label>
                <textarea 
                  value={newLogEntry.descripcion} onChange={(e) => setNewLogEntry(prev => ({ ...prev, descripcion: e.target.value }))}
                  placeholder="Detalles técnicos del cambio realizado o observación..."
                  className="w-full px-6 py-5 bg-slate-900 border border-slate-800 rounded-[24px] text-white text-sm outline-none focus:border-cyan-500/50 transition-all min-h-[120px] resize-none leading-relaxed"
                />
              </div>

              <div className="flex flex-col md:flex-row justify-between items-center gap-4">
                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                  <span className="text-red-500">*</span> Campos obligatorios
                </p>
                <button 
                  type="submit" 
                  disabled={isAddingLog || !newLogEntry.titulo || !newLogEntry.descripcion}
                  className="w-full md:w-auto px-12 py-5 bg-cyan-600 hover:bg-cyan-500 disabled:bg-slate-800 disabled:text-slate-500 text-white font-black rounded-[24px] transition-all uppercase tracking-[0.2em] text-sm shadow-2xl shadow-cyan-900/40 flex items-center justify-center gap-4 group"
                >
                  {isAddingLog ? <Loader2 className="w-5 h-5 animate-spin" /> : <Book className="w-5 h-5 group-hover:scale-110 transition-transform" />}
                  Registrar Evento Técnico
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
      {/* Cambio de Guardia Modal */}
      <AnimatePresence>
        {showWatchChangeModal && (
          <div className="fixed inset-0 z-[9000] flex items-center justify-center bg-slate-950/80 backdrop-blur-md p-4">
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-slate-900 border border-slate-800 rounded-3xl p-6 w-full max-w-md shadow-2xl"
            >
              <div className="flex items-center gap-3 mb-6">
                <div className="w-12 h-12 bg-emerald-500/20 rounded-2xl flex items-center justify-center border border-emerald-500/30">
                  <Clock className="w-6 h-6 text-emerald-500" />
                </div>
                <div>
                  <h3 className="text-xl font-black text-white uppercase tracking-tighter">Relevo de Guardia</h3>
                  <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Registro Operativo de Sistemas</p>
                </div>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest px-1">Oficial Saliente</label>
                  <input 
                    type="text" 
                    value={userProfile?.name || 'Usuario Actual'} 
                    disabled
                    className="w-full px-4 py-3 bg-slate-950 border border-slate-800 rounded-2xl text-slate-400 text-sm outline-none cursor-not-allowed"
                  />
                </div>

                <div>
                  <label className="text-[10px] font-black text-emerald-500 uppercase tracking-widest px-1">Oficial Entrante</label>
                  <input 
                    type="text" 
                    value={watchChangeData.oficial_entrante}
                    onChange={(e) => setWatchChangeData({ ...watchChangeData, oficial_entrante: e.target.value })}
                    placeholder="Nombre del oficial entrante..."
                    className="w-full px-4 py-3 bg-slate-950 border border-slate-800 rounded-2xl text-white text-sm outline-none focus:border-emerald-500/50 transition-all"
                  />
                </div>

                <div>
                  <label className="text-[10px] font-black text-emerald-500 uppercase tracking-widest px-1">Estado de Sistemas</label>
                  <textarea 
                    value={watchChangeData.estado_sistemas}
                    onChange={(e) => setWatchChangeData({ ...watchChangeData, estado_sistemas: e.target.value })}
                    className="w-full h-24 px-4 py-3 bg-slate-950 border border-slate-800 rounded-2xl text-white text-sm outline-none focus:border-emerald-500/50 transition-all resize-none"
                  />
                </div>

                <div className="flex gap-3 pt-4">
                  <button 
                    onClick={() => setShowWatchChangeModal(false)}
                    className="flex-1 py-4 bg-slate-800 hover:bg-slate-700 text-white font-black uppercase tracking-widest rounded-2xl transition-all text-xs"
                  >
                    Cancelar
                  </button>
                  <button 
                    onClick={handleWatchChange}
                    disabled={!watchChangeData.oficial_entrante}
                    className="flex-[2] py-4 bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-800 disabled:text-slate-500 text-white font-black uppercase tracking-widest rounded-2xl transition-all text-xs shadow-lg shadow-emerald-900/20"
                  >
                    Confirmar Relevo
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};

export default Logbook;
