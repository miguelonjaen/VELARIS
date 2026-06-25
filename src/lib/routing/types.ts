export interface RoutePoint {
  lat: number;
  lng: number;

  depth?: number;

  source?:
    | 'departure'
    | 'coastal'
    | 'bathymetry'
    | 'weather'
    | 'ais'
    | 'arrival';

  reason?: string;
}

export interface PlannedRoute {
  points: RoutePoint[];
  distanceNm: number;
}