#!/usr/bin/env node
// KRATER walk test: a mole walks across generated maps, left and right, and every stop is listed
// with the terrain in front of it. For checking the walking collision after physics or terrain
// changes: stops should only be walls, low ceilings, the water and the map's ends.
//
//   node tools/walktest.mjs [--maps N] [--url URL]
//
// Like the playtest it starts vite (or uses --url) and drives the dev build in headless Chromium.
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const opt = (k, d) => (args.includes(k) ? args[args.indexOf(k) + 1] : d);
const maps = +opt('--maps', 40);

async function startVite() {
  const port = await new Promise((res, rej) => {
    const s = createServer();
    s.listen(0, '127.0.0.1', () => {
      const { port } = s.address();
      s.close(() => res(port));
    });
    s.on('error', rej);
  });
  const proc = spawn('npx', ['vite', '--port', String(port), '--strictPort', '--host', '127.0.0.1'], { cwd: ROOT, stdio: 'ignore' });
  const url = `http://127.0.0.1:${port}/`;
  for (let i = 0; i < 100; i++) {
    try {
      if ((await fetch(url)).ok) return { url, proc };
    } catch {}
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error('vite did not start');
}

let vite = null;
const url = opt('--url', null) ?? (vite = await startVite()).url;
const browser = await puppeteer.launch({ executablePath: process.env.CHROMIUM || '/usr/bin/chromium', headless: true, args: ['--no-sandbox', '--disable-gpu'] });
try {
  const page = await browser.newPage();
  page.on('pageerror', (e) => console.error('page error:', e.message));
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForFunction(() => window.krater, { timeout: 30000 });
  const out = await page.evaluate((maps) => {
    const { World, THEMES, makeRng, mapWidth, MAP_H } = window.krater;
    const res = [];
    for (let seed = 1; seed <= maps; seed++)
      for (const dir of [1, -1]) {
        const settings = { teams: [{ cpu: false, skill: 0 }, { cpu: false, skill: 0 }], molesPerTeam: 3, wind: false, moveLimit: 0, turnSeconds: 0, suddenDeath: 0 };
        const w = new World(settings, THEMES[seed % THEMES.length], makeRng(seed), mapWidth(2), MAP_H);
        const empty = () => ({ held: new Set(), pressed: new Set(), released: new Set() });
        for (let g = 0; w.phase !== 'move' && g < 1000; g++) w.step(empty());
        const m = w.activeMole, t = w.terrain;
        const surface = (x, y) => {
          for (let yy = Math.floor(y) - 40; yy < t.h; yy++) if (t.isSolid(x, yy)) return yy;
          return 9999;
        };
        const snapshot = () => {
          const ahead = [];
          for (let i = 0; i <= 10; i++) ahead.push(surface(Math.round(m.x) + i * dir, m.y) - Math.floor(m.y));
          return { x: Math.round(m.x), y: Math.round(m.y), onGround: m.onGround, ahead };
        };
        const stalls = [];
        let lastX = m.x, still = 0, start = null;
        for (let f = 0; f < 2400; f++) {
          const inp = empty();
          inp.held.add(dir > 0 ? 'right' : 'left');
          w.step(inp);
          if (!m.alive || w.phase !== 'move') break;
          if (Math.abs(m.x - lastX) < 0.01) {
            if (still++ === 1) start = snapshot();
          } else {
            if (still >= 2) stalls.push({ ...start, frames: still, resolved: true });
            still = 0;
            lastX = m.x;
          }
        }
        if (still >= 2) stalls.push({ ...start, frames: still, resolved: false });
        res.push({ seed, dir, alive: m.alive, phase: w.phase, stalls, w: w.w });
      }
    return res;
  }, maps);
  const ends = { drowned: 0, stopped: 0, mapEdge: 0 };
  let transient = 0;
  for (const r of out) {
    for (const s of r.stalls) {
      if (s.resolved) transient++;
      if (s.x <= 8 || s.x >= r.w - 8) continue;
      console.log(`map ${r.seed} ${r.dir > 0 ? 'right' : 'left '} x=${s.x} y=${s.y} ${s.onGround ? 'ground' : 'air   '} ${s.resolved ? `stalled ${s.frames} frames` : 'STOPPED'}  surface ahead (rows below the feet): ${s.ahead.join(' ')}`);
    }
    if (!r.alive) ends.drowned++;
    else if (r.stalls.some((s) => !s.resolved && s.x > 8 && s.x < r.w - 8)) ends.stopped++;
    else ends.mapEdge++;
  }
  console.log(`\n${out.length} walks: ${ends.drowned} ended in the water, ${ends.stopped} at an obstacle, ${ends.mapEdge} at the map edge; ${transient} passing stalls`);
} finally {
  await browser.close();
  vite?.proc.kill();
}
