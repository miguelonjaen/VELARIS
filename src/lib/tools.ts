interface ToolProperty { type: 'string' | 'number' | 'boolean'; description: string }
interface FunctionDeclaration {
  name: string; description: string;
  parameters: { type: 'object'; properties: Record<string, ToolProperty>; required?: string[] };
}

export const NAV_TOOLS: FunctionDeclaration[] = [
  {
    name: "set_navigation_target",
    description: "Solicita configurar un destino confirmado por el usuario; no calcula ni valida una derrota ni distancia a costa. No inventes coordenadas.",
    parameters: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          description: "Nombre del puerto o destino (ej: 'Puerto Banús', 'Gibraltar').",
        },
        lat: {
          type: 'number',
          description: "Latitud del destino.",
        },
        lng: {
          type: 'number',
          description: "Longitud del destino.",
        },
      },
      required: ["name", "lat", "lng"],
    },
  },
  {
    name: "start_travesia",
    description: "Inicia oficialmente una travesía (zarpar). Activa el protocolo de despacho y bitácora.",
    parameters: {
      type: 'object',
      properties: {
        assisted: {
          type: 'boolean',
          description: "Si es true, la travesía se registra como 'asistida' por IA.",
        },
      },
    },
  },
  {
    name: "end_travesia",
    description: "Finaliza la travesía actual (arribar a puerto).",
    parameters: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: "activate_mob",
    description: "Activa la alerta de Hombre al Agua (MOB) de emergencia.",
    parameters: {
      type: 'object',
      properties: {},
    },
  }
];
