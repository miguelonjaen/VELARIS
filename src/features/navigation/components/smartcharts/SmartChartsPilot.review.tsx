import React from 'react';
import { createRoot } from 'react-dom/client';
import { MapContainer } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import SmartChartsPilotOverlay from './SmartChartsPilotOverlay';

// Isolated verification of the production adapter, without authentication, telemetry or basemap requests.
createRoot(document.getElementById('root')!).render(<>
  <h1 style={{ font: 'bold 18px system-ui', color: '#fef3c7' }}>SmartCHARTS · Mediterráneo occidental · Verificación del adaptador Desktop</h1>
  <p style={{ color: '#cbd5e1', font: '14px system-ui' }}>Tierra, mar de profundidad desconocida, aguas interiores, costa e infraestructura. Datos OSM locales.</p>
  <MapContainer center={[37.8, 2]} zoom={5} style={{ height: '75vh', width: '100%', background: '#26313d' }}>
    <SmartChartsPilotOverlay />
  </MapContainer>
</>);
