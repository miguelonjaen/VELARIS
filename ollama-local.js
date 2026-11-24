"use strict";

const OLLAMA_URL = "http://127.0.0.1:11434";
const OLLAMA_MODEL = "qwen2.5:3b";

const MARINE_KNOWLEDGE = `
DEFINICIONES NAUTICAS OBLIGATORIAS:
SOG = Speed Over Ground. Velocidad del barco respecto al fondo terrestre.
STW = Speed Through Water. Velocidad del barco respecto al agua.
TWS = True Wind Speed. Velocidad del viento verdadero.
COG = Course Over Ground. Direccion del desplazamiento respecto al fondo.
HDG = Heading. Direccion hacia la que apunta la proa.
CPA = Closest Point of Approach. Distancia minima prevista entre dos barcos.
TCPA = Time to Closest Point of Approach. Tiempo previsto hasta el CPA.

No confundas STW con TWS.
No inventes datos ni evaluaciones de riesgo.
No ejecutes acciones de navegacion.
`;
const DEFINITIONS = {
  SOG: "SOG (Speed Over Ground) es la velocidad de la embarcacion respecto al fondo terrestre. Incluye el efecto de las corrientes.",
  STW: "STW (Speed Through Water) es la velocidad de la embarcacion respecto al agua que la rodea.",
  TWS: "TWS (True Wind Speed) es la velocidad del viento verdadero.",
  COG: "COG (Course Over Ground) es la direccion del desplazamiento de la embarcacion respecto al fondo terrestre.",
  HDG: "HDG (Heading) es la direccion hacia la que apunta la proa de la embarcacion.",
  CPA: "CPA (Closest Point of Approach) es la distancia minima prevista entre dos embarcaciones si mantienen sus movimientos actuales.",
  TCPA: "TCPA (Time to Closest Point of Approach) es el tiempo previsto hasta alcanzar el CPA."
};

function getVerifiedDefinition(prompt) {
  const normalized = prompt
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/^[^A-Z0-9]+/, "")
    .trim();

  const operational = /\d|QUE DEBO HACER|QUE HAGO|MANIOBRA|COLISION|RIESGO|PELIGRO|ALARMA|EVITAR|PILOTO|CAMBIAR RUMBO|DISTANCIA ACTUAL/.test(normalized);

  if (operational) return null;

  const conceptual = /^(QUE SIGNIFICA|QUE ES|DEFINE|DEFINICION DE|EXPLICA|CUAL ES LA DIFERENCIA|DIFERENCIA ENTRE)\b/.test(normalized);

  if (!conceptual) return null;

  const matches = normalized.match(/\b(SOG|STW|TWS|COG|HDG|CPA|TCPA)\b/g);

  if (!matches) return null;

  const terms = [...new Set(matches)];

  return terms.map(term => DEFINITIONS[term]).join("\n\n");
}
function getSafetyResponse(prompt) {
  const normalized = prompt
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase();

  const operational = /\b(QUE DEBO HACER|QUE HAGO|COMO EVITO|MANIOBR|COLISION|RIESGO|PELIGRO|CAMBIAR RUMBO|PILOTO AUTOMATICO|ACELERAR|FRENAR|ESQUIVAR)\b/.test(normalized);

  if (!operational) return null;

  return {
    text: "GAULOS no dispone en esta consulta de una evaluacion nautica verificada suficiente para recomendar una maniobra. Un valor aislado de CPA no determina por si solo el riesgo de colision. Comprueba visualmente la situacion, los instrumentos y la evolucion de los objetivos. El Oficial IA no controla el piloto automatico ni sustituye la vigilancia y las obligaciones del patron conforme al RIPA.",
    functionCalls: [],
    provider: "gaulos-safety",
    model: "marine-safety-v1"
  };
}
async function askOllama(prompt, systemInstruction = "") {
  if (typeof prompt !== "string" || !prompt.trim()) {
    throw new Error("El mensaje está vacío");
  }

  const safety = getSafetyResponse(prompt);
  if (safety) return safety;
  const verified = getVerifiedDefinition(prompt);

  if (verified) {
    return {
      text: verified,
      functionCalls: [],
      provider: "gaulos-verified",
      model: "marine-definitions-v1"
    };
  }
  const response = await fetch(`${OLLAMA_URL}/api/chat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    signal: AbortSignal.timeout(60000),
    body: JSON.stringify({
      model: OLLAMA_MODEL,
      stream: false,
      keep_alive: "10m",
      messages: [
        {
          role: "system",
          content: [
            "Eres el Oficial IA de GAULOS.",
            "Responde exclusivamente en español.",
            "Explica los resultados verificados del motor náutico.",
            "No inventes datos, riesgos ni maniobras.",
            "No determines por tu cuenta el riesgo de colisión.",
            "No ejecutes acciones de navegación.",
            MARINE_KNOWLEDGE,
          systemInstruction
          ].join("\n")
        },
        {
          role: "user",
          content: prompt
        }
      ],
      options: {
        temperature: 0.1,
        num_predict: 160,
        num_ctx: 4096
      }
    })
  });

  if (!response.ok) {
    throw new Error(`OLLAMA_HTTP_${response.status}`);
  }

  const data = await response.json();
  console.info("[OLLAMA METRICS]", JSON.stringify({
    model: OLLAMA_MODEL,
    totalMs: Math.round((data.total_duration || 0) / 1e6),
    loadMs: Math.round((data.load_duration || 0) / 1e6),
    promptMs: Math.round((data.prompt_eval_duration || 0) / 1e6),
    generationMs: Math.round((data.eval_duration || 0) / 1e6),
    promptTokens: data.prompt_eval_count || 0,
    outputTokens: data.eval_count || 0,
    doneReason: data.done_reason || "unknown"
  }));

  if (typeof data.message?.content !== "string" ||
      !data.message.content.trim()) {
    throw new Error("OLLAMA_EMPTY_RESPONSE");
  }

  return {
    text: [
      "OFICIAL VIRTUAL \u00b7 IA LOCAL \u00b7 CONOCIMIENTO NO VERIFICADO",
      data.message.content.trim(),
      data.done_reason === "length"
        ? "Respuesta incompleta: se ha alcanzado el limite de generacion."
        : null,
      "Informacion orientativa. Contraste con documentacion tecnica y fuentes nauticas autorizadas."
    ].filter(Boolean).join("\n\n"),
    functionCalls: [],
    provider: "ollama",
    model: OLLAMA_MODEL
  };
}

module.exports = { askOllama, getVerifiedDefinition, getSafetyResponse };
