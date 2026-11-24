import assert from 'node:assert/strict';
import { test } from 'node:test';
import { classifyReadOnlyLogisticsQuery } from './logisticsReadOnly';
import { isReadOnlyDocumentQuery } from './documentWatch';

test('mantenimiento plural y signos Unicode', () => {
  assert.deepEqual(
    classifyReadOnlyLogisticsQuery(
      '\u00bfQu\u00e9 mantenimientos tengo pendientes?'
    ),
    {
      topics: ['maintenance'],
      focus: 'attention'
    }
  );
});

test('inventario caducado', () => {
  assert.ok(classifyReadOnlyLogisticsQuery(
    '\u00bfQu\u00e9 elementos del inventario est\u00e1n caducados?'
  ));
});

test('consultas documentales de renovacion', () => {
  for (const query of [
    '\u00bfQu\u00e9 documentaci\u00f3n tengo pendiente de renovar?',
    '\u00bfQu\u00e9 documentos tengo que renovar?',
    '\u00bfQu\u00e9 certificados debo renovar?',
    '\u00bfQu\u00e9 documentaci\u00f3n est\u00e1 caducada?'
  ]) {
    assert.equal(isReadOnlyDocumentQuery(query), true, query);
  }
});

test('rechaza mutaciones y ordenes mixtas', () => {
  for (const query of [
    'Renueva los documentos',
    'Borra los certificados vencidos',
    'Que documentos debo renovar? Elimina los vencidos',
    'Que documentacion tengo pendiente de renovar y calcula una ruta'
  ]) {
    assert.equal(isReadOnlyDocumentQuery(query), false, query);
  }

  assert.equal(
    classifyReadOnlyLogisticsQuery(
      'Dime los mantenimientos pendientes y elimina los registros'
    ),
    null
  );
});