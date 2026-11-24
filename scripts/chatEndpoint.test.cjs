const test = require('node:test');
const assert = require('node:assert/strict');
const { Readable } = require('node:stream');
const { app } = require('../map-server.js');

function invokeChat(body, rawBody, url = '/api/chat') {
  return new Promise((resolve) => {
    const payload = rawBody !== undefined ? rawBody : JSON.stringify(body);
    const stream = new Readable({
      read() {
        this.push(payload);
        this.push(null);
      }
    });
    stream.method = 'POST';
    stream.url = url;
    stream.headers = {
      'content-type': 'application/json',
      'content-length': Buffer.byteLength(payload).toString()
    };
    let statusCode = 200;
    const headers = {};
    const res = {
      statusCode: 200,
      setHeader(k, v) { headers[k.toLowerCase()] = v; },
      getHeader(k) { return headers[k.toLowerCase()]; },
      writeHead(code, h) { statusCode = code; if (h) Object.assign(headers, h); },
      status(code) { this.statusCode = code; statusCode = code; return this; },
      json(obj) { resolve({ status: statusCode, data: obj }); },
      send(str) { resolve({ status: statusCode, body: str }); },
      end() { resolve({ status: statusCode }); }
    };
    app(stream, res);
  });
}

test('valid normal query of visible chart view arrives at AI Officer without HTTP 413 (with mock Ollama)', async () => {
  const chartEvidence = {
    bbox: [-3.55, 36.68, -3.48, 36.75],
    queriedAt: Date.now(),
    enc: 'available',
    encFilename: 'ES401010.000',
    coverage: 'objects-available',
    quality: 'objects-available',
    issues: ['OSM local experimental: fecha 2026-01-01'],
    totalCandidates: 18,
    sentObjects: 2,
    omittedObjects: 16,
    truncated: false,
    objects: [
      { id: 'ENC:WRECKS:1', name: 'Pecio de recalada', kind: 'WRECKS', source: 'ENC', category: 'hazard', position: [36.72, -3.51], attributes: { VALSOU: 3.5, WATLEV: 3 } },
      { id: 'ENC:LIGHTS:2', name: 'Faro Verde', kind: 'LIGHTS', source: 'ENC', category: 'aid', position: [36.73, -3.49], attributes: { COLOUR: '3', LITCHR: '1' } }
    ]
  };

  const contextEvidence = {
    evaluatedAt: Date.now(),
    topics: ['chart', 'navigation', 'instruments'],
    navigation: { position: { value: { lat: 36.71, lng: -3.5 }, source: 'GPS', status: 'VALID' }, sog: { value: 6.2 }, cog: { value: 185 } },
    instruments: { depth: { value: { meters: 18.4, reference: 'transducer' }, status: 'valid' } },
    chart: chartEvidence
  };

  const prompt = 'Identifica los peligros visibles y la sonda en la carta.\nEVIDENCIA_JSON:\n' + JSON.stringify(contextEvidence);
  assert.ok(prompt.length < 16000, `Prompt length ${prompt.length} should be < 16000`);

  // Mock global fetch for Ollama 11434 to test successful local response contract
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, options) => {
    if (String(url).includes('11434')) {
      return {
        ok: true,
        json: async () => ({
          message: {
            content: 'Se detecta un pecio con sonda 3.5 m en posición 36.72, -3.51 y faro verde en 36.73, -3.49.'
          }
        })
      };
    }
    return originalFetch(url, options);
  };

  try {
    const res = await invokeChat({ prompt, systemInstruction: 'Eres el Oficial IA de GAULOS.' });
    assert.notEqual(res.status, 413, 'Visible view query must NEVER return HTTP 413');
    assert.equal(res.status, 200);
    assert.equal(res.data.provider, 'ollama');
    assert.equal(res.data.model, 'qwen2.5:3b');
    assert.ok(res.data.text.includes('pecio'));
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('valid operational query returns 503 AI_LOCAL_UNAVAILABLE when Ollama is offline (never 413)', async () => {
  const chartEvidence = {
    bbox: [-3.55, 36.68, -3.48, 36.75],
    queriedAt: Date.now(),
    enc: 'available',
    coverage: 'objects-available',
    quality: 'objects-available',
    issues: [],
    totalCandidates: 2,
    sentObjects: 1,
    omittedObjects: 1,
    truncated: false,
    objects: [{ id: 'ENC:WRECKS:1', name: 'Pecio', kind: 'WRECKS', source: 'ENC', category: 'hazard', position: [36.72, -3.51], attributes: { VALSOU: 3.5 } }]
  };
  const prompt = 'Peligros en la zona con sonda 12m:\n' + JSON.stringify(chartEvidence);
  const res = await invokeChat({ prompt });
  assert.notEqual(res.status, 413, 'Prompt within bounds must never return HTTP 413');
  assert.equal(res.status, 503);
  assert.equal(res.data.code, 'AI_LOCAL_UNAVAILABLE');
});

test('valid conceptual query returns 200 with verified marine definition without HTTP 413', async () => {
  const res = await invokeChat({ prompt: 'QUE ES SOG' });
  assert.equal(res.status, 200);
  assert.equal(res.data.provider, 'gaulos-verified');
  assert.ok(res.data.text.includes('Speed Over Ground'));
});

test('valid tactical safety query returns 200 with safety advice without HTTP 413', async () => {
  const res = await invokeChat({ prompt: 'QUE DEBO HACER PARA EVITAR COLISION' });
  assert.equal(res.status, 200);
  assert.equal(res.data.provider, 'gaulos-safety');
  assert.ok(res.data.text.includes('RIPA'));
});

test('excessive prompt exceeding CHAT_LIMITS.prompt returns HTTP 413 AI_PROMPT_TOO_LONG', async () => {
  const giantPrompt = 'X'.repeat(20_001);
  const res = await invokeChat({ prompt: giantPrompt });
  assert.equal(res.status, 413);
  assert.equal(res.data.code, 'AI_PROMPT_TOO_LONG');
  assert.ok(res.data.error.includes('limite'));
});

test('excessive request payload exceeding Express limit returns HTTP 413 AI_PAYLOAD_TOO_LARGE', async () => {
  const giantPayload = JSON.stringify({ prompt: 'test', extra: 'Z'.repeat(550 * 1024) });
  const res = await invokeChat(null, giantPayload);
  assert.equal(res.status, 413);
  assert.equal(res.data.code, 'AI_PAYLOAD_TOO_LARGE');
});

test('malformed request with missing or empty prompt returns HTTP 400 AI_INVALID_PROMPT', async () => {
  for (const emptyPrompt of ['', '   ', null, undefined]) {
    const res = await invokeChat({ prompt: emptyPrompt });
    assert.equal(res.status, 400);
    assert.equal(res.data.code, 'AI_INVALID_PROMPT');
  }
});

test('malformed request with non-object array body returns HTTP 400 AI_INVALID_BODY', async () => {
  const res = await invokeChat(null, '[]');
  assert.equal(res.status, 400);
  assert.equal(res.data.code, 'AI_INVALID_BODY');
});

test('malformed request with invalid JSON syntax returns HTTP 400 AI_INVALID_JSON', async () => {
  for (const badSyntax of ['{ prompt: "broken json', '"just a string"']) {
    const res = await invokeChat(null, badSyntax);
    assert.equal(res.status, 400);
    assert.equal(res.data.code, 'AI_INVALID_JSON');
  }
});

test('commercial chat-openai endpoint is disabled and returns 503 AI_LOCAL_ONLY', async () => {
  const res = await invokeChat({ prompt: 'test' }, undefined, '/api/chat-openai');
  assert.equal(res.status, 503);
  assert.equal(res.data.code, 'AI_LOCAL_ONLY');
});
