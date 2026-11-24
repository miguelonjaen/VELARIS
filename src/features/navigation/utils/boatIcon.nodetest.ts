// Icono de la embarcación: escala con el zoom y HTML (node:test).
// Ejecutar con: node --import tsx --test src/features/navigation/utils/boatIcon.nodetest.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  BOAT_ICON_HEADING_VAR,
  BOAT_ICON_MAX_SCALE,
  BOAT_ICON_MIN_SCALE,
  BOAT_ICON_REFERENCE_ZOOM,
  BOAT_ICON_SCALE_VAR,
  boatIconScale,
  buildBoatIconHtml,
  normalizeHeading
} from './boatIcon';

test('al zoom de referencia el icono conserva su tamaño actual (34×64 px)', () => {
  assert.equal(boatIconScale(BOAT_ICON_REFERENCE_ZOOM), 1);
});

test('crece al acercar y se reduce al alejar, de forma progresiva', () => {
  const zooms = [8, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19];
  const scales = zooms.map(boatIconScale);
  for (let i = 1; i < scales.length; i++) assert.ok(scales[i] >= scales[i - 1], `zoom ${zooms[i]} no puede ser menor que ${zooms[i - 1]}`);
  assert.ok(boatIconScale(16) > 1 && boatIconScale(14) < 1);
  assert.equal(boatIconScale(16), Math.round(2 ** 0.25 * 1000) / 1000, '×1,19 por nivel');
});

test('límites mínimo y máximo: nunca desaparece ni se vuelve desproporcionado', () => {
  assert.equal(boatIconScale(0), BOAT_ICON_MIN_SCALE);
  assert.equal(boatIconScale(3), BOAT_ICON_MIN_SCALE);
  assert.equal(boatIconScale(22), BOAT_ICON_MAX_SCALE);
  assert.equal(boatIconScale(30), BOAT_ICON_MAX_SCALE);
  for (let zoom = 0; zoom <= 22; zoom += 0.25) {
    const scale = boatIconScale(zoom);
    assert.ok(scale >= BOAT_ICON_MIN_SCALE && scale <= BOAT_ICON_MAX_SCALE);
  }
  assert.equal(boatIconScale(Number.NaN), 1);
});

test('sin saltos bruscos: con zoom fraccionario el cambio es continuo', () => {
  for (let zoom = 5; zoom < 20; zoom += 0.1) {
    // 0,1 niveles de zoom cambian el tamaño como mucho 2^(0,025) − 1 ≈ 1,75 % (más el redondeo).
    const jump = Math.abs(boatIconScale(zoom + 0.1) - boatIconScale(zoom)) / boatIconScale(zoom);
    assert.ok(jump <= 0.02, `salto relativo de ${jump} entre ${zoom.toFixed(1)} y ${(zoom + 0.1).toFixed(1)}`);
  }
});

test('HTML: rumbo y escala por variables CSS, rotación sin animar y escala animada', () => {
  const html = buildBoatIconHtml(false, 291, 1.19);
  assert.match(html, new RegExp(`rotate\\(var\\(${BOAT_ICON_HEADING_VAR}, 291deg\\)\\)`));
  assert.match(html, new RegExp(`scale\\(var\\(${BOAT_ICON_SCALE_VAR}, 1.19\\)\\)`));
  assert.match(html, /transition:transform 250ms/);
  const rotateBlock = html.slice(html.indexOf('rotate('), html.indexOf('scale('));
  assert.doesNotMatch(rotateBlock, /transition/, 'el giro de 359° a 1° no debe animarse dando la vuelta');
  assert.match(html, /viewBox="0 0 34 64"/, 'mismo diseño, sin deformar');
  assert.doesNotMatch(html, />SIM</);
  assert.match(html, /stroke="#22d3ee"/);
});

test('HTML del marcador de simulación: etiqueta SIM bajo el casco escalado, sin girar', () => {
  const html = buildBoatIconHtml(true, 10, 0.5);
  assert.match(html, />SIM</);
  assert.match(html, /stroke="#f59e0b"/);
  assert.match(html, new RegExp(`top:calc\\(32px \\+ 32px \\* var\\(${BOAT_ICON_SCALE_VAR}, 0.5\\) \\+ 2px\\)`));
});

test('rumbo normalizado 0..360', () => {
  assert.equal(normalizeHeading(-10), 350);
  assert.equal(normalizeHeading(370), 10);
  assert.equal(normalizeHeading(Number.NaN), 0);
});
