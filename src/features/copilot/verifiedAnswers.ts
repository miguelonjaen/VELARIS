import type { CopilotContext } from './context';

export function getVerifiedTacticalAnswer(
  question: string,
  context: CopilotContext
): string | null {
  const normalized = question
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

    // Solo responder directamente a consultas sobre la lectura de sonda.
  const mentionsDepth =
    /\b(sonda|profundidad)\b/.test(normalized);

  if (!mentionsDepth) return null;

  // Las consultas sobre decisiones o riesgos de navegación
  // deben pasar al análisis táctico, nunca a una respuesta
  // simplificada basada únicamente en la sonda.
  const safetyQuestion =
    /\b(puedo|podemos|debo|debemos|seguro|segura|seguridad|suficiente|riesgo|peligro|entrar|salir|navegar|continuar|pasar|maniobra|varada|encallar|quilla|resguardo|margen)\b/.test(normalized);

  if (safetyQuestion) return null;

  // No confundir batimetría de cartas con sonda del barco.
  const chartQuestion =
    /\b(batimetria|carta|cartografia|zona|puerto|fondeo|costa|canal|ruta)\b/.test(normalized);

  if (chartQuestion) return null;

  // Debe existir una referencia explícita a la medición.
  const asksMeasurement =
    /\b(sonda|marca|marca la sonda|indica|lectura|medida|actual|bajo mi barco|debajo del barco)\b/.test(normalized);

  if (!asksMeasurement) return null;

  const depth = context.instruments.depth;

  if (
    depth.status !== 'valid' ||
    !depth.value ||
    !Number.isFinite(depth.value.meters)
  ) {
    return 'No dispongo de una lectura vigente de la sonda del barco. No puedo confirmar la profundidad actual.';
  }

  const referenceLabels: Record<string, string> = {
    keel: 'referida a la quilla',
    surface: 'referida a la superficie',
    transducer: 'referida al transductor'
  };

  const reference = depth.value.reference
    ? referenceLabels[depth.value.reference] ?? 'con referencia desconocida'
    : 'con referencia desconocida';

  const meters = depth.value.meters.toLocaleString('es-ES', {
    maximumFractionDigits: 2
  });

  const age = depth.ageMs === null
    ? 'antigüedad desconocida'
    : `recibida hace ${(depth.ageMs / 1000).toFixed(1).replace('.', ',')} segundos`;

  return `La sonda del barco indica ${meters} metros, ${reference}. Fuente: ${depth.source}; ${age}. Esta lectura no demuestra por sí sola el resguardo bajo quilla ni la seguridad de la navegación.`;
}
