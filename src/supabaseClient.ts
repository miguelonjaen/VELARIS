import { createClient } from '@supabase/supabase-js';
import { normalizeSupabaseUrl } from './lib/normalizeSupabaseUrl';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim();
const supabasePublishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim();

if (!supabaseUrl || !supabasePublishableKey) {
  throw new Error(
    'Faltan VITE_SUPABASE_URL o VITE_SUPABASE_PUBLISHABLE_KEY en la configuración de entorno.'
  );
}

export const supabase = createClient(normalizeSupabaseUrl(supabaseUrl), supabasePublishableKey);