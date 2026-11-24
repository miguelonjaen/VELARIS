import test from 'node:test';
import assert from 'node:assert/strict';
import { detectedDocumentMime, documentExpiryLabel, requiresSensitiveAccess, validateDocumentDates, validateExternalUrl } from './model';

test('External links reject executable schemes, embedded credentials and insecure transport', () => {
  for (const url of ['javascript:alert(1)','data:text/html,x','file:///C:/secret','http://example.org','https://user:secret@example.org']) assert.throws(() => validateExternalUrl(url));
  assert.equal(validateExternalUrl(' https://example.org/manual.pdf '),'https://example.org/manual.pdf');
});
test('File signatures reject disguised executables and SVG', () => {
  assert.equal(detectedDocumentMime(new TextEncoder().encode('%PDF-1.7')),'application/pdf');
  assert.equal(detectedDocumentMime(new Uint8Array([255,216,255,224])),'image/jpeg');
  assert.equal(detectedDocumentMime(new Uint8Array([137,80,78,71,13,10,26,10])),'image/png');
  assert.equal(detectedDocumentMime(new TextEncoder().encode('RIFF0000WEBP')),'image/webp');
  assert.equal(detectedDocumentMime(new TextEncoder().encode('<svg onload=')),null);
  assert.equal(detectedDocumentMime(new Uint8Array([77,90,0,0])),null);
  assert.equal(detectedDocumentMime(new Uint8Array()),null);
});
test('Document dates validate leap days, order and empty optional fields', () => {
  validateDocumentDates('2028-02-29','2028-03-01');
  validateDocumentDates('','');
  assert.throws(() => validateDocumentDates('2026-02-29',''));
  assert.throws(() => validateDocumentDates('2026-11-07','2026-11-06'));
  assert.throws(() => validateDocumentDates('2026-1-1',''));
});
test('Expiry labels distinguish past, today, near and distant dates', () => {
  assert.match(documentExpiryLabel('2026-11-05','2026-11-06'),/Vencido/);
  assert.equal(documentExpiryLabel('2026-11-06','2026-11-06'),'Vence hoy');
  assert.match(documentExpiryLabel('2026-11-13','2026-11-06'),/7 días/);
  assert.match(documentExpiryLabel('2027-11-06','2026-11-06'),/Vence el/);
  assert.equal(documentExpiryLabel(null),'Sin caducidad registrada');
});
test('Personal document categories force restricted access', () => {
  assert.equal(requiresSensitiveAccess('docs_dni_tripulacion'),true);
  assert.equal(requiresSensitiveAccess('docs_titulacion_patron'),true);
  assert.equal(requiresSensitiveAccess('manual'),false);
});
