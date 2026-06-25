console.log('***** MAP-SERVER VERSION NUEVA *****');
require('dotenv').config(); // Carga las variables de entorno desde el archivo .env
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const MBTiles = require('@mapbox/mbtiles');
const { GoogleGenerativeAI } = require("@google/generative-ai");
const OpenAI = require("openai");
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});
const { createClient } = require('@supabase/supabase-js');
const WebSocket = require('ws');
const app = express();
const PORT = 8089;

// Middleware de seguridad y utilidad
app.use(cors({ origin: '*' }));
app.use(express.json({ limit: '256kb' }));

let currentChartsPath = "";
let mbtilesInstances = {};

// 🛡️ 1. Configuración de Supabase (Llave Maestra)
// Supabase es opcional para el servidor cartográfico y el chat.
const supabase = process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY
  ? createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
      { realtime: { transport: WebSocket } }
    )
  : null;

// --- CONFIGURACIÓN DINÁMICA DEL REPOSITORIO ---
app.post('/api/settings/charts-path', (req, res) => {
  const { path: newPath } = req.body;
  if (!newPath) return res.status(400).json({ error: "Ruta no proporcionada" });
  
  currentChartsPath = newPath;
  
  // Liberar archivos MBTiles previos si existieran
  Object.keys(mbtilesInstances).forEach(key => {
    mbtilesInstances[key].close(() => delete mbtilesInstances[key]);
  });
  
  console.log(`📂 Puerto de cartas establecido en: ${currentChartsPath}`);
  res.json({ success: true, path: currentChartsPath });
});

// --- SERVIDOR DE TESELAS DINÁMICO ---
app.get('/tiles/:filename/:z/:x/:y.png', (req, res) => {
  const { filename, z, x, y } = req.params;
  const mbtilesFile = path.join(currentChartsPath, filename.endsWith('.mbtiles') ? filename : `${filename}.mbtiles`);

  if (!fs.existsSync(mbtilesFile)) return res.status(404).send('Carta no encontrada en el repositorio');

  const serveTile = (mbtiles) => {
    mbtiles.getTile(parseInt(z), parseInt(x), parseInt(y), (err, data, headers) => {
      if (err) return res.status(404).send('Tesela inexistente');
      res.set(headers);
      res.send(data);
    });
  };

  if (!mbtilesInstances[filename]) {
    new MBTiles(`${mbtilesFile}?mode=ro`, (err, mbtiles) => {
      if (err) return res.status(500).send(err.message);
      mbtilesInstances[filename] = mbtiles;
      serveTile(mbtiles);
    });
  } else {
    serveTile(mbtilesInstances[filename]);
  }
});


// 🔐 SEGURIDAD: API key solo se carga en el servidor (NUNCA en cliente)
// La ausencia de Gemini no debe derribar teselas, salud ni otros servicios locales.
const genAI = process.env.GEMINI_API_KEY
  ? new GoogleGenerativeAI(process.env.GEMINI_API_KEY)
  : null;

console.log('[AI CONFIG]', {
  model: process.env.GEMINI_MODEL || 'gemini-2.5-flash',
  apiKeyConfigured: Boolean(process.env.GEMINI_API_KEY)
});

// --- ENDPOINTS ---

// 🤖 Endpoint de Chat Seguro con Ubicación Dinámica en Tiempo Real
app.get('/api/charts', async (req, res) => {
  if (!currentChartsPath || !fs.existsSync(currentChartsPath)) return res.json([]);
  try {
    const files = fs.readdirSync(currentChartsPath).filter(f => f.toLowerCase().endsWith('.mbtiles'));
    
    const chartsWithMetadata = [];
    for (const file of files) {
      const metadata = await new Promise((resolve) => {
        const mbtilesFile = path.join(currentChartsPath, file);
        new MBTiles(`${mbtilesFile}?mode=ro`, (err, mbtiles) => {
          if (err) return resolve({ name: file });
          mbtiles.getInfo((infoErr, info) => {
            mbtiles.close(() => {
              if (infoErr) resolve({ name: file });
              else resolve({
                name: file,
                bounds: info.bounds, // [minLon, minLat, maxLon, maxLat]
                minzoom: info.minzoom,
                maxzoom: info.maxzoom
              });
            });
          });
        });
      });
      chartsWithMetadata.push(metadata);
    }
    res.json(chartsWithMetadata);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

const CHAT_LIMITS = Object.freeze({
  prompt: 16_000,
  systemInstruction: 24_000,
  sector: 120
});

const NAV_TOOL_DECLARATIONS = Object.freeze([
  {
    name: 'set_navigation_target',
    description: 'Establece un destino geográfico para calcular una derrota.',
    parameters: {
      type: 'OBJECT',
      properties: {
        name: { type: 'STRING', description: 'Nombre inequívoco del destino.' },
        lat: { type: 'NUMBER', description: 'Latitud WGS84, entre -90 y 90.' },
        lng: { type: 'NUMBER', description: 'Longitud WGS84, entre -180 y 180.' }
      },
      required: ['name', 'lat', 'lng']
    }
  },
  {
    name: 'start_travesia',
    description: 'Solicita iniciar la travesía. La aplicación exigirá la confirmación operativa correspondiente.',
    parameters: {
      type: 'OBJECT',
      properties: {
        assisted: { type: 'BOOLEAN', description: 'Indica navegación asistida por IA.' }
      },
      required: ['assisted']
    }
  },
  {
    name: 'end_travesia',
    description: 'Solicita finalizar la travesía actual.',
    parameters: { type: 'OBJECT', properties: {} }
  },
  {
    name: 'activate_mob',
    description: 'Activa el protocolo de emergencia de persona al agua (MOB).',
    parameters: { type: 'OBJECT', properties: {} }
  }
]);

function isFiniteCoordinate(value, min, max) {
  return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;
}

function getRequestedToolDeclarations(tools) {
  if (!Array.isArray(tools)) return [];

  const requestedNames = new Set(
    tools
      .map((tool) => tool && typeof tool === 'object' ? tool.name : undefined)
      .filter((name) => typeof name === 'string')
  );

  return NAV_TOOL_DECLARATIONS.filter((declaration) => requestedNames.has(declaration.name));
}

function sanitizeFunctionCalls(functionCalls, enabledToolNames) {
  if (!Array.isArray(functionCalls)) return [];

  return functionCalls.flatMap((call) => {
    if (!call || typeof call.name !== 'string' || !enabledToolNames.has(call.name)) return [];

    const args = call.args && typeof call.args === 'object' ? call.args : {};
    if (call.name === 'set_navigation_target') {
      const name = typeof args.name === 'string' ? args.name.trim().slice(0, 160) : '';
      if (!name || !isFiniteCoordinate(args.lat, -90, 90) || !isFiniteCoordinate(args.lng, -180, 180)) {
        return [];
      }
      return [{ name: call.name, args: { name, lat: args.lat, lng: args.lng } }];
    }

    if (call.name === 'start_travesia') {
      return [{ name: call.name, args: { assisted: args.assisted === true } }];
    }

    return [{ name: call.name, args: {} }];
  });
}

let geminiBlockedUntil = 0;

function getGeminiRetryAfterSeconds(error) {
  const message = error instanceof Error ? error.message : String(error);
  const retryMatch = message.match(/retry(?:Delay)?(?:["':\s]+|\s+in\s+)(\d+(?:\.\d+)?)s/i);
  const retryAfterSeconds = retryMatch ? Math.ceil(Number(retryMatch[1])) : 60;
  return Math.min(Math.max(retryAfterSeconds, 1), 3600);
}

app.post('/api/chat', async (req, res) => {
  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const prompt = typeof body.prompt === 'string' ? body.prompt.trim() : '';
  const systemInstruction = typeof body.systemInstruction === 'string'
    ? body.systemInstruction.trim()
    : '';

  if (!prompt) return res.status(400).json({ error: 'Falta el mensaje' });
  if (prompt.length > CHAT_LIMITS.prompt) {
    return res.status(413).json({ error: 'El mensaje supera el límite permitido' });
  }
  if (systemInstruction.length > CHAT_LIMITS.systemInstruction) {
    return res.status(413).json({ error: 'La instrucción de sistema supera el límite permitido' });
  }
  if (!genAI) {
    return res.status(503).json({ error: 'GEMINI_API_KEY no está configurada en el backend' });
  }

  const quotaCooldownSeconds = Math.ceil((geminiBlockedUntil - Date.now()) / 1000);
  if (quotaCooldownSeconds > 0) {
    res.set('Retry-After', String(quotaCooldownSeconds));
    return res.status(429).json({
      code: 'GEMINI_QUOTA_EXCEEDED',
      error: 'Cuota de Gemini temporalmente agotada',
      retryAfterSeconds: quotaCooldownSeconds
    });
  }

  try {
    const requestStartedAt = Date.now();
    console.log('[POST /api/chat]', {
      promptLength: prompt.length,
      jsonMode: body.isJson === true,
      toolsCount: Array.isArray(body.tools) ? body.tools.length : 0
    });
    const position = body.posicionActual;
    const hasValidPosition = position
      && isFiniteCoordinate(position.lat, -90, 90)
      && isFiniteCoordinate(position.lng, -180, 180);
    const sector = position && typeof position.sector === 'string'
      ? position.sector.trim().slice(0, CHAT_LIMITS.sector)
      : '';
    const locationReport = hasValidPosition
      ? `Latitud: ${position.lat}; longitud: ${position.lng}${sector ? `; sector: ${sector}` : ''}.`
      : 'No disponible: no se han recibido coordenadas GPS válidas.';

    const requestedTools = getRequestedToolDeclarations(body.tools);
    const enabledToolNames = new Set(requestedTools.map((tool) => tool.name));
    const modelConfiguration = {
      model: process.env.GEMINI_MODEL || 'gemini-2.5-flash',
      systemInstruction: `
Eres Nucleus AI, asistente táctico de SmartShip PRO. Responde de forma concisa, profesional y náutica.

POSICIÓN DEL BUQUE
${locationReport}

REGLAS DE SEGURIDAD
- No inventes telemetría, meteorología, batimetría, AIS ni estado de sistemas.
- Distingue con claridad datos instrumentales, cálculos e información no disponible.
- Una llamada a herramienta expresa una solicitud; nunca afirmes que la maniobra ya fue ejecutada.
- Para acciones críticas, conserva la autoridad final del Almirante.

${systemInstruction || 'Aplica el protocolo estándar de asistencia al puente.'}
      `.trim()
    };

    if (body.isJson === true) {
      modelConfiguration.generationConfig = { responseMimeType: 'application/json' };
    }
    if (requestedTools.length > 0 && body.isJson !== true) {
      modelConfiguration.tools = [{ functionDeclarations: requestedTools }];
    }

    const model = genAI.getGenerativeModel(modelConfiguration);
    const result = await model.generateContent(prompt);
    const response = await result.response;
    const rawFunctionCalls = typeof response.functionCalls === 'function'
      ? response.functionCalls()
      : [];
    const functionCalls = sanitizeFunctionCalls(rawFunctionCalls, enabledToolNames);
    const text = response.text().trim();
    let data;
    if (body.isJson === true) {
      try {
        data = JSON.parse(text);
      } catch {
        return res.status(502).json({ error: 'El modelo devolvió JSON inválido' });
      }
    }

    return res.json({
      text: text || (functionCalls.length > 0 ? 'Orden preparada para confirmación.' : 'Sin respuesta del modelo.'),
      functionCalls,
      ...(body.isJson === true ? { data } : {}),
      processingMs: Date.now() - requestStartedAt
    
    });
  }  catch (error) {

  console.error(
    '❌ ERROR GEMINI COMPLETO:',
    error
  );

  const message =
    error instanceof Error
      ? error.message
      : String(error);

  console.error(
    '❌ MENSAJE:',
    message
  );

  return res.status(503).json({
    error: message
  });
}
});
// ===== PRUEBA OPENAI =====

app.post('/api/chat-openai', async (req, res) => {

  try {

    const { prompt } = req.body;

    const response =
      await openai.responses.create({
        model: "gpt-5-mini",
        input: prompt
      });

    res.json({
      text: response.output_text
    });

  } catch (error) {

    console.error(error);

    res.status(500).json({
      error: error.message
    });

  }

});
// Endpoint de Salud
app.get('/health', (req, res) => res.status(200).send('OK'));

app.get('/api/almirantazgo/usuarios', async (req, res) => {
  if (!supabase) {
    return res.status(503).json({ error: 'Supabase no está configurado en el backend' });
  }

  try {
    // Tu servidor ignora las restricciones del frontend y lee la vista directamente
    const { data, error } = await supabase
      .from('vista_administracion_usuarios')
      .select('*');
    
    if (error) throw error;
    res.json(data);
  } catch (error) {
    console.error("❌ Error en Menú Almirantazgo:", error.message);
    res.status(500).json({ error: "Acceso denegado a la suite de administración." });
  }
  });

  // Ejemplo para descargar un archivo de forma segura desde el backend
app.get('/api/archivos/:nombreArchivo', async (req, res) => {
  if (!supabase) {
    return res.status(503).json({ error: 'Supabase no está configurado en el backend' });
  }

  const { nombreArchivo } = req.params;
  
  const { data, error } = await supabase.storage
    .from('tu-bucket-privado')
    .download(nombreArchivo);

  if (error) return res.status(404).json({ error: "Archivo no encontrado" });
  
  // Enviar el archivo de vuelta al frontend
  const buffer = Buffer.from(await data.arrayBuffer());
  res.send(buffer);
});

// 🛥️ ENDPOINT: Obtener Flota
app.get('/api/flota', async (req, res) => {
  // ... implementación única ...
});

let server = null;

function startMapServer(port = PORT) {
  if (server) return server;

  server = app.listen(port, () => {
    console.log(`[SERVER] SmartShip PRO backend escuchando en http://localhost:${port}`);
  });

  server.on('error', (error) => {
    console.error('[SERVER] No se pudo iniciar el backend:', error);
    server = null;
  });

  return server;
}

function stopMapServer() {
  if (!server) return;
  server.close();
  server = null;
}

if (require.main === module) {
  startMapServer();
}

module.exports = { app, startMapServer, stopMapServer };
