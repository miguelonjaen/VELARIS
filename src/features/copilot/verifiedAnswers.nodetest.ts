import test from 'node:test';
import assert from 'node:assert/strict';
import { getVerifiedTacticalAnswer } from './verifiedAnswers';
import type { CopilotContext } from './context';

function makeContext(
  status: 'valid' | 'stale' | 'unavailable' | 'invalid',
  meters: number | null,
  reference: 'keel' | 'surface' | 'transducer' | null = 'transducer'
): CopilotContext {
  return {
    instruments: {
      depth: {
        value: meters === null ? null : { meters, reference },
        source: 'BOAT instrument store',
        timestamp: Date.now() - 2000,
        timestampMeaning: 'recepcion',
        maxAgeMs: 8000,
        ageMs: 2000,
        status
      }
    }
  } as CopilotContext;
}

test('responde con la profundidad vigente de la sonda', () => {
  const answer = getVerifiedTacticalAnswer(
    '¿Qué profundidad marca la sonda?',
    makeContext('valid', 8.4)
  );

  assert.ok(answer?.includes('8,4 metros'));
  assert.ok(answer?.includes('transductor'));
  assert.ok(answer?.includes('BOAT instrument store'));
});

test('rechaza lecturas caducadas', () => {
  const answer = getVerifiedTacticalAnswer(
    '¿Qué profundidad marca la sonda?',
    makeContext('stale', 8.4)
  );

  assert.ok(answer?.includes('No dispongo de una lectura vigente'));
  assert.ok(!answer?.includes('8,4 metros'));
});

test('rechaza lecturas ausentes', () => {
  const answer = getVerifiedTacticalAnswer(
    '¿Qué profundidad marca la sonda?',
    makeContext('unavailable', null)
  );

  assert.ok(answer?.includes('No dispongo de una lectura vigente'));
});

test('declara las referencias desconocidas', () => {
  const answer = getVerifiedTacticalAnswer(
    '¿Qué profundidad marca la sonda?',
    makeContext('valid', 12.3, null)
  );

  assert.ok(answer?.includes('12,3 metros'));
  assert.ok(answer?.includes('referencia desconocida'));
});

test('no confunde la batimetría cartográfica con la sonda', () => {
  const answer = getVerifiedTacticalAnswer(
    '¿Qué profundidad tiene la zona del puerto?',
    makeContext('valid', 8.4)
  );

  assert.equal(answer, null);
});

test('no intercepta preguntas ajenas a la profundidad', () => {
  const answer = getVerifiedTacticalAnswer(
    '¿Cuál es mi velocidad SOG?',
    makeContext('valid', 8.4)
  );

  assert.equal(answer, null);
});
test('no responde directamente a decisiones de navegación', () => {
  const questions = [
    '¿Tengo suficiente profundidad para entrar al puerto?',
    '¿Puedo navegar con esta profundidad?',
    '¿Es seguro continuar con la profundidad actual?',
    '¿Hay riesgo de varada según la sonda?',
    '¿Qué resguardo tengo bajo la quilla?',
    '¿Puedo pasar por este canal con la profundidad indicada?',
    '¿Qué profundidad tiene la carta náutica?',
    '¿Cuál es la profundidad de esta zona?'
  ];

  for (const question of questions) {
    const answer = getVerifiedTacticalAnswer(
      question,
      makeContext('valid', 8.4)
    );

    assert.equal(
      answer,
      null,
      `No debería responder directamente: ${question}`
    );
  }
});