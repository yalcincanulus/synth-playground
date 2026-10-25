import type { ParamId, ParamValues } from "../audio/params";
import type { Preset, Rgb } from "./presets";

const rand = (min: number, max: number) => min + Math.random() * (max - min);
const expRand = (min: number, max: number) => min * Math.pow(max / min, Math.random());
const pick = <T>(items: readonly T[]): T => items[Math.floor(Math.random() * items.length)];
const chance = (p: number) => Math.random() < p;

type Archetype = "bass" | "lead" | "pad" | "pluck";
const CATEGORY: Record<Archetype, Preset["category"]> = { bass: "Bass", lead: "Lead", pad: "Pad", pluck: "Keys" };

const ADJECTIVES = ["Fuzzy", "Cosmic", "Velvet", "Rusty", "Neon", "Hollow", "Liquid", "Dusty", "Glass", "Wobbly", "Lazy", "Molten", "Frozen", "Tiny", "Electric", "Sleepy"];
const NOUNS = ["Comet", "Engine", "Moth", "Signal", "Harbor", "Lantern", "Robot", "Tide", "Circuit", "Whale", "Static", "Garden", "Rocket", "Ghost", "Prism", "Bloom"];

function randomName() {
  for (;;) {
    const name = `${pick(ADJECTIVES)} ${pick(NOUNS)}`;
    if (name.length <= 18) return name;
  }
}

/** A saturated colour in the LED's 0-127 range. */
function randomColor(): Rgb {
  const h = Math.random() * 6;
  const x = 127 * (1 - Math.abs((h % 2) - 1));
  const sectors: Rgb[] = [[127, x, 0], [x, 127, 0], [0, 127, x], [0, x, 127], [x, 0, 127], [127, 0, x]];
  return sectors[Math.floor(h)].map(Math.round) as Rgb;
}

/**
 * Roll a random but playable patch. An archetype fixes the envelope shape and
 * sensible ranges; everything else is free within musical limits.
 */
export function rollDice(): Preset {
  const archetype = pick<Archetype>(["bass", "lead", "pad", "pluck"]);
  const mono = archetype === "bass" ? chance(0.8) : archetype === "lead" ? chance(0.6) : false;

  const v: Partial<ParamValues> = {
    mono: mono ? 1 : 0,
    glide: mono && chance(0.6) ? rand(0.01, 0.12) : 0,
    osc1Wave: pick([2, 2, 3, 3, 1, 0]),
    osc2Wave: pick([2, 2, 3, 1, 0]),
    osc2Semi: pick([0, 0, 0, 12, -12, 7, 5, 19, 24]),
    osc2Detune: chance(0.7) ? rand(2, 20) : rand(20, 40),
    oscMix: rand(0.1, 0.9),
    unison: archetype === "pad" ? pick([2, 3, 3]) : pick([1, 1, 2]),
    subLevel: archetype === "bass" ? rand(0.2, 0.7) : chance(0.2) ? rand(0, 0.4) : 0,
    noiseLevel: chance(0.15) ? rand(0.05, 0.3) : 0,
    filterMorph: chance(0.75) ? 0 : pick([0.5, 1, rand(0, 1)]),
    filter2Mode: chance(0.2) ? pick([1, 2]) : 0,
    filter2Cutoff: expRand(80, 3000),
    filter2Resonance: expRand(0.7, 8),
    filter2Morph: pick([0, 0.5, 1, 1]),
    filterModel: chance(0.3) ? 1 : 0,
    resonance: expRand(0.7, 12),
    drive: chance(0.5) ? rand(0, 0.5) : 0,
    keyTrack: rand(0.2, 0.8),
    velocity: rand(0.3, 0.8),
    lfoTarget: pick([0, 1, 1, 2, 3]),
    lfoWave: pick([0, 1, 1, 2, 3, 4]),
    lfoSync: chance(0.3) ? pick([3, 4, 5]) : 0,
    lfoRate: expRand(0.1, 8),
    lfoDepth: chance(0.5) ? rand(0.05, 0.4) : 0,
    lfo2Target: pick([0, 1, 2]),
    lfo2Wave: pick([0, 1, 2, 4]),
    lfo2Sync: 0,
    lfo2Rate: expRand(0.05, 2),
    lfo2Depth: chance(0.35) ? rand(0.1, 0.4) : 0,
    modTarget: pick([0, 0, 1]),
    pulseWidth: chance(0.4) ? rand(0.1, 0.5) : 0.5,
    oscSync: archetype === "lead" && chance(0.3) ? 1 : 0,
    fmAmount: chance(0.15) ? rand(0.1, 0.5) : 0,
    pitchEnvAmt: chance(0.2) ? pick([rand(-2, 2), rand(5, 24)]) : 0,
    pitchEnvDecay: expRand(0.03, 0.6),
    pitchEnvTarget: 0,
    chorus: chance(0.5) ? rand(0.1, 0.7) : 0,
    delayMix: chance(0.45) ? rand(0.1, 0.4) : 0,
    delayDiv: pick([1, 2, 3, 4]),
    delayFeedback: rand(0.2, 0.55),
    reverbMix: rand(0.05, 0.5),
    reverbSize: expRand(1, 6),
  };

  switch (archetype) {
    case "bass":
      Object.assign(v, {
        cutoff: expRand(150, 900), filterEnvAmt: rand(0.5, 4), filterAttack: 0.002, filterDecay: expRand(0.08, 0.6),
        filterSustain: rand(0, 0.4), attack: 0.003, decay: rand(0.2, 0.6), sustain: rand(0.5, 1), release: rand(0.05, 0.2),
        reverbMix: rand(0, 0.12), chorus: 0,
      });
      break;
    case "lead":
      Object.assign(v, {
        cutoff: expRand(600, 5000), filterEnvAmt: rand(0, 3), filterAttack: expRand(0.002, 0.1), filterDecay: expRand(0.1, 1),
        filterSustain: rand(0.2, 0.7), attack: expRand(0.002, 0.08), decay: rand(0.1, 0.5), sustain: rand(0.6, 1), release: rand(0.1, 0.5),
      });
      break;
    case "pad":
      Object.assign(v, {
        cutoff: expRand(300, 3000), filterEnvAmt: rand(-1, 3), filterAttack: expRand(0.3, 3), filterDecay: expRand(0.5, 3),
        filterSustain: rand(0.3, 0.8), attack: expRand(0.3, 2), decay: rand(0.5, 2), sustain: rand(0.7, 1), release: expRand(1, 4),
        reverbMix: rand(0.3, 0.6),
      });
      break;
    case "pluck":
      Object.assign(v, {
        cutoff: expRand(250, 1500), filterEnvAmt: rand(2, 5), filterAttack: 0.001, filterDecay: expRand(0.08, 0.4),
        filterSustain: 0, attack: 0.001, decay: rand(0.3, 1.2), sustain: rand(0, 0.15), release: rand(0.2, 0.8),
      });
      break;
  }

  // Sometimes a wavetable on Osc 1, with LFO 2 scanning through it.
  if (chance(0.25)) {
    Object.assign(v, { osc1Wave: 4, wtTable: Math.floor(Math.random() * 8), wtPos: rand(0, 1), lfo2Target: 4, lfo2Depth: rand(0.3, 0.9), lfo2Rate: expRand(0.08, 1.5) });
  }

  // A few mod matrix routes. Sources: 6 mod env, 7 velocity, 10 random; destinations: 0 pitch, 2 cutoff, 5 wt pos.
  const routes: [number, number, number][] = [];
  if (chance(0.4)) routes.push([7, 2, rand(0.2, 0.6)]);
  if (v.osc1Wave === 4 && chance(0.5)) {
    routes.push([6, 5, rand(0.4, 0.9) * (chance(0.8) ? 1 : -1)]);
    Object.assign(v, { modEnvAttack: 0.001, modEnvDecay: expRand(0.1, 1.5), modEnvSustain: rand(0, 0.3), wtPos: rand(0, 0.3) });
  }
  if (chance(0.2)) routes.push([10, 0, rand(0.002, 0.008)]);
  routes.forEach(([src, dst, amt], i) => Object.assign(v, { [`mod${i + 1}Src`]: src, [`mod${i + 1}Dst`]: dst, [`mod${i + 1}Amt`]: amt }));

  // Sync on its own changes little: pair it with a pitch envelope on Osc 2 for the sweep.
  if (v.oscSync) Object.assign(v, { pitchEnvAmt: rand(8, 30), pitchEnvDecay: expRand(0.2, 1.2), pitchEnvTarget: 1, oscMix: rand(0.5, 0.9) });

  // The filter usually closes a little faster or slower than the volume fades.
  v.filterRelease = (v.release ?? 0.3) * rand(0.5, 1.5);

  // Knobs: the filter core, then four of the parameters this roll actually uses.
  const optional: ParamId[] = ["wtPos", "pitchEnvAmt", "fmAmount", "pulseWidth", "osc2Detune", "osc2Semi", "oscMix", "lfoRate", "lfoDepth", "drive", "chorus", "delayMix", "reverbMix", "subLevel", "glide"];
  const used = optional.filter((id) => {
    if (id === "lfoRate") return (v.lfoDepth ?? 0) > 0;
    if (id === "glide") return mono;
    if (id === "wtPos") return v.osc1Wave === 4;
    if (id === "pulseWidth") return v.osc1Wave === 3 || v.osc2Wave === 3;
    if (id === "pitchEnvAmt") return Math.abs(v.pitchEnvAmt ?? 0) > 0;
    if (id === "osc2Semi" || id === "osc2Detune" || id === "oscMix") return true;
    return (v[id] ?? 0) > 0;
  });
  const extras = used.sort(() => Math.random() - 0.5).slice(0, 4);
  while (extras.length < 4) extras.push(["reverbMix", "drive", "chorus", "delayMix"].find((id) => !extras.includes(id as ParamId)) as ParamId);

  return {
    name: randomName(),
    category: CATEGORY[archetype],
    color: randomColor(),
    knobs: ["cutoff", "resonance", "filterEnvAmt", "filterDecay", ...extras] as Preset["knobs"],
    values: v,
  };
}
