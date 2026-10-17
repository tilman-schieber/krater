// A battle without a screen: CPU teams play each other as fast as the machine allows, for
// balancing and for catching errors. Dev builds expose it on the console as sim().
import { makeRng } from 'arcade-kit/rng';
import { World, Settings, Event } from './world';
import { Bot } from './bot';
import { THEMES } from './themes';

export interface SimResult {
  seed: number;
  theme: string;
  frames: number;
  turns: number;
  winner: number | null;
  events: Partial<Record<Event, number>>;
  teams: { name: string; dealt: number; kills: number; alive: number; hp: number }[];
  /** Per turn: team, weapon, damage dealt that turn. */
  log: string[];
  error?: string;
  /** The world as it ended, for poking at. */
  world: World;
}

export function simulate(opts: { seed?: number; teams?: number; moles?: number; skills?: number[]; theme?: number; maxFrames?: number; wind?: boolean } = {}): SimResult {
  const seed = opts.seed ?? Math.floor(Math.random() * 1e9);
  const n = opts.teams ?? 2;
  const skills = opts.skills ?? Array(n).fill(0.55);
  const settings: Settings = {
    teams: Array.from({ length: n }, (_, i) => ({ cpu: true, skill: skills[i] ?? 0.55 })),
    molesPerTeam: opts.moles ?? 3,
    wind: opts.wind ?? true,
    turnSeconds: 45,
    suddenDeath: 10,
  };
  const theme = THEMES[opts.theme ?? seed % THEMES.length];
  const w = new World(settings, theme, makeRng(seed), 1600 + (n - 2) * 320, 720);
  const bots = w.teams.map((t) => new Bot(t.index, t.skill));
  const events: Partial<Record<Event, number>> = {};
  const log: string[] = [];
  const max = opts.maxFrames ?? 60 * 60 * 20;
  let frames = 0;
  let lastTurn = 0;
  let dealtBefore = 0;
  let error: string | undefined;
  try {
    while (w.phase !== 'over' && frames < max) {
      const bot = bots[w.activeTeam];
      w.step(bot.think(w));
      frames++;
      for (const e of w.events) events[e] = (events[e] ?? 0) + 1;
      if (w.turn !== lastTurn) {
        const dealt = w.teams.reduce((s, t) => s + t.dealt, 0);
        if (lastTurn) log.push(`T${lastTurn} ${w.teams[(w.activeTeam + n - 1) % n].name} +${dealt - dealtBefore}`);
        dealtBefore = dealt;
        lastTurn = w.turn;
      }
    }
  } catch (e) {
    error = String(e instanceof Error ? e.stack ?? e.message : e);
  }
  return {
    seed,
    theme: theme.id,
    frames,
    turns: w.turn,
    winner: w.winner,
    events,
    teams: w.teams.map((t) => ({ name: t.name, dealt: t.dealt, kills: t.kills, alive: w.teamMoles(t.index).length, hp: w.teamHp(t.index) })),
    log,
    error,
    world: w,
  };
}
