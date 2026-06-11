export interface AISTarget {
  mmsi: number;
  name?: string;

  lat: number;
  lon: number;

  cog: number;
  sog: number;

  heading?: number;

  vesselType?: string;

  timestamp: number;
}