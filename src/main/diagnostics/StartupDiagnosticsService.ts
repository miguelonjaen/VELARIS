import { LIMITS, candidateKey, type Candidate, type DiagnosticReport, type DiagnosticRequest, type LocalInterface } from '../../features/nmea/startupDiagnostics/contracts';

export interface DiagnosticDependencies {
  interfaces(signal: AbortSignal): Promise<LocalInterface[]>;
  serial(signal: AbortSignal): Promise<string[]>;
  configured(target: unknown): Candidate | null;
  active(): Candidate | null;
  discover(iface: LocalInterface, signal: AbortSignal): Promise<Candidate[]>;
  probe(candidate: Candidate, signal: AbortSignal): Promise<Candidate>;
}

/** Each operation owns a child signal. Timeout/cancel settles even non-cancellable OS enumeration. */
export async function bounded<T>(parent: AbortSignal, ms: number, work: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const child = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let abort: () => void = () => undefined;
  try {
    return await new Promise<T>((resolve, reject) => {
      abort = () => { child.abort(); reject(new Error(parent.aborted ? 'Cancelado' : 'Timeout')); };
      if (parent.aborted) { abort(); return; }
      parent.addEventListener('abort', abort, { once: true });
      timer = setTimeout(abort, ms);
      Promise.resolve().then(() => work(child.signal)).then(resolve, reject);
    });
  } finally { clearTimeout(timer); parent.removeEventListener('abort', abort); child.abort(); }
}

export class StartupDiagnosticsService {
  private sequence = 0;
  private current: { controller: AbortController; promise: Promise<DiagnosticReport> } | null = null;
  constructor(private readonly deps: DiagnosticDependencies, private readonly globalMs: number = LIMITS.global) {}
  cancel(): void { this.current?.controller.abort(); }
  run(request: DiagnosticRequest = {}): Promise<DiagnosticReport> {
    if (this.current) return this.current.promise;
    const controller = new AbortController();
    const promise = this.execute(++this.sequence, request, controller).finally(() => { this.current = null; });
    this.current = { controller, promise };
    return promise;
  }
  private async execute(sessionId: number, request: DiagnosticRequest, controller: AbortController): Promise<DiagnosticReport> {
    const report: DiagnosticReport = { sessionId, phase: 'RUNNING', candidates: [], interfaces: [], issues: [] };
    const signal = controller.signal;
    const deadline = setTimeout(() => { report.phase = 'TIMEOUT'; controller.abort(); }, this.globalMs);
    const add = (candidate: Candidate) => {
      if (signal.aborted || report.candidates.length >= LIMITS.candidates) return;
      const id = candidateKey(candidate);
      if (!report.candidates.some(c => c.id === id)) report.candidates.push({ ...candidate, id });
    };
    const checked = async (label: string, ms: number, work: (s: AbortSignal) => Promise<void>) => {
      try { await bounded(signal, ms, work); } catch { if (!signal.aborted) report.issues.push(`${label}: no disponible o tiempo agotado`); }
    };
    try {
      const active = this.deps.active();
      if (active) add(active);
      const configured = this.deps.configured(request.target);
      if (configured) add(configured);
      await Promise.all([
        checked('Interfaces', LIMITS.interfaces, async s => { const interfaces = await this.deps.interfaces(s); if (!s.aborted) report.interfaces = interfaces; }),
        checked('Serie', LIMITS.serial, async s => { const paths = await this.deps.serial(s); if (!s.aborted) paths.forEach(path => add({ id: '', transport: 'serial', path, configured: false, state: 'DETECTED', protocol: 'UNKNOWN', lastValidAt: null, instruments: [], reason: 'Puerto enumerado; no abierto', action: 'Seleccionar en configuración' })); })
      ]);
      // A fixed worker pool accounts for mDNS sockets and TCP checks together.
      const jobs: Array<() => Promise<void>> = report.interfaces.filter(i => i.eligible && request.authorizedInterfaces?.includes(i.address)).map(iface => () => checked('mDNS', LIMITS.mdns, async s => { const found = await this.deps.discover(iface, s); if (!s.aborted) found.forEach(add); }));
      for (const c of report.candidates.filter(c => c.configured && c.transport === 'tcp')) {
        if (active && candidateKey(active) === c.id && active.state !== 'DISCONNECTED') continue;
        jobs.push(() => checked('TCP', LIMITS.tcp + LIMITS.telemetry, async s => {
          // Recheck ownership immediately before touching the network.
          const owner = this.deps.active();
          const next = owner && candidateKey(owner) === c.id && owner.state !== 'DISCONNECTED' ? owner : await this.deps.probe(c, s);
          if (!s.aborted) Object.assign(c, next, { id: c.id });
        }));
      }
      let cursor = 0;
      await Promise.all(Array.from({ length: Math.min(LIMITS.network, jobs.length) }, async () => {
        while (!signal.aborted) { const job = jobs[cursor++]; if (!job) return; await job(); }
      }));
      if (signal.aborted) report.issues.push('Resultados parciales; operaciones pendientes canceladas');
      if (report.phase === 'RUNNING') report.phase = signal.aborted ? 'CANCELLED' : 'COMPLETE';
      return report;
    } finally { clearTimeout(deadline); controller.abort(); }
  }
}
