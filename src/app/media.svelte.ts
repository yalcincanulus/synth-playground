import { MediaQuery } from "svelte/reactivity";

// The screen sizes the layout changes at. CSS uses the same numbers in its @media rules.

/** A phone, or a narrow window: the compact header, the small keyboard, one column. */
export const narrow = new MediaQuery("max-width: 700px");

/** Too narrow for the Synth view's cables: the panel only. */
export const noCables = new MediaQuery("max-width: 800px");

/** A touch screen as the main pointer: no hover tooltips, and no computer keyboard to name. */
export const touch = new MediaQuery("pointer: coarse");
