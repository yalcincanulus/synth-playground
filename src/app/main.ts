import { mount } from "svelte";
import { loadImportedTables } from "../audio/tableStore";
import { loadLink } from "../song/songLink";
import { loadSongs } from "../song/songStore";
import App from "./App.svelte";
import "./app.css";

// Imported wavetables join the table list first, so presets that use them find them; then the songs, and
// the song or sound in the link the page was opened with.
await loadImportedTables();
await Promise.all([loadSongs(), loadLink()]);
mount(App, { target: document.getElementById("app")! });
