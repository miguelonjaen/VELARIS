import { supabase } from '../supabaseClient';
import { UserProfile, ShipData, LogEntry, VesselStatus } from '@/shared/types';

export const userRepository = {
  async getProfile(userId: string) {
    return supabase
      .from('usuarios')
      .select(`*, suscripciones (plan_tactico)`)
      .eq('id', userId)
      .single();
  },
  async updateProfile(profile: any) {
    return supabase.from('usuarios').upsert(profile, { onConflict: 'id' });
  },
  async updateAvatar(userId: string, url: string) {
    return supabase.from('usuarios').update({ foto_perfil_url: url }).eq('id', userId);
  },
  async getAllUsers() {
    return supabase.from('usuarios').select('*');
  }
};

export const vesselRepository = {
  async getFleet(userId: string) {
    return supabase.from('barcos').select('*').eq('capitan_id', userId);
  },
  async getAllVessels() {
    return supabase.from('barcos').select(`*, usuarios:capitan_id (email)`);
  },
  async getVesselStatus(barcoId: string | null) {
    if (!barcoId) return { data: null, error: null };
    return supabase.from('vessel_status').select('*').eq('barco_id', barcoId).maybeSingle();
  },
  async updateVessel(id: string | null, data: any) {
    if (!id) return { data: null, error: null };
    return supabase.from('barcos').update(data).eq('id', id);
  },
  async updateVesselStatus(barcoId: string | null, status: any) {
    if (!barcoId) return { data: null, error: null };
    return supabase.from('vessel_status').update(status).eq('barco_id', barcoId);
  },
  async upsertVesselStatus(status: any) {
    return supabase.from('vessel_status').upsert(status, { onConflict: 'barco_id' });
  },
  async setActiveVessel(userId: string, shipId: string) {
    await supabase.from('barcos').update({ is_active: false }).eq('capitan_id', userId);
    await supabase.from('barcos').update({ is_active: true }).eq('id', shipId);
    return supabase.from('usuarios').update({ barco_activo_id: shipId }).eq('id', userId);
  },
  async deleteVessel(id: string) {
    return supabase.from('barcos').delete().eq('id', id);
  },
  async insertVessel(ship: any) {
    return supabase.from('barcos').insert([ship]);
  },
  async getInventory(barcoId: string | null) {
    if (!barcoId) return { data: null, error: null };
    return supabase.from('inventario').select('*').eq('barco_id', barcoId);
  },
  async updateInventoryItem(id: string | number, data: any) {
    return supabase.from('inventario').update(data).eq('id', id);
  }
};

export const logRepository = {
  async insertEntry(entry: any) {
    return supabase.from('bitacora').insert([entry]).select();
  },
  async getActiveLog(barcoId: string | null) {
  if (!barcoId) return { data: null, error: null };

  return supabase
    .from('bitacora')
    .select(`
      id,
      titulo,
      destino_planificado,
      tipo_navegacion,
      registro_tipo,
      es_alarma,
      tipo_evento
    `)
    .eq('barco_id', barcoId)
    .is('fecha_fin', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
},
  async updateLog(logId: string | number, data: any) {
    return supabase.from('bitacora').update(data).eq('id', logId);
  },
  async getAiLogs(barcoId: string | null) {
    if (!barcoId) return { data: null, error: null };
    return supabase.from('ai_logs')
      .select('*')
      .eq('barco_id', barcoId)
      .order('created_at', { ascending: false })
      .limit(20);
  },
  async logAiOrder(userId: string, barcoId: string | null, order: string, response: string, metadata: any) {
    return supabase.from('ai_logs').insert({
      user_id: userId,
      barco_id: barcoId,
      prompt_usuario: order,
      respuesta_ia: response,
      categoria_consulta: metadata.categoria || 'chat_tactico',
      metadatos: metadata
    });
  },
  async getActiveRuta(barcoId: string) {
    return supabase.from('rutas').select('*').eq('barco_id', barcoId).eq('estado', 'activa').maybeSingle();
  },
  async insertRuta(ruta: any) {
    return supabase.from('rutas').insert([ruta]).select().single();
  }
};