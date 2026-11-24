require('dotenv').config(); // Carga las variables de entorno desde el archivo .env
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { execFile } = require('child_process');
const MBTiles = require('@mapbox/mbtiles');
const OpenAI = require("openai");
const apiKey = process.env.OPENAI_API_KEY;

// Credentials remain server-side. Do not retry prompts that can request actions.
let openai = apiKey ? new OpenAI({ apiKey, timeout: 25_000, maxRetries: 0 }) : null;
const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-5-mini';
function configureOpenAIKey(key) {
  if (typeof key !== 'string' || key.length < 20 || key.length > 512 || /\s/.test(key)) throw new Error('Invalid OpenAI credential');
  openai = new OpenAI({ apiKey: key, timeout: 25_000, maxRetries: 0 });
  aiBlockedUntil = 0;
}
function getOpenAIStatus() { return { configured: Boolean(openai), model: OPENAI_MODEL }; }

const app = express();
const PORT = 8089;

const { timingSafeEqual } = require('node:crypto');

let desktopToken = null;

function configureDesktopAuthentication(token) {
  if (typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token)) {
    throw new Error('INVALID_DESKTOP_TOKEN');
  }

  desktopToken = token;
}

function validDesktopToken(value) {
  if (!desktopToken || typeof value !== 'string') return false;

  const expected = Buffer.from(desktopToken);
  const received = Buffer.from(value);

  return expected.length === received.length &&
    timingSafeEqual(expected, received);
}

// Middleware de seguridad y utilidad
// Solo la propia interfaz de GAULOS. Antes era '*': cualquier web abierta en el navegador podÃ­a
// leer este backend a travÃ©s de localhost. El renderer de Electron no depende de CORS.
const ALLOWED_ORIGINS = new Set(['http://localhost:3000', 'http://127.0.0.1:3000']);
app.disable('x-powered-by');

app.use((req, res, next) => {
  const host = req.headers.host || '';

  if (!/^(127\.0\.0\.1|localhost)(:\d+)?$/i.test(host)) {
    return res.status(403).json({ error: 'INVALID_HOST' });
  }

  const origin = req.headers.origin;
  const trustedOrigin =
    origin === 'null' || ALLOWED_ORIGINS.has(origin);

  if (origin && !trustedOrigin) {
    return res.status(403).json({ error: 'ORIGIN_DENIED' });
  }

  if (req.method === 'OPTIONS') {
    if (!trustedOrigin) {
      return res.status(403).end();
    }

    return next();
  }

  if (desktopToken &&
      !validDesktopToken(req.headers['x-gaulos-desktop-token'])) {
    return res.status(401).json({ error: 'DESKTOP_AUTH_REQUIRED' });
  }

  if (!desktopToken && origin === 'null') {
    return res.status(403).json({ error: 'ORIGIN_DENIED' });
  }

  next();
});

app.use(cors({
  origin: (origin, callback) => {
    callback(
      null,
      !origin ||
      ALLOWED_ORIGINS.has(origin) ||
      (origin === 'null' && Boolean(desktopToken))
    );
  },
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'X-Gaulos-Desktop-Token'],
  maxAge: 600,
}));
app.use(express.json({ limit: '512kb' }));

// Packaged builds use compiled TypeScript; development uses the existing tsx dependency.
const geographicSource = path.join(__dirname, 'src/main/geography/geographicResolver.ts');
const geographicCompiled = [
  path.join(__dirname, 'dist-main/src/main/geography/geographicResolver.js'),
  path.join(__dirname, 'src/main/geography/geographicResolver.js')
].find(filename => fs.existsSync(filename));
const useGeographicSource = fs.existsSync(geographicSource) && !(process.versions.electron && require('electron').app.isPackaged);
if (useGeographicSource) require('tsx/cjs');
if (!useGeographicSource && !geographicCompiled) throw new Error('GEOGRAPHY_BUILD_MISSING');
const { GeographicResolver, NominatimProvider } = require(useGeographicSource ? geographicSource : geographicCompiled);
const geographicCacheRoot = process.versions.electron ? require('electron').app.getPath('userData') : path.join(process.env.LOCALAPPDATA || __dirname, 'GAULOS');
const geography = new GeographicResolver(new NominatimProvider(process.env.GAULOS_GEOCODER_URL || undefined), path.join(geographicCacheRoot, 'geography-cache-v1.json'));
let geographicRequests = 0;
app.post('/api/geographic-resolve', async (req, res) => {
  const { query, kind = 'PLACE', offline = false } = req.body || {};
  if (typeof query !== 'string' || !query.trim() || query.length > 200 || !/\p{L}/u.test(query) || /[\x00-\x1f]/.test(query) ||
      !['PLACE','LOCALITY','PORT','PORT_ENTRANCE','ISLAND','CAPE'].includes(kind) || typeof offline !== 'boolean') return res.status(400).json({error:'GEOGRAPHY_INVALID_QUERY'});
  if (geographicRequests >= 8) return res.status(429).json({error:'GEOGRAPHY_BUSY'});
  geographicRequests++;
  try { res.json(await geography.resolve(query,kind,offline)); }
  catch { res.status(503).json({error:'GEOGRAPHY_UNAVAILABLE'}); }
  finally { geographicRequests--; }
});

let currentChartsPath = "";
let mbtilesInstances = {};
let mbtilesSchemes = {};
const s57LayerNameCache = new Map();
const s57DatasetMetadataCache = new Map();
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
  const executableName = process.platform === 'win32' ? `${name}.exe` : name;
  const candidates = [
    configuredDirectory ? path.join(configuredDirectory, executableName) : null,
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
  if (!gdalinfo) throw new Error('GDAL no estÃ¡ disponible. Instala GDAL o configura GAULOS_GDAL_DIR.');

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
  if (!ogrinfo) throw new Error('GDAL/OGR no estÃ¡ disponible. Instala GDAL o configura GAULOS_GDAL_DIR.');

  const dataset = await resolveS57Dataset(chartPath);
  const inspection = await runGdal(ogrinfo, ['-ro', '-al', '-so', '-oo', 'UPDATES=APPLY', dataset]);
  const output = `${inspection.stdout}\n${inspection.stderr}`;
  if (inspection.exitCode !== 0) throw new Error('OGR no pudo leer la celda S-57. Comprueba que el ZIP contiene una ENC NOAA vÃ¡lida.');

  const layers = parseS57Layers(output);
  if (layers.length === 0) throw new Error('OGR no devolviÃ³ capas para esta celda S-57.');

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
  const datasetParameters = {
    depthUnitCode: metadata.DSPM_DUNI ?? null,
    coordinateUnitCode: metadata.DSPM_COUN ?? null,
    horizontalDatumCode: metadata.DSPM_HDAT ?? null,
    soundingDatumCode: metadata.DSPM_SDAT ?? null
  };
  s57LayerNameCache.set(sourceVersion, layers.map(layer => layer.name));
  s57DatasetMetadataCache.set(sourceVersion, datasetParameters);
  while (s57LayerNameCache.size > 20) s57LayerNameCache.delete(s57LayerNameCache.keys().next().value);
  while (s57DatasetMetadataCache.size > 20) s57DatasetMetadataCache.delete(s57DatasetMetadataCache.keys().next().value);

  return {
    sourceName: path.basename(chartPath),
    cellName: metadata.DSID_DSNM || path.basename(dataset),
    edition: metadata.DSID_EDTN || null,
    updateNumber: metadata.DSID_UPDN || null,
    updateApplicationDate: metadata.DSID_UADT || null,
    updateMode: 'APPLY',
    datasetParameters,
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

function isCoordinatePosition(value) {
  return Array.isArray(value) && value.length >= 2 && value.every(component => !Array.isArray(component));
}

function collectGeometryPositions(value, positions) {
  if (isCoordinatePosition(value)) {
    positions.push(value);
    return;
  }
  if (Array.isArray(value)) value.forEach(child => collectGeometryPositions(child, positions));
}

function validateEncGeometry(geometry, summary, layerName) {
  if (!geometry || typeof geometry !== 'object' || typeof geometry.type !== 'string') return false;
  const positions = [];
  if (geometry.type === 'GeometryCollection') {
    if (!Array.isArray(geometry.geometries) || geometry.geometries.length === 0) return false;
    const childResults = geometry.geometries.map(child => validateEncGeometry(child, summary, layerName));
    return childResults.every(Boolean);
  }
  collectGeometryPositions(geometry.coordinates, positions);
  let structureValid = positions.length > 0;
  const coordinates = geometry.coordinates;
  const lineValid = line => Array.isArray(line) && line.length >= 2 && line.every(isCoordinatePosition);
  const ringValid = ring => {
    if (!Array.isArray(ring) || ring.length < 4 || !ring.every(isCoordinatePosition)) return false;
    const first = ring[0];
    const last = ring[ring.length - 1];
    return Math.abs(first[0] - last[0]) <= 1e-8 && Math.abs(first[1] - last[1]) <= 1e-8;
  };

  switch (geometry.type) {
    case 'Point': structureValid = isCoordinatePosition(coordinates); break;
    case 'MultiPoint': structureValid = Array.isArray(coordinates) && coordinates.length > 0 && coordinates.every(isCoordinatePosition); break;
    case 'LineString': structureValid = lineValid(coordinates); break;
    case 'MultiLineString': structureValid = Array.isArray(coordinates) && coordinates.length > 0 && coordinates.every(lineValid); break;
    case 'Polygon': structureValid = Array.isArray(coordinates) && coordinates.length > 0 && coordinates.every(ringValid); break;
    case 'MultiPolygon': structureValid = Array.isArray(coordinates) && coordinates.length > 0 && coordinates.every(polygon => Array.isArray(polygon) && polygon.length > 0 && polygon.every(ringValid)); break;
    default: structureValid = false;
  }

  for (const position of positions) {
    summary.checkedPositions += 1;
    const valid = position.every(component => typeof component === 'number' && Number.isFinite(component))
      && position[0] >= -180 && position[0] <= 180
      && position[1] >= -90 && position[1] <= 90;
    if (!valid) summary.invalidCoordinates += 1;
    if (layerName === 'SOUNDG') {
      summary.soundingPoints += 1;
      if (position.length < 3 || !Number.isFinite(position[2])) summary.soundingsMissingDepth += 1;
    }
  }
  return structureValid && positions.every(position => position.every(component => typeof component === 'number' && Number.isFinite(component)));
}

function isFiniteNumericValue(value) {
  const values = Array.isArray(value) ? value : [value];
  return values.length > 0 && values.every(item => {
    if (typeof item === 'number') return Number.isFinite(item);
    if (typeof item !== 'string' || item.trim() === '') return false;
    return Number.isFinite(Number(item.trim()));
  });
}

const S57_ATTRIBUTE_CODE_RANGES = Object.freeze({
  COLOUR: [1, 13],
  BOYSHP: [1, 8],
  BCNSHP: [1, 7],
  CATLAM: [1, 4],
  COLPAT: [1, 6]
});

function isValidS57CodeList(value, minimum, maximum) {
  const values = (Array.isArray(value) ? value : [value]).flatMap(item => {
    if (typeof item === 'number') return [item];
    if (typeof item !== 'string') return [];
    return item.split(/[\s,]+/).filter(Boolean).map(Number);
  });
  return values.length > 0 && values.every(code => Number.isInteger(code) && code >= minimum && code <= maximum);
}

function validateEncPreview(features, datasetParameters = {}) {
  const summary = {
    checkedFeatures: features.length,
    checkedPositions: 0,
    invalidCoordinates: 0,
    invalidGeometries: 0,
    soundingPoints: 0,
    soundingsMissingDepth: 0,
    invalidDepthAttributes: 0,
    invalidCodedAttributes: 0,
    missingDepthRanges: 0,
    depthRangeOrderErrors: 0,
    missingDepthContours: 0,
    depthUnitCode: datasetParameters.depthUnitCode,
    coordinateUnitCode: datasetParameters.coordinateUnitCode,
    horizontalDatumCode: datasetParameters.horizontalDatumCode
  };

  for (const feature of features) {
    const layerName = feature?.properties?.__s57Layer;
    if (!validateEncGeometry(feature?.geometry, summary, layerName)) summary.invalidGeometries += 1;
    const properties = feature?.properties && typeof feature.properties === 'object' ? feature.properties : {};
    for (const key of ['VALSOU', 'DRVAL1', 'DRVAL2', 'VALDCO']) {
      if (properties[key] !== null && properties[key] !== undefined && properties[key] !== '' && !isFiniteNumericValue(properties[key])) {
        summary.invalidDepthAttributes += 1;
      }
    }
    for (const [key, [minimum, maximum]] of Object.entries(S57_ATTRIBUTE_CODE_RANGES)) {
      if (properties[key] !== null && properties[key] !== undefined && properties[key] !== '' && !isValidS57CodeList(properties[key], minimum, maximum)) {
        summary.invalidCodedAttributes += 1;
      }
    }
    if (layerName === 'DEPARE') {
      if (!isFiniteNumericValue(properties.DRVAL1) || !isFiniteNumericValue(properties.DRVAL2)) {
        summary.missingDepthRanges += 1;
      } else if (Number(properties.DRVAL1) > Number(properties.DRVAL2)) {
        summary.depthRangeOrderErrors += 1;
      }
    }
    if (layerName === 'DEPCNT' && !isFiniteNumericValue(properties.VALDCO)) summary.missingDepthContours += 1;
  }
  return summary;
}

async function exportEncPreview(chartPath, bounds) {
  const ogr2ogr = resolveGdalExecutable('ogr2ogr');
  if (!ogr2ogr) throw new Error('GDAL/OGR no estÃ¡ disponible. Instala ogr2ogr o configura GAULOS_GDAL_DIR.');

  // GDAL can inspect a ZIP through /vsizip/, but ogr2ogr must receive the
  // resolved S-57 cell inside it to reliably select and export feature layers.
  const dataset = await resolveS57Dataset(chartPath);

  const fileStat = fs.statSync(chartPath);
  const sourceVersion = `${path.resolve(chartPath).toLowerCase()}|${fileStat.size}|${fileStat.mtimeMs}`;
  let availableLayers = s57LayerNameCache.get(sourceVersion);
  if (!availableLayers || !s57DatasetMetadataCache.has(sourceVersion)) {
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
        throw new Error(`OGR devolviÃ³ GeoJSON invÃ¡lido para la capa ${layerName}.`);
      }
      for (const feature of collection.features) {
        if (!feature.properties || typeof feature.properties !== 'object') feature.properties = {};
        feature.properties.__s57Layer = layerName;
      }
      results[index] = collection.features;
    }
  };

  await Promise.all(Array.from({ length: Math.min(3, selectedLayers.length) }, () => worker()));
  const features = results.flat();
  const data = {
    type: 'FeatureCollection',
    features,
    layersIncluded: selectedLayers,
    validation: validateEncPreview(features, s57DatasetMetadataCache.get(sourceVersion))
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

// --- CONFIGURACIÃ“N DINÃMICA DEL REPOSITORIO ---
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

// --- SERVIDOR DE TESELAS DINÃMICO ---
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


// OpenAI credentials are loaded only in the server process.
// --- ENDPOINTS ---

// ðŸ¤– Endpoint de Chat Seguro con UbicaciÃ³n DinÃ¡mica en Tiempo Real
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

// CatÃ¡logo informativo de ENC S-57. Se mantiene separado de /api/charts:
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
    console.error(`[ENC] InspecciÃ³n fallida (${req.params.filename}): ${message}`);
    const status = /GDAL|OGR no estÃ¡ disponible/i.test(message) ? 503 : 422;
    return res.status(status).json({ error: message });
  }
});

app.get('/api/enc-charts/:filename/preview', async (req, res) => {
  try {
    const chartPath = resolveEncFile(req.params.filename);
    if (!chartPath) return res.status(404).json({ error: 'Archivo ENC no encontrado.' });

    const bounds = parsePreviewBounds(req.query.bbox);
    if (!bounds) {
      return res.status(400).json({ error: 'Se requiere bbox=Oeste,Sur,Este,Norte en WGS84; extensiÃ³n mÃ¡xima 2Â°.' });
    }

    return res.json(await exportEncPreview(chartPath, bounds));
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Error al generar la vista previa ENC.';
    console.error(`[ENC] Vista previa fallida (${req.params.filename}): ${message}`);
    const status = /GDAL|OGR no estÃ¡ disponible/i.test(message) ? 503 : 422;
    return res.status(status).json({ error: message });
  }
});

const CHAT_LIMITS = Object.freeze({
  prompt: 20_000,
  systemInstruction: 24_000,
  sector: 120
});

const NAV_TOOL_DECLARATIONS = Object.freeze([
  {
    name: 'set_navigation_target',
    description: 'Solicita configurar un destino confirmado; no calcula ni valida una derrota o distancia a costa. No inventes coordenadas.',
    parameters: {
      type: 'OBJECT',
      properties: {
        name: { type: 'STRING', description: 'Nombre inequÃ­voco del destino.' },
        lat: { type: 'NUMBER', description: 'Latitud WGS84, entre -90 y 90.' },
        lng: { type: 'NUMBER', description: 'Longitud WGS84, entre -180 y 180.' }
      },
      required: ['name', 'lat', 'lng']
    }
  },
  {
    name: 'start_travesia',
    description: 'Solicita iniciar la travesÃ­a. La aplicaciÃ³n exigirÃ¡ la confirmaciÃ³n operativa correspondiente.',
    parameters: {
      type: 'OBJECT',
      properties: {
        assisted: { type: 'BOOLEAN', description: 'Indica navegaciÃ³n asistida por IA.' }
      },
      required: ['assisted']
    }
  },
  {
    name: 'end_travesia',
    description: 'Solicita finalizar la travesÃ­a actual.',
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

let aiBlockedUntil = 0;

function getAIRetryAfterSeconds(error) {
  const message = error instanceof Error ? error.message : String(error);
  const retryMatch = message.match(/retry(?:Delay)?(?:["':\s]+|\s+in\s+)(\d+(?:\.\d+)?)s/i);
  const retryAfterSeconds = retryMatch ? Math.ceil(Number(retryMatch[1])) : 60;
  return Math.min(Math.max(retryAfterSeconds, 1), 3600);
}


const { askOllama } = require('./ollama-local');

const handleTacticalChat = async (req, res) => {
  if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) {
    return res.status(400).json({
      code: 'AI_INVALID_BODY',
      error: 'El cuerpo debe ser un objeto JSON'
    });
  }
  const body = req.body;
  const prompt = typeof body.prompt === 'string' ? body.prompt.trim() : '';

  if (!prompt) {
    return res.status(400).json({
      code: 'AI_INVALID_PROMPT',
      error: 'Falta el mensaje'
    });
  }

  if (prompt.length > CHAT_LIMITS.prompt) {
    return res.status(413).json({
      code: 'AI_PROMPT_TOO_LONG',
      error: 'El mensaje supera el limite permitido'
    });
  }

  const started = Date.now();

  try {
    const systemInstruction = typeof body.systemInstruction === 'string'
  ? body.systemInstruction.slice(0, 24000)
  : '';

const result = await askOllama(prompt, systemInstruction);

    return res.json({
      ...result,
      processingMs: Date.now() - started
    });
  } catch (error) {
    const code = error && error.name === 'TimeoutError'
      ? 'AI_TIMEOUT'
      : 'AI_LOCAL_UNAVAILABLE';

    console.error('[OLLAMA]', code);

    return res.status(503).json({
      code,
      error: 'No se ha podido obtener respuesta de Ollama local'
    });
  }
};

const { interpretRouteOrder, interpretRouteConversation, validateConversationContext } = require('./ollama-route-intent');

app.post('/api/route-intent', async (req, res) => {
  const order = req.body?.order;

  if (typeof order !== 'string' ||
      !order.trim() ||
      order.length > 4000) {
    return res.status(400).json({
      code: 'ROUTE_INVALID_ORDER',
      error: 'Orden de ruta no válida'
    });
  }

  try {
    if (req.body.contractVersion === 2) {
      const context = req.body.context ?? {spec:null,hasCalculatedProposal:false};
      try { validateConversationContext(context); }
      catch { return res.status(400).json({code:'ROUTE_INVALID_CONTEXT',error:'Contexto de propuesta no válido'}); }
      const interpretation = await interpretRouteConversation(order,context);
      return res.json({status:'INTERPRETED',contractVersion:2,interpretation});
    }
    const interpretation = await interpretRouteOrder(order);

    return res.json({
      status: 'INTERPRETED',
      requiresGeographicResolution: true,
      route: interpretation
    });
  } catch (error) {
    console.error('[ROUTE_INTENT]', error.message);

    return res.status(503).json({
      code: error?.name === 'TimeoutError' || error?.name === 'AbortError' ? 'ROUTE_INTERPRETATION_TIMEOUT' : 'ROUTE_INTERPRETATION_FAILED',
      error: 'No se ha podido interpretar la orden'
    });
  }
});

app.post('/api/chat', handleTacticalChat);

app.post('/api/chat-openai', (_req, res) => {
  return res.status(503).json({
    code: 'AI_LOCAL_ONLY',
    error: 'Proveedor comercial deshabilitado'
  });
});

// Endpoint de Salud
app.get('/health', (req, res) => res.status(200).send('OK'));

// Middleware de errores de Express (payload excesivo o JSON malformado)
app.use((err, _req, res, next) => {
  if (err && (err.type === 'entity.too.large' || err.status === 413)) {
    return res.status(413).json({
      code: 'AI_PAYLOAD_TOO_LARGE',
      error: 'El payload de la petición supera el límite permitido'
    });
  }
  if (err && (err.type === 'entity.parse.failed' || (err instanceof SyntaxError && err.status === 400 && 'body' in err))) {
    return res.status(400).json({
      code: 'AI_INVALID_JSON',
      error: 'El cuerpo de la petición no es un JSON válido'
    });
  }
  next(err);
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

module.exports = {
  app,
  startMapServer,
  stopMapServer,
  configureOpenAIKey,
  getOpenAIStatus,
  configureDesktopAuthentication,
};
