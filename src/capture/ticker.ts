import TimerWorker from './timer.worker?worker&inline';

/** Calls `tick` every `ms`, also in a background tab. */
export class Ticker {
  private worker: Worker | null = null;
  private fallback: ReturnType<typeof setInterval> | null = null;

  constructor(private readonly tick: () => void) {}

  start(ms: number): void {
    this.stop();
    if (!this.worker) {
      try {
        this.worker = new TimerWorker();
        this.worker.onmessage = () => this.tick();
      } catch { this.worker = null; }
    }
    if (this.worker) this.worker.postMessage(ms);
    else this.fallback = setInterval(this.tick, ms);
  }

  stop(): void {
    this.worker?.postMessage(0);
    if (this.fallback) { clearInterval(this.fallback); this.fallback = null; }
  }
}
