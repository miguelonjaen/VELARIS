import type { Component, Installation, InstallationLink, InstallationNode } from './model';

export const electricalNodeLabels = {
  electrical: 'Equipo eléctrico', alternator: 'Alternador', solar: 'Solar', shore: 'Toma de puerto AC',
  controller: 'Regulador solar', charger: 'Cargador AC/DC', distributor: 'Repartidor de carga CC', consumer: 'Consumidor',
} satisfies Record<InstallationNode['kind'], string>;
export const installationKinds = Object.keys(electricalNodeLabels);
export const isChargeSource = (kind: string): boolean => ['alternator', 'solar', 'shore'].includes(kind);

/** Physical roles, not live switching states. Legacy direct solar routes remain readable. */
export function compatibleEndpoints(from: string | undefined, to: string | undefined, medium: string): boolean {
  if (medium === 'pipe') return from === 'tank' && to === 'consumer' || from === 'consumer' && to === 'tank';
  if (medium !== 'cable') return false;
  if (from === 'shore') return to === 'charger';
  if (from === 'solar' && to === 'controller') return true;
  if (['solar', 'alternator', 'controller', 'charger'].includes(from ?? '')) return to === 'bank' || to === 'distributor';
  return from === 'distributor' && to === 'bank' || from === 'bank' && to === 'consumer';
}

export interface ChargePath { source: InstallationNode; bank: Component; links: InstallationLink[]; via: InstallationNode[] }
/** Follow only declared cables. A branch reading is never copied through a distributor. */
export function chargePaths(installation: Installation, components: Component[], bankId?: string): ChargePath[] {
  const paths: ChargePath[] = [];
  const nodes = new Map(installation.nodes.map(node => [node.id, node]));
  const banks = new Map(components.filter(c => c.kind === 'bank').map(c => [c.id, c]));
  const outgoing = new Map<string, InstallationLink[]>();
  for (const link of installation.links) if (link.medium === 'cable') outgoing.set(link.from, [...(outgoing.get(link.from) ?? []), link]);
  for (const source of installation.nodes.filter(node => isChargeSource(node.kind))) {
    const visit = (id: string, links: InstallationLink[], via: InstallationNode[], visited: Set<string>) => {
      if (visited.has(id)) return;
      const nextVisited = new Set(visited).add(id);
      for (const link of outgoing.get(id) ?? []) {
        const bank = banks.get(link.to);
        if (bank) { if (!bankId || bank.id === bankId) paths.push({ source, bank, links: [...links, link], via }); }
        else {
          const node = nodes.get(link.to);
          if (node && ['controller', 'charger', 'distributor'].includes(node.kind)) visit(node.id, [...links, link], [...via, node], nextVisited);
        }
      }
    };
    visit(source.id, [], [], new Set());
  }
  return paths;
}
