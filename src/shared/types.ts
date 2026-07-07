export interface VesselState {
  lat: number;
  lng: number;
  sog: number; // Speed Over Ground
  cog: number; // Course Over Ground
  hdg: number; // Heading
  depth: number;
  wind: {
    speed: number;
    angle: number;
  };
  timestamp: number;
}

export interface TacticalAdvice {
  id: string;
  severity: 'info' | 'warning' | 'critical';
  message: string;
  rule: string;
  action?: string;
}

export interface UserProfile {
  id: string;
  name: string;
  email: string;
  photoUrl?: string;
  role: 'admin' | 'almirante' | 'capitan';
  location?: string;
  created_at?: string;
  nombre_completo?: string;
  telefono?: string;
  licencia_nautica?: string;
  dni_nie?: string;
  fecha_nacimiento?: string;
  foto_perfil_url?: string;
  nacionalidad?: string;
  direccion?: string;
  poblacion?: string;
  codigo_postal?: string;
  provincia?: string;
  contacto_emergencia_nombre?: string;
  contacto_emergencia_telefono?: string;
  grupo_sanguineo?: string;
  observaciones_medicas?: string;
  plan_nivel: 'gratis' | 'plata' | 'oro';
  plan_tactico?: 'basico' | 'capitan' | 'almirante';
  suscripcion_activa: boolean;
  total_barcos?: number;
  nombre?: string;
  barco_activo_id?: string | null;
}

export interface ShipData {
  id: string;
  nombre: string;
  is_active?: boolean;
  horas_motor?: number;
  modelo: string;
  marca: string;
  matricula: string;
  eslora: number;
  manga: number;
  calado: number;
  potencia_cv: number;
  numero_serie_casco: string;
  fecha_itb: string;
  fecha_seguro: string;
  foto_url?: string;
  user_id: string;
  capitan_id: string;
  documentacion_url?: string;
  manual_pdf?: string;
  lat?: number;
  lng?: number;
  tipo_barco?: string;
  type?: string;
  cog?: number;
  sog?: number;
  inventory?: InventoryItem[];
  maintenance?: MaintenanceTask[];
  // New fields
  mmsi?: string;
  ais?: string;
  ultimo_mantenimiento_motor?: string;
  ultima_revision_balsa?: string;
  ultima_revision_extintores?: string;
  // Levels & Status
  fuel_level?: number;
  water_level?: number;
  // Boolean indicators
  docs_certificado_navegabilidad?: boolean;
  docs_permiso_navegacion?: boolean;
  docs_seguro_vigente?: boolean;
  docs_itb_vigente?: boolean;
  docs_dni_tripulacion?: boolean;
  docs_titulacion_patron?: boolean;
  docs_leb_mmsi?: boolean;
  // Document URLs
  url_certificado_navegabilidad?: string;
  url_permiso_navegacion?: string;
  url_seguro?: string;
  url_itb?: string;
  url_dni_tripulacion?: string;
  url_titulacion_patron?: string;
  url_leb_mmsi?: string;
  // Compatibility aliases
  name?: string;
  brand?: string;
  model?: string;
  registration?: string;
  length?: number;
  beam?: number;
  draft?: number;
}

export interface InventoryItem {
  id: string;
  nombre: string;
  referencia: string;
  cantidad_actual: number;
  cantidad_minima: number;
  unidad?: string;
  ubicacion: string;
  categoria: 'Técnico' | 'Seguridad' | 'Botiquín' | 'Víveres' | 'General';
  fecha_caducidad?: string;
  created_at?: string;
  barco_id?: string | number;
}

export interface ProcessedWeather {
  temp: number;
  wind: number;
  windDir: number;
  condition: string;
  seaState: string;
  humidity: number;
  pressure: number;
  visibility: number;
  waveHeight: number;
  tideLevel: number;
}

export interface WeatherResponse {
  main: {
    temp: number;
    humidity: number;
    pressure: number;
  };
  wind: {
    speed: number;
    deg: number;
  };
  weather: Array<{
    description: string;
    main: string;
  }>;
  name: string;
  visibility: number;
}

export interface MaintenanceTask {
  id: string;
  task: string;
  lastDate: string;
  nextDate: string;
  status: 'ok' | 'warning' | 'danger';
  category: string;
}

export interface LogEntry {
  id: string | number;
  barco_id: string | number | null;
  user_id: string;
  capitan_id?: string;
  fecha: string;
  created_at?: string;
  titulo?: string;
  categoria: string;
  descripcion: string;
  horas_motor?: number;
  litros_repostados?: number;
  precio_litro?: number;
  puerto_repostaje?: string;
  texto?: string;
  is_auto?: boolean;
  tipo_navegacion?: 'Libre' | 'Planificada';
  destino_planificado?: string;
  ubicacion_texto?: string;
  time?: string;
  lat?: number;
  lng?: number;
  viento_nudos?: number;
  velocidad_gps?: number;
  rumbo?: number;
  viento?: string;
  estado_del_mar?: string;
  latitud?: number;
  longitud?: number;
  waypoints?: string;
  recomendacion_tactica?: string;
  configuracion_velas?: string;
  propulsion_objetivo?: string;
  distancia_total?: number;
  eta?: string;
}

export interface VesselStatus {
  id?: string;
  barco_id: string;
  fuel_level: number;
  water_level: number;
  oil_status: string;
  is_navigating: boolean;
  engine_hours?: number;
  battery_voltage: number;
  updated_at?: string;
}

export type AlarmSeverity = 'normal' | 'warning' | 'critical';

export interface VELARISAlarm {
  id: string;
  type: 'depth' | 'engine_temp' | 'fuel' | 'ais_collision' | 'internal_temp' | 'humidity' | 'layline_deviation' | 'anchor_drift' | 'anchor_drag' | 'sensor_quality';
  severity: AlarmSeverity;
  message: string;
  timestamp: number;
  value: number;
}

export interface SecurityThresholds {
  minDepth: number;
  maxEngineTemp: number;
  minFuel: number;
  minCPA: number;
  maxInternalTemp: number;
  maxHumidity: number;
}
