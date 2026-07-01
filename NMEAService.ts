import { SerialPort } from "serialport";
import { ReadlineParser } from "@serialport/parser-readline";
import log from "electron-log/main";

import { NMEAParser } from "@/core/services/NMEAParser";
import { TelemetryMessage } from "@/core/types/TelemetryMessage";

export class NMEAService {

    private activePort: InstanceType<typeof SerialPort> | null = null;

    private readonly parser = new NMEAParser();

    constructor(
        private readonly onData: (message: TelemetryMessage) => void
    ) {}

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

            const parser = this.activePort.pipe(
                new ReadlineParser({ delimiter: "\r\n" })
            );

            parser.on("data", (line: string) => {

                const message = this.parser.parse(line);

                this.onData(message);

            });

            this.activePort.on("error", (err: Error) => {
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