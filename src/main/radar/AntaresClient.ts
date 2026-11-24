import { createConnection, type Socket } from 'node:net';
import { performance } from 'node:perf_hooks';
import { AntaresDecoder, AntaresTrackStore, type AntaresSnapshot } from '../../features/radar/antares';

/** Receive-only, fixed loopback endpoint. Never connects to the controller or NMEA. */
export class AntaresClient {
  private socket: Socket | null = null;
  private decoder = new AntaresDecoder();
  private readonly store = new AntaresTrackStore();
  private state: AntaresSnapshot['state'] = 'disconnected';
  private error: string | null = null;
  private deadline: ReturnType<typeof setTimeout> | null = null;
  constructor(private readonly openSocket: () => Socket = () => createConnection({ host: '127.0.0.1', port: 17396 })) {}
  connect(): AntaresSnapshot {
    this.disconnect();
    this.decoder = new AntaresDecoder();
    this.state = 'connecting';
    const socket = this.openSocket();
    this.socket = socket;
    const fail = (message: string): void => {
      if (this.socket !== socket) return;
      this.disconnect(); this.state = 'error'; this.error = message;
    };
    this.deadline = setTimeout(() => fail('Tiempo de conexión agotado en 127.0.0.1:17396'), 4000);
    socket.setEncoding('utf8');
    socket.on('connect', () => {
      if (this.socket !== socket) return;
      if (this.deadline) clearTimeout(this.deadline);
      this.deadline = null; this.state = 'connected';
    });
    socket.on('data', (chunk: string) => {
      if (this.socket !== socket) return;
      for (const track of this.decoder.feed(chunk)) {
        // Both processes run on this host: old/replayed UTC packets are not fresh tracks.
        if (Math.abs(Date.now() - track.timestampMs) > 10000 || !this.store.ingest(track, performance.now())) this.decoder.rejected++;
      }
    });
    socket.on('error', (error: NodeJS.ErrnoException) => fail(`ANTARES: ${error.code ?? 'error TCP'}`));
    socket.on('close', () => fail('ANTARES cerró la conexión TCP'));
    return this.snapshot();
  }
  snapshot(): AntaresSnapshot {
    return { source: 'RADAR_SIM', state: this.state, tracks: this.store.snapshot(performance.now()), rejected: this.decoder.rejected, error: this.error };
  }
  disconnect(): void {
    const socket = this.socket; this.socket = null;
    if (this.deadline) clearTimeout(this.deadline);
    this.deadline = null;
    socket?.destroy();
    this.store.clear(); this.state = 'disconnected'; this.error = null;
  }
}
