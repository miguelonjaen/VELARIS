/** Restrict the REST query to the same principals accepted by barcos RLS. */
export function fleetFilter(userId: string): string {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId)) throw new Error('Identidad de flota no válida');
  return `user_id.eq.${userId},capitan_id.eq.${userId}`;
}
export function fleetRows<T>(data: T[] | null, error: {message:string;code?:string} | null): T[] {
  if (error) throw new Error(`No se pudo cargar la flota (${error.code || 'conexión'}): ${error.message}. Se conserva la última flota disponible.`);
  if (!Array.isArray(data)) throw new Error('Respuesta de flota no válida. Se conserva la última flota disponible.');
  return data;
}
/** Invalidates stale responses even when a transport fails to honour cancellation. */
export class FleetLoadGate {
  private controller: AbortController | null = null;
  begin(): {signal:AbortSignal; current:()=>boolean} {
    this.cancel();
    const controller = new AbortController();this.controller=controller;
    return {signal:controller.signal,current:()=>this.controller===controller&&!controller.signal.aborted};
  }
  cancel(): void {this.controller?.abort();this.controller=null;}
}
