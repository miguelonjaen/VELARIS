export interface TargetAIS {
  mmsi: string;

  nombre: string;

  tipo: "Carguero" | "Velero" | "Pesquero" | "Yate";

  lat: number;

  lng: number;

  cog: number;

  sog: number;

  status: "Navegando" | "Fondeado";

  cpa?: number;

  tcpa?: number;

  isCollisionRisk?: boolean;
}