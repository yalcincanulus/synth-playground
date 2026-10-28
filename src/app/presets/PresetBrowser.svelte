<script lang="ts">
  import { filterPresets, isUserPresetId, type PresetGroup } from "../../presets/browser";
  import { CATEGORIES, TAG_CHOICES, type Preset } from "../../presets/presets";
  import type { Playground } from "../playground.svelte";

  let { pg, onclose }: { pg: Playground; onclose: () => void } = $props();

  let f = $derived(pg.presetFilter);
  let list = $derived(filterPresets(pg.presets, f, pg.favourites));
  /** The row the arrow keys are on (Enter loads it). */
  let cursor = $state(-1);
  let message = $state<{ ok: boolean; text: string } | null>(null);
  let search: HTMLInputElement;
  let fileInput: HTMLInputElement;
  let listEl = $state<HTMLElement>();

  const GROUP_NAMES: Record<string, string> = { all: "All", favourites: "★ Favourites", mine: "My presets" };
  let groups = $derived<{ id: PresetGroup; name: string; count: number }[]>([
    ...(["all", "favourites", "mine"] as const).map((id) => ({ id, name: GROUP_NAMES[id], count: filterPresets(pg.presets, { group: id, query: "", tags: [] }, pg.favourites).length })),
    ...CATEGORIES.map((c) => ({ id: c, name: c === "Test" ? "Feature demos" : c, count: pg.presets.filter((p) => p.category === c).length })),
  ]);

  $effect(() => {
    search.focus();
  });
  // A new search starts at the top of the list.
  $effect(() => {
    void f;
    cursor = -1;
  });

  const rgb = (p: Preset) => `rgb(${p.color.map((c) => Math.round(c * 2 * 0.75 + 255 * 0.25)).join(" ")})`;

  function setGroup(group: PresetGroup) {
    pg.setPresetFilter({ group });
    search.focus();
  }

  function toggleTag(tag: string) {
    pg.setPresetFilter({ tags: f.tags.includes(tag) ? f.tags.filter((t) => t !== tag) : [...f.tags, tag] });
    search.focus();
  }

  function keydown(e: KeyboardEvent) {
    if (e.key === "Escape") return onclose();
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (!list.length) return;
      cursor = Math.max(0, Math.min(list.length - 1, cursor + (e.key === "ArrowDown" ? 1 : -1)));
      listEl?.querySelectorAll("li")[cursor]?.scrollIntoView({ block: "nearest" });
      return;
    }
    if (e.key === "Enter" && list.length) {
      const p = list[Math.max(0, cursor)];
      pg.loadPreset(p.id);
      if (e.shiftKey) pg.previewPreset(p.id);
    }
  }

  function rename(p: Preset) {
    const name = prompt("New name", p.name);
    if (name) pg.renameUserPreset(p.id, name);
  }

  function remove(p: Preset) {
    if (confirm(`Delete "${p.name}"? A part playing it keeps the sound until you load another.`)) pg.deleteUserPreset(p.id);
  }

  function exportMine() {
    const blob = new Blob([pg.exportPresets()], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `minilab3-presets-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
    message = { ok: true, text: `${pg.userPresets.length} preset${pg.userPresets.length === 1 ? "" : "s"} saved to a file` };
  }

  async function copyLink() {
    let url: string;
    try {
      url = await pg.soundShareLink();
    } catch (err) {
      message = { ok: false, text: (err as Error).message };
      return;
    }
    try {
      await navigator.clipboard.writeText(url);
      message = { ok: true, text: `Link to "${pg.preset.name}"${pg.dirty ? " (with your changes)" : ""} copied` };
    } catch {
      // No clipboard (not allowed here): copy it by hand.
      prompt("Copy this link:", url);
    }
  }

  async function importFile(file: File | undefined) {
    if (!file) return;
    try {
      message = { ok: true, text: await pg.importPresets(file) };
      pg.setPresetFilter({ group: "mine", query: "", tags: [] });
    } catch (err) {
      message = { ok: false, text: (err as Error).message };
    }
    fileInput.value = "";
  }
</script>

<div class="browser" role="dialog" aria-label="Preset browser">
  <div class="top">
    <input
      bind:this={search}
      class="search"
      type="search"
      placeholder={'Search: "dark bass", "plucky", "wide pad"…'}
      value={f.query}
      oninput={(e) => pg.setPresetFilter({ query: e.currentTarget.value })}
      onkeydown={keydown}
      aria-label="Search presets"
    />
    {#if message}<span class="message" class:bad={!message.ok}>{message.text}</span>{/if}
    <span class="push"></span>
    <button onclick={copyLink} title="Copy a link that opens the sound you are playing (with your changes) in any browser">Copy link</button>
    <button onclick={() => fileInput.click()} title="Add presets from a file (exported on this or another computer)">Import…</button>
    <button onclick={exportMine} disabled={!pg.userPresets.length} title="Save your own presets to a file, to keep or to open on another computer">Export mine</button>
    <input bind:this={fileInput} type="file" accept=".json,application/json" hidden onchange={(e) => importFile(e.currentTarget.files?.[0])} />
    <button class="close" onclick={onclose} aria-label="Close" title="Close (Esc)">✕</button>
  </div>

  <div class="body">
    <nav aria-label="Groups">
      {#each groups as g, i (g.id)}
        {#if i === 3}<hr />{/if}
        <button class:active={f.group === g.id} onclick={() => setGroup(g.id)}>
          {g.name}<span class="count">{g.count}</span>
        </button>
      {/each}
    </nav>

    <div class="main">
      <div class="tags" role="group" aria-label="Describing words">
        {#each TAG_CHOICES as tag (tag)}
          <button class:active={f.tags.includes(tag)} aria-pressed={f.tags.includes(tag)} onclick={() => toggleTag(tag)}>{tag}</button>
        {/each}
      </div>

      {#if list.length}
        <ul bind:this={listEl}>
          {#each list as p, i (p.id)}
            {@const user = isUserPresetId(p.id)}
            <li class:current={p.id === pg.preset.id} class:cursor={i === cursor} class:browsed={p.id === pg.browseId}>
              <button class="load" class:about={!!p.about} onclick={() => pg.loadPreset(p.id)} ondblclick={onclose} title={p.about ? `${p.about}\n\nLoad (double-click: load and close)` : "Load (double-click: load and close)"}>
                <span class="dot" style:background={rgb(p)}></span>
                <span class="name">{p.name}</span>
                <span class="cat">{user ? `mine · ${p.category}` : p.category}</span>
                <!-- A Classic says what it recreates instead of its describing words (they are still searchable). -->
                <span class="ptags">{p.about ? p.about : p.tags?.join(" · ")}</span>
              </button>
              <button class="icon" onclick={() => pg.previewPreset(p.id)} title="Hear it first (a short note) without loading it" aria-label="Preview {p.name}">▷</button>
              <button class="icon star" class:on={pg.isFavourite(p.id)} onclick={() => pg.toggleFavourite(p.id)} aria-pressed={pg.isFavourite(p.id)} title={pg.isFavourite(p.id) ? `Favourite${pg.hw(" (the first 8 are on pad bank B)")}. Click to remove` : `Add to favourites${pg.hw(" (the first 8 are on pad bank B)")}`} aria-label="Favourite">★</button>
              {#if user}
                <button class="icon" onclick={() => rename(p)} title="Rename" aria-label="Rename {p.name}">✎</button>
                <button class="icon" onclick={() => remove(p)} title="Delete" aria-label="Delete {p.name}">🗑</button>
              {/if}
            </li>
          {/each}
        </ul>
      {:else}
        <p class="empty">
          {#if f.group === "mine" && !f.query && !f.tags.length}
            No presets of your own yet. Change a sound and click <b>Save as…</b>, or import a file.
          {:else if f.group === "favourites" && !f.query && !f.tags.length}
            No favourites yet. Click ★ on a preset to add it.
          {:else}
            Nothing matches. <button class="link" onclick={() => pg.setPresetFilter({ query: "", tags: [] })}>Clear the search</button>
          {/if}
        </p>
      {/if}
    </div>
  </div>

  {#if pg.explain}
    <p class="foot">Click to load · ▷ hears it without loading · ↑ ↓ and Enter in the search box · ◀ ▶ {pg.hasDevice ? "and the MiniLab's encoder step" : "step"} through this list · ★ favourites{pg.hw(": the first 8 are on pad bank B")}</p>
  {/if}
</div>

<style>
  .browser {
    position: absolute; top: calc(100% + 6px); left: 0; z-index: 30; width: min(880px, calc(100vw - 32px));
    display: flex; flex-direction: column; gap: 8px; padding: 10px; max-height: min(560px, calc(100vh - 120px));
    background: var(--panel); border: 1px solid var(--line); border-radius: 8px; box-shadow: 0 12px 32px #000a;
  }
  .top { display: flex; align-items: center; gap: 6px; }
  .search { width: 340px; font-size: 14px; padding: 5px 9px; }
  .message { font-size: 12px; color: var(--accent); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: 0; }
  .message.bad { color: #ff8a7a; }
  .push { flex: 1; }
  .top button { font-size: 12px; padding: 4px 10px; white-space: nowrap; }
  .close { color: var(--dim); }

  .body { display: flex; gap: 10px; min-height: 0; flex: 1; }
  nav { display: flex; flex-direction: column; gap: 2px; width: 150px; flex: none; overflow-y: auto; }
  nav button { display: flex; justify-content: space-between; border: none; background: none; text-align: left; font-size: 13px; padding: 4px 8px; border-radius: 5px; color: var(--dim); }
  nav button:hover { color: var(--text); background: #ffffff08; }
  nav button.active { background: color-mix(in srgb, var(--accent) 18%, transparent); color: var(--text); }
  .count { font: 11px var(--mono); color: var(--dim); }
  hr { border: none; border-top: 1px solid var(--line); margin: 4px 0; width: 100%; }

  .main { display: flex; flex-direction: column; gap: 8px; flex: 1; min-width: 0; min-height: 0; }
  .tags { display: flex; flex-wrap: wrap; gap: 4px; }
  .tags button { font-size: 11.5px; padding: 2px 8px; border-radius: 10px; color: var(--dim); }
  .tags button.active { background: var(--accent); border-color: var(--accent); color: #0b1314; font-weight: 600; }

  ul { list-style: none; margin: 0; padding: 0; overflow-y: auto; flex: 1; min-height: 0; }
  li { display: flex; align-items: center; gap: 2px; border-radius: 5px; border: 1px solid transparent; }
  li:hover { background: #ffffff08; }
  li.current { background: color-mix(in srgb, var(--accent) 16%, transparent); }
  li.cursor, li.browsed { border-color: var(--accent); }
  .load { flex: 1; min-width: 0; display: flex; align-items: center; gap: 10px; border: none; background: none; text-align: left; padding: 5px 8px; }
  .dot { width: 10px; height: 10px; border-radius: 50%; flex: none; }
  .name { font-size: 13.5px; color: var(--text); white-space: nowrap; flex: none; width: 150px; overflow: hidden; text-overflow: ellipsis; }
  .cat { font-size: 11px; color: var(--dim); width: 90px; flex: none; white-space: nowrap; }
  .ptags { font-size: 11px; color: #8b9a9e; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: 0; }
  .about .ptags { font-style: italic; }
  .icon { border: none; background: none; padding: 3px 7px; font-size: 13px; color: var(--dim); flex: none; }
  .icon:hover { color: var(--text); }
  .star.on { color: #f5c542; }

  .empty { color: var(--dim); font-size: 13px; margin: 12px 4px; }
  .link { border: none; background: none; padding: 0; color: var(--accent); text-decoration: underline; font-size: 13px; }
  .foot { margin: 0; font-size: 11.5px; color: var(--dim); }

  /* Phones: the whole screen, with the groups and the describing words as rows that scroll sideways. */
  @media (max-width: 700px) {
    .browser { position: fixed; inset: 8px; width: auto; max-height: none; }
    .top { flex-wrap: wrap; }
    .search { flex: 1 1 100%; width: auto; order: -1; }
    .message { flex: 1 1 100%; order: 0; }
    .body { flex-direction: column; gap: 8px; }
    nav { flex-direction: row; width: auto; overflow-x: auto; scrollbar-width: none; }
    nav button { flex: none; gap: 6px; white-space: nowrap; border: 1px solid var(--line); }
    hr { display: none; }
    .tags { flex-wrap: nowrap; overflow-x: auto; scrollbar-width: none; flex: none; }
    .tags button { flex: none; }
    .name { flex: 0 1 auto; width: auto; }
    .cat { display: none; }
    .load { padding: 8px; }
    .icon { padding: 8px 10px; font-size: 15px; }
  }
</style>
