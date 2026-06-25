import { RoutePoint } from './types';

export function buildSafeRoute(
  start: { lat: number; lng: number },
  dest: [number, number]
): RoutePoint[] {

  const offshore = 0.04;

  const midLng = (start.lng + dest[1]) / 2;

  return [
    {
      lat: start.lat,
      lng: start.lng,
      source: 'departure',
      reason: 'Salida'
    },

    {
      lat: start.lat - offshore,
      lng: start.lng,
      source: 'coastal',
      reason: 'Separación inicial de costa'
    },

    {
      lat: start.lat - offshore,
      lng: midLng,
      source: 'coastal',
      reason: 'Tránsito costero'
    },

    {
      lat: dest[0] - offshore,
      lng: midLng,
      source: 'coastal',
      reason: 'Aproximación'
    },

    {
      lat: dest[0] - offshore,
      lng: dest[1],
      source: 'coastal',
      reason: 'Entrada puerto'
    },

    {
      lat: dest[0],
      lng: dest[1],
      source: 'arrival',
      reason: 'Destino'
    }
  ];
}