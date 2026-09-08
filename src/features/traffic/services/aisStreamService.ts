
import { AISTarget } from '../../../types/ais';

export class AISStreamService {
  private socket: WebSocket | null = null;

  disconnect(): void {
    this.socket?.close();
    this.socket = null;
  }

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
      [35.0, -6.0],
      [38.0, 1.0]
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

  console.log('================ AIS DEBUG ================');
  console.log('AISStream.connect() EJECUTADO');
  console.log('API KEY PRESENTE:', !!apiKey);
  console.log('API KEY LENGTH:', apiKey?.length ?? 0);
  console.log('AIS MODE:', this.AIS_MODE);
  console.log('BOUNDING BOX:', this.getBoundingBoxes());
  console.log('============================================');

  if (!apiKey) {
    console.error('❌ AISSTREAM: VITE_AISSTREAM_API_KEY NO EXISTE');
    return;
  }

  this.socket = new WebSocket(
    'wss://stream.aisstream.io/v0/stream'
  );

  this.socket.onopen = () => {
    console.log('🟢 AISSTREAM WEBSOCKET CONECTADO');

    const subscription = {
      APIKey: apiKey,
      BoundingBoxes: this.getBoundingBoxes()
    };

    console.log(
      'AISSTREAM SUSCRIPCIÓN:',
      JSON.stringify({
        ...subscription,
        APIKey: '***'
      })
    );

    this.socket?.send(JSON.stringify(subscription));

    console.log('🟢 AISSTREAM SUSCRIPCIÓN ENVIADA');
  };

  this.socket.onmessage = async (event) => {
  console.log('📡 AISSTREAM EVENTO RECIBIDO');
  console.log('EVENT TYPE:', typeof event.data);

  try {
    const text =
      event.data instanceof Blob
        ? await event.data.text()
        : String(event.data);

    console.log('📡 AISSTREAM RAW:', text);

    const data = JSON.parse(text);

    console.log('🚢 AISSTREAM MENSAJE:', data);
  } catch (error) {
    console.error('❌ AIS PARSE ERROR:', error);
  }
};

  this.socket.onerror = (event) => {
    console.error('🔴 AISSTREAM WEBSOCKET ERROR:', event);
  };

  this.socket.onclose = (event) => {
  console.warn('🟡 AISSTREAM DESCONECTADO');
  console.log('Código:', event.code);
  console.log('Motivo:', event.reason);
  console.log('Clean:', event.wasClean);
};

this.socket.onerror = (event) => {
  console.error('🔴 AISSTREAM WEBSOCKET ERROR:', event);
};
}
}
