export interface MissionState {

    isTravesiaActive: boolean;

    startTime?: Date | null;

    navigationMode: string;

    currentOfficer?: {
        nombre: string;
    };

    navPlan: {
        targetName: string;
        distanceNM: number;
        eta: string;
        btw: number;
        xte: number;
        vmg: number;
    };

    rutaActiva: any[];
}