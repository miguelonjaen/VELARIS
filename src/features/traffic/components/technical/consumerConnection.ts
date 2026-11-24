import { parseInventory, type InstallationNode, type TechnicalInventory } from './model';

export interface ConsumerConnectionRequest {
  sourceId: string;
  medium: 'cable' | 'pipe';
  consumerId: string | null;
  name: string;
  connectionName: string;
}

/** One consumer may have a declared electrical supply and a fluid supply, without duplication. */
export function connectConsumer(inventory: TechnicalInventory, request: ConsumerConnectionRequest, id: () => string = () => crypto.randomUUID()): TechnicalInventory {
  const source = inventory.components.find(component => component.id === request.sourceId);
  if (!source || source.kind !== (request.medium === 'pipe' ? 'tank' : 'bank')) throw new Error('Selecciona un origen de esta embarcación compatible con la salida.');
  const installation = inventory.installation ?? { nodes: [], links: [] };
  const nodes = [...installation.nodes];
  let consumer: InstallationNode | undefined;
  if (request.consumerId) {
    consumer = nodes.find(node => node.id === request.consumerId && node.kind === 'consumer');
    if (!consumer) throw new Error('El consumidor seleccionado ya no está disponible.');
  } else {
    if (!request.name.trim()) throw new Error('Indica el nombre del consumidor instalado.');
    consumer = { id: id(), kind: 'consumer', name: request.name.trim(), location: '', manufacturer: '', model: '' };
    nodes.push(consumer);
  }
  if (installation.links.some(link => link.from === source.id && link.to === consumer.id && link.medium === request.medium)) throw new Error('Este consumidor ya tiene esa conexión declarada.');
  const link = { id: id(), from: source.id, to: consumer.id, medium: request.medium, name: request.connectionName.trim() || `${source.name} → ${consumer.name}`.slice(0, 240) };
  return parseInventory({ ...inventory, installation: { ...installation, nodes, links: [...installation.links, link] } });
}
