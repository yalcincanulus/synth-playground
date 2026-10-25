import { mount } from "svelte";
import { loadImportedTables } from "../audio/tableStore";
import App from "./App.svelte";
import "./app.css";

// Imported wavetables join the table list first, so presets that use them find them.
await loadImportedTables();
mount(App, { target: document.getElementById("app")! });
