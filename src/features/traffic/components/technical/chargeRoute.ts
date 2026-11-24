import { parseInventory, type InstallationNode, type TechnicalInventory } from './model';
import { compatibleEndpoints } from './electricalTopology';

export type SourceKind = 'solar' | 'shore' | 'alternator';
export interface DeviceChoice { existingId: string | null; name: string }
export type ChargeRouteRequest = {
  kind: SourceKind; source: DeviceChoice; converter: DeviceChoice | null; distributor: DeviceChoice | null; bankIds: string[];
} | { kind: 'distributor'; inputId: string; distributor: DeviceChoice; bankIds: string[] };

/** One revision for equipment and all selected outputs. No fictitious readings or allocation percentages. */
export function addChargeRoute(inventory: TechnicalInventory, request: ChargeRouteRequest, id: () => string = () => crypto.randomUUID()): TechnicalInventory {
  const installation = inventory.installation ?? { nodes: [], links: [] };
  const nodes = [...installation.nodes], links = [...installation.links];
  const destinations = [...new Set(request.bankIds)];
  if (!destinations.length) throw new Error('Selecciona al menos un banco de destino.');
  if (destinations.some(bankId => !inventory.components.some(c => c.id === bankId && c.kind === 'bank'))) throw new Error('El banco de destino no pertenece a esta embarcación.');
  const device = (kind: InstallationNode['kind'], choice: DeviceChoice): InstallationNode => {
    if (choice.existingId) {
      const existing = nodes.find(n => n.id === choice.existingId && n.kind === kind);
      if (!existing) throw new Error('El equipo seleccionado ya no está disponible.');
      return existing;
    }
    if (!choice.name.trim()) throw new Error('Indica el nombre del equipo instalado.');
    const node: InstallationNode = { id: id(), kind, name: choice.name.trim(), location: '', manufacturer: '', model: '' };
    nodes.push(node); return node;
  };
  const connect = (from: string, to: string) => {
    const source = nodes.find(n => n.id === from) ?? inventory.components.find(c => c.id === from);
    const target = nodes.find(n => n.id === to) ?? inventory.components.find(c => c.id === to);
    if (!compatibleEndpoints(source?.kind, target?.kind, 'cable')) throw new Error('Estos equipos no admiten esa conexión de carga.');
    if (!links.some(l => l.medium === 'cable' && l.from === from && l.to === to)) links.push({ id: id(), from, to, medium: 'cable', name: `${source!.name} → ${target!.name}`.slice(0, 240) });
  };
  let output: string;
  if (request.kind === 'distributor') {
    if (!nodes.some(n => n.id === request.inputId && ['alternator', 'controller', 'charger'].includes(n.kind))) throw new Error('Selecciona la salida CC de un alternador, regulador o cargador.');
    output = device('distributor', request.distributor).id;
    connect(request.inputId, output);
    // Existing direct branches remain until explicitly removed by the owner.
  } else {
    output = device(request.kind, request.source).id;
    if (request.kind !== 'alternator') {
      if (!request.converter) throw new Error(request.kind === 'shore' ? 'La toma de puerto necesita un cargador AC/DC.' : 'Selecciona el regulador solar instalado.');
      const converter = device(request.kind === 'shore' ? 'charger' : 'controller', request.converter);
      connect(output, converter.id); output = converter.id;
    }
    if (request.distributor) { const distributor = device('distributor', request.distributor); connect(output, distributor.id); output = distributor.id; }
  }
  for (const bankId of destinations) connect(output, bankId);
  return parseInventory({ ...inventory, installation: { ...installation, nodes, links } });
}
