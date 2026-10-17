// KRATER's sounds and music on arcade-kit's chiptune engine.
import { arp, audioNow, createMusic, midiHz, noise, onsets, perc, setVolume, tone, Tune } from 'arcade-kit/audio';
import { Event } from './world';

export { unlockAudio } from 'arcade-kit/audio';

setVolume(0.22);

/** Skips a sound already played this many seconds ago, so rapid fire doesn't pile up. */
const last: Record<string, number> = {};
function every(key: string, gap: number) {
  const t = audioNow();
  if (t === null) return false;
  if (t - (last[key] ?? -1) < gap) return false;
  last[key] = t;
  return true;
}

export const sfx = {
  move: () => tone(1400, 0.02, 'square', 0.12),
  select: () => tone(988, 0.04, 'square', 0.18),
  start: () => arp([60, 67, 72, 0, 72, 75, 79, 84], 0.06, 0.2),
  pause: () => arp([84, 79], 0.06, 0.18),
  fire: () => {
    noise(0.25, 0.4, 3000, 0, 'lowpass', 300);
    tone(300, 0.15, 'sawtooth', 0.1, 0, 80);
  },
  shot: () => {
    noise(0.12, 0.5, 5000, 0, 'bandpass', 800);
    tone(200, 0.06, 'square', 0.12, 0, 60);
  },
  boom: () => {
    if (!every('boom', 0.05)) return;
    noise(0.5, 0.6, 2200, 0, 'lowpass', 100);
    tone(120, 0.3, 'square', 0.14, 0, 35);
  },
  bigboom: () => {
    noise(1.1, 0.8, 3000, 0, 'lowpass', 60);
    tone(90, 0.7, 'sawtooth', 0.2, 0, 25);
  },
  smallboom: () => {
    if (!every('sboom', 0.04)) return;
    noise(0.2, 0.4, 2600, 0, 'lowpass', 200);
  },
  bounce: () => every('bounce', 0.08) && tone(500, 0.05, 'square', 0.1, 0, 300),
  splash: () => {
    noise(0.4, 0.35, 1800, 0, 'bandpass', 400);
  },
  jump: () => tone(400, 0.1, 'square', 0.1, 0, 700),
  hurt: () => every('hurt', 0.05) && tone(220, 0.1, 'square', 0.12, 0, 120),
  death: () => {
    const t = audioNow();
    if (t === null) return;
    for (let k = 0; k < 5; k++) tone(500 - k * 70, 0.1, 'square', 0.14, t + k * 0.08, 300 - k * 50);
  },
  pickup: () => arp([72, 76, 79, 84], 0.05, 0.2),
  teleport: () => arp([60, 72, 84, 96], 0.04, 0.16, 'triangle'),
  girder: () => {
    tone(180, 0.1, 'square', 0.15, 0, 120);
    noise(0.08, 0.3, 4000, 0, 'highpass');
  },
  bat: () => {
    noise(0.08, 0.5, 2500, 0, 'bandpass', 600);
    tone(150, 0.12, 'square', 0.15, 0, 60);
  },
  plane: () => {
    const t = audioNow();
    if (t === null) return;
    for (let k = 0; k < 24; k++) tone(70 + Math.sin(k) * 4, 0.1, 'sawtooth', 0.05, t + k * 0.08);
  },
  turn: () => arp([67, 72], 0.05, 0.15),
  tick: () => tone(1200, 0.03, 'square', 0.14),
  rope: () => tone(700, 0.08, 'square', 0.1, 0, 1400),
  skip: () => arp([60, 55], 0.08, 0.12),
  win: () => arp([60, 64, 67, 72, 0, 72, 76, 79, 84, 84], 0.09, 0.22),
  charge: (p: number) => every('charge', 0.05) && tone(200 + p * 600, 0.05, 'square', 0.05),
};

/** Plays the sound for a world event. */
export function play(e: Event) {
  (sfx[e] as (() => void) | undefined)?.();
}

// ---------- music ----------

// A jaunty march in A minor, 8 bars of 8 eighths. Instruments join as the intensity rises.
const BASS_ROOTS = [45, 45, 41, 43, 45, 45, 41, 40];
const MELODY = onsets([
  // bar 1-2
  0, 69, 1, 1, 72, 1, 2, 76, 2, 4, 74, 1, 5, 72, 1, 6, 69, 2,
  8, 71, 1, 9, 72, 1, 10, 74, 2, 12, 72, 1, 13, 71, 1, 14, 69, 2,
  // bar 3-4
  16, 65, 1, 17, 69, 1, 18, 72, 2, 20, 71, 1, 21, 69, 1, 22, 65, 2,
  24, 67, 1, 25, 71, 1, 26, 74, 2, 28, 72, 1, 29, 71, 1, 30, 67, 2,
  // bar 5-6
  32, 69, 1, 33, 72, 1, 34, 76, 1, 35, 79, 1, 36, 81, 2, 38, 79, 1, 39, 76, 1,
  40, 77, 1, 41, 76, 1, 42, 74, 2, 44, 72, 1, 45, 71, 1, 46, 69, 2,
  // bar 7-8
  48, 65, 1, 49, 69, 1, 50, 72, 1, 51, 77, 1, 52, 76, 2, 54, 72, 1, 55, 69, 1,
  56, 68, 1, 57, 71, 1, 58, 76, 2, 60, 71, 1, 61, 68, 1, 62, 64, 2,
]);

const MARCH: Tune = {
  name: 'march',
  unit: 0.14,
  length: 64,
  play(i, t, lv, tr, u) {
    const bar = Math.floor(i / 8), beat = i % 8;
    const root = BASS_ROOTS[bar] + tr;
    // Bass: root on the beat, the fifth or octave in between.
    if (beat % 2 === 0) tone(midiHz(root), u * 0.9, 'triangle', 0.22, t);
    else if (lv >= 1) tone(midiHz(root + (beat === 3 || beat === 7 ? 7 : 12)), u * 0.6, 'triangle', 0.14, t);
    // Drums.
    if (beat === 0 || beat === 4) perc.kick(t, 0.5);
    if (lv >= 1 && (beat === 2 || beat === 6)) perc.snare(t, 0.25);
    if (lv >= 2 && beat % 2 === 1) perc.hat(t, 0.08);
    // Melody.
    for (const [n, len] of MELODY.get(i) ?? []) {
      tone(midiHz(n + tr), u * len * 0.85, 'square', 0.12, t);
      if (lv >= 3) tone(midiHz(n + tr - 12), u * len * 0.85, 'square', 0.05, t);
    }
    // Chords on the off beats once it is lively.
    if (lv >= 2 && (beat === 1 || beat === 5)) {
      const minor = bar !== 2 && bar !== 3 && bar !== 6;
      for (const k of [0, minor ? 3 : 4, 7]) tone(midiHz(root + 12 + k), u * 0.5, 'square', 0.04, t);
    }
  },
};

export const music = createMusic([MARCH]);
