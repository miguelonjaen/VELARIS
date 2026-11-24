export interface ReleaseSection {
  title: string;
  icon: string;
  items: string[];
}

export interface Release {
  version: string;
  date: string;
  title: string;
  summary: string;
  sections: ReleaseSection[];
}

export const releases: Release[] = [
  { version: '1.4.3', date: '2026-10-28', title: 'GAULOS 1.4.3 · Oficial IA OpenAI',
    summary: 'Configuración OpenAI para Desktop, diagnósticos verificables y consultas cartográficas desde el Terminal Táctico.',
    sections: [
      { title: 'Oficial IA', icon: '⚙️', items: ['Importación de OPENAI_API_KEY desde un .env elegido por el usuario, con almacenamiento cifrado en el perfil del equipo.', 'Servicio OpenAI Responses; errores de configuración, autenticación, cuota y timeout visibles.'] },
      { title: 'Límites de navegación', icon: '🧭', items: ['Consultas ENC/OSM limitadas a la carta visible; las consultas de rutas y peligros no ejecutan acciones.', 'No se calcula ni valida una derrota con resguardo continuo de 1 NM a costa. Configurar la IA no garantiza disponibilidad, cobertura ENC ni seguridad de ruta.'] }
    ] },
  {
    version: '1.1.0',
    date: '2026-07-02',
    title: 'GAULOS 1.1.0',
    summary:
      'Mejoras en navegación, alertas tácticas y experiencia general para la operación diaria.',
    sections: [
      {
        title: 'Navegación',
        icon: '🧭',
        items: [
          'Mejora del seguimiento de ruta y puntos de paso.',
          'Actualización de ETA y distancias restantes.',
        ],
      },
      {
        title: 'Alertas',
        icon: '🚨',
        items: [
          'Panel de alarmas más claro y accionable.',
          'Notificaciones tácticas mejor organizadas.',
        ],
      },
      {
        title: 'Experiencia',
        icon: '✨',
        items: [
          'Interfaz más consistente en pantallas principales.',
          'Optimización general de rendimiento y estabilidad.',
        ],
      },
    ],
  },
];
