/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string;
  readonly VITE_SUPABASE_ANON_KEY: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

// Solo declarar módulos que realmente NO tengan @types en npm
declare module '@mapbox/mbtiles';
declare module 'serialport';
