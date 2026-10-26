// The course's glossary: the words its pages introduce (in bold), each with a short definition.
//
// A page's paragraphs are cut into pieces for the view: its bold words, and the first plain mention of a
// word an earlier chapter introduced (so "cutoff" in the LFO chapter still explains itself on hover).

import { PAGES } from "./course";

export interface Term {
  term: string;
  /** Other spellings and forms that mean the same (plurals, the long name, a control's label). */
  also?: string[];
  text: string;
  /** Used on almost every page: explained where it is bold, not marked in plain text. */
  basic?: true;
}

export const GLOSSARY: Term[] = [
  // Chapter 1
  { term: "wave", also: ["waves"], text: "A picture of a sound: how the speaker, and the air, moves over time. Up pushes the air out, down pulls it back.", basic: true },
  { term: "sine", also: ["sines", "sine wave"], text: "The simplest wave: one smooth swing, over and over, with no harmonics. It sounds pure, like a whistle.", basic: true },
  { term: "pitch", text: "How high or low a note sounds. It comes from how fast the wave repeats: its frequency.", basic: true },
  { term: "frequency", also: ["frequencies"], text: "How many times a second a wave repeats, in hertz. The higher the frequency, the higher the note." },
  { term: "hertz", also: ["Hz"], text: "The unit of frequency: swings per second. The A above middle C is 440 Hz." },
  { term: "octave", also: ["octaves"], text: "The step from a note to the one at twice its frequency, 12 keys up. It sounds like the same note, higher." },
  { term: "amplitude", text: "How tall a wave is: how far the air moves. The taller, the louder." },
  { term: "velocity", text: "How hard you press a key. The synth can use it to make a note louder, or brighter." },
  { term: "oscillator", also: ["oscillators"], text: "The part of a synth that makes the tone: a wave, repeating at the note's pitch.", basic: true },
  { term: "triangle", text: "A wave of straight lines up and down. Soft, like a sine with a little edge: a few weak odd harmonics." },
  { term: "sawtooth", also: ["saw", "saws"], text: "A wave that ramps up slowly, then drops at once. Bright and buzzy: it has every harmonic." },
  { term: "square", text: "A wave that jumps between up and down, half the time at each. Hollow-sounding: odd harmonics only." },
  { term: "fundamental", text: "The lowest sine in a sound. It sets the pitch you hear." },
  { term: "harmonics", also: ["harmonic"], text: "The sines above the fundamental, at 2, 3, 4… times its frequency. Their mix is the sound's colour." },
  { term: "timbre", text: "A sound's colour: what makes a flute and a violin sound different at the same pitch and loudness." },
  { term: "beating", text: "The slow pulse you hear when two notes are slightly out of tune, as their waves drift in and out of step." },
  { term: "cents", also: ["cent"], text: "Hundredths of a key. Used for tiny pitch differences, like detune." },
  { term: "detune", also: ["detuned"], text: "Setting one oscillator a few cents away from the other. The beating makes the sound wider and more alive." },
  // Chapter 2
  { term: "envelope", also: ["envelopes"], text: "A shape that rises and falls once per note, used to move a setting over time: the volume, the cutoff…" },
  { term: "amp envelope", text: "The envelope that moves each note's volume, in four stages: attack, decay, sustain, release." },
  { term: "attack", text: "The first envelope stage: how long a note takes to rise from silence to full." },
  { term: "decay", text: "The second envelope stage: how long the envelope takes to fall from full to the sustain level." },
  { term: "sustain", text: "The envelope's level while you hold the key, after the decay. The one stage that is a level, not a time." },
  { term: "release", text: "The last envelope stage: how long a note takes to fade to silence after you let go of the key." },
  { term: "ADSR", text: "Attack, decay, sustain, release: the four stages of the classic envelope." },
  { term: "pluck", also: ["plucks"], text: "A sound with no attack, a short decay and no sustain: quick and percussive, like a plucked string." },
  { term: "pad", also: ["pads"], text: "A sound with a slow attack, a high sustain and a long release: it swells in and holds, a soft bed for chords." },
  { term: "filter envelope", text: "An envelope that moves the filter's cutoff once per note, so a note can start bright and turn dark." },
  // Chapter 3
  { term: "filter", also: ["filters"], text: "Takes away part of a sound's harmonics. The usual kind, the low-pass, makes the sound darker as its cutoff goes down." },
  { term: "cutoff", text: "The frequency where a filter starts turning the sound down. A low-pass with a lower cutoff sounds darker." },
  { term: "subtractive synthesis", text: "Making sounds by starting from a wave full of harmonics and taking some away with a filter." },
  { term: "low-pass", text: "A filter that lets the low frequencies through and turns down those above its cutoff." },
  { term: "spectrogram", also: ["spectrograms"], text: "A picture of a sound's frequencies over time: pitch goes up, and each harmonic is a bright line." },
  { term: "resonance", text: "A boost a filter gives to the frequencies right at its cutoff. It adds a whistling, vowel-like edge." },
  { term: "response", text: "How much of each frequency a filter lets through, drawn from low to high." },
  { term: "high-pass", text: "A filter that turns down everything below its cutoff, so the sound gets thin and airy." },
  { term: "band-pass", text: "A filter that keeps only a band of frequencies around its cutoff. It sounds nasal, like a telephone." },
  { term: "key tracking", also: ["Key Track"], text: "Moving the filter's cutoff with the note you play, so high and low notes stay equally bright." },
  { term: "drive", text: "Pushing the wave harder than it can go, so its peaks are rounded off. That adds harmonics: warmer, then gritty." },
  { term: "clean filter", also: ["clean"], text: "This synth's gentle filter: it turns frequencies down softly and stays polite even with a lot of resonance." },
  { term: "ladder filter", also: ["ladder"], text: "A filter modelled on Moog's circuit from the 1960s: steeper and fatter, and it rings on its own at high resonance." },
  { term: "self-oscillation", text: "A filter with so much resonance that it rings on its own, as a sine at its cutoff." },
  // Chapter 4
  { term: "LFO", also: ["LFOs", "low-frequency oscillator"], text: "An oscillator too slow to hear, a few swings a second, that moves a setting up and down by itself." },
  { term: "vibrato", text: "A gentle, regular wobble in pitch, as singers and violinists make. On a synth: an LFO on the pitch." },
  { term: "wah", text: "A filter opening and closing, so the sound seems to say 'wah'." },
  { term: "wobble", text: "A rhythmic filter movement from an LFO, often in time with the music: the 'wub' of dubstep." },
  { term: "tremolo", text: "The volume pulsing louder and softer: an LFO on the volume." },
  { term: "sample and hold", text: "An LFO shape that jumps to a random value each step and holds it: the bubbling 'computer' sound of old science fiction." },
  { term: "tempo sync", text: "Setting an LFO's speed as a note length (1/4, 1/8…) instead of in hertz, so it stays in time with the music." },
  { term: "source", also: ["sources"], text: "In the mod matrix, the thing that moves: an LFO, an envelope, velocity, the key you play." },
  { term: "destination", also: ["destinations"], text: "In the mod matrix, the setting a source moves." },
  { term: "route", also: ["routes"], text: "One connection in the mod matrix: from a source to a destination, by an amount." },
  { term: "mod matrix", text: "The list of routes: each lets a source move a destination, by an amount in either direction." },
  { term: "patching", also: ["patch", "patched"], text: "Making a route. Old modular synths did it with patch cables." },
  { term: "pan", text: "Where a sound sits between the left and the right speaker." },
  // Chapter 5
  { term: "pulse width", text: "The share of each cycle a pulse wave spends up. At 50% it is a square; narrower, a thinner pulse." },
  { term: "pulse wave", text: "A square with its pulse width narrowed: thinner and more nasal the narrower it is." },
  { term: "PWM", also: ["pulse-width modulation"], text: "Moving the pulse width while a note plays, usually with an LFO: the lush sound of analog strings." },
  { term: "hard sync", also: ["sync"], text: "Osc 1 restarting Osc 2's cycle each time it starts its own. Raising Osc 2's pitch then changes the tone, not the note." },
  { term: "FM", also: ["frequency modulation"], text: "One oscillator moving another's pitch as fast as a note, which turns into new harmonics: bright, metallic, bell-like." },
  { term: "wavetable", also: ["wavetables"], text: "A row of waves, stored one after another. Moving the position through it morphs from one wave to the next." },
  { term: "Init", text: "The plainest starting sound: one sawtooth through an open filter, with no movement or effects." },
];

const BY_WORD = new Map(GLOSSARY.flatMap((t) => [t.term, ...(t.also ?? [])].map((w) => [w.toLowerCase(), t] as const)));

/** The term a word or phrase names, if the glossary has it. */
export const termFor = (word: string): Term | undefined => BY_WORD.get(word.toLowerCase());

/** The words of a page that are bold. */
const boldOf = (text: string[]) => text.flatMap((p) => [...p.matchAll(/\*\*(.+?)\*\*/g)].map((m) => m[1]));

/** The page (index into PAGES) where each term is first in bold. */
const INTRODUCED = new Map<Term, number>();
PAGES.forEach(({ lesson }, i) => {
  for (const w of boldOf(lesson.text)) {
    const t = termFor(w);
    if (t && !INTRODUCED.has(t)) INTRODUCED.set(t, i);
  }
});

/** The page that introduces a term (-1: none does). */
export const introducedOn = (term: Term): number => INTRODUCED.get(term) ?? -1;

/** The glossary in A–Z order. */
export const GLOSSARY_AZ = [...GLOSSARY].sort((a, b) => a.term.localeCompare(b.term, "en", { sensitivity: "base" }));

/** A piece of a paragraph: plain text, a bold word, and the term it names (if any). */
export interface Piece {
  t: string;
  bold?: boolean;
  term?: Term;
}

// Every word and phrase, longest first, so "pulse width" wins over "pulse" and "amp envelope" over "envelope".
const WORDS = [...BY_WORD.keys()].sort((a, b) => b.length - a.length);
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const MENTION = new RegExp(`\\b(${WORDS.map(escape).join("|")})\\b`, "gi");

/**
 * A page's paragraphs, cut into pieces. Bold words carry their term. In the plain text, the first mention
 * of each term an earlier chapter introduced carries it too (not the basic ones); terms this page puts in
 * bold are left to the bold.
 */
export function markTerms(text: string[], page: number): Piece[][] {
  const chapter = PAGES[page].chapter;
  const earlier = (at: number) => at >= 0 && at < page && PAGES[at].chapter !== chapter;
  // Terms this chapter (re)introduces in bold are explained there, so they aren't marked again.
  const seen = new Set(chapter.lessons.flatMap((l) => boldOf(l.text)).map(termFor).filter((t) => t !== undefined));
  return text.map((p) =>
    p.split(/\*\*(.+?)\*\*/).flatMap((t, i): Piece[] => {
      if (i % 2 === 1) return [{ t, bold: true, term: termFor(t) }];
      const out: Piece[] = [];
      let from = 0;
      for (const m of t.matchAll(MENTION)) {
        const term = termFor(m[0])!;
        if (seen.has(term) || term.basic || !earlier(introducedOn(term))) continue;
        seen.add(term);
        if (m.index > from) out.push({ t: t.slice(from, m.index) });
        out.push({ t: m[0], term });
        from = m.index + m[0].length;
      }
      if (from < t.length) out.push({ t: t.slice(from) });
      return out;
    }),
  );
}
