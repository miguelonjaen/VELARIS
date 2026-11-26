import test from 'node:test';
import assert from 'node:assert/strict';
import type { LibraryDocument } from '../traffic/components/documents/model';
import { classifyDocuments, collectDocumentPages, formatDocumentAnswer, isReadOnlyDocumentQuery } from './documentWatch';

const document = (id: string, expires_on: string | null, state: 'ready' | 'pending' = 'ready'): LibraryDocument => ({ id, owner_id: 'u', origin_vessel_id: 'v', title: id, category: 'other', kind: 'file', sensitive: false, archived: false, revision: 1, external_url: null, created_at: '', updated_at: '', can_edit: false, can_manage: false,
  latest_version: { id: 'x', document_id: id, uploaded_by: 'u', bucket_id: 'b', object_path: 'p', original_name: 'x.pdf', mime_type: 'application/pdf', byte_size: 1, sha256: 'a', state, created_at: '' }, vessels: [{ document_id: id, vessel_id: 'v', issued_on: null, expires_on }] });
test('consulta documental solo lectura no admite órdenes mixtas', () => {
  assert.equal(isReadOnlyDocumentQuery('¿Qué documentos vencen pronto?'), true);
  assert.equal(isReadOnlyDocumentQuery('muestra y renueva el seguro'), false);
});
test('clasifica vigente, próximo, vencido, sin fecha y no disponible', () => {
  const result = classifyDocuments([document('vigente','2027-12-01'), document('pronto','2026-12-01'), document('vencido','2026-01-01'), document('sin-fecha',null), document('pendiente','2027-01-01','pending')], 'v', '2026-11-24', 30);
  assert.deepEqual(result.map(value => value.status), ['CURRENT','DUE_SOON','EXPIRED','NO_DATE','UNAVAILABLE']);
  assert.match(formatDocumentAnswer([], 'Velero'), /ausencia de registros/i);
});

test('paginación deduplica, termina ante repetición y cancela por cambio de buque', async () => {
  const pages = [[{ id: 'a' }, { id: 'b' }], [{ id: 'c' }], []];
  const result = await collectDocumentPages(offset => Promise.resolve(pages[offset === 0 ? 0 : offset === 2 ? 1 : 2]), () => true);
  assert.deepEqual(result.map(value => value.id), ['a','b','c']);
  await assert.rejects(() => collectDocumentPages(() => Promise.resolve([{ id: 'a' }]), () => false), /cancelada/);
  let page = 0;
  await assert.rejects(() => collectDocumentPages(() => Promise.resolve([{ id: String(page++) }]), () => true, 2), /límite seguro/);
});

test('paginacion repetida no acredita un informe completo', async () => {
  await assert.rejects(
    () => collectDocumentPages(
      async () => [{ id: 'repeated' }],
      () => true
    ),
    /sin progreso/
  );
});
