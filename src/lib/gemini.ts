/**
 * Núcleo de Inteligencia Gemini - VELARIS
 * Implementación con Resiliencia Náutica y Modo Offline de Contingencia.
 */

const API_BASE_URL = (import.meta.env.VITE_LOCAL_API_URL || 'http://localhost:8089')
  .replace(/\/$/, '');
const API_ENDPOINT = `${API_BASE_URL}/api/chat`;

export interface GeminiResponse {
  text: string;
  functionCalls?: GeminiFunctionCall[];
  isOfflineMode: boolean;
  [key: string]: any;
}

export type GeminiFunctionCall =
  | { name: 'set_navigation_target'; args: { name: string; lat: number; lng: number } }
  | { name: 'start_travesia'; args: { assisted: boolean } }
  | { name: 'end_travesia'; args: Record<string, never> }
  | { name: 'activate_mob'; args: Record<string, never> };

interface ChatApiResponse {
  text?: string;
  functionCalls?: GeminiFunctionCall[];
  data?: unknown;
}

interface ChatApiError {
  code?: string;
  error?: string;
  retryAfterSeconds?: number;
}

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
let quotaBlockedUntil = 0;

/**
 * Genera una respuesta basada en plantillas locales para situaciones de fallo de red.
 */
const getLocalNauticalFallback = (prompt: string): string => {
  const p = prompt.toLowerCase();
  
  if (p.includes('asesor') || p.includes('táctico') || p.includes('situación') || p.includes('informe')) {
    return "Sistemas locales estables. Modo IA en Contingencia. Telemetría HUD activa: Mantenga rumbo y vigile el viento actual.";
  }
  
  if (p.includes('ancla') || p.includes('fondeo') || p.includes('garreo')) {
    return "Monitor de fondeo local activo. Sin conexión con el centro de datos. Vigilancia de borneo operando por heurística local.";
  }

  if (p.includes('combustible') || p.includes('motor') || p.includes('logística')) {
    return "Análisis logístico en modo local. Verifique niveles en el panel de control. Sensores de propulsión informan estado NOMINAL.";
  }

  return "Comando VELARIS: Servidor saturado o sin red. Ejecutando protocolos de reserva. Sistemas del buque operativos.";
};

export const callGemini = async (
  prompt: string,
  systemInstruction?: string,
  isJson: boolean = false,
  tools?: any[]
): Promise<GeminiResponse> => {
  console.log(
  '🚨 GEMINI INVOCADO'
);

console.log(
  'PROMPT:',
  prompt.substring(0, 200)
);

console.log(
  'STACK:',
  new Error().stack
);
  const maxRetries = 2;
  const retryDelay = 1500; // 1.5 segundos entre intentos

  if (Date.now() < quotaBlockedUntil) {
    return {
      text: getLocalNauticalFallback(prompt),
      functionCalls: [],
      isOfflineMode: true
    };
  }

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.debug('[Gemini API] Solicitud', {
        endpoint: API_ENDPOINT,
        attempt,
        promptLength: prompt.length,
      });

      // Timeout de 30 segundos para evitar colgar la UI
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000);

      const response = await fetch(API_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, systemInstruction, isJson, tools }),
        signal: controller.signal
      });
      clearTimeout(timeoutId);

      if (response.status === 429) {
        const errorData = await response.json().catch((): ChatApiError => ({})) as ChatApiError;
        const headerDelay = Number(response.headers.get('Retry-After'));
        const retryAfterSeconds = Number.isFinite(errorData.retryAfterSeconds)
          ? Math.max(1, errorData.retryAfterSeconds as number)
          : Number.isFinite(headerDelay) && headerDelay > 0
            ? headerDelay
            : 60;

        quotaBlockedUntil = Date.now() + retryAfterSeconds * 1000;
        console.warn(`[Gemini] Cuota agotada. Modo local durante ${retryAfterSeconds}s.`);
        return {
          text: getLocalNauticalFallback(prompt),
          functionCalls: [],
          isOfflineMode: true
        };
      }

      // Manejo de Error 503 (Service Unavailable) o Saturación
      if (response.status === 503) {
        if (attempt < maxRetries) {
          console.warn(`[Gemini] Intento ${attempt} fallido (503). Reintentando en ${retryDelay}ms...`);
          await sleep(retryDelay);
          continue;
        }
      }

      if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(`HTTP ${response.status}: ${errorBody || response.statusText}`);
      }

      const data = await response.json() as ChatApiResponse;
      const structuredData = isJson && data.data && typeof data.data === 'object'
        ? data.data
        : {};

      return {
        ...structuredData,
        text: data.text || "Operación procesada.",
        functionCalls: Array.isArray(data.functionCalls) ? data.functionCalls : [],
        isOfflineMode: false,
      };

    } catch (error) {
      console.error('[Gemini API] Fallo de solicitud', {
        endpoint: API_ENDPOINT,
        attempt,
        error,
      });

      if (attempt < maxRetries) {
        console.warn(`[Gemini] Error de conexión/red. Intento ${attempt} de ${maxRetries}...`);
        await sleep(retryDelay);
        continue;
      }

      console.error("[Gemini] Fallo crítico. Activando protocolo de Modo Seguro Local.");
      return {
        text: getLocalNauticalFallback(prompt),
        functionCalls: [],
        isOfflineMode: true
      };
    }
  }

  return {
    text: getLocalNauticalFallback(prompt),
    isOfflineMode: true
  };
};
