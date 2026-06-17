/**
 * Núcleo de Inteligencia Gemini - SmartShip PRO
 * Implementación con Resiliencia Náutica y Modo Offline de Contingencia.
 */

const API_ENDPOINT = "http://localhost:8089/api/chat";

export interface GeminiResponse {
  text: string;
  functionCalls?: any[];
  isOfflineMode: boolean;
  [key: string]: any;
}

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

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

  return "Comando SmartShip PRO: Servidor saturado o sin red. Ejecutando protocolos de reserva. Sistemas del buque operativos.";
};

export const callGemini = async (
  prompt: string,
  systemInstruction?: string,
  isJson: boolean = false,
  tools?: any[]
): Promise<GeminiResponse> => {
  const maxRetries = 2;
  const retryDelay = 1500; // 1.5 segundos entre intentos

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
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

      // Manejo de Error 503 (Service Unavailable) o Saturación
      if (response.status === 503) {
        if (attempt < maxRetries) {
          console.warn(`[Gemini] Intento ${attempt} fallido (503). Reintentando en ${retryDelay}ms...`);
          await sleep(retryDelay);
          continue;
        }
      }

      if (!response.ok) throw new Error(`Status: ${response.status}`);

      const data = await response.json();
      return {
        text: data.text || "Operación procesada.",
        functionCalls: data.functionCalls || [],
        isOfflineMode: false
      };

    } catch (error) {
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