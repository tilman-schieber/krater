// Screens and settings: the title with its menu, the battle, pause, the winner and the help pages.
// The world does the fighting; the game owns the camera, the CPU players and what the keys mean
// on each screen.
import { makeRng, randomSeed, Rng } from 'arcade-kit/rng';
import { load, save } from 'arcade-kit/storage';
import { World, Input, Action, Settings, Event } from './world';
import { Bot } from './bot';
import { THEMES } from './themes';
import { HELP_PAGES } from './help';
import { WEAPON_ORDER } from './world';
import { PANEL_COLS } from './weapons';
import { music, play, sfx } from './audio';
import type { View } from './render';

export const W = 640;
export const H = 360;

export type Phase = 'title' | 'play' | 'over' | 'help';

export const TEAM_KINDS = ['OFF', 'HUMAN', 'CPU EASY', 'CPU NORMAL', 'CPU HARD'] as const;
const SKILLS = [0, 0, 0.2, 0.55, 0.9];
export const MAPS = ['RANDOM', ...THEMES.map((t) => t.name)];
export const TIMES = [30, 45, 60, 0];
export const SUDDEN = [0, 8, 15];
export const MOVES = [0, 100, 200, 350];
export const MOVE_NAMES = ['FREE', 'SHORT', 'NORMAL', 'LONG'];
export const MUSIC_NAMES = ['ON', 'OFF'];

export const MENU = ['TEAM 1', 'TEAM 2', 'TEAM 3', 'TEAM 4', 'MOLES', 'MAP', 'WIND', 'MOVEMENT', 'TURN TIME', 'SUDDEN DEATH', 'MUSIC', 'HELP'] as const;
export type MenuRow = (typeof MENU)[number];
/** The title screen's layout: the teams panel, the rules panel and the start button. */
export const TITLE = {
  teams: { x: 24, y: 84, w: 284, h: 198, top: 24, rowH: 42 },
  rules: { x: 320, y: 84, w: 296, h: 198, top: 24, rowH: 20, gapBefore: 6 },
  start: { x: W / 2 - 90, y: 294, w: 180, h: 36 },
};
/** Rows in the rules panel that have a gap above (a new group). */
const RULES_GAP: MenuRow[] = ['MUSIC'];

/** Screen y of a menu row's top. */
export function menuRowY(i: number) {
  if (i < 4) return TITLE.teams.y + TITLE.teams.top + i * TITLE.teams.rowH;
  let y = TITLE.rules.y + TITLE.rules.top;
  for (let k = 4; k < i; k++) y += TITLE.rules.rowH + (RULES_GAP.includes(MENU[k + 1]) ? TITLE.rules.gapBefore : 0);
  return y;
}

/** The menu row under a screen point, 'start' for the button, or -1. */
export function menuHit(sx: number, sy: number): number | 'start' {
  const b = TITLE.start;
  if (sx >= b.x && sx <= b.x + b.w && sy >= b.y && sy <= b.y + b.h) return 'start';
  for (let i = 0; i < MENU.length; i++) {
    const p = i < 4 ? TITLE.teams : TITLE.rules;
    const y = menuRowY(i);
    if (sx >= p.x && sx <= p.x + p.w && sy >= y - 2 && sy < y + p.rowH - 2) return i;
  }
  return -1;
}

export interface GameSettings {
  teams: number[];
  moles: number;
  map: number;
  wind: boolean;
  move: number;
  time: number;
  sudden: number;
  music: number;
}

const DEFAULTS: GameSettings = { teams: [1, 3, 0, 0], moles: 3, map: 0, wind: true, move: 2, time: 1, sudden: 1, music: 0 };
const KEY = 'krater.settings';

function loadSettings(): GameSettings {
  try {
    const s = { ...DEFAULTS, ...JSON.parse(load(KEY) ?? '{}') };
    if (!Array.isArray(s.teams) || s.teams.length !== 4) s.teams = [...DEFAULTS.teams];
    return s;
  } catch {
    return { ...DEFAULTS, teams: [...DEFAULTS.teams] };
  }
}

/** The weapon panel's place on screen (the game needs it for clicks, the renderer to draw it). */
export const PANEL = { x: W / 2 - 3 * 44 - 8, y: 70, cell: 44, cols: PANEL_COLS };

export class Game {
  phase: Phase = 'title';
  settings = loadSettings();
  menuRow = 0;
  paused = false;
  world: World | null = null;
  bots: Bot[] = [];
  /** CPUs fighting behind the title screen. */
  attract: World | null = null;
  attractBots: Bot[] = [];
  /** Camera: the map pixel at the screen's top left. */
  cam = { x: 0, y: 0 };
  /** Zoom levels, cycled with Z or the wheel; the view is W/zoom by H/zoom map pixels. */
  static readonly ZOOMS = [1, 2 / 3, 0.5];
  zoomIndex = 0;
  /** The player has dragged the view; stop following until something happens. */
  panned = false;
  /** Where the mouse is over the screen, for scrolling at the edges; null when it left. */
  pointerAt: { x: number; y: number } | null = null;
  dragging = false;
  /** Frames the winner card has been up. */
  overT = 0;
  helpPage = 0;
  frame = 0;
  /** Events this frame, for sound. */
  events: Event[] = [];
  rng: Rng = makeRng(randomSeed());
  readonly debug = typeof location !== 'undefined' && new URLSearchParams(location.search).has('debug');

  constructor() {
    music.enabled = this.settings.music === 0;
    this.startAttract();
  }

  get isPlaying() {
    return this.phase === 'play' && !this.paused;
  }

  get zoom() {
    return Game.ZOOMS[this.zoomIndex];
  }

  /** The view on the map: camera, size in map pixels, zoom. */
  view(): View {
    const z = this.zoom;
    return { x: Math.round(this.cam.x), y: Math.round(this.cam.y), w: Math.ceil(W / z), h: Math.ceil(H / z), zoom: z };
  }

  /** Steps the zoom (by +1 out, -1 in, or to the next level), keeping the view's centre. */
  setZoom(index: number) {
    const n = Game.ZOOMS.length;
    const next = ((index % n) + n) % n;
    if (next === this.zoomIndex) return;
    const before = this.zoom, after = Game.ZOOMS[next];
    this.cam.x += (W / before - W / after) / 2;
    this.cam.y += (H / before - H / after) / 2;
    this.zoomIndex = next;
    this.clampCamera(this.shown);
    sfx.select();
  }

  /** The world on screen: the battle, or the one behind the title. */
  get shown() {
    return this.phase === 'play' || this.phase === 'over' ? this.world : this.attract;
  }

  private saveSettings() {
    save(KEY, JSON.stringify(this.settings));
  }

  // ---------- worlds ----------

  private makeWorld(settings: Settings, mapIndex: number) {
    const theme = mapIndex > 0 ? THEMES[mapIndex - 1] : THEMES[Math.floor(this.rng() * THEMES.length)];
    // Narrow enough to keep an overview: under two screens for two teams.
    const teams = settings.teams.length;
    const w = 1100 + (teams - 2) * 300;
    return new World(settings, theme, makeRng(randomSeed()), w, 720);
  }

  private startAttract() {
    const settings: Settings = { teams: [{ cpu: true, skill: 0.6 }, { cpu: true, skill: 0.6 }], molesPerTeam: 2, wind: true, moveLimit: 200, turnSeconds: 20, suddenDeath: 6 };
    this.attract = this.makeWorld(settings, 0);
    this.attractBots = this.attract.teams.map((t) => new Bot(t.index, t.skill));
    this.cam = { x: this.attract.w / 2 - W / 2, y: this.attract.h - H };
  }

  start() {
    const s = this.settings;
    const teams = s.teams.map((k) => k).filter((k) => k > 0);
    if (teams.length < 2) {
      sfx.move();
      return;
    }
    const settings: Settings = {
      teams: teams.map((k) => ({ cpu: k >= 2, skill: SKILLS[k] })),
      molesPerTeam: s.moles,
      wind: s.wind,
      moveLimit: MOVES[s.move],
      turnSeconds: TIMES[s.time],
      suddenDeath: SUDDEN[s.sudden],
    };
    this.world = this.makeWorld(settings, s.map);
    this.bots = this.world.teams.filter((t) => t.cpu).map((t) => new Bot(t.index, t.skill));
    this.phase = 'play';
    this.paused = false;
    this.panned = false;
    const m = this.world.activeMole!;
    this.cam = { x: m.x - W / 2, y: m.y - H / 2 };
    sfx.start();
    music.play(0, true);
    music.setIntensity(1);
  }

  quit() {
    this.phase = 'title';
    this.world = null;
    this.paused = false;
    this.startAttract();
    music.setIntensity(0);
  }

  // ---------- the frame ----------

  step(input: Input) {
    this.frame++;
    this.events = [];
    switch (this.phase) {
      case 'title':
        this.titleStep(input);
        break;
      case 'help':
        if (input.pressed.has('left')) this.helpPage = (this.helpPage + HELP_PAGES.length - 1) % HELP_PAGES.length;
        if (input.pressed.has('right') || input.pressed.has('start') || input.pressed.has('fire')) this.helpPage = (this.helpPage + 1) % HELP_PAGES.length;
        if (input.pressed.has('back') || input.pressed.has('quit') || (this.helpPage === 0 && (input.pressed.has('start') || input.pressed.has('fire')) && this.frame % 1 === 0 && false)) this.phase = 'title';
        if (input.pressed.has('left') || input.pressed.has('right')) sfx.move();
        break;
      case 'play':
        this.playStep(input);
        break;
      case 'over':
        this.overT++;
        this.world!.step(this.emptyInput());
        this.updateCamera(this.world!);
        if (this.overT > 60 && (input.pressed.has('start') || input.pressed.has('fire'))) {
          this.quit();
          sfx.select();
        }
        break;
    }
    if (this.phase === 'title' || this.phase === 'help') {
      const a = this.attract!;
      const bot = this.attractBots.find((b) => b.team === a.activeTeam);
      a.step(bot ? bot.think(a) : this.emptyInput());
      this.updateCamera(a);
      if (a.phase === 'over' && a.frame % 240 === 0) this.startAttract();
    }
    if (input.pressed.has('mute')) this.toggleMusic();
    if (input.pressed.has('zoom')) this.setZoom(this.zoomIndex + 1);
  }

  private emptyInput(): Input {
    return { held: new Set<Action>(), pressed: new Set<Action>(), released: new Set<Action>() };
  }

  private toggleMusic() {
    this.settings.music = this.settings.music ? 0 : 1;
    music.enabled = this.settings.music === 0;
    if (music.enabled) music.play();
    else music.stop();
    this.saveSettings();
  }

  // ---------- title ----------

  private titleStep(input: Input) {
    const rows = MENU.length;
    if (input.pressed.has('up')) {
      this.menuRow = (this.menuRow + rows - 1) % rows;
      sfx.move();
    }
    if (input.pressed.has('down')) {
      this.menuRow = (this.menuRow + 1) % rows;
      sfx.move();
    }
    // Enter starts the game from anywhere (on HELP it opens the help); Space changes the row.
    // A click picks a row and changes it, or presses the start button.
    let dir = input.pressed.has('right') ? 1 : input.pressed.has('left') ? -1 : 0;
    let go = input.pressed.has('fire');
    let start = input.pressed.has('start');
    const p = input.pointer;
    if (p?.click) {
      const hit = menuHit(p.x, p.y);
      if (hit === 'start') start = true;
      else if (hit >= 0) {
        if (this.menuRow !== hit) sfx.move();
        this.menuRow = hit;
        go = true;
      }
    }
    const row = MENU[this.menuRow];
    if (start && row !== 'HELP') {
      this.saveSettings();
      this.start();
      return;
    }
    if (start) go = true;
    if (dir || go) {
      const s = this.settings;
      const cyc = (v: number, n: number, d: number) => (v + d + n) % n;
      const d = dir || 1;
      switch (row) {
        case 'TEAM 1':
        case 'TEAM 2':
        case 'TEAM 3':
        case 'TEAM 4': {
          const i = +row.slice(5) - 1;
          s.teams[i] = cyc(s.teams[i], TEAM_KINDS.length, d);
          break;
        }
        case 'MOLES':
          s.moles = ((s.moles - 1 + d + 4) % 4) + 1;
          break;
        case 'MAP':
          s.map = cyc(s.map, MAPS.length, d);
          break;
        case 'WIND':
          s.wind = !s.wind;
          break;
        case 'MOVEMENT':
          s.move = cyc(s.move, MOVES.length, d);
          break;
        case 'TURN TIME':
          s.time = cyc(s.time, TIMES.length, d);
          break;
        case 'SUDDEN DEATH':
          s.sudden = cyc(s.sudden, SUDDEN.length, d);
          break;
        case 'MUSIC':
          this.toggleMusic();
          break;
        case 'HELP':
          if (go) {
            this.phase = 'help';
            this.helpPage = 0;
          }
          break;
      }
      sfx.select();
      this.saveSettings();
    }
  }

  // ---------- play ----------

  private playStep(input: Input) {
    const w = this.world!;
    if (input.pressed.has('back')) {
      this.paused = !this.paused;
      sfx.pause();
      if (this.paused) music.halt();
      else music.resume();
    }
    if (this.paused) {
      if (input.pressed.has('quit')) this.quit();
      return;
    }
    const team = w.team;
    let worldInput = input;
    if (team.cpu) {
      const bot = this.bots.find((b) => b.team === team.index)!;
      worldInput = bot.think(w);
      // Humans can still skip the banner.
      if (input.pressed.has('start')) worldInput.pressed.add('start');
    } else {
      // The pointer comes in screen coordinates; the world wants map coordinates.
      const p = input.pointer;
      if (p && w.panel) {
        if (p.click) {
          const i = this.panelHit(p.x, p.y);
          if (i >= 0) w.pickWeapon(WEAPON_ORDER[i]);
        }
        worldInput = { ...input, pointer: undefined };
      } else if (p) worldInput = { ...input, pointer: { ...this.toMap(p.x, p.y), click: p.click } };
      // Looking around: the mouse at the screen's edge scrolls, and in cursor mode the arrows
      // take the view along with the mark.
      this.scroll(input);
    }
    w.step(worldInput);
    this.events.push(...w.events);
    for (const e of w.events) play(e);
    if (w.charging) sfx.charge(w.charge);
    if (w.phase === 'over') {
      this.phase = 'over';
      this.overT = 0;
      music.setIntensity(3);
    }
    // Louder music as the teams thin out.
    const alive = w.moles.filter((m) => m.alive).length;
    const total = w.moles.length;
    music.setIntensity(w.suddenDeath ? 3 : alive <= total / 2 ? 2 : 1);
    this.updateCamera(w);
  }

  private scroll(input: Input) {
    const w = this.world!;
    const EDGE = 14, SPEED = 6;
    if (this.pointerAt && !this.dragging && !w.panel) {
      const { x, y } = this.pointerAt;
      const dx = x < EDGE ? SPEED : x > W - EDGE ? -SPEED : 0;
      const dy = y < EDGE ? SPEED : y > H - EDGE ? -SPEED : 0;
      if (dx || dy) this.pan(dx, dy);
    }
    if (w.cursorMode && w.controllable) {
      const girder = w.weapon.id === 'girder';
      const dx = (input.held.has('left') ? 4 : 0) - (input.held.has('right') ? 4 : 0);
      const dy = girder ? 0 : (input.held.has('up') ? 4 : 0) - (input.held.has('down') ? 4 : 0);
      if (dx || dy) this.pan(dx, dy);
    }
  }

  /** Index into WEAPON_ORDER of the panel cell at a screen point, or -1. */
  panelHit(sx: number, sy: number) {
    const col = Math.floor((sx - PANEL.x - 8) / PANEL.cell), row = Math.floor((sy - PANEL.y - 8) / PANEL.cell);
    if (col < 0 || col >= PANEL.cols || row < 0) return -1;
    const i = row * PANEL.cols + col;
    return i < WEAPON_ORDER.length ? i : -1;
  }

  // ---------- camera ----------

  /** The player dragged the view by (dx, dy) screen pixels. */
  pan(dx: number, dy: number) {
    this.cam.x -= dx / this.zoom;
    this.cam.y -= dy / this.zoom;
    this.panned = true;
    this.clampCamera(this.shown);
  }

  private lastFocus = { x: 0, y: 0 };

  private updateCamera(w: World) {
    const f = w.focus;
    if (f) {
      // A new thing to look at (a shot, a new turn) takes the view back from the player.
      if (Math.hypot(f.x - this.lastFocus.x, f.y - this.lastFocus.y) > 40 || w.projs.length) this.panned = false;
      this.lastFocus = { x: f.x, y: f.y };
    }
    if (f && !this.panned) {
      const tx = f.x - W / this.zoom / 2, ty = f.y - H / this.zoom / 2;
      const k = 0.1;
      this.cam.x += (tx - this.cam.x) * k;
      this.cam.y += (ty - this.cam.y) * k;
    }
    this.clampCamera(w);
  }

  private clampCamera(w: World | null) {
    if (!w) return;
    const vw = W / this.zoom, vh = H / this.zoom;
    // A view wider than the map sits centred on it.
    this.cam.x = vw >= w.w ? (w.w - vw) / 2 : Math.max(0, Math.min(w.w - vw, this.cam.x));
    this.cam.y = Math.max(-240 - (vh - H), Math.min(w.h - vh, this.cam.y));
  }

  /** Screen to map coordinates. */
  toMap(sx: number, sy: number) {
    return { x: sx / this.zoom + this.cam.x, y: sy / this.zoom + this.cam.y };
  }
}
