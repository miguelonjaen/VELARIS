import { validateSystems, systemExternalIds, type OnboardSystems } from './systemEquipment';
import type { ElectricalSystem } from './electrical/types';
import { validateElectricalSystem } from './electrical/model';
import { compatibleEndpoints, installationKinds } from './electricalTopology';
import { validateSensorBindings } from './sensorBindings';
export type Origin = 'manual' | 'measured' | 'unknown';
export interface Reading { value: number | null; origin: Origin; at: string | null; sensor: string | null }
export type ComponentKind = 'tank' | 'battery' | 'bank';
export interface BaseComponent { id: string; name: string; location: string; manufacturer: string; model: string }
export interface Tank extends BaseComponent { kind: 'tank'; fluid: 'diesel' | 'petrol' | 'freshwater' | 'greywater' | 'blackwater' | 'other'; capacityL: number | null; level: Reading }
export interface Bank extends BaseComponent { kind: 'bank'; purpose: 'service' | 'starter' | 'auxiliary' | 'other'; topology: 'parallel' | 'series' | 'series-parallel' | 'unknown' }
export interface Battery extends BaseComponent { kind: 'battery'; bankId: string | null; chemistry: 'AGM' | 'GEL' | 'flooded' | 'LiFePO4' | 'other' | 'unknown'; capacityAh: number | null; nominalV: number | null; voltage: Reading; soc: Reading }
export type Component = Tank | Bank | Battery;
export interface InstallationNode extends BaseComponent { kind: 'alternator' | 'solar' | 'shore' | 'controller' | 'charger' | 'distributor' | 'consumer' | 'electrical' }
export interface InstallationLink { id: string; from: string; to: string; medium: 'cable' | 'pipe'; name: string }
export type SensorChannel = 'tank-level' | 'battery-voltage' | 'battery-soc' | 'battery-current' | 'solar-current' | 'alternator-current' | 'solar-voltage' | 'alternator-voltage';
export interface SensorBinding { targetId: string; metric: 'level' | 'voltage' | 'soc' | 'current'; channel: SensorChannel; sensor: string; connection: string }
export interface Installation { nodes: InstallationNode[]; links: InstallationLink[]; bindings?: SensorBinding[] }
export interface TechnicalInventory { version: 1; components: Component[]; systems?:OnboardSystems; installation?: Installation; electrical?: ElectricalSystem }
export const emptyInventory = (): TechnicalInventory => ({ version: 1, components: [] });
export const unknownReading = (): Reading => ({ value: null, origin: 'unknown', at: null, sensor: null });
export function newComponent(kind: ComponentKind, id: string): Component {
  const base = { id, name: '', location: '', manufacturer: '', model: '' };
  if (kind === 'tank') return { ...base, kind, fluid: 'freshwater', capacityL: null, level: unknownReading() };
  if (kind === 'bank') return { ...base, kind, purpose: 'service', topology: 'unknown' };
  return { ...base, kind, bankId: null, chemistry: 'unknown', capacityAh: null, nominalV: null, voltage: unknownReading(), soc: unknownReading() };
}
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
function text(v: unknown): v is string { return typeof v === 'string' && v.length <= 240; }
function positive(v: unknown): boolean { return v === null || typeof v === 'number' && Number.isFinite(v) && v > 0; }
function reading(v: unknown, max: number): boolean {
  if (!object(v) || Object.keys(v).some(key => !['value', 'origin', 'at', 'sensor'].includes(key))) return false;
  if (v.value === null) return v.origin === 'unknown' && v.at === null && v.sensor === null;
  return typeof v.value === 'number' && Number.isFinite(v.value) && v.value >= 0 && v.value <= max
    && ['manual', 'measured'].includes(String(v.origin)) && typeof v.at === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/.test(v.at) && Number.isFinite(Date.parse(v.at))
    && (v.origin === 'measured' ? typeof v.sensor === 'string' && v.sensor.trim().length > 0 && v.sensor.length <= 240 : v.sensor === null);
}
/** Reject unsupported or corrupt data; never silently replace a vessel's saved inventory. */
export function parseInventory(value: unknown): TechnicalInventory {
  if (!object(value) || Object.keys(value).some(key => !['version', 'components', 'installation', 'electrical', 'systems'].includes(key)) || value.version !== 1 || !Array.isArray(value.components) || value.components.length > 2000) throw new Error('Formato de inventario no compatible');
  const ids = new Set<string>();
  for (const c of value.components) {
    if (!object(c) || !text(c.id) || !c.id.trim() || ids.has(c.id) || !text(c.name) || !c.name.trim()
      || !text(c.location) || !text(c.manufacturer) || !text(c.model)) throw new Error('Identidad de componente inválida o duplicada');
    const fields = ['id', 'name', 'location', 'manufacturer', 'model', 'kind',
      ...(c.kind === 'tank' ? ['fluid', 'capacityL', 'level'] : c.kind === 'bank' ? ['purpose', 'topology'] : ['bankId', 'chemistry', 'capacityAh', 'nominalV', 'voltage', 'soc'])];
    if (Object.keys(c).some(key => !fields.includes(key))) throw new Error('Campos de componente no compatibles');
    ids.add(c.id);
    if (c.kind === 'tank') {
      if (!['diesel', 'petrol', 'freshwater', 'greywater', 'blackwater', 'other'].includes(String(c.fluid)) || !positive(c.capacityL) || !reading(c.level, 100)) throw new Error('Depósito inválido');
    } else if (c.kind === 'bank') {
      if (!['service', 'starter', 'auxiliary', 'other'].includes(String(c.purpose)) || !['parallel', 'series', 'series-parallel', 'unknown'].includes(String(c.topology))) throw new Error('Banco inválido');
    } else if (c.kind === 'battery') {
      if (!['AGM', 'GEL', 'flooded', 'LiFePO4', 'other', 'unknown'].includes(String(c.chemistry)) || !positive(c.capacityAh) || !positive(c.nominalV)
        || !reading(c.voltage, 1000) || !reading(c.soc, 100) || !(c.bankId === null || typeof c.bankId === 'string')) throw new Error('Batería inválida');
    } else throw new Error('Tipo de componente no compatible');
  }
  const result = value as unknown as TechnicalInventory;
  for (const c of result.components) if (c.kind === 'battery' && c.bankId !== null && !result.components.some(b => b.kind === 'bank' && b.id === c.bankId)) throw new Error('El banco debe pertenecer a esta embarcación');
  if (value.installation !== undefined) {
    validateInstallation(value.installation, result.components);
  }
  if (value.electrical !== undefined) validateElectricalSystem(value.electrical, result);
  if (result.installation?.bindings !== undefined) validateSensorBindings(result.installation.bindings, result);
  if(value.systems!==undefined)validateSystems(value.systems,systemExternalIds(result));
  return result;
}
export function replaceComponent(inventory: TechnicalInventory, component: Component): TechnicalInventory {
  return parseInventory({ ...inventory, components: [...inventory.components.filter(c => c.id !== component.id), component] });
}
export function removeComponent(inventory: TechnicalInventory, id: string): TechnicalInventory {
  if (inventory.components.some(c => c.kind === 'battery' && c.bankId === id)) throw new Error('Reasigna las baterías antes de retirar el banco');
  return parseInventory({ ...inventory, components: inventory.components.filter(c => c.id !== id) });
}
/** No bank capacity is inferred: wiring, matching and usable capacity require verification. */
export function tankTotals(inventory: TechnicalInventory, fluid: Tank['fluid']): { count: number; knownL: number; unknown: number } {
  const tanks = inventory.components.filter((c): c is Tank => c.kind === 'tank' && c.fluid === fluid);
  return { count: tanks.length, knownL: tanks.reduce((sum, c) => sum + (c.capacityL ?? 0), 0), unknown: tanks.filter(c => c.capacityL === null).length };
}
export interface QuickVessel { nombre: string; marca: string; modelo: string; matricula: string; tipo_barco: string }
function validateInstallation(value: unknown, components: Component[]): asserts value is Installation {
  if (!object(value) || Object.keys(value).some(k => !['nodes', 'links', 'bindings'].includes(k)) || !Array.isArray(value.nodes) || !Array.isArray(value.links) || value.nodes.length > 2000 || value.links.length > 4000) throw new Error('Instalación no compatible');
  const ids = new Map(components.map(c => [c.id, c.kind as string]));
  for (const node of value.nodes) {
    if (!object(node) || Object.keys(node).some(k => !['id', 'kind', 'name', 'location', 'manufacturer', 'model'].includes(k)) || !installationKinds.includes(String(node.kind)) || !text(node.id) || !node.id.trim() || ids.has(node.id) || !text(node.name) || !node.name.trim() || !text(node.location) || !text(node.manufacturer) || !text(node.model)) throw new Error('Equipo de instalación inválido');
    ids.set(node.id, String(node.kind));
  }
  const linkIds = new Set<string>(); const routes = new Set<string>();
  for (const link of value.links) {
    if (!object(link) || Object.keys(link).some(k => !['id', 'from', 'to', 'medium', 'name'].includes(k)) || !text(link.id) || !link.id.trim() || linkIds.has(link.id) || ids.has(link.id) || !text(link.from) || !text(link.to) || !text(link.name) || !link.name.trim()) throw new Error('Conexión inválida');
    const from = ids.get(link.from), to = ids.get(link.to);
    const valid = compatibleEndpoints(from, to, String(link.medium));
    const route = `${link.medium}:${link.from}:${link.to}`;
    if (!valid || routes.has(route)) throw new Error('Extremos incompatibles, duplicados o ajenos a esta embarcación');
    linkIds.add(link.id); routes.add(route);
  }
}
export function quickVesselPayload(input: QuickVessel, userId: string) {
  if (![input.nombre, input.marca, input.modelo, input.tipo_barco, userId].every(v => v.trim().length > 0)) throw new Error('Completa nombre, marca, modelo y tipo');
  return { nombre: input.nombre.trim(), marca: input.marca.trim(), modelo: input.modelo.trim(), matricula: input.matricula.trim() || null,
    tipo_barco: input.tipo_barco, user_id: userId, capitan_id: userId,
    eslora: null, manga: null, calado: null, lat: null, lng: null, fuel_level: null, water_level: null, horas_motor: null, potencia_cv: null };
}
