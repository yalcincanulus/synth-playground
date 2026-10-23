<script lang="ts">
  import { FREQ_GRID, freqX, grid, surface, type Surface } from "./canvas";

  let { analyser, color }: { analyser: AnalyserNode; color: string } = $props();

  let bins = $derived(new Float32Array(analyser.frequencyBinCount));
  const MIN_DB = -100;
  const MAX_DB = -10;

  function draw({ g, w, h }: Surface) {
    grid(g, w, h, FREQ_GRID.map((f) => freqX(f, w)), [h / 3, (2 * h) / 3]);
    g.fillStyle = "#ffffff40";
    g.font = "10px ui-monospace, monospace";
    for (const f of [100, 1000, 10000]) g.fillText(f >= 1000 ? `${f / 1000}k` : `${f}`, freqX(f, w) + 3, h - 4);

    analyser.getFloatFrequencyData(bins);
    const nyquist = analyser.context.sampleRate / 2;
    const y = (db: number) => h - ((Math.max(MIN_DB, Math.min(MAX_DB, db)) - MIN_DB) / (MAX_DB - MIN_DB)) * h;

    // One point per pixel column: the loudest bin that falls in it.
    g.beginPath();
    g.moveTo(0, h);
    let bin = 1;
    for (let x = 0; x <= w; x++) {
      const fHi = 20 * Math.pow(10, ((x + 1) / w) * 3);
      let db = -Infinity;
      while (bin < bins.length && (bin * nyquist) / bins.length < fHi) db = Math.max(db, bins[bin++]);
      if (db === -Infinity) db = bins[Math.min(bin, bins.length - 1)];
      g.lineTo(x, y(db));
    }
    g.lineTo(w, h);
    g.closePath();
    const fill = g.createLinearGradient(0, 0, 0, h);
    fill.addColorStop(0, color);
    fill.addColorStop(1, "transparent");
    g.globalAlpha = 0.35;
    g.fillStyle = fill;
    g.fill();
    g.globalAlpha = 1;
    g.strokeStyle = color;
    g.lineWidth = 1.5;
    g.stroke();
  }
</script>

<canvas use:surface={{ draw, animate: true }}></canvas>

<style>
  /* Absolute, so the canvas pixel size never feeds back into the layout. */
  canvas { position: absolute; inset: 0; width: 100%; height: 100%; display: block; }
</style>
