export type OperationalDeclaration = 'berth' | 'preDeparture' | 'anchor' | 'arrival';
export interface DeclarationValue { value: boolean; at: string }
export interface OperationalDeclarationSnapshot {
  berth: boolean;
  preDeparture: boolean;
  anchor: boolean;
  arrival: boolean;
  limitations: readonly string[];
}

const MAX_AGE_MS: Record<OperationalDeclaration, number> = {
  berth: 12 * 60 * 60_000,
  preDeparture: 6 * 60 * 60_000,
  anchor: 24 * 60 * 60_000,
  arrival: 12 * 60 * 60_000
};

/** Las declaraciones expiran y la cinemática sostenida prevalece sobre atraque/fondeo. */
export function resolveOperationalDeclarations(
  values: ReadonlyMap<string, DeclarationValue>, now: number, sogKn: number | null
): OperationalDeclarationSnapshot {
  const limitations: string[] = [];
  const active = (name: OperationalDeclaration): boolean => {
    const value = values.get(`operation:${name === 'preDeparture' ? 'predeparture' : name}`);
    if (!value?.value) return false;
    const at = Date.parse(value.at);
    if (!Number.isFinite(at) || now - at > MAX_AGE_MS[name] || at > now + 60_000) {
      limitations.push(`La declaración ${name} no es vigente.`);
      return false;
    }
    return true;
  };
  let berth = active('berth');
  let anchor = active('anchor');
  if (sogKn !== null && sogKn >= 0.8) {
    if (berth) limitations.push('El SOG vigente contradice el atraque declarado.');
    if (anchor) limitations.push('El SOG vigente contradice el fondeo declarado.');
    berth = false; anchor = false;
  }
  return { berth, anchor, preDeparture: active('preDeparture'), arrival: active('arrival'), limitations };
}
