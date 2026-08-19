
import { AISTarget } from '../../../types/ais';

export class AISStreamService {
  private socket: WebSocket | null = null;

  // MODOS DISPONIBLES:
  // 'LOCAL'
  // 'MEDITERRANEAN'
  // 'SPAIN'
 private readonly AIS_MODE:
  'LOCAL' |
  'SPAIN' |
  'MEDITERRANEAN' |
  'DYNAMIC' = 'DYNAMIC';

  private getBoundingBoxes() {
    switch (this.AIS_MODE) {

      case 'LOCAL':
        return [
          [
            [35.5, -5.0],
            [37.5, -2.0]
          ]
        ];

      case 'MEDITERRANEAN':
        return [
          [
            [35.0, -6.0],
            [44.0, 15.0]
          ]
        ];

      case 'SPAIN':
        return [
          [
            [27.0, -19.0],
            [44.0, 5.0]
          ]
        ];
        case 'DYNAMIC':
  return [
    [
      [35.5, -5.0],
      [37.5, -2.0]
    ]
  ];

      default:
        return [
          [
            [35.5, -5.0],
            [37.5, -2.0]
          ]
        ];
    }
  }

  connect() {
    const apiKey = import.meta.env.VITE_AISSTREAM_API_KEY;

    console.log('API KEY:', apiKey);
    console.trace('Conectando AISStream...');
    console.log('Modo AIS:', this.AIS_MODE);

    this.socket = new WebSocket('wss://stream.aisstream.io/v0/stream');

    this.socket.onopen = () => {
      console.log('AISStream conectado');
      console.log('Enviando suscripción AIS...');

      this.socket?.send(
        JSON.stringify({
          APIKey: apiKey,
          BoundingBoxes: this.getBoundingBoxes()
        })
      );
    };

    this.socket.onmessage = async (event) => {
      try {
        const text =
          event.data instanceof Blob
            ? await event.data.text()
            : event.data;

        const data = JSON.parse(text);

        console.log('AIS:', data);

      } catch (error) {
        console.error('AIS PARSE ERROR:', error);
        console.log('RAW DATA:', event.data);
      }
    };

    this.socket.onerror = (err) => {
      console.error('AIS ERROR', err);
    };

    this.socket.onclose = (event) => {
      console.log('AIS desconectado');
      console.log('Código:', event.code);
      console.log('Motivo:', event.reason);
      console.log('Clean:', event.wasClean);
    };
  }

  disconnect() {
    this.socket?.close();
  }
}