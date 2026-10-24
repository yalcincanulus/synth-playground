import ClockWorker from "./clock.worker.ts?worker";

/** Something that calls back at a steady interval while started. */
export interface Ticker {
  start(intervalMs: number, onTick: () => void): void;
  stop(): void;
}

/** Ticks from a Web Worker, so a background tab doesn't slow it down (see clock.worker.ts). */
export class WorkerClock implements Ticker {
  private worker = new ClockWorker();

  start(intervalMs: number, onTick: () => void) {
    this.worker.onmessage = onTick;
    this.worker.postMessage({ interval: intervalMs });
  }

  stop() {
    this.worker.postMessage(null);
    this.worker.onmessage = null;
  }
}
