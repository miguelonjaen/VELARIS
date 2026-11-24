/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string;
  readonly VITE_SUPABASE_PUBLISHABLE_KEY: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

// Solo declarar módulos que realmente NO tengan @types en npm
declare module '@mapbox/mbtiles';
declare module 'serialport';

declare const __APP_VERSION__: string;

// Asegúrate de que esta línea esté presente para heredar los alias del tsconfig