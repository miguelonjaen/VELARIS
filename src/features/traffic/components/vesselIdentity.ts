import type { ShipData } from '../../../shared/types';

type IdentityKey = 'nombre' | 'marca' | 'modelo' | 'matricula' | 'tipo_barco' | 'eslora' | 'manga' | 'calado'
  | 'potencia_cv' | 'horas_motor' | 'numero_serie_casco' | 'mmsi' | 'ais'
  | 'puerto_base' | 'puerto_base_lat' | 'puerto_base_lng';
export type VesselIdentityDraft = Pick<ShipData, IdentityKey>;
interface IdentityField {
  key: IdentityKey; label: string; type: 'text' | 'number'; required?: boolean;
  min?: number; max?: number; step?: string; maxLength?: number; pattern?: string;
}
export const VESSEL_IDENTITY_FIELDS: readonly IdentityField[] = [
  {key:'nombre',label:'Nombre',type:'text',required:true,maxLength:240},
  {key:'marca',label:'Astillero / marca',type:'text',required:true,maxLength:240},
  {key:'modelo',label:'Modelo',type:'text',required:true,maxLength:240},
  {key:'eslora',label:'Eslora total (m)',type:'number',min:0.01,step:'0.01'},
  {key:'manga',label:'Manga máxima (m)',type:'number',min:0.01,step:'0.01'},
  {key:'calado',label:'Calado (m)',type:'number',min:0.01,step:'0.01'},
  {key:'tipo_barco',label:'Tipo de embarcación',type:'text',maxLength:120},
  {key:'matricula',label:'Matrícula / identificador',type:'text',maxLength:240},
  {key:'numero_serie_casco',label:'Número de identificación del casco (CIN / HIN)',type:'text',maxLength:240},
  {key:'potencia_cv',label:'Potencia de propulsión declarada (CV)',type:'number',min:0,step:'1'},
  {key:'horas_motor',label:'Horas de motor registradas (h)',type:'number',min:0,step:'0.1'},
  {key:'mmsi',label:'MMSI (9 dígitos)',type:'text',maxLength:9,pattern:'[0-9]{9}'},
  {key:'ais',label:'Identificación / referencia del AIS',type:'text',maxLength:240},
  {key:'puerto_base',label:'Puerto base',type:'text',maxLength:240},
  {key:'puerto_base_lat',label:'Latitud del puerto base (°)',type:'number',min:-90,max:90,step:'0.000001'},
  {key:'puerto_base_lng',label:'Longitud del puerto base (°)',type:'number',min:-180,max:180,step:'0.000001'},
];

/** Allowlisted identity fields only. Unknown values stay null, never become zero. */
export function buildVesselIdentityPatch(ship: VesselIdentityDraft) {
  const text = (value: string | null | undefined): string | null => value?.trim() || null;
  const required = (value: string, label: string): string => {
    const result=text(value); if (!result) throw new Error(`${label} es obligatorio.`); return result;
  };
  const number = (value: number | null | undefined, label: string, minimum: number, maximum = Infinity): number | null => {
    if (value == null) return null;
    if (!Number.isFinite(value) || value < minimum || value > maximum) throw new Error(`${label}: valor fuera de rango.`);
    return value;
  };
  const dimension = (value: number | null, label: string): number | null => {
    if (value != null && value <= 0) throw new Error(`${label} debe ser positiva o quedar sin especificar.`);
    return number(value,label,0);
  };
  const power=number(ship.potencia_cv,'Potencia',0);
  if (power !== null && !Number.isInteger(power)) throw new Error('La potencia en CV debe expresarse como un número entero.');
  const mmsi=text(ship.mmsi);
  if (mmsi && !/^\d{9}$/.test(mmsi)) throw new Error('El MMSI debe tener exactamente nueve dígitos.');
  const patch = {
    nombre:required(ship.nombre,'Nombre'),marca:required(ship.marca,'Marca'),modelo:required(ship.modelo,'Modelo'),
    eslora:dimension(ship.eslora,'Eslora'),manga:dimension(ship.manga,'Manga'),calado:dimension(ship.calado,'Calado'),
    tipo_barco:text(ship.tipo_barco),matricula:text(ship.matricula),numero_serie_casco:text(ship.numero_serie_casco),
    potencia_cv:power,horas_motor:number(ship.horas_motor,'Horas de motor',0),mmsi,ais:text(ship.ais),
    puerto_base:text(ship.puerto_base),puerto_base_lat:number(ship.puerto_base_lat,'Latitud del puerto base',-90,90),
    puerto_base_lng:number(ship.puerto_base_lng,'Longitud del puerto base',-180,180),
  };
  for (const field of VESSEL_IDENTITY_FIELDS) {
    const value=patch[field.key];
    if (typeof value === 'string' && field.maxLength && value.length > field.maxLength) throw new Error(`${field.label}: texto demasiado largo.`);
  }
  return patch;
}
