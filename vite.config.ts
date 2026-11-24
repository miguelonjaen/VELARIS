
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { readFileSync } from 'node:fs';
import { defineConfig, loadEnv } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import tsconfigPaths from 'vite-tsconfig-paths';
import svgr from 'vite-plugin-svgr';

const { version: appVersion } = JSON.parse(
  readFileSync(new URL('./package.json', import.meta.url), 'utf8')
) as { version: string };

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');

  const forbiddenClientSecrets = [
    'VITE_OPENWEATHER_API_KEY',
    'VITE_AISSTREAM_API_KEY',
    'VITE_OPENWEATHERMAP_API_KEY',
    'VITE_GEMINI_API_KEY',
    'VITE_OPENAI_API_KEY',
    'VITE_SUPABASE_SERVICE_ROLE_KEY',
  ];

  if (mode === 'production') {
    for (const name of forbiddenClientSecrets) {
      if (env[name]?.trim()) {
        throw new Error(
          `Credencial privada prohibida en producción: ${name}`
        );
      }
    }
  }

  const supabaseUrl = env.VITE_SUPABASE_URL?.trim();
  const supabasePublishableKey =
    env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim();

  if (
    mode === 'production' &&
    (!supabaseUrl || !supabasePublishableKey)
  ) {
    throw new Error(
      'Faltan VITE_SUPABASE_URL o VITE_SUPABASE_PUBLISHABLE_KEY; no se puede generar una build de producción.'
    );
  }

  return {
    base: './',

    plugins: [
      svgr(),
      react(),
      tsconfigPaths(),
      tailwindcss(),

      VitePWA({
        registerType: 'autoUpdate',
        workbox: {
          // Keep the current application entry (2.44 MB) available offline.
          maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
          globPatterns: [
            '**/*.{js,wasm,css,html}',
            'assets/relief-*.json',
            'assets/seamarks-pack-*.json'
          ]
        },
        includeAssets: [
          'favicon.ico',
          'apple-touch-icon.png',
          'mask-icon.svg'
        ],
        manifest: {
          name: 'GAULOS',
          short_name: 'GAULOS',
          description: 'Gestión Náutica Profesional y Resiliente',
          theme_color: '#0f172a',
          icons: [
            {
              src: 'pwa-192x192.png',
              sizes: '192x192',
              type: 'image/png'
            },
            {
              src: 'pwa-512x512.png',
              sizes: '512x512',
              type: 'image/png'
            }
          ]
        }
      })
    ],

    define: {
      __APP_VERSION__: JSON.stringify(appVersion)
    },

    resolve: {
      alias: {
        '@': path.resolve(__dirname, 'src'),
        '@shared': path.resolve(__dirname, 'src/shared'),
        '@main': path.resolve(__dirname, 'src/main'),
        '@lib': path.resolve(__dirname, 'src/lib'),
        '@types': path.resolve(__dirname, 'src/types')
      }
    },

    server: {
      hmr: process.env.DISABLE_HMR !== 'true',
      watch: {
        ignored: [
          '**/dist/**',
          '**/dist-main/**',
          '**/dist_electron*/**',
          '**/release-test/**'
        ]
      }
    }
  };
});
