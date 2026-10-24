<script lang="ts">
  import { FILTER_MODELS, FILTER_TYPES, formatValue, type ParamValues } from "../../audio/params";
  import { filterMagnitude } from "../../audio/filterResponse";
  import { FREQ_GRID, freqX, grid, surface, xFreq, type Surface } from "./canvas";

  let { ctx, values, color }: { ctx: BaseAudioContext; values: ParamValues; color: string } = $props();

  const POINTS = 200;
  const freqs = new Float32Array(POINTS);
  const mag = new Float32Array(POINTS);
  const MIN_DB = -36;
  const MAX_DB = 30;

  function response(cutoff: number) {
    return filterMagnitude(values, cutoff, ctx.sampleRate, freqs, mag);
  }

  function curve(g: CanvasRenderingContext2D, w: number, h: number, m: Float32Array) {
    g.beginPath();
    for (let i = 0; i < POINTS; i++) {
      const db = 20 * Math.log10(Math.max(m[i], 1e-6));
      const y = h - ((Math.max(MIN_DB, Math.min(MAX_DB, db)) - MIN_DB) / (MAX_DB - MIN_DB)) * h;
      const x = (i / (POINTS - 1)) * w;
      if (i === 0) g.moveTo(x, y);
      else g.lineTo(x, y);
    }
  }

  function draw({ g, w, h }: Surface) {
    for (let i = 0; i < POINTS; i++) freqs[i] = xFreq((i / (POINTS - 1)) * w, w);
    const zeroY = h - ((0 - MIN_DB) / (MAX_DB - MIN_DB)) * h;
    grid(g, w, h, FREQ_GRID.map((f) => freqX(f, w)), [zeroY]);

    // Where the envelope pushes the filter to, drawn as a ghost curve.
    if (Math.abs(values.filterEnvAmt) > 0.05) {
      curve(g, w, h, response(values.cutoff * Math.pow(2, values.filterEnvAmt)));
      g.setLineDash([4, 4]);
      g.strokeStyle = "#ffffff50";
      g.lineWidth = 1;
      g.stroke();
      g.setLineDash([]);
    }

    curve(g, w, h, response(values.cutoff));
    g.strokeStyle = color;
    g.lineWidth = 2;
    g.stroke();
    g.lineTo(w, h);
    g.lineTo(0, h);
    g.globalAlpha = 0.15;
    g.fillStyle = color;
    g.fill();
    g.globalAlpha = 1;

    const cx = freqX(values.cutoff, w);
    g.fillStyle = color;
    g.beginPath();
    g.arc(cx, zeroY, 3, 0, Math.PI * 2);
    g.fill();
    g.font = "11px ui-monospace, monospace";
    g.fillStyle = "#e8eef0";
    const model = FILTER_MODELS[values.filterModel] === "ladder" ? "ladder " : "";
    const text = `${model}${FILTER_TYPES[values.filterType]} · ${formatValue("cutoff", values.cutoff)}`;
    g.fillText(text, 8, 16);
  }

  // Redraw when any filter-related value changes.
  let key = $derived(`${values.cutoff}|${values.resonance}|${values.filterType}|${values.filterModel}|${values.filterEnvAmt}|${color}`);
</script>

<canvas use:surface={{ draw, key }}></canvas>

<style>
  /* Absolute, so the canvas pixel size never feeds back into the layout. */
  canvas { position: absolute; inset: 0; width: 100%; height: 100%; display: block; }
</style>
