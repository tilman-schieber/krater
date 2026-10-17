#!/usr/bin/env node
// KRATER playtest: CPU teams fight each other headless, many games fast, and a report says what each
// weapon did. For balancing.
//
//   npm run playtest -- [options]
//
//   --games N        games to play (default 20)
//   --seed S         base seed; game g plays seed S+g, so runs are reproducible (default 1)
//   --teams 2|3|4|mix  teams per game; mix cycles 2,3,4 (default 2)
//   --moles N        moles per team (default 3)
//   --skill 0..1     CPU skill of every team (default 0.7)
//   --skills a,b,..  skills per seat, e.g. 0.3,0.9 to pit a weak team against a strong one
//   --move N         movement budget per turn in pixels, 0 for none; the turn clock is off when there is one (default 200)
//   --wind on|off    (default on)
//   --url URL        use a running dev server instead of starting one
//   --out FILE       JSON output (default tools/playtest/out/<timestamp>.json)
//
// Starts `vite` on a free port, opens the dev build in headless Chromium (puppeteer-core; set CHROMIUM
// to the browser binary, default /usr/bin/chromium) and calls the page's sim() once per game.
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');

function parseArgs(argv) {
  const o = { games: 20, seed: 1, teams: '2', moles: 3, skill: 0.7, skills: null, move: 200, wind: true, url: null, out: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i], v = () => argv[++i];
    if (a === '--games') o.games = +v();
    else if (a === '--seed') o.seed = +v();
    else if (a === '--teams') o.teams = v();
    else if (a === '--moles') o.moles = +v();
    else if (a === '--skill') o.skill = +v();
    else if (a === '--skills') o.skills = v().split(',').map(Number);
    else if (a === '--move') o.move = +v();
    else if (a === '--wind') o.wind = v() !== 'off';
    else if (a === '--url') o.url = v();
    else if (a === '--out') o.out = resolve(v());
    else if (a === '-h' || a === '--help') {
      console.log(readFileSync(fileURLToPath(import.meta.url), 'utf8').split('\nimport ')[0].replace(/^#.*\n/, '').replace(/^\/\/ ?/gm, ''));
      process.exit(0);
    } else throw new Error(`unknown option ${a}`);
  }
  return o;
}

function freePort() {
  return new Promise((res, rej) => {
    const s = createServer();
    s.listen(0, '127.0.0.1', () => {
      const { port } = s.address();
      s.close(() => res(port));
    });
    s.on('error', rej);
  });
}

async function startVite() {
  const port = await freePort();
  const proc = spawn('npx', ['vite', '--port', String(port), '--strictPort', '--host', '127.0.0.1'], { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] });
  let log = '';
  proc.stdout.on('data', (d) => (log += d));
  proc.stderr.on('data', (d) => (log += d));
  const url = `http://127.0.0.1:${port}/`;
  for (let i = 0; i < 100; i++) {
    if (proc.exitCode !== null) throw new Error(`vite exited:\n${log}`);
    try {
      const r = await fetch(url);
      if (r.ok) return { url, proc };
    } catch {}
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`vite did not start:\n${log}`);
}

const pad = (s, n) => String(s).padStart(n);
const f1 = (x) => (Number.isFinite(x) ? x.toFixed(1) : '-');

function report(games, opts) {
  const n = games.length;
  const done = games.filter((g) => g.winner !== null);
  console.log(`\n${n} games, ${opts.teams} teams, ${opts.moles} moles, skill ${opts.skills ? opts.skills.join('/') : opts.skill}, move ${opts.move}, wind ${opts.wind ? 'on' : 'off'}`);
  const turns = games.map((g) => g.turns), secs = games.map((g) => g.frames / 60);
  const mean = (a) => a.reduce((s, x) => s + x, 0) / Math.max(1, a.length);
  console.log(`finished ${done.length}/${n}, draws ${done.filter((g) => g.winner < 0).length}, turns ${f1(mean(turns))} (${Math.min(...turns)}-${Math.max(...turns)}), minutes ${f1(mean(secs) / 60)}`);
  for (const g of games) if (g.winner === null) console.log(`unfinished: seed ${g.seed} ${g.theme} ${g.phase} T${g.turns} ${g.teams.map((t) => t.alive + '/' + t.hp).join(' ')}`);
  const errors = games.filter((g) => g.error);
  if (errors.length) console.log(`errors: ${errors.length}\n  ${errors[0].error.split('\n').slice(0, 3).join('\n  ')}`);

  // Who wins: by seat, and by skill when seats differ.
  const seats = {};
  for (const g of done) if (g.winner >= 0) seats[g.winner] = (seats[g.winner] ?? 0) + 1;
  console.log(`wins by seat: ${Object.entries(seats).map(([s, w]) => `${s}:${w}`).join(' ')}`);
  if (opts.skills) {
    const bySkill = {};
    for (const g of done) if (g.winner >= 0) bySkill[g.skills[g.winner]] = (bySkill[g.skills[g.winner]] ?? 0) + 1;
    console.log(`wins by skill: ${Object.entries(bySkill).map(([s, w]) => `${s}:${w}`).join(' ')}`);
  }

  // Weapons.
  const totals = {};
  for (const g of games)
    for (const [k, s] of Object.entries(g.stats)) {
      const t = (totals[k] ??= { uses: 0, dealt: 0, self: 0, kills: 0, drowns: 0 });
      for (const f of Object.keys(t)) t[f] += s[f];
    }
  const allDealt = Object.values(totals).reduce((s, t) => s + t.dealt, 0) || 1;
  console.log('\nweapon       uses  /game  dmg/use  self/use  kills/use  drown/use  share');
  for (const [k, t] of Object.entries(totals).sort((a, b) => b[1].dealt - a[1].dealt)) {
    const u = t.uses || 0;
    console.log(`${k.padEnd(12)} ${pad(u, 4)}  ${pad(f1(u / n), 5)}  ${pad(u ? f1(t.dealt / u) : f1(t.dealt), 7)}  ${pad(u ? f1(t.self / u) : '-', 8)}  ${pad(u ? (t.kills / u).toFixed(2) : t.kills, 9)}  ${pad(u ? (t.drowns / u).toFixed(2) : t.drowns, 9)}  ${pad(((t.dealt / allDealt) * 100).toFixed(0) + '%', 5)}`);
  }
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  let vite = null;
  const url = opts.url ?? (vite = await startVite()).url;
  const browser = await puppeteer.launch({ executablePath: process.env.CHROMIUM || '/usr/bin/chromium', headless: true, args: ['--no-sandbox', '--disable-gpu'] });
  try {
    const page = await browser.newPage();
    page.on('pageerror', (e) => console.error('page error:', e.message));
    await page.goto(url, { waitUntil: 'load' });
    await page.waitForFunction(() => typeof window.sim === 'function', { timeout: 30000 });
    const games = [];
    const teamsOf = (g) => (opts.teams === 'mix' ? 2 + (g % 3) : +opts.teams);
    const t0 = Date.now();
    for (let g = 0; g < opts.games; g++) {
      const teams = teamsOf(g);
      const r = await page.evaluate(
        (o) => {
          const r = window.sim(o);
          return { seed: r.seed, theme: r.theme, frames: r.frames, turns: r.turns, winner: r.winner, phase: r.world.phase, teams: r.teams, events: r.events, stats: r.stats, skills: r.skills, error: r.error ?? null, log: r.log };
        },
        { seed: opts.seed + g, teams, moles: opts.moles, skill: opts.skill, skills: opts.skills ? opts.skills.slice(0, teams) : undefined, moveLimit: opts.move, wind: opts.wind, maxFrames: 60 * 60 * 20 },
      );
      games.push(r);
      process.stdout.write(`\rgame ${g + 1}/${opts.games}  ${r.theme.padEnd(7)} T${pad(r.turns, 3)} winner ${r.winner === null ? 'none' : r.winner < 0 ? 'draw' : r.winner}   `);
    }
    process.stdout.write(`\r${' '.repeat(60)}\r`);
    report(games, opts);
    console.log(`\n${((Date.now() - t0) / 1000).toFixed(1)}s`);
    const out = opts.out ?? join(HERE, 'playtest', 'out', `${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, JSON.stringify({ opts, games }, null, 1));
    console.log(`written to ${out}`);
  } finally {
    await browser.close();
    vite?.proc.kill();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
