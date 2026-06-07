import { SerialPort } from 'serialport';
import { ReadlineParser } from '@serialport/parser-readline';
import log from 'electron-log/main';

export class NMEAService {
  private activePort: InstanceType<typeof SerialPort> | null = null;

  constructor(private onData: (data: any) => void) {}

  public connect(portPath: string): boolean {
    if (this.activePort && this.activePort.isOpen) {
      this.activePort.close();
    }

    try {
      this.activePort = new SerialPort({
        path: portPath,
        baudRate: 4800,
        autoOpen: true
      });

      const parser = this.activePort.pipe(new ReadlineParser({ delimiter: '\r\n' }));

      parser.on('data', (line: string) => {
        // En producción, aquí se llamaría al NMEAProcessor para devolver un VesselState
        this.onData(line);
      });

      this.activePort.on('error', (err: Error) => {
        log.error(`NMEA Error: ${err.message}`);
      });
      
      log.info(`⚓ Conectado a puerto NMEA: ${portPath}`);
      return true;
    } catch (error: any) {
      log.error(`Fallo al abrir puerto: ${error.message}`);
      return false;
    }
  }
}