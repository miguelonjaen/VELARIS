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
  {
    version: '1.1.0',
    date: '2026-07-02',
    title: 'SmartShip Pro 1.1.0',
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
