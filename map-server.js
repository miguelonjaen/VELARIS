require('dotenv').config(); // Carga las variables de entorno desde el archivo .env
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const MBTiles = require('@mapbox/mbtiles');
const { GoogleGenerativeAI } = require("@google/generative-ai");
const { createClient } = require('@supabase/supabase-js');
const app = express();
const PORT = 8089;

// Middleware de seguridad y utilidad
app.use(cors({ origin: '*' }));
app.use(express.json());

let currentChartsPath = "";
let mbtilesInstances = {};

// 🛡️ 1. Configuración de Supabase (Llave Maestra)
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// --- CONFIGURACIÓN DINÁMICA DEL REPOSITORIO ---
app.post('/api/settings/charts-path', (req, res) => {
  const { path: newPath } = req.body;
  if (!newPath) return res.status(400).json({ error: "Ruta no proporcionada" });
  
  currentChartsPath = newPath;
  
  // Liberar archivos MBTiles previos si existieran
  Object.keys(mbtilesInstances).forEach(key => {
    mbtilesInstances[key].close(() => delete mbtilesInstances[key]);
  });
  
  console.log(`📂 Puerto de cartas establecido en: ${currentChartsPath}`);
  res.json({ success: true, path: currentChartsPath });
});

// --- SERVIDOR DE TESELAS DINÁMICO ---
app.get('/tiles/:filename/:z/:x/:y.png', (req, res) => {
  const { filename, z, x, y } = req.params;
  const mbtilesFile = path.join(currentChartsPath, filename.endsWith('.mbtiles') ? filename : `${filename}.mbtiles`);

  if (!fs.existsSync(mbtilesFile)) return res.status(404).send('Carta no encontrada en el repositorio');

  const serveTile = (mbtiles) => {
    mbtiles.getTile(parseInt(z), parseInt(x), parseInt(y), (err, data, headers) => {
      if (err) return res.status(404).send('Tesela inexistente');
      res.set(headers);
      res.send(data);
    });
  };

  if (!mbtilesInstances[filename]) {
    new MBTiles(`${mbtilesFile}?mode=ro`, (err, mbtiles) => {
      if (err) return res.status(500).send(err.message);
      mbtilesInstances[filename] = mbtiles;
      serveTile(mbtiles);
    });
  } else {
    serveTile(mbtilesInstances[filename]);
  }
});


// 🔐 SEGURIDAD: API key solo se carga en el servidor (NUNCA en cliente)
if (!process.env.GEMINI_API_KEY) {
  console.error("❌ CRÍTICO: GEMINI_API_KEY no está configurada en .env");
  process.exit(1);
}

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
console.log("🔑 Clave de Gemini cargada desde variables de entorno (servidor seguro)");

// --- ENDPOINTS ---

// 🤖 Endpoint de Chat Seguro con Ubicación Dinámica en Tiempo Real
app.get('/api/charts', async (req, res) => {
  if (!currentChartsPath || !fs.existsSync(currentChartsPath)) return res.json([]);
  try {
    const files = fs.readdirSync(currentChartsPath).filter(f => f.toLowerCase().endsWith('.mbtiles'));
    
    const chartsWithMetadata = [];
    for (const file of files) {
      const metadata = await new Promise((resolve) => {
        const mbtilesFile = path.join(currentChartsPath, file);
        new MBTiles(`${mbtilesFile}?mode=ro`, (err, mbtiles) => {
          if (err) return resolve({ name: file });
          mbtiles.getInfo((infoErr, info) => {
            mbtiles.close(() => {
              if (infoErr) resolve({ name: file });
              else resolve({
                name: file,
                bounds: info.bounds, // [minLon, minLat, maxLon, maxLat]
                minzoom: info.minzoom,
                maxzoom: info.maxzoom
              });
            });
          });
        });
      });
      chartsWithMetadata.push(metadata);
    }
    res.json(chartsWithMetadata);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/chat', async (req, res) => {
  try {
    // 📥 Recibimos la posición en tiempo real desde el frontend
    const { prompt, systemInstruction, isJson, posicionActual } = req.body;
    if (!prompt) return res.status(400).json({ error: "Falta el mensaje" });

    // 📡 CONTEXTO DE UBICACIÓN DINÁMICO
    let reporteUbicacion = "Desconocida. El GPS del buque no ha enviado coordenadas válidas aún.";
    
    if (posicionActual && posicionActual.lat && posicionActual.lng) {
      reporteUbicacion = `Latitud: ${posicionActual.lat}, Longitud: ${posicionActual.lng}`;
      if (posicionActual.sector) {
        reporteUbicacion += ` (Sector / Zona: ${posicionActual.sector})`;
      }
    }

    const telemetriaBuque = `
      --- INFORME TÁCTICO DE BITÁCORA ---
      [Ubicación del Buque]: ${reporteUbicacion}
      [Estado de Sistemas]: Cartografía Leaflet ONLINE, Servidores Supabase PROTEGIDOS.
      [Identificación del Capitán]: El de la gorra.
      ------------------------------------
    `;

    const directivaSistemaFinal = `
      Eres IA_OFFICER, el sistema de inteligencia artificial táctico a bordo de SmartShip PRO.
      Asiste al capitán con datos concisos, profesionales y tono náutico militar.
      
      ${telemetriaBuque}
      
      INSTRUCCIÓN DE OPERACIÓN:
      Si el capitán te pide el estado del tiempo o del viento, utiliza los datos de ubicación (coordenadas o sector) provistos arriba. Simula un reporte meteorológico marítimo realista acorde a esa posición geográfica (viento en nudos, dirección, estado de la mar y ráfagas). Si la ubicación dice "Desconocida", infórmale cortésmente que necesitas que fije una posición en el mapa cartográfico primero.
      
      ${systemInstruction || "Actúa con tu protocolo estándar de asistencia al puente."}
    `;

    const configuracionModelo = { 
      model: "gemini-3-flash-preview",
      systemInstruction: directivaSistemaFinal
    };

    if (isJson) {
      configuracionModelo.generationConfig = { responseMimeType: "application/json" };
    }

    const model = genAI.getGenerativeModel(configuracionModelo);
    const result = await model.generateContent(prompt);
    const response = await result.response;
    
    res.json({ text: response.text() });
  } catch (error) {
    console.error("❌ Error en comunicación Nexus:", error.message);
    res.status(500).json({ error: "Fallo en la comunicación con la IA" });
  }
});

// Endpoint de Salud
app.get('/health', (req, res) => res.status(200).send('OK'));

app.get('/api/almirantazgo/usuarios', async (req, res) => {
  try {
    // Tu servidor ignora las restricciones del frontend y lee la vista directamente
    const { data, error } = await supabase
      .from('vista_administracion_usuarios')
      .select('*');
    
    if (error) throw error;
    res.json(data);
  } catch (error) {
    console.error("❌ Error en Menú Almirantazgo:", error.message);
    res.status(500).json({ error: "Acceso denegado a la suite de administración." });
  }
  });

  // Ejemplo para descargar un archivo de forma segura desde el backend
app.get('/api/archivos/:nombreArchivo', async (req, res) => {
  const { nombreArchivo } = req.params;
  
  const { data, error } = await supabase.storage
    .from('tu-bucket-privado')
    .download(nombreArchivo);

  if (error) return res.status(404).json({ error: "Archivo no encontrado" });
  
  // Enviar el archivo de vuelta al frontend
  const buffer = Buffer.from(await data.arrayBuffer());
  res.send(buffer);
});

// 🛥️ ENDPOINT: Obtener Flota
app.get('/api/flota', async (req, res) => {
  // ... implementación única ...
});

console.log('***** MAP-SERVER VERSION NUEVA *****');
app.listen(PORT, () => {
  console.log(`🚀 SmartShip PRO Backend ONLINE en puerto ${PORT}`);
  console.log(`🛡️  Modo Seguro: IA y Supabase encapsulados.`);
});