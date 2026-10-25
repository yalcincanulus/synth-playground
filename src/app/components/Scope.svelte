<script lang="ts">
  import { glowStroke, grid, surface, type Surface } from "./canvas";

  let { analyser, color }: { analyser: AnalyserNode; color: string } = $props();

  const buf = new Float32Array(4096);
  const WINDOW = 1024; // ~21 ms at 48 kHz: two cycles of a low note

  /** The last frame drawn was silence: while it stays silent, there is nothing new to draw. */
  let drewSilence = false;
  function idle() {
    analyser.getFloatTimeDomainData(buf);
    let peak = 0;
    for (let i = 0; i < buf.length; i += 4) peak = Math.max(peak, Math.abs(buf[i]));
    const silent = peak < 1e-5;
    const skip = silent && drewSilence;
    drewSilence = silent;
    return skip;
  }

  function draw({ g, w, h }: Surface) {
    grid(g, w, h, [w / 4, w / 2, (3 * w) / 4], [h / 4, h / 2, (3 * h) / 4]);
    analyser.getFloatTimeDomainData(buf);

    // Trigger on a rising zero crossing so periodic waves stand still.
    let start = 0;
    for (let i = 1; i < buf.length - WINDOW; i++) {
      if (buf[i - 1] < 0 && buf[i] >= 0) {
        start = i;
        break;
      }
    }
    let peak = 0;
    for (let i = start; i < start + WINDOW; i++) peak = Math.max(peak, Math.abs(buf[i]));
    // Gentle auto-gain so quiet sounds are still visible, capped so noise isn't blown up.
    const gain = peak > 0.001 ? Math.min(4, 0.9 / peak) : 1;

    g.beginPath();
    for (let i = 0; i < WINDOW; i++) {
      const x = (i / (WINDOW - 1)) * w;
      const y = h / 2 - buf[start + i] * gain * (h / 2) * 0.9;
      if (i === 0) g.moveTo(x, y);
      else g.lineTo(x, y);
    }
    glowStroke(g, color, 2);
  }
</script>

<canvas use:surface={{ draw, animate: true, idle }}></canvas>

<style>
  /* Absolute, so the canvas pixel size never feeds back into the layout. */
  canvas { position: absolute; inset: 0; width: 100%; height: 100%; display: block; }
</style>
