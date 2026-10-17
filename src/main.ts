import { Game, W, H } from './game';
import { render } from './render';
import { Input, Action } from './world';
import { unlockAudio, music } from './audio';
import { setupTouch, TouchButton } from 'arcade-kit/touch';
import { loadSprites } from './sprites';
import { setupHidPad, padAxes } from 'arcade-kit/hidpad';

const canvas = document.getElementById('screen') as HTMLCanvasElement;
const ctx = canvas.getContext('2d')!;
ctx.imageSmoothingEnabled = false;

// On-screen controls for phones and tablets.
const TOUCH_ROWS: TouchButton<Action>[][] = [
  [
    { id: 'left', label: '◀', a: 'left' },
    { id: 'right', label: '▶', a: 'right' },
    { id: 'up', label: '▲', a: 'up' },
    { id: 'down', label: '▼', a: 'down' },
    { id: 'zoom', label: '⊖', a: 'zoom' },
    { id: 'music', label: '♪', a: 'mute' },
  ],
  [
    { id: 'flip', label: 'FLIP', a: 'flip' },
    { id: 'jump', label: 'JUMP', a: 'jump' },
    { id: 'weapons', label: 'WPN', a: 'weapons' },
    { id: 'fire', label: 'FIRE', a: 'fire', wide: true },
    { id: 'start', label: 'START', a: 'start' },
  ],
];
const touchPanel = setupTouch(TOUCH_ROWS, onTouch);
setupHidPad();

let scale = 1;
function resize() {
  const reserved = touchPanel ? touchPanel.el.offsetHeight + 8 : 0;
  const s = Math.min(innerWidth / W, (innerHeight - reserved) / H);
  // Whole-number scaling keeps pixels crisp; phones may need a fractional fit.
  scale = s >= 2 ? Math.floor(s) : Math.max(0.5, s);
  canvas.style.width = `${Math.floor(W * scale)}px`;
  canvas.style.height = `${Math.floor(H * scale)}px`;
}
addEventListener('resize', resize);
resize();

// By e.key so labels match any layout.
const KEYS: Record<string, Action[]> = {
  arrowup: ['up'],
  arrowdown: ['down'],
  arrowleft: ['left'],
  arrowright: ['right'],
  w: ['up'],
  s: ['down'],
  a: ['left'],
  d: ['right'],
  ' ': ['fire'],
  enter: ['jump', 'start'],
  backspace: ['flip', 'quit'],
  tab: ['weapons'],
  q: ['weapons'],
  escape: ['back'],
  p: ['back'],
  m: ['mute'],
  z: ['zoom'],
};

const game = new Game();
const input: Input = { held: new Set(), pressed: new Set(), released: new Set() };
/** Keys currently down: e.code -> the actions it stood for at press time. */
const heldKeys = new Map<string, Action[]>();
const touchHeld = new Set<TouchButton<Action>>();
let fuseKey: number | undefined;

addEventListener('keydown', (e) => {
  unlockAudio();
  const key = e.key.toLowerCase();
  if (key === 'h' && game.phase === 'title') {
    game.phase = 'help';
    game.helpPage = 0;
  }
  if (/^[1-5]$/.test(key) && !e.repeat) fuseKey = +key;
  const acts = KEYS[key];
  if (acts || key === 'tab' || key === 'backspace') e.preventDefault();
  if (!acts) return;
  heldKeys.set(e.code, acts);
  if (!e.repeat) for (const a of acts) input.pressed.add(a);
});
addEventListener('keyup', (e) => {
  const acts = heldKeys.get(e.code);
  heldKeys.delete(e.code);
  if (acts) for (const a of acts) if (![...heldKeys.values()].some((v) => v.includes(a))) input.released.add(a);
});
for (const ev of ['pointerdown', 'pointerup', 'touchend']) addEventListener(ev, unlockAudio, { passive: true });
addEventListener('blur', () => {
  heldKeys.clear();
  if (game.isPlaying) input.pressed.add('back');
});

function onTouch(b: TouchButton<Action>, down: boolean) {
  unlockAudio();
  if (!down) {
    touchHeld.delete(b);
    input.released.add(b.a);
    return;
  }
  touchHeld.add(b);
  input.pressed.add(b.a);
}

// ---------- pointer: drag to look around, click to place ----------

// The pointer is handed to the game in screen coordinates: it converts to the map each frame,
// so a mark under a still mouse stays put while the view scrolls.
let pointer: { x: number; y: number; click: boolean } | undefined;
let drag: { x: number; y: number; moved: boolean; id: number } | null = null;
const toScreen = (e: PointerEvent) => {
  const r = canvas.getBoundingClientRect();
  return { x: ((e.clientX - r.left) / r.width) * W, y: ((e.clientY - r.top) / r.height) * H };
};
canvas.addEventListener('pointerdown', (e) => {
  const p = toScreen(e);
  drag = { x: p.x, y: p.y, moved: false, id: e.pointerId };
  game.dragging = true;
  canvas.setPointerCapture(e.pointerId);
  // Taps on menus count as a press.
  if (game.phase !== 'play') input.pressed.add('start');
});
canvas.addEventListener('pointermove', (e) => {
  const p = toScreen(e);
  if (e.pointerType === 'mouse') game.pointerAt = p;
  if (drag && drag.id === e.pointerId) {
    const dx = p.x - drag.x, dy = p.y - drag.y;
    if (drag.moved || Math.hypot(dx, dy) > 6) {
      drag.moved = true;
      game.pan(dx, dy);
      drag.x = p.x;
      drag.y = p.y;
    }
  } else if (e.pointerType === 'mouse' && game.world?.cursorMode) pointer = { x: p.x, y: p.y, click: false };
});
canvas.addEventListener('pointerleave', () => (game.pointerAt = null));
canvas.addEventListener(
  'wheel',
  (e) => {
    e.preventDefault();
    game.setZoom(game.zoomIndex + (e.deltaY > 0 ? 1 : -1));
  },
  { passive: false },
);
const endDrag = (e: PointerEvent) => {
  if (!drag || drag.id !== e.pointerId) return;
  const p = toScreen(e);
  if (!drag.moved && game.phase === 'play') pointer = { x: p.x, y: p.y, click: true };
  drag = null;
  game.dragging = false;
};
canvas.addEventListener('pointerup', endDrag);
canvas.addEventListener('pointercancel', endDrag);
canvas.addEventListener('contextmenu', (e) => e.preventDefault());

// ---------- gamepad ----------

const PAD_BUTTONS: Record<number, Action[]> = { 0: ['fire'], 1: ['jump', 'start'], 2: ['flip'], 3: ['weapons'], 9: ['back', 'start'], 8: ['quit'], 12: ['up'], 13: ['down'], 14: ['left'], 15: ['right'], 4: ['weapons'], 5: ['weapons'] };
let padWas = new Set<Action>();
function pollPads() {
  const now = new Set<Action>();
  for (const pad of navigator.getGamepads?.() ?? []) {
    if (!pad) continue;
    pad.buttons.forEach((b, i) => b.pressed && PAD_BUTTONS[i]?.forEach((a) => now.add(a)));
    const [ax, ay] = padAxes(pad);
    if (ax < -0.5) now.add('left');
    if (ax > 0.5) now.add('right');
    if (ay < -0.5) now.add('up');
    if (ay > 0.5) now.add('down');
  }
  for (const a of now) {
    input.held.add(a);
    if (!padWas.has(a)) input.pressed.add(a);
  }
  for (const a of padWas) if (!now.has(a)) input.released.add(a);
  padWas = now;
}

// ---------- the loop ----------

const STEP = 1000 / 60;
let last = performance.now();
let acc = 0;

function frame(now: number) {
  acc = Math.min(acc + (now - last), STEP * 4);
  last = now;
  while (acc >= STEP) {
    acc -= STEP;
    input.held.clear();
    for (const acts of heldKeys.values()) for (const a of acts) input.held.add(a);
    for (const b of touchHeld) input.held.add(b.a);
    // A tap shorter than a frame still counts as held for that frame, so it moves a step.
    for (const a of input.pressed) input.held.add(a);
    pollPads();
    input.fuse = fuseKey;
    input.pointer = pointer;
    game.step(input);
    input.pressed.clear();
    input.released.clear();
    fuseKey = undefined;
    pointer = undefined;
  }
  touchPanel?.update(music.enabled);
  render(ctx, game);
  requestAnimationFrame(frame);
}

loadSprites().then(() => requestAnimationFrame(frame));

// A few helpers for the console in dev builds: sim() plays CPU battles without a screen.
if (import.meta.env.DEV) import('./sim').then(({ simulate }) => Object.assign(window, { game, sim: simulate }));
