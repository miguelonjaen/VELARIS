import express from 'express';
import cors from 'cors';
import log from 'electron-log/main';
import path from 'path';
import fs from 'fs';
import MBTiles from '@mapbox/mbtiles';
import { GoogleGenerativeAI } from "@google/generative-ai";

export class MapService {
  private app: express.Application;
  private server: any = null;
  private mbtilesInstances: Record<string, any> = {};
  private currentChartsPath: string = "";
  private genAI: GoogleGenerativeAI | null = null;

  constructor() {
    this.app = express();
    this.app.use(cors());
    this.app.use(express.json());
    
    if (process.env.GEMINI_API_KEY) {
      this.genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    }
    console.log(
  'GEMINI KEY:',
  process.env.GEMINI_API_KEY
    ? process.env.GEMINI_API_KEY.substring(0, 10) + '...'
    : 'NO ENCONTRADA'
);
    this.setupEndpoints();
  }

  private setupEndpoints() {
    this.app.get('/health', (_req, res) => res.send('OK'));

    // Servidor de teselas MBTiles integrado
    this.app.get('/tiles/:filename/:z/:x/:y', (req, res) => {
      const { filename, z, x, y } = req.params;
      if (!this.currentChartsPath) return res.status(404).send('Ruta no configurada');

      const mbtilesFile = path.join(this.currentChartsPath, filename.endsWith('.mbtiles') ? filename : `${filename}.mbtiles`);

      if (!fs.existsSync(mbtilesFile)) return res.status(404).send('Carta no encontrada');

      const serveTile = (instance: any) => {
        instance.getTile(parseInt(z), parseInt(x), parseInt(y), (err: any, data: any, headers: any) => {
          if (err) return res.status(404).send('Tesela inexistente');
          res.set(headers);
          res.send(data);
        });
      };

      if (!this.mbtilesInstances[filename]) {
        new MBTiles(`${mbtilesFile}?mode=ro`, (err: any, mbtiles: any) => {
          if (err) return res.status(500).send(err.message);
          this.mbtilesInstances[filename] = mbtiles;
          serveTile(mbtiles);
        });
      } else {
        serveTile(this.mbtilesInstances[filename]);
      }
    });

    // Endpoint para actualizar la ruta de cartas desde la UI
    this.app.post('/api/settings/charts-path', (req, res) => {
      const { path: newPath } = req.body;
      this.currentChartsPath = newPath;
      log.info(`📂 Repositorio de cartas actualizado a: ${newPath}`);
      res.json({ success: true });
    });
    this.app.post('/api/chat', async (req, res) => {
  try {

    if (!this.genAI) {
      return res.status(500).json({
        error: 'GEMINI_API_KEY no configurada'
      });
    }

    const {
      prompt,
      systemInstruction
    } = req.body;

    if (!prompt) {
      return res.status(400).json({
        error: 'Falta prompt'
      });
    }

    const modelName = 'models/gemini-2.5-flash';

console.log('MODELO USADO:', modelName);

const model = this.genAI.getGenerativeModel({
  model: modelName
});

    const fullPrompt = `
${systemInstruction || ''}

${prompt}
`;

    const result = await model.generateContent(fullPrompt);

    const response = await result.response;

    res.json({
      text: response.text()
    });

  } catch (error: any) {

  console.error('ERROR RAW:', error);
  console.error('ERROR MESSAGE:', error?.message);
  console.error('ERROR STATUS:', error?.status);
  console.error('ERROR STACK:', error?.stack);

  res.status(500).json({
    error: error?.message || 'Error Gemini'
  });

    console.error(
  'Gemini Error:',
  JSON.stringify(error, null, 2)
);

    res.status(500).json({
      error: error.message
    });

  }
});
    // Listado de cartas disponibles
this.app.get('/api/charts', async (_req, res) => {
  if (!this.currentChartsPath || !fs.existsSync(this.currentChartsPath)) {
    return res.json([]);
  }

  try {
    const files = fs
      .readdirSync(this.currentChartsPath)
      .filter(f => f.toLowerCase().endsWith('.mbtiles'));

    const chartsWithMetadata: any[] = [];

    for (const file of files) {
      chartsWithMetadata.push({
        name: file
      });
    }

    res.json(chartsWithMetadata);

  } catch (error: any) {
    res.status(500).json({
      error: error.message
    });
  }
});
  }

  public setChartsPath(newPath: string) {
    this.currentChartsPath = newPath;
  }

  public start(port: number = 8089) {
    try {
      this.server = this.app.listen(port, () => {
        log.info(`🚀 Motor Táctico (MapService) online en puerto ${port}`);
      });
    } catch (error) {
      log.error('Fallo al iniciar MapService:', error);
    }
    this.app.get('/api/list-models', async (_req, res) => {

  try {

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${process.env.GEMINI_API_KEY}`
    );

    const data = await response.json();

    res.json(data);

  } catch (err: any) {

    res.status(500).json({
      error: err.message
    });

  }

});
  }
}