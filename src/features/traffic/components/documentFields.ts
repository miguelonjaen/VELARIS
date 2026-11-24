export const DOCUMENT_URL_KEYS = {
  docs_certificado_navegabilidad: 'url_certificado_navegabilidad',
  docs_permiso_navegacion: 'url_permiso_navegacion',
  docs_seguro_vigente: 'url_seguro', docs_itb_vigente: 'url_itb',
  docs_dni_tripulacion: 'url_dni_tripulacion', docs_titulacion_patron: 'url_titulacion_patron',
  docs_leb_mmsi: 'url_leb_mmsi',
} as const;
export type DocumentId = keyof typeof DOCUMENT_URL_KEYS;
