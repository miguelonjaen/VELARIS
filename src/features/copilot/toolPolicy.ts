import type { GeminiFunctionCall } from '../../lib/gemini';

export function validNavigationAction(call: unknown): call is GeminiFunctionCall {
  if (!call || typeof call !== 'object' || !('name' in call) || !('args' in call)) return false;
  const args = call.args;
  if (!args || typeof args !== 'object') return false;
  switch (call.name) {
    case 'set_navigation_target': return 'lat' in args && typeof args.lat === 'number' && Number.isFinite(args.lat) && Math.abs(args.lat) <= 90
      && 'lng' in args && typeof args.lng === 'number' && Number.isFinite(args.lng) && Math.abs(args.lng) <= 180
      && 'name' in args && typeof args.name === 'string' && args.name.trim().length > 0 && args.name.length <= 160;
    case 'start_travesia': return 'assisted' in args && typeof args.assisted === 'boolean';
    case 'end_travesia': case 'activate_mob': return Object.keys(args).length === 0;
    default: return false;
  }
}
export function confirmNavigationAction(call: unknown, confirm: (message: string) => boolean = message => window.confirm(message)): boolean {
  if (!validNavigationAction(call)) return false;
  const description = call.name === 'set_navigation_target' ? `Establecer destino ${call.args.name} (${call.args.lat}, ${call.args.lng})`
    : call.name === 'start_travesia' ? `Iniciar travesía (${call.args.assisted ? 'asistida' : 'libre'})`
    : call.name === 'end_travesia' ? 'Finalizar travesía' : 'Activar MOB';
  return confirm(`${description}\n\nSolicitud del copiloto. Puede afectar a la navegación o la bitácora. ¿Confirmar ejecución?`);
}
