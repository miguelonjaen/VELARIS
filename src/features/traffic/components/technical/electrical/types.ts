export type ElectricalDomain = 'AC' | 'DC' | 'PV' | 'unknown';
export type Pole = 'positive' | 'negative' | 'line' | 'neutral' | 'earth' | 'unknown';
export interface Terminal { id: string; label: string; domain: ElectricalDomain; direction: 'in' | 'out' | 'bidirectional'; pole: Pole; nominalV: number | null }
export interface ElectricalDevice {
  componentId: string; catalogId: string; terminals: Terminal[]; nominalV: number | null; ratedA: number | null; ratedW: number | null;
  installedOn: string; condition: string; notes: string; provenance: 'manual' | 'template' | 'legacy';
}
export interface Endpoint { componentId: string; terminalId: string }
export interface ElectricalWire {
  id: string; from: Endpoint; to: Endpoint; domain: ElectricalDomain; nominalV: number | null;
  cable: string; sectionMm2: number | null; lengthM: number | null; protectionId: string | null; notes: string;
  provenance: 'manual' | 'template' | 'legacy'; bankId: string | null;
}
export interface BankCircuit { bankId: string; strings: string[][] }
export interface ElectricalSystem {
  version: 1; devices: ElectricalDevice[]; nodes: { componentId: string; x: number; y: number }[]; wires: ElectricalWire[];
  banks: BankCircuit[]; viewport: { x: number; y: number; zoom: number }; origin: 'custom' | 'template' | 'legacy';
}
export interface ElectricalIssue { severity: 'error' | 'warning' | 'pending'; code: string; message: string; componentId?: string; wireId?: string }
