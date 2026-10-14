require('dotenv').config(); // Carga las variables de entorno desde el archivo .env
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { execFile } = require('child_process');
const MBTiles = require('@mapbox/mbtiles');
const { GoogleGenerativeAI } = require("@google/generative-ai");
const OpenAI = require("openai");
const apiKey = process.env.OPENAI_API_KEY;

let openai = null;

if (apiKey) {
    openai = new OpenAI({ apiKey });
    
} else {
    
}
const { createClient } = require('@supabase/supabase-js');
const WebSocket = require('ws');
const app = express();
const PORT = 8089;

// Middleware de seguridad y utilidad
// Solo la propia interfaz de VELARIS. Antes era '*': cualquier web abierta en el navegador podía
// leer este backend a través de localhost. El renderer de Electron no depende de CORS.
const ALLOWED_ORIGINS = new Set(['http://localhost:3000', 'http://127.0.0.1:3000']);
app.use(cors({ origin: (origin, callback) => callback(null, !origin || ALLOWED_ORIGINS.has(origin)) }));
app.use(express.json({ limit: '256kb' }));

let currentChartsPath = "";
let mbtilesInstances = {};
let mbtilesSchemes = {};
const s57LayerNameCache = new Map();
const encPreviewCache = new Map();
const ENC_PREVIEW_LAYER_NAMES = Object.freeze([
  'DEPARE', 'DEPCNT', 'SOUNDG', 'COALNE', 'LNDARE', 'LAKARE', 'OBSTRN', 'UWTROC', 'WRECKS',
  'LIGHTS', 'BOYLAT', 'BOYSPP', 'BCNLAT', 'BCNSPP', 'DAYMAR', 'PILPNT', 'FAIRWY', 'RESARE',
  'M_COVR', 'M_QUAL', 'BRIDGE', 'SLCONS', 'BUISGL'
]);

function resolveChartFile(filename) {
  if (!currentChartsPath || !fs.existsSync(currentChartsPath)) return null;

  const requestedName = String(filename);
  const requestedLower = requestedName.toLowerCase();
  const files = fs.readdirSync(currentChartsPath);
  const exactName = files.find(file => file.toLowerCase() === requestedLower)
    || (!requestedLower.endsWith('.mbtiles')
      ? files.find(file => file.toLowerCase() === `${requestedLower}.mbtiles`)
      : null);

  return exactName ? path.join(currentChartsPath, exactName) : null;
}

function resolveEncFile(filename) {
  if (!currentChartsPath || !fs.existsSync(currentChartsPath)) return null;

  const requestedName = String(filename || '');
  if (!requestedName || path.basename(requestedName) !== requestedName) return null;

  const extension = path.extname(requestedName).toLowerCase();
  if (extension !== '.zip' && extension !== '.000') return null;

  const root = path.resolve(currentChartsPath);
  const actualName = fs.readdirSync(root).find(file => file.toLowerCase() === requestedName.toLowerCase());
  if (!actualName) return null;

  const fullPath = path.resolve(root, actualName);
  if (path.dirname(fullPath) !== root || !fs.statSync(fullPath).isFile()) return null;
  return fullPath;
}

function resolveGdalExecutable(name) {
  const configuredDirectory = process.env.VELARIS_GDAL_DIR;
  const candidates = [
    configuredDirectory ? path.join(configuredDirectory, `${name}.exe`) : null,
    process.platform === 'win32' ? path.join('C:\\Program Files (x86)\\GDAL', `${name}.exe`) : null,
    process.platform === 'win32' ? path.join('C:\\Program Files\\GDAL', `${name}.exe`) : null,
    process.platform === 'win32' ? `${name}.exe` : name
  ].filter(Boolean);

  return candidates.find(candidate => candidate === `${name}.exe` || candidate === name || fs.existsSync(candidate)) || null;
}

function runGdal(executable, args, timeout = 45_000, maxBuffer = 8 * 1024 * 1024) {
  const binDirectory = path.dirname(executable);
  const dataDirectory = path.join(binDirectory, 'gdal-data');
  const pluginDirectory = path.join(binDirectory, 'gdalplugins');
  const env = {
    ...process.env,
    PATH: [binDirectory, process.env.PATH || ''].filter(Boolean).join(path.delimiter),
    ...(fs.existsSync(dataDirectory) ? { GDAL_DATA: dataDirectory } : {}),
    ...(fs.existsSync(pluginDirectory) ? { GDAL_DRIVER_PATH: pluginDirectory } : {})
  };

  return new Promise((resolve, reject) => {
    execFile(executable, args, { env, timeout, maxBuffer, windowsHide: true }, (error, stdout, stderr) => {
      if (error && (error.code === 'ENOENT' || error.killed)) {
        return reject(error);
      }
      resolve({
        stdout: stdout || '',
        stderr: stderr || '',
        exitCode: error && typeof error.code === 'number' ? error.code : 0
      });
    });
  });
}

async function resolveS57Dataset(chartPath) {
  if (path.extname(chartPath).toLowerCase() === '.000') return chartPath;

  const gdalinfo = resolveGdalExecutable('gdalinfo');
  if (!gdalinfo) throw new Error('GDAL no está disponible. Instala GDAL o configura VELARIS_GDAL_DIR.');

  const virtualZipPath = `/vsizip/${path.resolve(chartPath).replace(/\\/g, '/')}`;
  const listing = await runGdal(gdalinfo, [virtualZipPath]);
  const output = `${listing.stdout}\n${listing.stderr}`;
  const cells = [...new Set(output.match(/\/vsizip\/[^\r\n]*?\.000\b/g) || [])];

  if (cells.length === 0) throw new Error('El ZIP no contiene una celda S-57 .000 reconocible.');
  if (cells.length > 1) throw new Error('El ZIP contiene varias celdas .000; esta vista previa admite una celda por archivo.');
  return cells[0].trim();
}

function parseS57Layers(output) {
  const sections = output.split(/(?=^Layer name: )/m).filter(section => /^Layer name: /m.test(section));
  return sections.map(section => {
    const name = (section.match(/^Layer name: (.+)$/m) || [])[1]?.trim() || 'UNKNOWN';
    const geometry = (section.match(/^Geometry: (.+)$/m) || [])[1]?.trim() || 'Unknown';
    const countText = (section.match(/^Feature Count: (\d+)$/m) || [])[1];
    const extentText = (section.match(/^Extent: \(([-\d.]+), ([-\d.]+)\) - \(([-\d.]+), ([-\d.]+)\)$/m) || []).slice(1);
    const schema = section.split(/^Layer SRS WKT:/m)[0];
    const fields = [...schema.matchAll(/^([A-Za-z][A-Za-z0-9_]*)\s*:\s*(?:Integer64|Integer|Real|StringList|IntegerList|RealList|String|Binary|DateTime|Date|Time)\b/gm)]
      .map(match => match[1]);

    return {
      name,
      geometry,
      featureCount: countText ? Number(countText) : null,
      extent: extentText.length === 4 ? extentText.map(Number) : null,
      fields
    };
  });
}

async function inspectS57Chart(chartPath) {
  const ogrinfo = resolveGdalExecutable('ogrinfo');
  if (!ogrinfo) throw new Error('GDAL/OGR no está disponible. Instala GDAL o configura VELARIS_GDAL_DIR.');

  const dataset = await resolveS57Dataset(chartPath);
  const inspection = await runGdal(ogrinfo, ['-ro', '-al', '-so', '-oo', 'UPDATES=APPLY', dataset]);
  const output = `${inspection.stdout}\n${inspection.stderr}`;
  if (inspection.exitCode !== 0) throw new Error('OGR no pudo leer la celda S-57. Comprueba que el ZIP contiene una ENC NOAA válida.');

  const layers = parseS57Layers(output);
  if (layers.length === 0) throw new Error('OGR no devolvió capas para esta celda S-57.');

  const metadataResult = await runGdal(ogrinfo, ['-ro', '-al', '-oo', 'UPDATES=APPLY', dataset, 'DSID']);
  const metadataOutput = `${metadataResult.stdout}\n${metadataResult.stderr}`;
  const metadata = Object.fromEntries(
    [...metadataOutput.matchAll(/^\s+([A-Z0-9_]+) \([^)]+\) = (.*)$/gm)].map(match => [match[1], match[2].trim()])
  );
  const version = await runGdal(ogrinfo, ['--version']);

  const bounds = layers.reduce((result, layer) => {
    if (!layer.extent) return result;
    if (!result) return [...layer.extent];
    return [
      Math.min(result[0], layer.extent[0]),
      Math.min(result[1], layer.extent[1]),
      Math.max(result[2], layer.extent[2]),
      Math.max(result[3], layer.extent[3])
    ];
  }, null);
  const fileStat = fs.statSync(chartPath);
  const sourceVersion = `${path.resolve(chartPath).toLowerCase()}|${fileStat.size}|${fileStat.mtimeMs}`;
  s57LayerNameCache.set(sourceVersion, layers.map(layer => layer.name));
  while (s57LayerNameCache.size > 20) s57LayerNameCache.delete(s57LayerNameCache.keys().next().value);

  return {
    sourceName: path.basename(chartPath),
    cellName: metadata.DSID_DSNM || path.basename(dataset),
    edition: metadata.DSID_EDTN || null,
    updateNumber: metadata.DSID_UPDN || null,
    updateApplicationDate: metadata.DSID_UADT || null,
    updateMode: 'APPLY',
    gdalVersion: version.stdout.trim(),
    bounds,
    layerCount: layers.length,
    totalLayerFeatures: layers.reduce((total, layer) => total + (layer.featureCount || 0), 0),
    layers
  };
}

function parsePreviewBounds(rawBounds) {
  if (typeof rawBounds !== 'string') return null;
  const values = rawBounds.split(',').map(value => Number(value.trim()));
  if (values.length !== 4 || !values.every(Number.isFinite)) return null;
  const [west, south, east, north] = values;
  if (west < -180 || east > 180 || south < -90 || north > 90) return null;
  if (west >= east || south >= north || east - west > 2 || north - south > 2) return null;
  return values.map(value => Number(value.toFixed(5)));
}

async function exportEncPreview(chartPath, bounds) {
  const ogr2ogr = resolveGdalExecutable('ogr2ogr');
  if (!ogr2ogr) throw new Error('GDAL/OGR no está disponible. Instala ogr2ogr o configura VELARIS_GDAL_DIR.');

  // GDAL can inspect a ZIP through /vsizip/, but ogr2ogr must receive the
  // resolved S-57 cell inside it to reliably select and export feature layers.
  const dataset = await resolveS57Dataset(chartPath);

  const fileStat = fs.statSync(chartPath);
  const sourceVersion = `${path.resolve(chartPath).toLowerCase()}|${fileStat.size}|${fileStat.mtimeMs}`;
  let availableLayers = s57LayerNameCache.get(sourceVersion);
  if (!availableLayers) {
    const inspection = await inspectS57Chart(chartPath);
    availableLayers = inspection.layers.map(layer => layer.name);
  }

  const selectedLayers = ENC_PREVIEW_LAYER_NAMES.filter(name => availableLayers.includes(name));
  if (selectedLayers.length === 0) throw new Error('La celda no contiene capas S-57 compatibles con la vista previa.');

  const cacheKey = `${sourceVersion}|${bounds.join(',')}`;
  const cached = encPreviewCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.data;

  const results = new Array(selectedLayers.length);
  let nextIndex = 0;
  const worker = async () => {
    while (nextIndex < selectedLayers.length) {
      const index = nextIndex++;
      const layerName = selectedLayers[index];
      const args = [
        '-f', 'GeoJSON', '/vsistdout/',
        '-spat', String(bounds[0]), String(bounds[1]), String(bounds[2]), String(bounds[3]),
        '-clipsrc', String(bounds[0]), String(bounds[1]), String(bounds[2]), String(bounds[3]),
        dataset,
        layerName
      ];
      const output = await runGdal(ogr2ogr, args, 45_000, 16 * 1024 * 1024);
      if (output.exitCode !== 0) throw new Error(`OGR no pudo exportar la capa ${layerName}.`);

      const collection = JSON.parse(output.stdout);
      if (!collection || collection.type !== 'FeatureCollection' || !Array.isArray(collection.features)) {
        throw new Error(`OGR devolvió GeoJSON inválido para la capa ${layerName}.`);
      }
      for (const feature of collection.features) {
        if (!feature.properties || typeof feature.properties !== 'object') feature.properties = {};
        feature.properties.__s57Layer = layerName;
      }
      results[index] = collection.features;
    }
  };

  await Promise.all(Array.from({ length: Math.min(3, selectedLayers.length) }, () => worker()));
  const data = {
    type: 'FeatureCollection',
    features: results.flat(),
    layersIncluded: selectedLayers
  };
  encPreviewCache.set(cacheKey, { data, expiresAt: Date.now() + 30_000 });
  while (encPreviewCache.size > 12) encPreviewCache.delete(encPreviewCache.keys().next().value);
  return data;
}

function readDeclaredScheme(mbtiles, callback) {
  if (!mbtiles._db || typeof mbtiles._db.get !== 'function') {
    return callback(null, 'tms');
  }

  mbtiles._db.get(
    "SELECT value FROM metadata WHERE name = 'scheme' LIMIT 1",
    (err, row) => {
      if (err) return callback(err);
      const declaredScheme = row && typeof row.value === 'string'
        ? row.value.trim().toLowerCase()
        : '';
      callback(null, declaredScheme === 'xyz' ? 'xyz' : 'tms');
    }
  );
}

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
    delete mbtilesSchemes[key];
  });
  
  
  res.json({ success: true, path: currentChartsPath });
});

// --- SERVIDOR DE TESELAS DINÁMICO ---
app.get('/tiles/:filename/:z/:x/:y.png', (req, res) => {
  const { filename, z, x, y } = req.params;
  const zoom = Number.parseInt(z, 10);
  const column = Number.parseInt(x, 10);
  const row = Number.parseInt(y, 10);
  const mbtilesFile = resolveChartFile(filename);

  if (!mbtilesFile) return res.status(404).send('Carta no encontrada en el repositorio');
  if (![zoom, column, row].every(Number.isInteger) || zoom < 0 || column < 0 || row < 0) {
    return res.status(404).send('Tesela inexistente');
  }

  const cacheKey = mbtilesFile.toLowerCase();
  const serveTile = (mbtiles, scheme) => {
    console.info(`[MBTiles] Tile request: z=${zoom} x=${column} y=${row}`);
    // @mapbox/mbtiles.getTile() always flips its input Y for TMS storage.
    // Pass the complementary value for XYZ files so the physical row is unchanged.
    const libraryRow = scheme === 'xyz'
      ? Math.pow(2, zoom) - 1 - row
      : row;

    mbtiles.getTile(zoom, column, libraryRow, (err, data, headers) => {
      if (err) {
        if (err.message === 'Tile does not exist') {
          return res.status(404).send('Tesela inexistente');
        }
        return res.status(500).send(err.message);
      }
      console.info('[MBTiles] Tile found');
      res.set(headers);
      res.send(data);
    });
  };

  if (!mbtilesInstances[cacheKey]) {
    new MBTiles(`${mbtilesFile}?mode=ro`, (err, mbtiles) => {
      if (err) return res.status(500).send(err.message);
      readDeclaredScheme(mbtiles, (schemeErr, scheme) => {
        if (schemeErr) {
          return mbtiles.close(() => res.status(500).send(schemeErr.message));
        }
        mbtilesInstances[cacheKey] = mbtiles;
        mbtilesSchemes[cacheKey] = scheme;
        console.info(`[MBTiles] Chart loaded: ${path.basename(mbtilesFile)}`);
        console.info(`[MBTiles] Scheme: ${scheme}`);
        serveTile(mbtiles, scheme);
      });
    });
  } else {
    serveTile(mbtilesInstances[cacheKey], mbtilesSchemes[cacheKey]);
  }
});


// 🔐 SEGURIDAD: API key solo se carga en el servidor (NUNCA en cliente)
// La ausencia de Gemini no debe derribar teselas, salud ni otros servicios locales.
const genAI = process.env.GEMINI_API_KEY
  ? new GoogleGenerativeAI(process.env.GEMINI_API_KEY)
  : null;



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
          if (err) return resolve({
            name: file,
            filename: file,
            bounds: null,
            center: null,
            minzoom: null,
            maxzoom: null,
            format: null,
            scheme: null
          });
          mbtiles.getInfo((infoErr, info) => {
            mbtiles.close(() => {
              if (infoErr) {
                return resolve({
                  name: file,
                  filename: file,
                  bounds: null,
                  center: null,
                  minzoom: null,
                  maxzoom: null,
                  format: null,
                  scheme: null
                });
              }

              resolve({
                name: file,
                filename: file,
                bounds: info.bounds ?? null,
                center: info.center ?? null,
                minzoom: info.minzoom ?? null,
                maxzoom: info.maxzoom ?? null,
                format: info.format ?? null,
                scheme: info.scheme ?? null
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

// Catálogo informativo de ENC S-57. Se mantiene separado de /api/charts:
// el renderer de MBTiles no debe tratar una ENC como una fuente de teselas.
app.get('/api/enc-charts', (req, res) => {
  if (!currentChartsPath || !fs.existsSync(currentChartsPath)) return res.json([]);

  try {
    const files = fs.readdirSync(currentChartsPath, { withFileTypes: true })
      .filter(entry => entry.isFile() && /\.(zip|000)$/i.test(entry.name))
      .map(entry => ({ name: entry.name }));
    return res.json(files);
  } catch (error) {
    console.error('[ENC] No se pudo enumerar el directorio de cartas:', error.message);
    return res.status(500).json({ error: 'No se pudo leer el directorio de cartas.' });
  }
});

app.get('/api/enc-charts/:filename/inspect', async (req, res) => {
  try {
    const chartPath = resolveEncFile(req.params.filename);
    if (!chartPath) return res.status(404).json({ error: 'Archivo ENC no encontrado.' });

    return res.json(await inspectS57Chart(chartPath));
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Error al inspeccionar la ENC.';
    console.error(`[ENC] Inspección fallida (${req.params.filename}): ${message}`);
    const status = /GDAL|OGR no está disponible/i.test(message) ? 503 : 422;
    return res.status(status).json({ error: message });
  }
});

app.get('/api/enc-charts/:filename/preview', async (req, res) => {
  try {
    const chartPath = resolveEncFile(req.params.filename);
    if (!chartPath) return res.status(404).json({ error: 'Archivo ENC no encontrado.' });

    const bounds = parsePreviewBounds(req.query.bbox);
    if (!bounds) {
      return res.status(400).json({ error: 'Se requiere bbox=Oeste,Sur,Este,Norte en WGS84; extensión máxima 2°.' });
    }

    return res.json(await exportEncPreview(chartPath, bounds));
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Error al generar la vista previa ENC.';
    console.error(`[ENC] Vista previa fallida (${req.params.filename}): ${message}`);
    const status = /GDAL|OGR no está disponible/i.test(message) ? 503 : 422;
    return res.status(status).json({ error: message });
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
Eres Nucleus AI, asistente táctico de VELARIS. Responde de forma concisa, profesional y náutica.

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

    if (!openai) {
        return res.status(503).json({
            error: "OpenAI no está configurado en este servidor."
        });
    }

    try {

        const { prompt } = req.body;

        const response = await openai.responses.create({
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

// Endpoints que usan la clave de servicio de Supabase (salta la RLS). No se usan desde la interfaz y
// no deben existir en equipos de usuario: desactivados salvo VELARIS_ENABLE_ADMIN_API=1 (desarrollo).
const ADMIN_API_ENABLED = process.env.VELARIS_ENABLE_ADMIN_API === '1';
app.use(['/api/almirantazgo', '/api/archivos', '/api/flota'], (req, res, next) => {
  if (ADMIN_API_ENABLED) return next();
  return res.status(403).json({ error: 'API de administración desactivada en este equipo' });
});

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

  // Solo loopback: el backend local (cartas, chat) no debe ser accesible desde la Wi-Fi.
  server = app.listen(port, '127.0.0.1', () => {
    
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
