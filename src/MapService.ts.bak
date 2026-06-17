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
    console.log('MAPSERVICE CARGADO');
    this.app = express();
    this.app.use(cors());
    this.app.use(express.json());
    
    if (process.env.GEMINI_API_KEY) {
      this.genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    }
    
    this.setupEndpoints();
  }

  private setupEndpoints() {
    this.app.get('/health', (_req, res) => res.send('OK'));
    this.app.get('/test', (_req, res) => {
  console.log('TEST LLAMADO');
  res.send('TEST OK');
});
    this.app.get('/api/charts', (_req, res) => {
      console.log('API CHARTS LLAMADA');

  if (!this.currentChartsPath) {
    return res.json([]);
  }

  try {

    const files = fs
      .readdirSync(this.currentChartsPath)
      .filter(file =>
        file.toLowerCase().endsWith('.mbtiles')
      );

    return res.json(files);

  } catch (error) {

    log.error('Error leyendo cartas:', error);

    return res.status(500).json({
      error: 'No se pudieron leer las cartas'
    });
  }

});

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

    this.app.post('/api/settings/charts-path', (req, res) => {
      const { path: newPath } = req.body;
      console.log('API CHARTS LLAMADA');
      console.log('RUTA CARTAS:', this.currentChartsPath);
      this.currentChartsPath = newPath;
      log.info(`📂 Repositorio de cartas actualizado a: ${newPath}`);
      res.json({ success: true });
    });
  }

  public start(port: number = 8089) {
    try {
      this.server = this.app.listen(port, () => {
        log.info(`🚀 Motor Táctico (MapService) online en puerto ${port}`);
      });
    } catch (error) {
      log.error('Fallo al iniciar MapService:', error);
    }
  }
}
