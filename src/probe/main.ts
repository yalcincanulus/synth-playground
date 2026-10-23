import { findPorts, isMainPort, MiniLab, requestMidi, type RawMessage } from "../minilab/device";
import {
  CC_MAPS,
  decode,
  displayMessage,
  IDENTITY_REQUEST,
  knobValueMessage,
  LED_IDS,
  ledColorMessage,
  parameterMessage,
  requestProgramMessage,
  toHex,
  type ControlEvent,
  type PadBank,
  type Program,
} from "../minilab/protocol";

const $ = <T extends HTMLElement = HTMLElement>(sel: string) => document.querySelector<T>(sel)!;

function h(tag: string, props: Record<string, string> = {}, ...children: (Node | string)[]) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) k === "class" ? (el.className = v) : el.setAttribute(k, v);
  el.append(...children);
  return el;
}
const svg = (tag: string, attrs: Record<string, string | number>) => {
  const el = document.createElementNS("http://www.w3.org/2000/svg", tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
  return el;
};

// ---------------------------------------------------------------- state

let access: MIDIAccess | null = null;
let device: MiniLab | null = null;
let program: Program | "?" = "?";
let bank: PadBank = "A";
let encoderTotal = 0;
const ledColors = new Map<number, [number, number, number]>(); // LED id -> rgb 0-127

// ---------------------------------------------------------------- device diagram

const root = $("#device");

const buttons = h("div", { class: "buttons" });
const hwButton = (label: string, cls = "") => {
  const b = h("div", { class: `hw-btn ${cls}` }, label);
  buttons.append(b);
  return b;
};
const shiftBtn = hwButton("Shift", "dark");
hwButton("Hold", "internal").title = "Handled inside the device: sends no MIDI";
hwButton("Oct −", "internal").title = "Handled inside the device: transposes key notes";
hwButton("Oct +", "internal").title = "Handled inside the device: transposes key notes";
root.append(buttons);

const strips = h("div", { class: "strips" });
const makeStrip = (label: string, centered: boolean) => {
  const fill = h("div", { class: "fill" });
  const strip = h("div", { class: "strip" }, ...(centered ? [h("div", { class: "center" })] : []), fill);
  strips.append(h("div", {}, strip, h("div", { class: "lbl" }, label)));
  return fill;
};
const pitchFill = makeStrip("Pitch", true);
const modFill = makeStrip("Mod", false);
root.append(strips);

const screenLines = h("div", {}, "\n");
const screenMeta = h("div", { class: "meta" }, "");
const encoderMark = h("div", { class: "mark" });
const encoderEl = h("div", { class: "encoder" }, encoderMark);
const encoderCount = h("div", { class: "encoder-count" }, "0");
root.append(h("div", { class: "screen-col" }, h("div", { class: "screen" }, screenLines, screenMeta), encoderEl, encoderCount));

const knobsEl = h("div", { class: "knobs" });
const knobs = Array.from({ length: 8 }, (_, i) => {
  const s = svg("svg", { viewBox: "0 0 60 60" });
  s.append(
    svg("path", { d: arc(0, 1), fill: "none", stroke: "#2c5a52", "stroke-width": 4, opacity: 0.25 }),
  );
  const valueArc = svg("path", { d: arc(0, 0), fill: "none", stroke: "#12302b", "stroke-width": 4, "stroke-linecap": "round" });
  const face = svg("circle", { class: "face", cx: 30, cy: 30, r: 17, fill: "#f2f2f2", stroke: "#bbb" });
  const pointer = svg("line", { x1: 30, y1: 30, x2: 30, y2: 15, stroke: "#333", "stroke-width": 2.5, "stroke-linecap": "round" });
  s.append(valueArc, face, pointer);
  const val = h("div", { class: "val" }, "–");
  const lbl = h("div", { class: "lbl" }, `${i + 1}`);
  const el = h("div", { class: "knob" }, s, val, lbl);
  knobsEl.append(el);
  return { el, valueArc, pointer, val, lbl };
});
root.append(knobsEl);

function arc(from: number, to: number) {
  // 270° sweep starting at 225° (7 o'clock), fractions 0-1
  const a = (t: number) => ((225 - 270 * t) * Math.PI) / 180;
  const p = (t: number) => `${30 + 24 * Math.cos(a(t))} ${30 - 24 * Math.sin(a(t))}`;
  if (to - from < 0.001) return `M ${p(from)}`;
  return `M ${p(from)} A 24 24 0 ${to - from > 2 / 3 ? 1 : 0} 1 ${p(to)}`;
}

const fadersEl = h("div", { class: "faders" });
const faders = Array.from({ length: 4 }, (_, i) => {
  const thumb = h("div", { class: "thumb" });
  const val = h("div", { class: "val" }, "–");
  const lbl = h("div", { class: "lbl" }, `${i + 1}`);
  fadersEl.append(h("div", { class: "fader" }, h("div", { class: "track" }, thumb), val, lbl));
  thumb.style.bottom = "0%";
  return { thumb, val, lbl };
});
root.append(fadersEl);

const bankEl = h("div", { class: "bank" }, "Bank A");
root.append(bankEl);
const padsEl = h("div", { class: "pads" });
const PAD_LABELS = ["Arp", "Pad", "Prog", "⟲", "■", "▶", "●", "Tap"];
const pads = PAD_LABELS.map((label) => {
  const hit = h("div", { class: "hit" });
  const pressure = h("div", { class: "pressure" });
  const vel = h("div", { class: "vel" });
  const el = h("div", { class: "pad" }, hit, pressure, vel, label);
  padsEl.append(el);
  return { el, hit, pressure, vel };
});
root.append(padsEl);

// Keyboard: 25 keys. The window follows the notes, since Oct −/+ transposes inside the device.
let keyBase = 48;
const keysEl = h("div", { class: "keys" });
const keyRange = h("div", { class: "key-range" });
root.append(keysEl, keyRange);
const keyEls = new Map<number, HTMLElement>();
const BLACK = new Set([1, 3, 6, 8, 10]);
function buildKeys() {
  keysEl.replaceChildren();
  keyEls.clear();
  const whites = Array.from({ length: 25 }, (_, i) => keyBase + i).filter((n) => !BLACK.has(n % 12));
  const w = 100 / whites.length;
  let wi = 0;
  for (let n = keyBase; n < keyBase + 25; n++) {
    if (BLACK.has(n % 12)) {
      const el = h("div", { class: "key-b" }, h("span", { class: "vel" }));
      el.style.left = `${wi * w - w * 0.3}%`;
      el.style.width = `${w * 0.6}%`;
      keysEl.append(el);
      keyEls.set(n, el);
    } else {
      const el = h("div", { class: "key-w" }, h("span", { class: "vel" }));
      keysEl.append(el);
      keyEls.set(n, el);
      wi++;
    }
  }
  keyRange.textContent = `notes ${keyBase}–${keyBase + 24} (${noteName(keyBase)}–${noteName(keyBase + 24)})`;
}
const noteName = (n: number) => ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"][n % 12] + (Math.floor(n / 12) - 1);
buildKeys();

function updateLabels() {
  const map = program === "?" ? null : CC_MAPS[program];
  knobs.forEach((k, i) => (k.lbl.textContent = `${i + 1}${map ? ` · CC${map.knobs[i]}` : ""}`));
  faders.forEach((f, i) => (f.lbl.textContent = `${i + 1}${map ? ` · CC${map.faders[i]}` : ""}`));
  bankEl.textContent = `Bank ${bank}`;
  screenMeta.textContent = `program: ${program}`;
  refreshPadLeds();
}

function refreshPadLeds() {
  const ids = bank === "A" ? LED_IDS.padsA : LED_IDS.padsB;
  pads.forEach((p, i) => {
    const c = ledColors.get(ids[i]);
    p.el.style.setProperty("--led", c && c.some((x) => x > 0) ? rgbCss(c) : "#345");
  });
}
const rgbCss = ([r, g, b]: [number, number, number]) => `rgb(${r * 2} ${g * 2} ${b * 2})`;

// ---------------------------------------------------------------- event handling

function handle(e: ControlEvent) {
  switch (e.type) {
    case "knob": {
      const k = knobs[e.index];
      const t = e.value / 127;
      k.valueArc.setAttribute("d", arc(0, t));
      const ang = ((225 - 270 * t) * Math.PI) / 180;
      k.pointer.setAttribute("x2", String(30 + 15 * Math.cos(ang)));
      k.pointer.setAttribute("y2", String(30 - 15 * Math.sin(ang)));
      k.val.textContent = String(e.value);
      noteProgram(e.program);
      if (echo()) {
        const cc = CC_MAPS[e.program].knobs[e.index];
        device?.send(parameterMessage(cc, `Knob ${e.index + 1}`, `${e.value}`), "display");
      }
      break;
    }
    case "fader": {
      const f = faders[e.index];
      f.thumb.style.bottom = `${(e.value / 127) * 100}%`;
      f.val.textContent = String(e.value);
      noteProgram(e.program);
      if (echo()) {
        const cc = CC_MAPS[e.program].faders[e.index];
        device?.send(parameterMessage(cc, `Fader ${e.index + 1}`, `${e.value}`), "display");
      }
      break;
    }
    case "pitchBend": {
      const v = e.value;
      pitchFill.style.top = v >= 0 ? `${50 - v * 50}%` : "50%";
      pitchFill.style.bottom = v >= 0 ? "50%" : `${50 + v * 50}%`;
      break;
    }
    case "mod":
      modFill.style.top = `${100 - (e.value / 127) * 100}%`;
      modFill.style.bottom = "0";
      break;
    case "encoder":
      encoderTotal += e.delta;
      encoderMark.style.transform = `rotate(${encoderTotal * 15}deg)`;
      encoderCount.textContent = `${encoderTotal}${e.shifted ? " (shift)" : ""}`;
      break;
    case "encoderClick":
      encoderEl.classList.toggle("pressed", e.pressed);
      break;
    case "shift":
      shiftBtn.classList.toggle("on", e.pressed);
      break;
    case "pad": {
      if (e.bank !== bank) {
        bank = e.bank;
        updateLabels();
      }
      const p = pads[e.index];
      p.hit.style.opacity = e.on ? String(0.25 + (e.velocity / 127) * 0.6) : "0";
      p.vel.textContent = e.on ? String(e.velocity) : "";
      if (!e.on) p.pressure.style.width = "0";
      if ($<HTMLInputElement>("#flash-pads").checked) flashPad(e.bank, e.index, e.on, e.velocity);
      break;
    }
    case "padPressure":
      pads[e.index].pressure.style.width = `${(e.value / 127) * 100}%`;
      break;
    case "key": {
      if (e.on && (e.note < keyBase || e.note >= keyBase + 25)) {
        keyBase = e.note - (((e.note - keyBase) % 12) + 12) % 12;
        if (e.note >= keyBase + 25) keyBase = e.note - 24;
        buildKeys();
      }
      const el = keyEls.get(e.note);
      if (el) {
        el.classList.toggle("on", e.on);
        el.querySelector(".vel")!.textContent = e.on ? String(e.velocity) : "";
      }
      break;
    }
    case "transport":
      if (e.pressed) flashScreenMeta(`transport: ${e.button}`);
      break;
    case "program":
      program = e.program;
      updateLabels();
      break;
    case "padBank":
      bank = e.bank;
      updateLabels();
      break;
    case "identity":
      setStatus(`Connected · identity ${toHex(e.bytes.slice(5, -1))}`, "ok");
      break;
    case "unknown":
      break;
  }
}

const echo = () => $<HTMLInputElement>("#echo-knobs").checked;

function noteProgram(p: Program) {
  if (program !== p) {
    program = p;
    updateLabels();
  }
}

function flashPad(padBank: PadBank, index: number, on: boolean, velocity: number) {
  const id = (padBank === "A" ? LED_IDS.padsA : LED_IDS.padsB)[index];
  const base = ledColors.get(id) ?? [0, 0, 0];
  const v = velocity;
  const color: [number, number, number] = on ? [v, v, v] : base;
  device?.send(ledColorMessage(id, ...color), `led-${id}`);
}

let metaTimer = 0;
function flashScreenMeta(text: string) {
  screenMeta.textContent = text;
  clearTimeout(metaTimer);
  metaTimer = window.setTimeout(updateLabels, 1200);
}

// ---------------------------------------------------------------- log

const logEl = $("#log");
const logLines: string[] = [];
const CONTINUOUS = new Set(["pitchBend", "mod", "padPressure"]);

function log(m: RawMessage) {
  if (m.direction === "out" && !$<HTMLInputElement>("#log-out").checked) return;
  const event = m.direction === "in" ? decode(m.bytes) : null;
  if (event && CONTINUOUS.has(event.type) && !$<HTMLInputElement>("#log-continuous").checked) return;
  const time = (m.time / 1000).toFixed(3);
  const desc = event ? describe(event) : describeOut(m.bytes);
  logLines.push(`${time}\t${m.direction}\t${toHex(m.bytes)}\t${desc}`);
  const li = h(
    "li",
    { class: event?.type === "unknown" ? "unknown" : "" },
    h("span", { class: "t" }, time),
    h("span", { class: m.direction }, m.direction),
    h("span", {}, toHex(m.bytes)),
    h("span", {}, desc),
  );
  logEl.append(li);
  while (logEl.childElementCount > 500) logEl.firstElementChild!.remove();
  logEl.scrollTop = logEl.scrollHeight;
}

function describe(e: ControlEvent): string {
  const { type, ...rest } = e;
  if (type === "unknown") return "unknown";
  return `${type} ${Object.entries(rest)
    .map(([k, v]) => `${k}=${typeof v === "number" && !Number.isInteger(v) ? v.toFixed(3) : v}`)
    .join(" ")}`;
}

function describeOut(b: number[]): string {
  const body = toHex(b.slice(6, 9));
  if (b[1] === 0x7e) return "identity request";
  if (body === "02 02 16") return `led id=0x${b[9].toString(16)} rgb=${b.slice(10, 13).join(",")}`;
  if (body === "04 02 60") return `display ${String.fromCharCode(...b.filter((x) => x >= 0x20 && x < 0x7f).slice(1))}`;
  if (body === "02 00 40") return b[10] === 0x21 ? "connect (hello)" : "disconnect (goodbye)";
  if (body === "01 00 40") return "request program";
  if (body === "21 10 00") return `knob realign id=${b[9]} value=${b[11]}`;
  return "";
}

// ---------------------------------------------------------------- connection

function setStatus(text: string, cls = "") {
  const s = $("#status");
  s.textContent = text;
  s.className = `status ${cls}`;
}

async function connect() {
  try {
    access ??= await requestMidi();
  } catch (err) {
    setStatus(`MIDI access denied: ${(err as Error).message}`, "err");
    return;
  }
  access.onstatechange = (e) => {
    const port = (e as MIDIConnectionEvent).port;
    if (port && isMainPort(port)) fillPortSelects();
  };
  fillPortSelects();
  openSelected();
}

function fillPortSelects() {
  if (!access) return;
  const { inputs, outputs, input, output } = findPorts(access);
  const fill = (sel: HTMLSelectElement, ports: MIDIPort[], preferred?: MIDIPort) => {
    const current = sel.value;
    sel.replaceChildren(...ports.map((p) => h("option", { value: p.id }, `${p.name} (${p.state})`)));
    sel.value = ports.some((p) => p.id === current) ? current : preferred?.id ?? ports[0]?.id ?? "";
  };
  fill($("#in-port"), inputs, input);
  fill($("#out-port"), outputs, output);
}

function openSelected() {
  if (!access) return;
  const input = access.inputs.get($<HTMLSelectElement>("#in-port").value);
  const output = access.outputs.get($<HTMLSelectElement>("#out-port").value);
  if (!input || !output) {
    setStatus("MiniLab 3 not found: is it plugged in?", "err");
    return;
  }
  device?.close();
  device = new MiniLab(input, output);
  device.gapMs = Number($<HTMLInputElement>("#gap").value);
  device.onRaw(log);
  device.onEvent(handle);
  device.hello();
  setStatus(`Connected to ${input.name}`, "ok");
  $("#connect").textContent = "Reconnect";
}

$("#connect").onclick = connect;
$("#in-port").onchange = openSelected;
$("#out-port").onchange = openSelected;

// ---------------------------------------------------------------- tools

const RAINBOW: [number, number, number][] = [
  [127, 0, 0], [127, 50, 0], [110, 110, 0], [0, 127, 0], [0, 110, 110], [0, 0, 127], [70, 0, 127], [127, 0, 90],
];

const ledGrid = $("#led-grid");
const ledInputs = new Map<number, HTMLInputElement>();
const hexToRgb = (hex: string): [number, number, number] => {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 17) & 0x7f, (n >> 9) & 0x7f, (n >> 1) & 0x7f];
};
const rgbToHex = ([r, g, b]: [number, number, number]) =>
  "#" + [r, g, b].map((x) => Math.min(255, x * 2).toString(16).padStart(2, "0")).join("");

for (const [label, ids] of [["A", LED_IDS.padsA], ["B", LED_IDS.padsB]] as const) {
  ledGrid.append(h("span", {}, `Bank ${label}`));
  for (const id of ids) {
    const input = h("input", { type: "color", value: "#000000", title: `LED 0x${id.toString(16)}` }) as HTMLInputElement;
    input.oninput = () => setLed(id, hexToRgb(input.value));
    ledInputs.set(id, input);
    ledGrid.append(input);
  }
}
ledGrid.append(h("span", {}, "Oct"));
for (const id of [LED_IDS.octMinus, LED_IDS.octPlus]) {
  const input = h("input", { type: "color", value: "#000000", title: `LED 0x${id.toString(16)}` }) as HTMLInputElement;
  input.oninput = () => setLed(id, hexToRgb(input.value));
  ledInputs.set(id, input);
  ledGrid.append(input);
}

function setLed(id: number, rgb: [number, number, number]) {
  ledColors.set(id, rgb);
  const input = ledInputs.get(id);
  if (input) input.value = rgbToHex(rgb);
  device?.send(ledColorMessage(id, ...rgb), `led-${id}`);
  refreshPadLeds();
}

const realignSel = $<HTMLSelectElement>("#realign-knob");
realignSel.append(...Array.from({ length: 8 }, (_, i) => h("option", { value: String(i) }, String(i + 1))));

$<HTMLInputElement>("#gap").oninput = (e) => {
  const v = Number((e.target as HTMLInputElement).value);
  $("#gap-out").textContent = `${v} ms`;
  if (device) device.gapMs = v;
};

let scanPrev: number | null = null;
function scanLight(id: number) {
  id = Math.max(0, Math.min(127, id));
  $<HTMLInputElement>("#scan-id").value = id.toString(16).toUpperCase();
  if (scanPrev !== null && scanPrev !== id && $<HTMLInputElement>("#scan-clear").checked)
    device?.send(ledColorMessage(scanPrev, 0, 0, 0));
  device?.send(ledColorMessage(id, ...hexToRgb($<HTMLInputElement>("#scan-color").value)));
  device?.send(displayMessage("LED scan", `id 0x${id.toString(16).toUpperCase()} (${id})`), "display");
  scanPrev = id;
}
const scanId = () => parseInt($<HTMLInputElement>("#scan-id").value, 16) || 0;

const actions: Record<string, () => void> = {
  hello: () => device?.hello(),
  goodbye: () => device?.goodbye(),
  "request-program": () => device?.send(requestProgramMessage()),
  identity: () => device?.send(IDENTITY_REQUEST),
  display: () => {
    const l1 = $<HTMLInputElement>("#line1").value;
    const l2 = $<HTMLInputElement>("#line2").value;
    screenLines.textContent = `${l1}\n${l2}`;
    device?.send(
      displayMessage(l1, l2, {
        transport: $<HTMLSelectElement>("#icon-transport").value as "none" | "play" | "record",
        arm: $<HTMLInputElement>("#icon-arm").checked,
        arp: $<HTMLInputElement>("#icon-arp").checked,
      }),
      "display",
    );
  },
  param: () =>
    device?.send(parameterMessage(CC_MAPS.daw.knobs[0], $<HTMLInputElement>("#line1").value, $<HTMLInputElement>("#line2").value), "display"),
  rainbow: () => {
    LED_IDS.padsA.forEach((id, i) => setLed(id, RAINBOW[i]));
    LED_IDS.padsB.forEach((id, i) => setLed(id, RAINBOW[7 - i]));
  },
  "leds-off": () => [...LED_IDS.padsA, ...LED_IDS.padsB, LED_IDS.octMinus, LED_IDS.octPlus].forEach((id) => setLed(id, [0, 0, 0])),
  "scan-prev": () => scanLight(scanId() - 1),
  "scan-next": () => scanLight(scanId() + 1),
  "scan-send": () => scanLight(scanId()),
  realign: () => device?.send(knobValueMessage(Number(realignSel.value), Number($<HTMLInputElement>("#realign-value").value))),
  "log-clear": () => {
    logEl.replaceChildren();
    logLines.length = 0;
  },
  "log-download": () => {
    const blob = new Blob([logLines.join("\n")], { type: "text/plain" });
    h("a", { href: URL.createObjectURL(blob), download: `minilab3-log-${Date.now()}.tsv` }).click();
  },
};
document.addEventListener("click", (e) => {
  const action = (e.target as HTMLElement).closest<HTMLElement>("[data-action]")?.dataset.action;
  if (action) actions[action]?.();
});

window.addEventListener("beforeunload", () => device?.goodbye());

updateLabels();
// Browsers that already granted MIDI permission connect without a click.
navigator.permissions
  ?.query({ name: "midi", sysex: true } as unknown as PermissionDescriptor)
  .then((p) => {
    if (p.state === "granted") connect();
  })
  .catch(() => {});
