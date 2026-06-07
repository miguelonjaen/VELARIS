import React, { useState, useEffect } from 'react';
import { cn } from '../lib/utils';
import { InventoryItem, VesselStatus, UserProfile } from '../shared/types';
import { 
  Fuel, 
  Droplets, 
  Search, 
  Plus, 
  Minus, 
  Trash2, 
  AlertTriangle, 
  Calendar, 
  Box, 
  Wrench, 
  ShieldCheck, 
  Utensils,
  Loader2,
  Filter,
  X,
  Stethoscope
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { SupabaseClient } from '@supabase/supabase-js';

interface InventoryManagerProps {
  inventory: InventoryItem[];
  vesselStatus: VesselStatus | null;
  supabase: SupabaseClient;
  selectedShipId: string | null;
  saveLogEntry: (entry: any) => Promise<void>;
  userProfile?: UserProfile | null;
  onClose?: () => void;
}

const InventoryManager: React.FC<InventoryManagerProps> = ({ 
  vesselStatus, 
  supabase, 
  selectedShipId, 
  saveLogEntry,
  userProfile,
  onClose
}) => {
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'Técnico' | 'Seguridad' | 'Botiquín' | 'Víveres' | 'General' | 'Todos'>('Todos');
  const [searchTerm, setSearchTerm] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [matchingItems, setMatchingItems] = useState<InventoryItem[]>([]);
  const [selectedExistingItem, setSelectedExistingItem] = useState<InventoryItem | null>(null);
  const [addQuantity, setAddQuantity] = useState(0);
  const [newItem, setNewItem] = useState<Partial<InventoryItem>>({
    categoria: 'General',
    cantidad_actual: 0,
    cantidad_minima: 1
  });

  useEffect(() => {
    if (selectedShipId) {
      fetchInventory();
    }
  }, [selectedShipId]);

  // Handle Autocomplete logic
  useEffect(() => {
    if (newItem.nombre && newItem.nombre.length > 1 && !selectedExistingItem) {
      const matches = items.filter(i => 
        i.nombre.toLowerCase().includes(newItem.nombre!.toLowerCase()) ||
        i.referencia?.toLowerCase().includes(newItem.nombre!.toLowerCase())
      );
      setMatchingItems(matches);
    } else {
      setMatchingItems([]);
    }
  }, [newItem.nombre, items, selectedExistingItem]);

  const selectExistingItem = (item: InventoryItem) => {
    setSelectedExistingItem(item);
    setNewItem({
      ...item,
      nombre: item.nombre,
      referencia: item.referencia,
      categoria: item.categoria as any,
      cantidad_actual: item.cantidad_actual,
      cantidad_minima: item.cantidad_minima,
      ubicacion: item.ubicacion
    });
    setMatchingItems([]);
    setAddQuantity(1);
  };

  const handleAddItem = async () => {
    if (!newItem.nombre || !selectedShipId) return;

    try {
      if (selectedExistingItem) {
        // UPDATE: Sum quantities
        const finalQuantity = selectedExistingItem.cantidad_actual + addQuantity;
        const { data, error } = await supabase
          .from('inventario')
          .update({ 
            cantidad_actual: finalQuantity,
            cantidad_minima: newItem.cantidad_minima,
            referencia: newItem.referencia,
            ubicacion: newItem.ubicacion,
            fecha_caducidad: newItem.fecha_caducidad
          })
          .eq('id', selectedExistingItem.id)
          .select();

        if (error) throw error;
        
        if (data) {
          setItems(prev => prev.map(i => i.id === selectedExistingItem.id ? data[0] : i));
        }
      } else {
        // NEW INSERT
        const itemToSend = {
          nombre: newItem.nombre,
          categoria: newItem.categoria,
          cantidad_actual: newItem.cantidad_actual,
          cantidad_minima: newItem.cantidad_minima,
          referencia: newItem.referencia || '',
          ubicacion: newItem.ubicacion || '',
          fecha_caducidad: newItem.fecha_caducidad || null,
          barco_id: selectedShipId
        };

        const { data, error } = await supabase
          .from('inventario')
          .insert([itemToSend])
          .select();

        if (error) throw error;

        if (data) setItems(prev => [...prev, data[0]]);
      }

      setShowAddModal(false);
      resetAddForm();
    } catch (err: any) {
      console.error('Inventory Error:', err);
      alert('Error al guardar en base de datos: ' + err.message);
    }
  };

  const resetAddForm = () => {
    setNewItem({ categoria: 'General', cantidad_actual: 0, cantidad_minima: 1 });
    setSelectedExistingItem(null);
    setAddQuantity(0);
    setMatchingItems([]);
  };

  const fetchInventory = async () => {
    if (!selectedShipId) {
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('inventario')
        .select('*')
        .eq('barco_id', selectedShipId)
        .order('nombre', { ascending: true });
      if (error) throw error;
      setItems(data || []);
    } catch (err) {
      console.error('Error fetching inventory:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateStock = async (item: InventoryItem, delta: number) => {
    const newQty = Math.max(0, item.cantidad_actual + delta);
    if (newQty === item.cantidad_actual) return;
    try {
      const { error } = await supabase
        .from('inventario')
        .update({ cantidad_actual: newQty })
        .eq('id', item.id);
      if (error) throw error;
      setItems(prev => prev.map(i => i.id === item.id ? { ...i, cantidad_actual: newQty } : i));
    } catch (err) {
      console.error('Error updating stock:', err);
    }
  };

  const handleDeleteItem = async (id: string, name: string) => {
    if (!window.confirm(`¿Eliminar ${name}?`)) return;
    try {
      const { error } = await supabase
        .from('inventario')
        .delete()
        .eq('id', id);
      if (error) throw error;
      setItems(prev => prev.filter(i => i.id !== id));
    } catch (err) {
      console.error('Error deleting item:', err);
    }
  };

  const filteredItems = items.filter(item => {
    const matchesFilter = filter === 'Todos' || item.categoria === filter;
    const matchesSearch = item.nombre.toLowerCase().includes(searchTerm.toLowerCase()) || 
                         item.referencia?.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesFilter && matchesSearch;
  });

  const isExpired = (dateStr?: string) => {
    if (!dateStr) return false;
    return new Date(dateStr) < new Date();
  };

  const getCategoryIcon = (cat: string) => {
    switch (cat) {
      case 'Técnico': return <Wrench className="w-4 h-4" />;
      case 'Seguridad': return <ShieldCheck className="w-4 h-4" />;
      case 'Botiquín': return <Stethoscope className="w-4 h-4" />;
      case 'Víveres': return <Utensils className="w-4 h-4" />;
      default: return <Box className="w-4 h-4" />;
    }
  };

  return (
    <div className="p-4 md:p-8 space-y-8 max-w-7xl mx-auto bg-slate-950 min-h-screen pointer-events-auto">
      {/* Header & Stats */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 relative">
        <div className="flex items-center gap-4">
          {onClose && (
            <button 
              onClick={onClose}
              className="p-2 bg-slate-900 hover:bg-slate-800 rounded-xl transition-colors text-slate-400 hover:text-white"
            >
              <X className="w-5 h-5" />
            </button>
          )}
          <div>
            <h2 className="text-3xl font-black text-white uppercase tracking-tighter flex items-center gap-3">
              <Box className="w-8 h-8 text-cyan-500" />
              Gestión de Inventario <span className="text-cyan-500">SmartShip</span>
            </h2>
            <p className="text-xs font-bold text-slate-500 uppercase tracking-[0.2em] mt-1">Control de Stock y Caducidades</p>
          </div>
        </div>

        <div className="flex gap-4 w-full md:w-auto">
          <div className="bg-slate-900/50 border border-slate-800 p-4 rounded-2xl flex items-center gap-4 flex-1 md:flex-none">
            <div className="w-10 h-10 bg-cyan-500/10 rounded-xl flex items-center justify-center border border-cyan-500/20">
              <Fuel className="w-5 h-5 text-cyan-500" />
            </div>
            <div>
              <p className="text-[8px] font-black text-slate-500 uppercase tracking-widest">Combustible</p>
              <p className="text-lg font-black text-white">{vesselStatus?.fuel_level ?? '--'}%</p>
            </div>
          </div>
          <div className="bg-slate-900/50 border border-slate-800 p-4 rounded-2xl flex items-center gap-4 flex-1 md:flex-none">
            <div className="w-10 h-10 bg-blue-500/10 rounded-xl flex items-center justify-center border border-blue-500/20">
              <Droplets className="w-5 h-5 text-blue-500" />
            </div>
            <div>
              <p className="text-[8px] font-black text-slate-500 uppercase tracking-widest">Agua Dulce</p>
              <p className="text-lg font-black text-white">{vesselStatus?.water_level ?? '--'}%</p>
            </div>
          </div>
        </div>
      </div>

      {/* Controls */}
      <div className="flex flex-col lg:flex-row gap-4 justify-between items-center bg-slate-900/30 p-4 rounded-3xl border border-slate-800/50 backdrop-blur-md">
        <div className="flex flex-wrap gap-2">
          {(['Todos', 'Técnico', 'Seguridad', 'Botiquín', 'Víveres', 'General'] as const).map(cat => (
            <button
              key={cat}
              onClick={() => setFilter(cat)}
              className={cn(
                "px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-2",
                filter === cat 
                  ? "bg-cyan-600 text-white shadow-lg shadow-cyan-900/20" 
                  : "bg-slate-900 text-slate-500 hover:text-white hover:bg-slate-800"
              )}
            >
              {cat !== 'Todos' && getCategoryIcon(cat)}
              {cat}
            </button>
          ))}
        </div>

        <div className="flex gap-3 w-full lg:w-auto">
          <div className="relative flex-1 lg:w-64">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
            <input 
              type="text"
              placeholder="Buscar por nombre o ref..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-white text-xs outline-none focus:border-cyan-500/50 transition-all"
            />
          </div>
          <button 
            onClick={() => setShowAddModal(true)}
            className="px-6 py-2.5 bg-cyan-600 hover:bg-cyan-500 text-white rounded-xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-2 shadow-lg shadow-cyan-900/20"
          >
            <Plus className="w-4 h-4" />
            Añadir
          </button>
        </div>
      </div>

      {/* Inventory Table */}
      <div className="bg-slate-900/30 rounded-3xl border border-slate-800/50 overflow-hidden backdrop-blur-md">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-800 bg-slate-900/50">
                <th className="px-6 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest">Artículo</th>
                <th className="px-6 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest">Referencia</th>
                <th className="px-6 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest">Ubicación</th>
                <th className="px-6 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest">Stock</th>
                <th className="px-6 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest">Caducidad</th>
                <th className="px-6 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/50">
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center">
                    <Loader2 className="w-8 h-8 text-cyan-500 animate-spin mx-auto mb-2" />
                    <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Cargando Inventario...</p>
                  </td>
                </tr>
              ) : !selectedShipId ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center">
                    <AlertTriangle className="w-8 h-8 text-amber-500 mx-auto mb-2" />
                    <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Seleccione un barco en Mi Flota</p>
                  </td>
                </tr>
              ) : filteredItems.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center">
                    <Box className="w-8 h-8 text-slate-700 mx-auto mb-2" />
                    <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">No se encontraron artículos</p>
                  </td>
                </tr>
              ) : (
                filteredItems.map(item => {
                  const lowStock = item.cantidad_actual <= item.cantidad_minima;
                  const expired = isExpired(item.fecha_caducidad);
                  
                  return (
                    <tr 
                      key={item.id} 
                      className={cn(
                        "group transition-colors",
                        expired ? "bg-red-950/20 hover:bg-red-950/30" : "hover:bg-slate-800/30"
                      )}
                    >
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className={cn(
                            "w-8 h-8 rounded-lg flex items-center justify-center border",
                            item.categoria === 'Técnico' ? "bg-amber-500/10 border-amber-500/20 text-amber-500" :
                            item.categoria === 'Seguridad' ? "bg-red-500/10 border-red-500/20 text-red-500" :
                            item.categoria === 'Botiquín' ? "bg-pink-500/10 border-pink-500/20 text-pink-500" :
                            item.categoria === 'Víveres' ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-500" :
                            "bg-slate-800 border-slate-700 text-slate-400"
                          )}>
                            {getCategoryIcon(item.categoria)}
                          </div>
                          <div>
                            <p className="text-sm font-black text-white uppercase tracking-tight">{item.nombre}</p>
                            <p className="text-[8px] font-bold text-slate-500 uppercase tracking-widest">{item.categoria}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className="text-[10px] font-mono text-slate-400">{item.referencia || '---'}</span>
                      </td>
                      <td className="px-6 py-4">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{item.ubicacion || '---'}</span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-4">
                          <div className="flex items-center gap-2">
                            <button 
                              onClick={() => handleUpdateStock(item, -1)}
                              className="w-6 h-6 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 flex items-center justify-center transition-colors"
                            >
                              <Minus className="w-3 h-3" />
                            </button>
                            <span className={cn(
                              "text-sm font-black min-w-[2rem] text-center",
                              lowStock ? "text-red-500" : "text-white"
                            )}>
                              {item.cantidad_actual}
                            </span>
                            <button 
                              onClick={() => handleUpdateStock(item, 1)}
                              className="w-6 h-6 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 flex items-center justify-center transition-colors"
                            >
                              <Plus className="w-3 h-3" />
                            </button>
                          </div>
                          {lowStock && (
                            <div className="flex items-center gap-1 text-red-500 animate-pulse">
                              <AlertTriangle className="w-3 h-3" />
                              <span className="text-[8px] font-black uppercase tracking-widest">Bajo</span>
                            </div>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        {item.fecha_caducidad ? (
                          <div className={cn(
                            "flex items-center gap-2",
                            expired ? "text-red-500" : "text-slate-400"
                          )}>
                            <Calendar className="w-3 h-3" />
                            <span className="text-[10px] font-bold uppercase tracking-widest">
                              {new Date(item.fecha_caducidad).toLocaleDateString('es-ES')}
                            </span>
                            {expired && <span className="text-[8px] font-black uppercase bg-red-500 text-white px-1.5 py-0.5 rounded">Caducado</span>}
                          </div>
                        ) : (
                          <span className="text-[10px] text-slate-600">---</span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <button 
                          onClick={() => handleDeleteItem(item.id, item.nombre)}
                          className="p-2 text-slate-600 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add Item Modal */}
      <AnimatePresence>
        {showAddModal && (
          <div className="fixed inset-0 z-[9000] flex items-center justify-center bg-slate-950/80 backdrop-blur-md p-4">
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-slate-900 border border-slate-800 rounded-3xl p-6 w-full max-w-lg shadow-2xl"
            >
              <div className="flex items-center gap-3 mb-6">
                <div className="w-12 h-12 bg-cyan-500/20 rounded-2xl flex items-center justify-center border border-cyan-500/30">
                  <Plus className="w-6 h-6 text-cyan-500" />
                </div>
                <div>
                  <h3 className="text-xl font-black text-white uppercase tracking-tighter">Nuevo Artículo</h3>
                  <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Añadir al Inventario de a Bordo</p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="md:col-span-2 relative">
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest px-1">
                    Nombre del Artículo <span className="text-red-500">*</span>
                  </label>
                  <input 
                    type="text" 
                    value={newItem.nombre || ''}
                    onChange={(e) => {
                      setNewItem({ ...newItem, nombre: e.target.value });
                      if (selectedExistingItem) setSelectedExistingItem(null);
                    }}
                    placeholder="Escriba para buscar o añadir nuevo..."
                    className="w-full px-4 py-3 bg-slate-950 border border-slate-800 rounded-2xl text-white text-sm outline-none focus:border-cyan-500/50 transition-all font-bold"
                  />
                  
                  {matchingItems.length > 0 && (
                    <div className="absolute top-full left-0 right-0 mt-2 bg-slate-900 border border-slate-700 rounded-2xl overflow-hidden z-20 shadow-2xl">
                      {matchingItems.map(item => (
                        <button
                          key={item.id}
                          onClick={() => selectExistingItem(item)}
                          className="w-full px-4 py-3 text-left hover:bg-cyan-600/20 text-xs text-white border-b border-slate-800 last:border-0 flex justify-between items-center"
                        >
                          <span>{item.nombre} <span className="text-slate-500 ml-2">({item.referencia})</span></span>
                          <span className="text-[10px] text-cyan-500 font-bold uppercase">Existente: {item.cantidad_actual}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <div>
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest px-1">Referencia / SKU</label>
                  <input 
                    type="text" 
                    value={newItem.referencia || ''}
                    onChange={(e) => setNewItem({ ...newItem, referencia: e.target.value })}
                    className="w-full px-4 py-3 bg-slate-950 border border-slate-800 rounded-2xl text-white text-sm outline-none focus:border-cyan-500/50 transition-all"
                  />
                </div>

                <div>
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest px-1">
                    Categoría <span className="text-red-500">*</span>
                  </label>
                  <select 
                    value={newItem.categoria}
                    disabled={!!selectedExistingItem}
                    onChange={(e) => setNewItem({ ...newItem, categoria: e.target.value as any })}
                    className="w-full px-4 py-3 bg-slate-950 border border-slate-800 rounded-2xl text-white text-sm outline-none focus:border-cyan-500/50 transition-all disabled:opacity-50"
                  >
                    <option value="Técnico">⚙️ Técnico</option>
                    <option value="Seguridad">🦺 Seguridad</option>
                    <option value="Botiquín">🩹 Botiquín</option>
                    <option value="Víveres">🍱 Víveres</option>
                    <option value="General">⚓ General</option>
                  </select>
                </div>

                <div>
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest px-1">
                    {selectedExistingItem ? 'Cantidad Actual (DB)' : 'Cantidad Inicial'}
                  </label>
                  <input 
                    type="number" 
                    readOnly={!!selectedExistingItem}
                    value={newItem.cantidad_actual}
                    onChange={(e) => setNewItem({ ...newItem, cantidad_actual: Number(e.target.value) })}
                    className="w-full px-4 py-3 bg-slate-950 border border-slate-800 rounded-2xl text-white text-sm outline-none focus:border-cyan-500/50 transition-all font-mono disabled:text-slate-500"
                  />
                </div>

                <div>
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest px-1">
                    Stock Mínimo
                  </label>
                  <input 
                    type="number" 
                    value={newItem.cantidad_minima}
                    onChange={(e) => setNewItem({ ...newItem, cantidad_minima: Number(e.target.value) })}
                    className="w-full px-4 py-3 bg-slate-950 border border-slate-800 rounded-2xl text-white text-sm outline-none focus:border-cyan-500/50 transition-all font-mono"
                  />
                </div>

                {selectedExistingItem && (
                  <div className="md:col-span-2 p-4 bg-cyan-600/10 border border-cyan-500/20 rounded-2xl animate-in fade-in slide-in-from-top-2 duration-300">
                    <label className="text-[10px] font-black text-cyan-500 uppercase tracking-widest px-1 block mb-2">
                      + Añadir Cantidad al Stock
                    </label>
                    <input 
                      type="number" 
                      autoFocus
                      value={addQuantity}
                      onChange={(e) => setAddQuantity(Number(e.target.value))}
                      className="w-full px-4 py-4 bg-slate-950 border-2 border-cyan-500 rounded-xl text-white text-xl font-mono text-center outline-none"
                    />
                    <p className="text-[10px] text-slate-400 mt-2 text-center uppercase tracking-widest">
                      Stock Final resultante: <span className="text-white font-black">{(selectedExistingItem.cantidad_actual + addQuantity)}</span>
                    </p>
                  </div>
                )}

                <div>
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest px-1">Ubicación</label>
                  <input 
                    type="text" 
                    value={newItem.ubicacion || ''}
                    onChange={(e) => setNewItem({ ...newItem, ubicacion: e.target.value })}
                    className="w-full px-4 py-3 bg-slate-950 border border-slate-800 rounded-2xl text-white text-sm outline-none focus:border-cyan-500/50 transition-all"
                  />
                </div>

                <div>
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest px-1">Fecha de Caducidad</label>
                  <input 
                    type="date" 
                    value={newItem.fecha_caducidad || ''}
                    onChange={(e) => setNewItem({ ...newItem, fecha_caducidad: e.target.value })}
                    className="w-full px-4 py-3 bg-slate-950 border border-slate-800 rounded-2xl text-white text-sm outline-none focus:border-cyan-500/50 transition-all"
                  />
                </div>
              </div>

              <div className="flex flex-col gap-4 pt-6">
                <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest text-center">
                  <span className="text-red-500">*</span> Campos obligatorios
                </p>
                <div className="flex gap-3">
                  <button 
                    onClick={() => {
                      setShowAddModal(false);
                      setNewItem({ categoria: 'General', cantidad_actual: 0, cantidad_minima: 1 });
                    }}
                    className="flex-1 py-4 bg-slate-800 hover:bg-slate-700 text-white font-black uppercase tracking-widest rounded-2xl transition-all text-xs"
                  >
                    Cancelar
                  </button>
                  <button 
                    onClick={handleAddItem}
                    disabled={!newItem.nombre || newItem.cantidad_actual === undefined || newItem.cantidad_minima === undefined}
                    className="flex-[2] py-4 bg-cyan-600 hover:bg-cyan-500 disabled:bg-slate-800 disabled:text-slate-500 text-white font-black uppercase tracking-widest rounded-2xl transition-all text-xs shadow-lg shadow-cyan-900/20"
                  >
                    Añadir al Inventario
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default InventoryManager;
