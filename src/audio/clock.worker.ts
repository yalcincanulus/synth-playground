// The sequencer's clock: a timer in a Web Worker. Browsers slow down a background tab's own
// timers (to about once a second), but not a worker's, so the sequencer keeps waking on time.
// Message { interval } starts ticking every `interval` ms; null stops.

const scope = self as unknown as {
  onmessage: ((e: MessageEvent<{ interval: number } | null>) => void) | null;
  postMessage(message: unknown): void;
};
let timer: ReturnType<typeof setInterval> | undefined;

scope.onmessage = (e) => {
  clearInterval(timer);
  if (e.data) timer = setInterval(() => scope.postMessage(0), e.data.interval);
};
