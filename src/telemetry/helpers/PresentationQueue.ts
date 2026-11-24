/** Coalesces presentation work only. Never enqueue ingestion, alarms or navigation here. */
export class PresentationQueue {
    private readonly pending = new Map<string, () => void>();
    private timer: ReturnType<typeof setTimeout> | null = null;

    constructor(
        private readonly intervalMs = 100,
        private readonly run: (flush: () => void) => void = flush => flush()
    ) {}

    public schedule(key: string, update: () => void): void {
        this.pending.set(key, update);
        // A fixed window, not a debounce: continuous telemetry cannot starve the display.
        if (this.timer !== null) return;
        this.timer = setTimeout(() => {
            this.timer = null;
            const updates = [...this.pending.values()];
            this.pending.clear();
            this.run(() => { for (const apply of updates) apply(); });
        }, this.intervalMs);
    }

    public cancel(): void {
        if (this.timer !== null) clearTimeout(this.timer);
        this.timer = null;
        this.pending.clear();
    }
}
