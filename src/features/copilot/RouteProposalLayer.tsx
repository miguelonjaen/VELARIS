import { useEffect, useRef, useState } from 'react';
import { CircleMarker, Marker, Polyline, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import { analyzeRouteProposal, generateOffshoreProposal, type RouteProposal, type RouteProposalAnalysis } from './routeProposal';

const icon = L.divIcon({
    className: '',
    html: '<span style="display:block;width:18px;height:18px;border:3px solid #fff;border-radius:50%;background:#f59e0b"></span>',
    iconSize: [18,18], iconAnchor: [9,9]
});
interface Props {
    proposal: RouteProposal;
    onChange: (proposal: RouteProposal) => void;
    onClose: () => void;
}
export function RouteProposalLayer({ proposal, onChange, onClose }: Props) {
    const map = useMap();
    const [analysisState, setAnalysis] = useState<{source:RouteProposal; result:RouteProposalAnalysis} | null>(null);
    const analysis = analysisState?.source === proposal ? analysisState.result : null;
    const [error, setError] = useState('');
    const [generationError, setGenerationError] = useState('');
    const [editing, setEditing] = useState(false);
    const [calculating, setCalculating] = useState(false);
    const calculation = useRef<AbortController | null>(null);
    useEffect(() => {
        map.fitBounds(proposal.positions.map(p => [p[1],p[0]] as [number,number]), {padding:[60,60], maxZoom:11});
        return () => { calculation.current?.abort(); };
    }, [map, proposal.id]);
    useEffect(() => {
        let cancelled = false;
        setError('');
        void analyzeRouteProposal(proposal).then(result => {
            if (!cancelled) setAnalysis({source:proposal,result});
        }).catch((e: unknown) => {
            if (!cancelled) setError(e instanceof Error ? e.message : 'Error de análisis');
        });
        return () => { cancelled = true; };
    }, [proposal]);
    const generate = async (): Promise<void> => {
        calculation.current?.abort();
        const controller = new AbortController();
        calculation.current = controller;
        setCalculating(true); setGenerationError(''); setEditing(false);
        try {
            const result = await generateOffshoreProposal(proposal,controller.signal);
            if (!controller.signal.aborted) onChange(result);
        } catch (e: unknown) {
            if (!controller.signal.aborted) setGenerationError(e instanceof Error ? e.message : 'Cálculo indeterminado');
        } finally {
            if (calculation.current === controller) setCalculating(false);
        }
    };
    const label = (index: number): string => proposal.pointLabels?.[index] ?? proposal.places[index]?.name ?? `WP ${index+1}`;
    const source = (index: number) => {
        const reference = proposal.referenceIndices ? proposal.referenceIndices[index] : index;
        return reference === null ? undefined : proposal.places[reference];
    };
    const statuses = analysis?.surfaces.legs.map((leg, i) => {
        const clearance = analysis.clearance?.legs[i];
        const land = leg.status === 'LAND_CONTACT' ? 'CONTACTO CON TIERRA/BORDE' :
            leg.status === 'INDETERMINATE' ? 'INDETERMINADO' : 'Sin contacto terrestre detectado';
        const distance = clearance?.distanceMeters;
        const separation = clearance?.belowRequestedDistance ? 'INCUMPLE separación solicitada.' :
            analysis.clearanceCoverageComplete && analysis.coastResourcesLoaded && distance !== null && distance !== undefined ?
                'Sin incumplimiento de separación detectado en datos cargados.' : 'Separación indeterminada.';
        return `Tramo ${i+1}: ${land}. Costa cargada: ${distance === null || distance === undefined ? 'desconocida' : (distance/1852).toFixed(2)+' NM'}. ${separation}`;
    });
    return <>
        <Polyline bubblingMouseEvents={false} positions={proposal.positions.map(p => [p[1],p[0]])}
            pathOptions={{color:'#f59e0b',weight:4,dashArray:'8,8'}}>
            <Popup minWidth={300} maxHeight={360}>
                <strong>PROPUESTA PROVISIONAL · NO ACTIVADA</strong>
                <p>{proposal.offshore ? 'Tramo exterior calculado. Paso frente a los lugares indicados, sin escala. Accesos portuarios de origen y destino SIN PLANIFICAR.' :
                    'Referencias portuarias unidas por segmentos. Confirme si desea un paso exterior sin escala.'}</p>
                <p>Separación solicitada: {proposal.requestedDistanceNm ?? 'sin indicar'} NM.
                    {proposal.offshore && ` Malla exterior: ${proposal.offshore.gridStepNm.toLocaleString('es-ES')} NM; margen numérico de construcción: ${proposal.offshore.constructionMarginNm.toLocaleString('es-ES')} NM, sin significado de seguridad. Los pasos locales usan puntos adicionales.`}
                    {proposal.edited && ' Puntos editados: resultado geométrico recalculado.'}</p>
                <button type="button" disabled={calculating || proposal.requestedDistanceNm === null}
                    onClick={() => { void generate(); }}>
                    {calculating ? 'Calculando…' : 'Calcular tramo exterior · sin escala'}
                </button>{' '}
                {calculating && <button type="button" onClick={() => calculation.current?.abort()}>Cancelar cálculo</button>}
                <button type="button" disabled={calculating} onClick={() => setEditing(v => !v)}>
                    {editing ? 'Terminar edición' : 'Editar puntos'}
                </button>{' '}
                <button type="button" onClick={() => { calculation.current?.abort(); onClose(); }}>Descartar propuesta</button>
                {generationError && <p role="alert">No se ha encontrado una alternativa con los datos y límites de cálculo actuales: {generationError}</p>}
                {proposal.constraints.length > 0 && <p>Restricciones pendientes: {proposal.constraints.join('; ')}</p>}
                {!analysis && !error && <p>Analizando geometrías…</p>}
                {error && <p role="alert">Análisis indeterminado: {error}</p>}
                {analysis?.clearance?.minimumDistanceMeters !== null && analysis?.clearance &&
                    <p><strong>Mínima separación geométrica: {(analysis.clearance.minimumDistanceMeters!/1852).toFixed(2)} NM.</strong></p>}
                {analysis && <p>Cobertura declarada del trazado: {analysis.surfaces.declaredCoverageComplete ? 'completa' : 'incompleta'}.
                    Entorno para separación: {analysis.clearanceCoverageComplete && analysis.coastResourcesLoaded ? 'cubierto por datos experimentales' : 'indeterminado'}.
                    {analysis.failedSectors.length > 0 && ` Recursos ausentes: ${analysis.failedSectors.join(', ')}.`}</p>}
                <p>OSM/Geofabrik · ODbL-1.0 · Uso experimental. Profundidades desconocidas.
                    ENC, batimetría, obstáculos y restricciones pendientes. Sin autorización para navegar.</p>
                {analysis?.referencePassages?.map(p=><p key={p.name}>
                    Paso {p.name}: objetivo {p.targetDistanceNm} ±{p.toleranceNm} NM; mínimo al contorno {p.minimumDistanceNm === null ? 'desconocido' : p.minimumDistanceNm.toFixed(3)+' NM'}.
                    {' '}{p.status === 'WITHIN_BAND' ? 'Dentro de banda geométrica.' : p.status === 'OUTSIDE_BAND' ? 'FUERA DE BANDA: revisar propuesta.' : 'Paso indeterminado.'}
                    {p.source && <> <a href={p.source} target="_blank" rel="noreferrer">Contorno OSM</a> · {p.sourceTimestamp}</>}
                </p>)}
                {statuses?.map(s => <p key={s}>{s}</p>)}
            </Popup>
        </Polyline>
        {proposal.offshore && proposal.places.map(place => <CircleMarker key={place.name}
            center={[place.position[1],place.position[0]]} radius={5} bubblingMouseEvents={false}
            pathOptions={{color:'#94a3b8',fillOpacity:0.5}}>
            <Popup>Referencia publicada: {place.name}. Acceso no planificado. {place.reference}</Popup>
        </CircleMarker>)}
        {proposal.positions.map((p, i) => {
            const reference = source(i);
            return <Marker key={`${proposal.id}-${i}`} position={[p[1],p[0]]} icon={icon}
                bubblingMouseEvents={false} title={`Propuesta: ${label(i)}`} alt={`Propuesta: ${label(i)}`}
                draggable={editing && !calculating} eventHandlers={{dragend: (event: L.DragEndEvent) => {
                    const point = (event.target as L.Marker).getLatLng();
                    const positions = proposal.positions.map((old,j) => j === i ? [point.lng,point.lat] as const : old);
                    onChange({...proposal,positions,edited:true,offshore:proposal.offshore ? {...proposal.offshore,positions} : undefined});
                }}}>
                <Popup><strong>Propuesta · {label(i)}</strong><p>{p[1].toFixed(6)}, {p[0].toFixed(6)}</p>
                    {proposal.offshore && <p>Punto derivado del cálculo geométrico, no publicado por la autoridad portuaria.</p>}
                    {reference && <><p>{reference.reference}</p><p>Referencia original: {reference.sourceCoordinate}. Datum: {reference.datum}. {reference.kind} {reference.attribution}</p>
                        <a href={reference.source} target="_blank" rel="noreferrer">Fuente geográfica · {reference.verifiedOn}</a></>}
                    <p>{editing ? 'Arrastre para editar y recalcular.' : 'Pulse el trazado para analizar o editar.'}</p>
                </Popup>
            </Marker>;
        })}
    </>;
}
