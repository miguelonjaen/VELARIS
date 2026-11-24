export interface MissionState {
  isTravesiaActive: boolean;

  navigationMode: any;

  navigationDestination: string;

  targetDestination: {
    lat: number;
    lng: number;
  } | null;

  rutaActiva: [number, number][];

  plannedPath: [number, number][];

  currentPath: [number, number][];

  tripDistance: number;

  startTime: Date | null;

  activeRouteId: string | null;
}