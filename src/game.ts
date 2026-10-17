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

export const W = 640;
export const H = 360;

export type Phase = 'title' | 'play' | 'over' | 'help';

export const TEAM_KINDS = ['OFF', 'HUMAN', 'CPU EASY', 'CPU NORMAL', 'CPU HARD'] as const;
const SKILLS = [0, 0, 0.2, 0.55, 0.9];
export const MAPS = ['RANDOM', ...THEMES.map((t) => t.name)];
export const TIMES = [30, 45, 60];
export const SUDDEN = [0, 8, 15];
export const MUSIC_NAMES = ['ON', 'OFF'];

export const MENU = ['TEAM 1', 'TEAM 2', 'TEAM 3', 'TEAM 4', 'MOLES', 'MAP', 'WIND', 'TURN TIME', 'SUDDEN DEATH', 'MUSIC', 'HELP', 'START'] as const;
export type MenuRow = (typeof MENU)[number];

export interface GameSettings {
  teams: number[];
  moles: number;
  map: number;
  wind: boolean;
  time: number;
  sudden: number;
  music: number;
}

const DEFAULTS: GameSettings = { teams: [1, 3, 0, 0], moles: 3, map: 0, wind: true, time: 1, sudden: 1, music: 0 };
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
  /** The player has dragged the view; stop following until something happens. */
  panned = false;
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
    const teams = settings.teams.length;
    const w = 1600 + (teams - 2) * 320;
    return new World(settings, theme, makeRng(randomSeed()), w, 720);
  }

  private startAttract() {
    const settings: Settings = { teams: [{ cpu: true, skill: 0.6 }, { cpu: true, skill: 0.6 }], molesPerTeam: 2, wind: true, turnSeconds: 20, suddenDeath: 6 };
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
    const dir = input.pressed.has('right') ? 1 : input.pressed.has('left') ? -1 : 0;
    const go = input.pressed.has('start') || input.pressed.has('fire');
    const row = MENU[this.menuRow];
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
        case 'START':
          if (go) {
            this.saveSettings();
            this.start();
            return;
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
    } else if (input.pointer?.click && w.panel) {
      // A click on the weapon panel picks that weapon.
      const i = this.panelHit(input.pointer.x - this.cam.x, input.pointer.y - this.cam.y);
      if (i >= 0) w.pickWeapon(WEAPON_ORDER[i]);
      worldInput = { ...input, pointer: undefined };
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
    this.cam.x -= dx;
    this.cam.y -= dy;
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
      const tx = f.x - W / 2, ty = f.y - H / 2;
      const k = 0.1;
      this.cam.x += (tx - this.cam.x) * k;
      this.cam.y += (ty - this.cam.y) * k;
    }
    this.clampCamera(w);
  }

  private clampCamera(w: World | null) {
    if (!w) return;
    this.cam.x = Math.max(0, Math.min(w.w - W, this.cam.x));
    this.cam.y = Math.max(-240, Math.min(w.h - H, this.cam.y));
  }

  /** Screen to map coordinates. */
  toMap(sx: number, sy: number) {
    return { x: sx + this.cam.x, y: sy + this.cam.y };
  }
}
