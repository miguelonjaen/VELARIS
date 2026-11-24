'use strict';
/**
 * Verificacion previa a la publicacion.
 * Comprueba el proxy meteorologico y credenciales privadas.
 * Nunca imprime valores de credenciales.
 */
const fs = require('fs');
const path = require('path');
const { scanAsciiFile } = require('./releaseScan.cjs');

const root = path.resolve(__dirname, '..');
const problems = [];
const ok = [];

function readAllJs(dir) {
  if (!fs.existsSync(dir)) return [];
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...readAllJs(full));
    else if (/\.(js|mjs|cjs|html)$/.test(entry.name)) out.push(full);
  }
  return out;
}

const SECRET_PATTERNS = [
  // payload JWT con "role":"service_role" codificado en base64 (tres alineaciones posibles)
  { name: 'clave Supabase secret', re: /\bsb_secret_[A-Za-z0-9_-]+/ },

  { name: 'JWT de Supabase con rol service_role', re: /InNlcnZpY2Vfcm9sZS|J5ZXJ2aWNlX3JvbGUi|ic2VydmljZV9yb2xlI|c2VydmljZV9yb2xl/ },
  { name: 'clave con formato OpenAI (sk-...)', re: /\bsk-(?:proj-)?[A-Za-z0-9_-]{24,}/ },
];

function scanText(label, text) {
  for (const { name, re } of SECRET_PATTERNS) {
    re.lastIndex = 0;
    if (re.test(text)) problems.push(`${label}: posible ${name}`);
  }

  // Detect inherited Supabase JWT API keys by role without echoing token contents.
  const jwtPattern = /eyJ[A-Za-z0-9_-]*\.([A-Za-z0-9_-]+)\.[A-Za-z0-9_-]+/g;
  for (const match of text.matchAll(jwtPattern)) {
    try {
      const payload = JSON.parse(Buffer.from(match[1], 'base64url').toString('utf8'));
      if (payload.role === 'anon') problems.push(`${label}: posible JWT anon heredado de Supabase`);
      if (payload.role === 'service_role') problems.push(`${label}: posible JWT service_role de Supabase`);
    } catch {
      // Ignore strings that resemble a JWT but do not contain a JSON payload.
    }
  }
}

// 1) Bundle del renderer
const rendererRoot = process.argv[3] ? path.resolve(process.argv[3]) : path.join(root, 'dist');
const distFiles = readAllJs(rendererRoot);
if (distFiles.length === 0) {
  problems.push('dist/ no existe o está vacío: ejecute npm run build antes de verificar.');
} else {
  let hasWeather = false;
  for (const file of distFiles) {
    scanAsciiFile(file, (text) => {
      hasWeather ||= text.includes('/functions/v1/weather-proxy');
      scanText(path.relative(root, file), text);
    });
  }
  if (hasWeather) ok.push('Renderer: proxy meteorologico presente.');
  else problems.push('Renderer: falta la integracion weather-proxy.');

}

// 2) Paquete (opcional): app.asar
const asarArg = process.argv[2];
if (asarArg) {
  const asarPath = path.resolve(asarArg);
  if (!fs.existsSync(asarPath)) {
    problems.push(`No existe ${asarPath}`);
  } else {
    const descriptor = fs.openSync(asarPath, 'r');
    let header;
    try {
      const prefix = Buffer.alloc(16);
      if (fs.readSync(descriptor, prefix, 0, 16, 0) !== 16) throw new Error('Cabecera ASAR incompleta');
      const headerSize = prefix.readUInt32LE(12);
      if (headerSize > fs.fstatSync(descriptor).size - 16) throw new Error('Tamaño de cabecera ASAR inválido');
      const headerBuffer = Buffer.alloc(headerSize);
      if (fs.readSync(descriptor, headerBuffer, 0, headerSize, 16) !== headerSize) throw new Error('Cabecera ASAR truncada');
      header = headerBuffer.toString('utf8');
    } finally {
      fs.closeSync(descriptor);
    }
    if (/"\.env[^"]*"\s*:\s*\{/.test(header)) problems.push('app.asar contiene un archivo .env');
    else ok.push('app.asar: sin archivos .env.');
    let hasWeather = false;
    scanAsciiFile(asarPath, (text) => {
      hasWeather ||= text.includes('/functions/v1/weather-proxy');
      scanText('app.asar', text);
    });
    if (hasWeather) ok.push('app.asar: proxy meteorologico presente.');
    else problems.push('app.asar: falta la integracion weather-proxy.');
  }
}

for (const line of ok) console.log(`OK  ${line}`);
for (const line of problems) console.error(`ERR ${line}`);
if (problems.length > 0) {
  console.error(`\nVerificación de release FALLIDA (${problems.length} problema(s)).`);
  process.exit(1);
}
console.log('\nVerificación de release correcta.');
