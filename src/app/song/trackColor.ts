import { TRACK_COLORS } from "../../song/song";

/** A track's colour on screen: the LED's 0-127 range, lifted toward white like the preset accent. */
export function trackCss(i: number) {
  const [r, g, b] = TRACK_COLORS[i].map((c) => Math.round(c * 2 * 0.75 + 255 * 0.25));
  return `rgb(${r} ${g} ${b})`;
}
