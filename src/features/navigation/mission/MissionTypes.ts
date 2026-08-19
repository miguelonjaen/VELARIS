export interface MissionState {
  isTravesiaActive: boolean;

  startTime: Date | null;

  tripDistance: number;

  navigationMode: string;

  navigationDestination: string;

  targetDestination: {
    lat: number;
    lng: number;
  } | null;

  rutaActiva: any[];

  plannedPath: any[];

  currentPath: any[];
}