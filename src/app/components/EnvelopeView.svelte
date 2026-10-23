<script lang="ts">
  import { toControl, type ParamValues } from "../../audio/params";
  import { grid, surface, type Surface } from "./canvas";

  let { values, color }: { values: ParamValues; color: string } = $props();

  // Segment widths follow the fader/knob position, not raw seconds, so 5 ms and 5 s are both readable.
  const seg = (id: "attack" | "decay" | "release" | "filterAttack" | "filterDecay" | "filterRelease", v: number) => 0.04 + 0.22 * toControl(id, v);
  const SUSTAIN_HOLD = 0.2;

  function path(g: CanvasRenderingContext2D, w: number, h: number, a: number, d: number, s: number, r: number, scale: number) {
    const pad = 6;
    const top = pad;
    const bottom = h - pad;
    const y = (level: number) => bottom - level * scale * (bottom - top);
    let x = pad;
    const W = w - pad * 2;
    g.beginPath();
    g.moveTo(x, y(0));
    x += a * W;
    g.lineTo(x, y(1));
    // Exponential-looking decay toward sustain.
    const dx = d * W;
    for (let i = 1; i <= 20; i++) g.lineTo(x + (dx * i) / 20, y(s + (1 - s) * Math.exp((-4 * i) / 20)));
    x += dx;
    x += SUSTAIN_HOLD * W;
    g.lineTo(x, y(s));
    const rx = r * W;
    for (let i = 1; i <= 20; i++) g.lineTo(x + (rx * i) / 20, y(s * Math.exp((-4 * i) / 20)));
  }

  function draw({ g, w, h }: Surface) {
    grid(g, w, h, [], [h / 2]);
    const v = values;
    // Filter envelope: dashed, scaled by its amount.
    const amount = Math.min(1, Math.abs(v.filterEnvAmt) / 4);
    if (amount > 0.01) {
      path(g, w, h, seg("filterAttack", v.filterAttack), seg("filterDecay", v.filterDecay), v.filterSustain, seg("filterRelease", v.filterRelease), amount);
      g.setLineDash([4, 4]);
      g.strokeStyle = "#ffffff60";
      g.lineWidth = 1.5;
      g.stroke();
      g.setLineDash([]);
    }
    path(g, w, h, seg("attack", v.attack), seg("decay", v.decay), v.sustain, seg("release", v.release), 1);
    g.strokeStyle = color;
    g.lineWidth = 2.5;
    g.lineJoin = "round";
    g.stroke();

    g.font = "11px ui-monospace, monospace";
    g.fillStyle = "#e8eef0";
    g.fillText("amp", 8, 16);
    if (amount > 0.01) {
      g.fillStyle = "#ffffff80";
      g.fillText("- - filter", 40, 16);
    }
  }

  let key = $derived(
    `${values.attack}|${values.decay}|${values.sustain}|${values.release}|${values.filterAttack}|${values.filterDecay}|${values.filterSustain}|${values.filterRelease}|${values.filterEnvAmt}|${color}`,
  );
</script>

<canvas use:surface={{ draw, key }}></canvas>

<style>
  /* Absolute, so the canvas pixel size never feeds back into the layout. */
  canvas { position: absolute; inset: 0; width: 100%; height: 100%; display: block; }
</style>
