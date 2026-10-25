<script lang="ts">
  import { CHORD_MODE_NAMES, CHORD_MODES, chordName, keyNotes, playable, ROOT_NAMES, SCALE_IDS, SCALES, type ChordMode, type ScaleId } from "../../audio/scale";
  import type { Playground } from "../playground.svelte";

  let { pg }: { pg: Playground } = $props();

  type Scale = Exclude<ScaleId, "off">;
  const SCALE_CHOICES = SCALE_IDS.filter((id): id is Scale => id !== "off");
  const CHORD_SHORT: Record<ChordMode, string> = { off: "Notes", triads: "Triads", sevenths: "7ths" };

  // The switch brings back the scale you used last (Major the first time); remembered per browser.
  const LAST_SCALE_KEY = "minilab3.lastScale";
  function lastScale(): Scale {
    try {
      const saved = localStorage.getItem(LAST_SCALE_KEY) as Scale | null;
      return saved && saved in SCALES ? saved : "major";
    } catch {
      return "major";
    }
  }

  let s = $derived(pg.scale);
  let on = $derived(s.scale !== "off");
  /** The chord on each note of the scale, root first: what one finger can play. */
  let chords = $derived(
    on && s.chords !== "off"
      ? Array.from({ length: 12 }, (_, i) => 60 + s.root + i)
          .filter((n) => playable(n, s))
          .map((n) => chordName(keyNotes(n, s), s))
      : [],
  );

  function toggle() {
    if (on) {
      try {
        localStorage.setItem(LAST_SCALE_KEY, s.scale);
      } catch {
        // Not saved (private window): Major next time.
      }
      pg.setScale({ scale: "off" });
    } else pg.setScale({ scale: lastScale() });
  }

  /** Menus give the focus back, so the computer keyboard plays notes again. */
  const blur = (e: Event) => (e.currentTarget as HTMLElement).blur();
</script>

<div class="scale" class:on>
  <button class="switch" role="switch" aria-checked={on} onclick={(e) => { toggle(); blur(e); }} title="Every key you press moves to the nearest note of the scale, so nothing sounds wrong">
    <span class="track"><span class="thumb"></span></span>
    Scale lock
  </button>

  {#if on}
    <div class="settings">
      <select class="root" value={s.root} aria-label="Root" title="The scale's first note (marked on the keys)" onchange={(e) => {
        pg.setScale({ root: +e.currentTarget.value });
        blur(e);
      }}>
        {#each ROOT_NAMES as name, i (i)}<option value={i}>{name}</option>{/each}
      </select>
      <select value={s.scale} aria-label="Scale" onchange={(e) => {
        pg.setScale({ scale: e.currentTarget.value as ScaleId });
        blur(e);
      }}>
        {#each SCALE_CHOICES as id (id)}<option value={id}>{SCALES[id].name}</option>{/each}
      </select>
      <div class="seg" role="radiogroup" aria-label="One key plays">
        {#each CHORD_MODES as mode (mode)}
          <button role="radio" aria-checked={s.chords === mode} class:active={s.chords === mode} title={mode === "off" ? "One key plays one note" : `One key plays a whole chord of scale notes: ${CHORD_MODE_NAMES[mode]}`} onclick={(e) => {
            pg.setScale({ chords: mode });
            blur(e);
          }}>{CHORD_SHORT[mode]}</button>
        {/each}
      </div>
    </div>
  {/if}

  {#if chords.length}
    <ol class="chords" aria-label="The chords of the scale">
      {#each chords as name, i (i)}<li class:now={name === pg.chord?.name}>{name}</li>{/each}
    </ol>
  {:else if pg.explain}
    <p class="note" title={on ? `${SCALES[s.scale as Scale].explain} Grey keys move to the nearest scale note; the marked keys are the root.` : undefined}>
      {#if !on}
        Turn it on and every key you press moves to the nearest note of a scale, so nothing sounds wrong.
      {:else}
        {SCALES[s.scale as Scale].explain} Grey keys move to the nearest scale note; the marked keys are the root.
      {/if}
    </p>
  {/if}
</div>

<style>
  .scale { display: flex; align-items: center; gap: 12px; flex: 1; min-width: 0; font-size: 12px; }

  /* An on/off switch: a pill with a sliding dot. */
  .switch { display: flex; align-items: center; gap: 8px; flex: none; background: none; border: none; padding: 4px 2px; color: var(--dim); font-size: 12px; }
  .switch:hover { color: var(--text); }
  .track { position: relative; width: 30px; height: 16px; border-radius: 8px; background: #2a3338; border: 1px solid var(--line); transition: background 0.15s; }
  .thumb { position: absolute; top: 2px; left: 2px; width: 10px; height: 10px; border-radius: 50%; background: #8b9497; transition: transform 0.15s, background 0.15s; }
  .on .switch { color: var(--text); }
  .on .track { background: color-mix(in srgb, var(--accent) 35%, #0b0e10); border-color: var(--accent); }
  .on .thumb { transform: translateX(14px); background: var(--accent); }

  .settings { display: flex; align-items: center; gap: 6px; flex: none; }
  select { font-size: 12px; padding: 3px 6px; }
  .root { width: 58px; }
  .seg { display: flex; align-items: center; gap: 2px; margin-left: 4px; background: #0b0e10; border: 1px solid var(--line); border-radius: 6px; padding: 2px; }
  .seg button { border: none; background: none; font-size: 11.5px; padding: 2px 9px; border-radius: 4px; color: var(--dim); white-space: nowrap; }
  .seg button:hover { color: var(--text); }
  .seg .active, .seg .active:hover { background: var(--accent); color: #0b1314; font-weight: 600; }

  .chords { display: flex; gap: 4px; list-style: none; margin: 0; padding: 0; min-width: 0; overflow: hidden; }
  .chords li { font: 11px var(--mono); padding: 2px 7px; border: 1px solid var(--line); border-radius: 4px; color: var(--text); white-space: nowrap; }
  .chords li.now { border-color: var(--accent); color: var(--accent); }
  .note {
    margin: 0; flex: 1; min-width: 0; color: #a9b6ba; font-size: 11.5px; line-height: 1.35;
    display: -webkit-box; -webkit-line-clamp: 2; line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
  }
</style>
