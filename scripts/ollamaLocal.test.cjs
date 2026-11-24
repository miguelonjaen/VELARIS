const test = require('node:test');
const assert = require('node:assert/strict');
const { askOllama, getVerifiedDefinition, getSafetyResponse } = require('../ollama-local');

test('las preguntas españolas con signo inicial usan la definición verificada', async () => {
  const definition = getVerifiedDefinition('¿Qué significa SOG?');
  assert.match(definition, /Speed Over Ground/);

  const response = await askOllama('¿Qué significa SOG?');
  assert.equal(response.provider, 'gaulos-verified');
  assert.equal(response.model, 'marine-definitions-v1');
});

test('las solicitudes de maniobra quedan en la barrera determinista', async () => {
  const safety = getSafetyResponse('¿Qué debo hacer para evitar una colisión?');
  assert.equal(safety?.provider, 'gaulos-safety');

  const response = await askOllama('¿Qué debo hacer para evitar una colisión?');
  assert.equal(response.provider, 'gaulos-safety');
  assert.deepEqual(response.functionCalls, []);
});
