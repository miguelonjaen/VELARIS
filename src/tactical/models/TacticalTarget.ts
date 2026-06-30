export interface TacticalTarget {

    id: string;

    mmsi: string;

    nombre: string;

    lat: number;

    lng: number;

    cog: number;

    sog: number;

    cpa?: number;

    tcpa?: number;

    risk: "safe" | "caution" | "danger";

    selected: boolean;

    visible: boolean;

}