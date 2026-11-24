import React from 'react';
import { Wrench } from 'lucide-react';
import type { ShipData } from '../../../shared/types';
import { REVIEWS, calendarDay } from './documentDashboardModel';
import { DocumentLibrary } from './documents/DocumentLibrary';
import './fleetDocumentation.css';

interface Props {
  ship: ShipData;
  userId: string;
  onChange: (patch: Partial<ShipData>) => void;
  onMaintenance: () => void;
}
const dateText = (value?: string): string => calendarDay(value) === null ? 'Sin fecha registrada' : new Date(`${value}T12:00:00`).toLocaleDateString('es-ES');

export function FleetDocumentation({ship,userId,onChange,onMaintenance}: Props) {
  return <section className="fd-dashboard" aria-label={`Documentación de ${ship.nombre}`}>
    <DocumentLibrary key={`${userId}:${ship.id}`} vesselId={ship.id} vesselName={ship.nombre} userId={userId}/>
    <section className="fd-panel fd-reviews">
      <div className="fd-panel-heading"><h4><Wrench size={16}/>Revisiones registradas</h4><button type="button" onClick={onMaintenance}>Mantenimiento e historial ↗</button></div>
      <div className="fd-review-grid">{REVIEWS.map(review => <label key={review.field}><span>{review.label}</span><small>{review.detail}</small><input type="date" name={review.field} value={calendarDay(ship[review.field]) === null ? '' : ship[review.field]} onChange={event => onChange({[review.field]:event.target.value})}/><span className="fd-review-line" data-recorded={calendarDay(ship[review.field]) !== null}/><small>{dateText(ship[review.field])}</small></label>)}</div>
    </section>
    {(ship.fecha_seguro || ship.fecha_itb) && <details className="fd-technical"><summary>Fechas conservadas de la ficha anterior</summary><p>Seguro: {dateText(ship.fecha_seguro)} · ITB: {dateText(ship.fecha_itb)}</p><p>Las caducidades actuales se gestionan en cada documento. Estas fechas históricas se conservan como referencia.</p></details>}
    <p className="fd-footnote">Los documentos se guardan al confirmar cada operación. Para conservar las revisiones y los datos técnicos, guarda la ficha.</p>
  </section>;
}
