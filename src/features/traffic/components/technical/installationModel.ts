import { electricalBankNominal } from './electrical/model';
import type { Bank, Battery, TechnicalInventory } from './model';

/** Nominal equivalents only. No estimate of SOC, usable energy or autonomy. */
export function bankNominal(bank: Bank, inventory: TechnicalInventory): { volts: number | null; ah: number | null; wh: number | null; reason: string } {
  const configured = electricalBankNominal(bank, inventory);
  if (configured) return configured;
  const cells = inventory.components.filter((c): c is Battery => c.kind === 'battery' && c.bankId === bank.id);
  const unknown = (reason: string) => ({ volts: null, ah: null, wh: null, reason });
  if (!cells.length) return unknown('Sin baterías asignadas');
  if (bank.topology === 'series-parallel') return unknown('Configura las ramas serie-paralelo en el editor');
  if (bank.topology === 'unknown') return unknown('Cableado desconocido');
  if (cells.some(c => c.nominalV === null || c.capacityAh === null)) return unknown('Características nominales incompletas');
  if (cells.some(c => c.chemistry === 'unknown' || c.chemistry === 'other') || new Set(cells.map(c => c.chemistry)).size !== 1) return unknown('Tecnologías sin compatibilidad confirmada');
  // Parallel branches require equal nominal voltage. Series capacity is limited
  // by the weakest rating; this is not a measurement of available capacity.
  const first = cells[0];
  if (bank.topology === 'parallel' && cells.some(c => c.nominalV !== first.nominalV)) return unknown('Tensiones incompatibles para paralelo');
  const volts = bank.topology === 'series' ? cells.reduce((n, c) => n + c.nominalV!, 0) : first.nominalV!;
  const ah = bank.topology === 'parallel' ? cells.reduce((n, c) => n + c.capacityAh!, 0) : Math.min(...cells.map(c => c.capacityAh!));
  if (!Number.isFinite(volts * ah)) return unknown('Nominal fuera de rango');
  return { volts, ah, wh: volts * ah, reason: cells.some(c => c.capacityAh !== first.capacityAh) ? 'Calculado · capacidades diferentes; revisar compatibilidad. Serie limitada por el menor Ah. No capacidad útil' : 'Calculado · nominal declarado; no capacidad útil' };
}
