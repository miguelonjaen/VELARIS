"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.NMEAService = void 0;
const serialport_1 = require("serialport");
const parser_readline_1 = require("@serialport/parser-readline");
const main_1 = __importDefault(require("electron-log/main"));
const NMEAParser_1 = require("./src/core/services/NMEAParser");
class NMEAService {
    onData;
    activePort = null;
    parser = new NMEAParser_1.NMEAParser();
    constructor(onData) {
        this.onData = onData;
    }
    connect(portPath) {
        if (this.activePort && this.activePort.isOpen) {
            this.activePort.close();
        }
        try {
            this.activePort = new serialport_1.SerialPort({
                path: portPath,
                baudRate: 4800,
                autoOpen: true
            });
            const parser = this.activePort.pipe(new parser_readline_1.ReadlineParser({ delimiter: "\r\n" }));
            parser.on("data", (line) => {
                const message = this.parser.parse(line);
                this.onData(message);
            });
            this.activePort.on("error", (err) => {
                main_1.default.error(`NMEA Error: ${err.message}`);
            });
            main_1.default.info(`⚓ Conectado a puerto NMEA: ${portPath}`);
            return true;
        }
        catch (error) {
            main_1.default.error(`Fallo al abrir puerto: ${error.message}`);
            return false;
        }
    }
}
exports.NMEAService = NMEAService;
