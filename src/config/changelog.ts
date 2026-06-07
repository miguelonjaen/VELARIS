export interface ChangelogEntry {
  version: string;
  date: string;
  title: string;
  features: {
    icon: string;
    text: string;
    category: 'tactical' | 'security' | 'system';
  }[];
}

export const CHANGELOG: ChangelogEntry[] = [
  {
    version: '1.0.9',
    date: '2026-05-24',
    title: 'Actualización: Puente de Mando PRO',
    features: [
      { icon: '🗺️', category: 'tactical', text: 'Integración de Cartografía Local MBTiles (CM93 Engine).' },
      { icon: '⛵', category: 'tactical', text: 'Nuevo Motor de Polares para optimización de VMG y bordos.' },
      { icon: '🛡️', category: 'security', text: 'Sistema SmartShield con alertas dinámicas de CPA y colisión.' },
      { icon: '⚓', category: 'security', text: 'Monitor de Fondeo avanzado con análisis de tendencia de garreo.' },
      { icon: '🤖', category: 'system', text: 'IA Officer: Capacidad de ejecución de comandos tácticos por voz/texto.' }
    ]
  },
  {
    version: '1.0.8',
    date: '2026-05-10',
    title: 'Mejoras de Estabilidad',
    features: [
      { icon: '🔌', category: 'system', text: 'Refactorización del motor NMEA para mayor estabilidad en puertos serie.' },
      { icon: '🌑', category: 'system', text: 'Modo Noche optimizado para evitar deslumbramiento en el puente.' }
    ]
  }
];

export const getLatestVersion = () => CHANGELOG[0];
export const getVersionInfo = (version: string) => CHANGELOG.find(v => v.version === version);