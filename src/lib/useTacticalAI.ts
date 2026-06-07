import { useState, useCallback } from 'react';
import { callGemini } from '../lib/gemini';
import { NAV_TOOLS } from '../lib/tools';

interface AIProps {
  userProfile: any;
  activeShip: any;
  shipPosition: any;
  weather: any;
  depth: number;
  navPlan: any;
}

export const useTacticalAI = ({ userProfile, activeShip, shipPosition, weather, depth, navPlan }: AIProps) => {
  const [messages, setMessages] = useState<any[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);

  const handleTacticalOrder = useCallback(async (order: string, callbacks: any) => {
    if (!order.trim() || isProcessing) return;

    const systemPrompt = `
      ASISTENTE DE COMANDO PRO-NAUTIC (PROTOCOLO NUCLEUS):
      Interlocutor: Almirante ${userProfile?.name}.
      Buque: ${activeShip?.nombre}. Posición: [${shipPosition?.lat}, ${shipPosition?.lng}].
      Viento: ${weather.wind}kts. Profundidad: ${depth}m.
      Destino: ${navPlan.targetName || 'Navegación libre'}.
    `;

    setMessages(prev => [...prev, { id: crypto.randomUUID(), role: 'user', text: order, timestamp: new Date() }]);
    setIsProcessing(true);

    try {
      const response = await callGemini(order, systemPrompt, false, NAV_TOOLS);
      if (!response) throw new Error("Respuesta vacía");

      const aiText = response.text || "Orden procesada.";
      const functionCalls = response.functionCalls;

      if (functionCalls) {
        for (const call of functionCalls) {
          if (call.name === 'set_navigation_target') callbacks.onSetTarget(call.args);
          if (call.name === 'start_travesia') callbacks.onStartTravesia(call.args);
          if (call.name === 'end_travesia') callbacks.onEndTravesia();
          if (call.name === 'activate_mob') callbacks.onMOB();
        }
      }

      setMessages(prev => [...prev, { id: crypto.randomUUID(), role: 'ai', text: aiText, timestamp: new Date() }]);
    } catch (error) {
      setMessages(prev => [...prev, { 
        id: crypto.randomUUID(), role: 'ai', text: "Error de conexión con el núcleo estratégico.", isError: true, timestamp: new Date() 
      }]);
    } finally {
      setIsProcessing(false);
    }
  }, [isProcessing, userProfile, activeShip, shipPosition, weather, depth, navPlan]);

  return {
    messages,
    setMessages,
    isProcessing,
    handleTacticalOrder
  };
};