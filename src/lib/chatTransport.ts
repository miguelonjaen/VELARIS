export type ChatFailureCode = 'CONFIGURATION' | 'BILLING' | 'AUTH' | 'QUOTA' | 'HTTP' | 'NETWORK' | 'TIMEOUT' | 'INVALID_RESPONSE';
export class ChatFailure extends Error {
  constructor(readonly code: ChatFailureCode, readonly endpoint: string, readonly status?: number) {
    const reasons: Record<ChatFailureCode, string> = {
      CONFIGURATION: 'OPENAI_API_KEY no está configurada en el backend. Un administrador debe configurar el servicio IA.',
      BILLING: 'OpenAI indica cuota insuficiente o límite de facturación. Revise la facturación y los límites del proyecto API.',
      AUTH: 'El servicio o proveedor rechazó la autenticación. Revise las credenciales del backend.',
      QUOTA: 'El proveedor ha limitado las solicitudes o agotado la cuota. Reintente más tarde.',
      HTTP: 'El servicio IA devolvió un error HTTP.',
      NETWORK: 'No se pudo contactar con el servicio IA. Compruebe servicio local, red y permisos de origen.',
      TIMEOUT: 'El servicio IA superó el tiempo máximo de respuesta.',
      INVALID_RESPONSE: 'El servicio IA devolvió una respuesta vacía o con formato inválido.',
    };
    super(`IA no disponible [${code}${status ? `; HTTP ${status}` : ''}] en ${endpoint}. ${reasons[code]} No se ha calculado ni validado una ruta; no se ha verificado el estado del buque.`);
    this.name = 'ChatFailure';
  }
}
export interface ChatRequest { prompt: string; systemInstruction?: string; isJson: boolean; tools?: readonly unknown[] }
export interface ChatPayload { text: string; functionCalls: unknown[]; data?: Record<string, unknown> }
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
/** One bounded request: never retry potentially actionable prompts automatically. Never expose provider bodies/secrets. */
export async function requestChat(endpoint: string, request: ChatRequest, fetcher: typeof fetch = fetch, timeoutMs = 70_000): Promise<ChatPayload> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => { controller.abort(); reject(new ChatFailure('TIMEOUT', endpoint)); }, timeoutMs);
  });
  try {
    return await Promise.race([timeout, (async () => {
      const response = await fetcher(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(request), signal: controller.signal });
      let body: unknown;
      try { body = await response.json(); } catch { body = null; }
      if (!response.ok) {
        const code: ChatFailureCode = record(body) && (body.code === 'AI_NOT_CONFIGURED' || (typeof body.error === 'string' && body.error.includes('GEMINI_API_KEY no está configurada')))
          ? 'CONFIGURATION' : record(body) && body.code === 'AI_BILLING_LIMIT' ? 'BILLING' : response.status === 401 || response.status === 403 ? 'AUTH' : response.status === 429 ? 'QUOTA' : (response.status === 504 || (record(body) && body.code === 'AI_TIMEOUT')) ? 'TIMEOUT' : 'HTTP';
        throw new ChatFailure(code, endpoint, response.status);
      }
      if (!record(body) || typeof body.text !== 'string' || (!body.text.trim() && !(Array.isArray(body.functionCalls) && body.functionCalls.length)) || (request.isJson && !record(body.data))) throw new ChatFailure('INVALID_RESPONSE', endpoint, response.status);
      return { text: body.text, functionCalls: Array.isArray(body.functionCalls) ? body.functionCalls : [], ...(record(body.data) ? { data: body.data } : {}) };
    })()]);
  } catch (error) {
    if (error instanceof ChatFailure) throw error;
    throw new ChatFailure(controller.signal.aborted ? 'TIMEOUT' : 'NETWORK', endpoint);
  } finally { if (timer !== undefined) clearTimeout(timer); }
}
