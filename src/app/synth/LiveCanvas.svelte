<script lang="ts">
  import { surface, type Surface } from "../components/canvas";

  let { draw, height = 70 }: { draw: (s: Surface) => void; height?: number } = $props();
</script>

<div class="live" style:height="{height}px">
  <canvas use:surface={{ draw, animate: true }}></canvas>
</div>

<style>
  .live { position: relative; background: #0b0e10; border-radius: 4px; }
  canvas { position: absolute; inset: 0; width: 100%; height: 100%; display: block; }
</style>
