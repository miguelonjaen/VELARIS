import { requestChat, ChatFailure } from './chatTransport';
export { ChatFailure } from './chatTransport';
const API_BASE_URL = (import.meta.env.VITE_LOCAL_API_URL || 'http://127.0.0.1:8089').replace(/\/$/, '');
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


export const callTacticalAI = async (prompt: string, systemInstruction?: string, isJson = false, tools?: readonly unknown[]): Promise<GeminiResponse> => {
  try {
    const data = await requestChat(API_ENDPOINT, { prompt, systemInstruction, isJson, tools });
    return { ...(isJson ? data.data : {}), text: data.text,
      functionCalls: data.functionCalls as GeminiFunctionCall[], isOfflineMode: false };
  } catch (error) {
    const failure = error instanceof ChatFailure ? error : new ChatFailure('NETWORK', API_ENDPOINT);
    return { text: failure.message, functionCalls: [], isOfflineMode: true };
  }
};

/** Compatibility alias for existing callers; all requests now use OpenAI on the server. */
export const callGemini = callTacticalAI;
