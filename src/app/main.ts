import { mount } from "svelte";
import { loadImportedTables } from "../audio/tableStore";
import { loadSongs } from "../song/songStore";
import App from "./App.svelte";
import "./app.css";

// Imported wavetables join the table list first, so presets that use them find them; then the songs.
await loadImportedTables();
await loadSongs();
mount(App, { target: document.getElementById("app")! });
