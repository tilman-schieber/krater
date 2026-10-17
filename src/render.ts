// Drawing: the battle through the camera, the HUD over it, and the title, help, pause and winner
// screens. Nothing here changes the game.
import { drawText, drawTextCentered, drawTextScaled, drawTextShadow, textWidth } from 'arcade-kit/font';
import { Ctx, WHITE, RED, GREY, LIGHT, DARK, YELLOW, GOLD, BLUE, GREEN, drawBox, disc } from 'arcade-kit/draw';
import { Game, W, H, MENU, MENU_SECTIONS, MenuRow, TEAM_KINDS, MAPS, TIMES, SUDDEN, MUSIC_NAMES, PANEL } from './game';
import { World, Mole, Proj, HH, MID, FPS, WEAPON_ORDER } from './world';
import { weapon } from './weapons';
import { spr, frames, flipped, rotated, teamed, white, drawAt, TEAM_COLORS, Sprite } from './sprites';
import { HELP_PAGES, wrapText } from './help';

export { W, H };

/** The mole sprites stand on this row of their 40px canvas. */
const FEET = 37;

const textC = (ctx: Ctx, s: string, cx: number, y: number, scale: number, color = WHITE) =>
  drawTextScaled(ctx, s, Math.round(cx - (textWidth(s) * scale) / 2), y, scale, color);

const textShadowC = (ctx: Ctx, s: string, cx: number, y: number, scale: number, color = WHITE) => {
  const x = Math.round(cx - (textWidth(s) * scale) / 2);
  drawTextScaled(ctx, s, x + scale, y + scale, scale, '#000');
  drawTextScaled(ctx, s, x, y, scale, color);
};

// ---------- the scene ----------

function backdrop(ctx: Ctx, w: World, cam: { x: number; y: number }, frame: number) {
  const th = w.theme;
  const farBottom = w.waterY - 60 - cam.y * 0.4 - (w.h - H) * 0.6;
  const far = spr(th.far);
  const farTop = farBottom - far.height;
  // Sky down to the far layer, which carries its own sky colour at the top.
  const g = ctx.createLinearGradient(0, Math.min(farTop, 0) - 200, 0, farTop);
  g.addColorStop(0, th.skyTop);
  g.addColorStop(1, th.skyBottom);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  // Clouds.
  if (th.cloud) {
    ctx.fillStyle = th.cloud;
    ctx.globalAlpha = 0.8;
    for (let k = 0; k < 7; k++) {
      const cx = (((k * 613 + frame * 0.15 - cam.x * 0.15) % (W + 300)) + W + 300) % (W + 300) - 150;
      const cy = 30 + ((k * 97) % 120) - cam.y * 0.1 - 24;
      const s = 1 + (k % 3) * 0.4;
      ctx.fillRect(cx - 24 * s, cy, 48 * s, 8 * s);
      ctx.fillRect(cx - 14 * s, cy - 6 * s, 28 * s, 6 * s);
      ctx.fillRect(cx - 6 * s, cy - 10 * s, 12 * s, 4 * s);
    }
    ctx.globalAlpha = 1;
  }
  const tile = (s: Sprite, bottom: number, par: number) => {
    const y = Math.round(bottom - s.height);
    const off = ((-cam.x * par) % s.width) - s.width;
    for (let x = off; x < W; x += s.width) ctx.drawImage(s, Math.round(x), y);
  };
  tile(far, farBottom, 0.25);
  ctx.fillStyle = th.farBottom;
  if (farBottom < H) ctx.fillRect(0, Math.round(farBottom) - 1, W, H - farBottom + 1);
  const near = spr(th.near);
  tile(near, w.waterY + 16 - cam.y * 0.7 - (w.h - H) * 0.3, 0.5);
}

function drawWater(ctx: Ctx, w: World, cam: { x: number; y: number }, frame: number) {
  const th = w.theme;
  const top = w.waterY - cam.y;
  if (top > H) return;
  const bands: [string, number, number, number][] = [
    [th.water, 0, 0.55, 1],
    [th.waterDeep, 7, 0.55, -1.3],
    [th.waterDeep, 14, 0.7, 0.8],
  ];
  for (const [col, dy, alpha, dir] of bands) {
    ctx.globalAlpha = alpha;
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.moveTo(0, H);
    for (let x = 0; x <= W; x += 8) {
      const y = top + dy + Math.sin((x + cam.x) * 0.03 + frame * 0.04 * dir) * 2 + Math.sin((x + cam.x) * 0.011 - frame * 0.02 * dir) * 2;
      ctx.lineTo(x, y);
    }
    ctx.lineTo(W, H);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  // Foam on the crests.
  ctx.fillStyle = th.foam;
  for (let x = 0; x <= W; x += 8) {
    const y = top + Math.sin((x + cam.x) * 0.03 + frame * 0.04) * 2 + Math.sin((x + cam.x) * 0.011 - frame * 0.02) * 2;
    if (Math.sin((x + cam.x) * 0.05 + frame * 0.03) > 0.6) ctx.fillRect(x, Math.round(y), 4, 1);
  }
}

function moleSprite(m: Mole, w: World): Sprite {
  let name = 'mole/stand';
  let i = 0;
  const pick = (strip: string, idx: number) => {
    const f = frames(strip);
    if (f.length > 1 || strip === 'mole/stand') {
      name = strip;
      i = Math.max(0, Math.min(f.length - 1, idx));
    }
  };
  if (!m.alive && m.drowning > 0) pick('mole/hurt', 3);
  else if (m.dying > 0) pick('mole/death', Math.floor(((60 - m.dying) / 60) * 7));
  else if (m.rope) pick('mole/jump', 3);
  else if (!m.onGround) {
    if (m.anim === 'flip') pick('mole/flip', Math.floor(m.animT / 4));
    else if (m.flying) pick('mole/hurt', 2 + (Math.floor(m.animT / 6) % 2));
    else pick('mole/jump', m.vy < -2 ? 2 : m.vy < 0 ? 3 : m.vy < 3 ? 4 : 5);
  } else if (m.anim === 'walk') pick('mole/walk', Math.floor(m.animT / 6) % 4);
  else if (m.anim === 'hurt') pick('mole/hurt', Math.floor(m.animT / 5));
  else if (m.anim === 'throw') pick('mole/throw', Math.floor(m.animT / 4));
  else pick('mole/idle', Math.floor((w.frame + m.id * 7) / 12) % 4);
  let s = frames(name)[i] ?? spr('mole/stand');
  const key = `${name}:${i}`;
  s = teamed(s, key, m.team);
  if (m.facing < 0) s = flipped(s, `${key}:t${m.team}`);
  if (m.flash > 0 && m.flash % 4 < 2) s = white(s, `${key}:t${m.team}:f${m.facing}`);
  return s;
}

function drawMole(ctx: Ctx, w: World, m: Mole, cam: { x: number; y: number }, active: boolean) {
  if (!m.alive && m.drowning <= 0) return;
  const sx = m.x - cam.x, sy = m.y - cam.y;
  if (sx < -40 || sx > W + 40 || sy < -60 || sy > H + 40) return;
  const s = moleSprite(m, w);
  // Rope.
  if (m.rope) {
    ctx.strokeStyle = '#d8c8a0';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(Math.round(sx) + 0.5, Math.round(sy - MID) + 0.5);
    ctx.lineTo(Math.round(m.rope.ax - cam.x) + 0.5, Math.round(m.rope.ay - cam.y) + 0.5);
    ctx.stroke();
  }
  // The weapon in hand, before the mole so the mole's arm overlaps it a little.
  const wp = w.teams[m.team].weapon;
  if (active && m.alive && m.dying === 0 && m.onGround && !m.rope && (wp === 'bazooka' || wp === 'shotgun' || wp === 'bat') && w.phase === 'move') {
    let g = spr(`icons/${wp}`);
    const key = `icons/${wp}`;
    if (m.facing < 0) g = flipped(g, key);
    const ang = -m.aim * m.facing + (wp === 'bat' ? m.facing * 0.6 : 0);
    const r = rotated(g, `${key}:${m.facing}`, ang);
    drawAt(ctx, r, sx + m.facing * 6, sy - MID - 2);
  }
  ctx.drawImage(s, Math.round(sx - s.width / 2), Math.round(sy - FEET - (s.height - 40)));
  if (!m.alive) return;
  // Name and health.
  const col = TEAM_COLORS[m.team];
  const name = m.name;
  const ny = Math.round(sy - FEET - 12);
  const hp = String(m.hp);
  drawTextShadow(ctx, name, Math.round(sx - textWidth(name) / 2), ny, col);
  const bw = textWidth(hp) + 4;
  ctx.fillStyle = '#000';
  ctx.fillRect(Math.round(sx - bw / 2) - 1, ny - 11, bw + 2, 10);
  ctx.fillStyle = col;
  ctx.fillRect(Math.round(sx - bw / 2), ny - 10, bw, 8);
  drawText(ctx, hp, Math.round(sx - bw / 2) + 2, ny - 9, '#000');
  // The active mole gets a bobbing arrow.
  if (active && (w.phase === 'move' || w.phase === 'intro')) {
    const ay = ny - 18 - Math.round(Math.abs(Math.sin(w.frame * 0.1)) * 4);
    ctx.fillStyle = '#000';
    ctx.fillRect(Math.round(sx) - 5, ay - 7, 11, 2);
    for (let k = 0; k < 5; k++) ctx.fillRect(Math.round(sx) - 5 + k, ay - 5 + k, 11 - 2 * k, 1);
    ctx.fillStyle = WHITE;
    ctx.fillRect(Math.round(sx) - 4, ay - 6, 9, 1);
    for (let k = 0; k < 4; k++) ctx.fillRect(Math.round(sx) - 4 + k, ay - 5 + k, 9 - 2 * k, 1);
  }
}

function drawAim(ctx: Ctx, w: World, cam: { x: number; y: number }) {
  const m = w.activeMole;
  if (!m || !w.controllable || w.phase !== 'move' || w.panel) return;
  const wp = w.weapon;
  if (wp.use === 'cursor' || wp.id === 'skip' || w.shotsLeft <= 0) return;
  const sx = m.x - cam.x, sy = m.y - MID - cam.y;
  const dx = Math.cos(m.aim) * m.facing, dy = -Math.sin(m.aim);
  if (wp.use === 'charge' || wp.id === 'shotgun' || wp.id === 'rope') {
    // Crosshair out along the aim.
    drawAt(ctx, spr('items/crosshair'), sx + dx * 64, sy + dy * 64);
  }
  if (w.charging) {
    // Power: a wedge of growing blocks from yellow to red.
    const n = Math.floor(w.charge * 12);
    for (let k = 0; k < n; k++) {
      const d = 18 + k * 4;
      const size = 2 + Math.floor(k / 3);
      const t = k / 12;
      ctx.fillStyle = t < 0.5 ? YELLOW : t < 0.8 ? '#f8a030' : RED;
      ctx.fillRect(Math.round(sx + dx * d - size / 2), Math.round(sy + dy * d - size / 2), size, size);
    }
  }
}

function drawCursor(ctx: Ctx, w: World, cam: { x: number; y: number }) {
  if (!w.cursorMode || !w.controllable) return;
  const wp = w.weapon;
  const cx = w.cursor.x - cam.x, cy = w.cursor.y - cam.y;
  if (wp.id === 'girder') {
    const a = (w.girderAngle * Math.PI) / 4;
    const m = w.activeMole!;
    const ok = Math.hypot(w.cursor.x - m.x, w.cursor.y - m.y) <= 220;
    ctx.save();
    ctx.translate(Math.round(cx), Math.round(cy));
    ctx.rotate(a);
    ctx.globalAlpha = 0.7;
    ctx.fillStyle = ok ? '#9ca0b0' : RED;
    ctx.fillRect(-32, -4, 64, 8);
    ctx.fillStyle = '#50545c';
    for (let x = -28; x < 32; x += 8) ctx.fillRect(x, -1, 2, 2);
    ctx.restore();
    ctx.globalAlpha = 1;
    return;
  }
  const blink = w.frame % 30 < 20;
  if (blink) drawAt(ctx, spr('items/crosshair'), cx, cy);
  if (wp.id === 'airstrike') {
    // Which way the plane comes from.
    const m = w.activeMole!;
    const dir = w.cursor.x >= m.x ? 1 : -1;
    const s = spr('items/plane');
    drawAt(ctx, dir > 0 ? s : flipped(s, 'items/plane'), cx - dir * 40, cy - 50);
  } else if (wp.id === 'teleport') {
    const free = w.terrain.boxFree(w.cursor.x, w.cursor.y, 7, HH) && w.cursor.y < w.waterY;
    ctx.strokeStyle = free ? GREEN : RED;
    ctx.strokeRect(Math.round(cx - 7) + 0.5, Math.round(cy - HH) + 0.5, 14, HH);
  }
}

function drawProj(ctx: Ctx, p: Proj, cam: { x: number; y: number }, frame: number) {
  const sx = p.x - cam.x, sy = p.y - cam.y;
  if (sy < -40) {
    // Off the top: an arrow where it is.
    ctx.fillStyle = WHITE;
    const x = Math.round(Math.max(6, Math.min(W - 6, sx)));
    for (let k = 0; k < 5; k++) ctx.fillRect(x - k, 4 + k, 1 + 2 * k, 1);
    return;
  }
  switch (p.kind) {
    case 'bazooka': {
      const s = rotated(spr('proj/shell'), 'proj/shell', Math.atan2(p.vy, p.vx));
      drawAt(ctx, s, sx, sy);
      break;
    }
    case 'bomb': {
      const s = rotated(spr('proj/bomb'), 'proj/bomb', Math.atan2(p.vy, p.vx) - Math.PI / 2);
      drawAt(ctx, s, sx, sy);
      break;
    }
    case 'grenade':
    case 'cluster':
      drawAt(ctx, rotated(spr('proj/grenade'), 'proj/grenade', p.spin), sx, sy);
      if (p.fuse > 0 && p.fuse < FPS && frame % 10 < 5) disc(ctx, sx, sy, 2, RED);
      break;
    case 'bomblet':
      drawAt(ctx, rotated(spr('proj/bomblet'), 'proj/bomblet', p.spin), sx, sy);
      break;
    case 'dynamite':
      drawAt(ctx, spr('proj/dynamite'), sx, sy - 4);
      if (frame % 6 < 3) {
        ctx.fillStyle = frame % 12 < 6 ? YELLOW : WHITE;
        ctx.fillRect(Math.round(sx) + 3, Math.round(sy) - 12, 2, 2);
      }
      break;
    default:
      disc(ctx, sx, sy, 3, WHITE);
  }
  // Fuse seconds over grenades.
  if (p.fuse > 0 && p.kind !== 'bomblet') {
    const secs = String(Math.ceil(p.fuse / FPS));
    drawTextShadow(ctx, secs, Math.round(sx - 2), Math.round(sy) - 20, WHITE);
  }
}

export function drawScene(ctx: Ctx, w: World, cam: { x: number; y: number }, frame: number, hud: boolean) {
  backdrop(ctx, w, cam, frame);
  // Terrain: the part on screen.
  const sx = Math.max(0, cam.x), sy = Math.max(0, cam.y);
  const dx = sx - cam.x, dy = sy - cam.y;
  const cw = Math.min(w.w - sx, W - dx), ch = Math.min(w.h - sy, H - dy);
  if (cw > 0 && ch > 0) ctx.drawImage(w.terrain.canvas, sx, sy, cw, ch, Math.round(dx), Math.round(dy), cw, ch);
  for (const g of w.graves) drawAt(ctx, teamed(spr('items/grave'), 'items/grave', g.team), g.x - cam.x, g.y - cam.y - 14);
  for (const c of w.crates) {
    drawAt(ctx, spr(c.kind === 'health' ? 'items/crate_health' : 'items/crate_weapon'), c.x - cam.x, c.y - cam.y - 14);
    if (!c.landed) drawAt(ctx, spr('items/parachute'), c.x - cam.x, c.y - cam.y - 42);
  }
  for (const m of w.moles) drawMole(ctx, w, m, cam, m === w.activeMole && hud);
  if (hud) {
    drawAim(ctx, w, cam);
    drawCursor(ctx, w, cam);
  }
  for (const p of w.projs) drawProj(ctx, p, cam, frame);
  for (const pl of w.planes) {
    const s = spr('items/plane');
    const img = pl.dir > 0 ? s : flipped(s, 'items/plane');
    ctx.drawImage(img, Math.round(pl.x - cam.x - 32), Math.round(pl.y - cam.y - 32), 64, 64);
  }
  // Particles behind the explosions.
  for (const p of w.particles) {
    if (p.color === 'smoke') {
      ctx.globalAlpha = Math.min(0.6, p.life / 30);
      ctx.fillStyle = '#c8c8c8';
      const s = 2 + Math.floor((35 - p.life) / 10);
      ctx.fillRect(Math.round(p.x - cam.x - s / 2), Math.round(p.y - cam.y - s / 2), s, s);
      ctx.globalAlpha = 1;
    } else {
      ctx.fillStyle = p.color;
      ctx.fillRect(Math.round(p.x - cam.x), Math.round(p.y - cam.y), p.size, p.size);
    }
  }
  const ex = frames('fx/explosion');
  for (const e of w.explosions) {
    const i = Math.floor(e.t / 5);
    if (i >= ex.length) continue;
    const s = ex[i];
    const size = Math.round(64 * e.scale);
    if (e.t < 3) disc(ctx, e.x - cam.x, e.y - cam.y, e.r * 0.8, WHITE);
    // The effect's anchor is near its top left; centre the blast on its fireball.
    ctx.drawImage(s, Math.round(e.x - cam.x - size * 0.5), Math.round(e.y - cam.y - size * 0.55), size, size);
  }
  drawWater(ctx, w, cam, frame);
  for (const f of w.floats) {
    const y = f.y - cam.y - f.t * 0.4;
    ctx.globalAlpha = f.t > 45 ? 1 - (f.t - 45) / 25 : 1;
    textShadowC(ctx, f.text, f.x - cam.x, Math.round(y), 1, f.color);
    ctx.globalAlpha = 1;
  }
}

// ---------- HUD ----------

function drawHud(ctx: Ctx, game: Game, w: World) {
  const th = w.theme;
  void th;
  // Turn clock, top left (unless the clock is off).
  if ((w.phase === 'move' && w.settings.turnSeconds) || w.phase === 'retreat') {
    const secs = w.phase === 'move' ? Math.ceil(w.turnLeft / FPS) : Math.ceil(w.retreatLeft / FPS);
    const col = w.phase === 'retreat' ? YELLOW : secs <= 5 ? RED : WHITE;
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(8, 8, 52, 30);
    textC(ctx, String(secs).padStart(2, ' '), 34, 14, 3, col);
    if (w.phase === 'retreat') drawTextCentered(ctx, 'RUN', 34, 40, YELLOW);
  }
  // Wind, top centre.
  if (w.settings.wind) {
    const gx = W / 2 - 60, gy = 10;
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(gx, gy, 120, 14);
    ctx.fillStyle = DARK;
    ctx.fillRect(gx + 2, gy + 2, 116, 10);
    ctx.fillStyle = GREY;
    ctx.fillRect(gx + 59, gy + 2, 2, 10);
    const len = Math.round(Math.abs(w.wind) * 56);
    ctx.fillStyle = Math.abs(w.wind) > 0.6 ? RED : Math.abs(w.wind) > 0.3 ? YELLOW : BLUE;
    if (w.wind > 0) ctx.fillRect(gx + 61, gy + 4, len, 6);
    else ctx.fillRect(gx + 59 - len, gy + 4, len, 6);
    // Chevrons moving with the wind.
    ctx.fillStyle = WHITE;
    const dir = Math.sign(w.wind);
    if (dir) {
      const ph = (game.frame * Math.abs(w.wind) * 0.6) % 12;
      for (let k = 0; k < len; k += 12) {
        const x = dir > 0 ? gx + 61 + ((k + ph) % Math.max(len, 1)) : gx + 59 - ((k + ph) % Math.max(len, 1));
        ctx.fillRect(Math.round(x), gy + 6, 1, 2);
      }
    }
    drawTextCentered(ctx, 'WIND', W / 2, gy + 16, LIGHT);
  }
  // Turn and sudden death, top right.
  const info = w.suddenDeath ? 'SUDDEN DEATH' : `TURN ${w.turn}`;
  if (!w.suddenDeath || game.frame % 40 < 28) drawTextShadow(ctx, info, W - 8 - textWidth(info), 10, w.suddenDeath ? RED : LIGHT);
  // Team health, bottom left.
  const max = w.settings.molesPerTeam * 100;
  w.teams.forEach((t, i) => {
    const hp = w.teamHp(t.index);
    const y = H - 10 - (w.teams.length - 1 - i) * 12;
    const col = TEAM_COLORS[t.index];
    drawTextShadow(ctx, t.name, 8, y - 6, col);
    ctx.fillStyle = '#000';
    ctx.fillRect(50, y - 6, 104, 8);
    ctx.fillStyle = col;
    ctx.fillRect(52, y - 4, Math.round((Math.min(hp, max) / max) * 100), 4);
    if (t.index === w.activeTeam && w.phase !== 'over') {
      ctx.fillStyle = WHITE;
      ctx.fillRect(2, y - 4, 3, 4);
    }
  });
  // Weapon, bottom right.
  const team = w.team;
  const wp = w.weapon;
  const bx = W - 8 - 150, by = H - 44;
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.fillRect(bx, by, 150, 36);
  drawAt(ctx, spr(wp.icon), bx + 20, by + 18);
  drawTextScaled(ctx, wp.name, bx + 40, by + 6, 2, WHITE);
  const ammo = team.ammo[wp.id];
  let sub = ammo < 0 ? '' : `X${ammo}`;
  if (wp.bounce) sub += `${sub ? '  ' : ''}FUSE ${team.fuse}`;
  if (wp.id === 'shotgun' && w.shotsLeft < wp.shots && w.phase === 'move') sub = 'ONE MORE';
  drawText(ctx, sub, bx + 40, by + 24, LIGHT);
  // Banners.
  if (w.phase === 'intro') {
    const m = w.activeMole!;
    const col = TEAM_COLORS[team.index];
    drawBox(ctx, W / 2 - 150, 90, 300, w.handover ? 64 : 48);
    textC(ctx, `${team.name} TEAM`, W / 2, 100, 2, col);
    textC(ctx, w.handover ? `${m.name}, PRESS ENTER` : `${m.name}'S TURN`, W / 2, 120, 1, WHITE);
    if (w.handover) drawTextCentered(ctx, 'PASS THE KEYBOARD', W / 2, 136, LIGHT);
    if (w.suddenDeath && w.turn % w.teams.length === 1) textShadowC(ctx, 'THE WATER RISES', W / 2, 170, 2, RED);
  }
  if (w.panel) drawPanel(ctx, w);
}

function drawPanel(ctx: Ctx, w: World) {
  const rows = Math.ceil(WEAPON_ORDER.length / PANEL.cols);
  const pw = PANEL.cols * PANEL.cell + 16, ph = rows * PANEL.cell + 16 + 36;
  drawBox(ctx, PANEL.x, PANEL.y, pw, ph);
  const team = w.team;
  WEAPON_ORDER.forEach((id, i) => {
    const col = i % PANEL.cols, row = Math.floor(i / PANEL.cols);
    const x = PANEL.x + 8 + col * PANEL.cell, y = PANEL.y + 8 + row * PANEL.cell;
    const ammo = team.ammo[id];
    const on = i === w.panelIndex;
    ctx.fillStyle = on ? '#404040' : '#181818';
    ctx.fillRect(x + 1, y + 1, PANEL.cell - 2, PANEL.cell - 2);
    if (on) {
      ctx.fillStyle = YELLOW;
      ctx.fillRect(x, y, PANEL.cell, 1);
      ctx.fillRect(x, y + PANEL.cell - 1, PANEL.cell, 1);
      ctx.fillRect(x, y, 1, PANEL.cell);
      ctx.fillRect(x + PANEL.cell - 1, y, 1, PANEL.cell);
    }
    ctx.globalAlpha = ammo === 0 ? 0.3 : 1;
    drawAt(ctx, spr(`icons/${id}`), x + PANEL.cell / 2, y + PANEL.cell / 2 - 2);
    ctx.globalAlpha = 1;
    if (ammo >= 0) drawTextShadow(ctx, String(ammo), x + PANEL.cell - 4 - textWidth(String(ammo)), y + PANEL.cell - 10, ammo ? WHITE : GREY);
  });
  const wp = weapon(WEAPON_ORDER[w.panelIndex]);
  const ty = PANEL.y + 8 + rows * PANEL.cell + 4;
  drawTextScaled(ctx, wp.name, PANEL.x + 8, ty, 2, YELLOW);
  drawText(ctx, wp.blurb, PANEL.x + 8, ty + 18, LIGHT);
}

// ---------- screens ----------

function drawLogo(ctx: Ctx, frame: number, y: number) {
  const t = 'KRATER';
  const scale = 7;
  const x = Math.round(W / 2 - (textWidth(t) * scale) / 2);
  drawTextScaled(ctx, t, x + 3, y + 3, scale, '#000');
  // Earth from the top, a glowing crater underneath.
  const bands: [number, string][] = [[0, '#6ad04c'], [1, '#a06838'], [3, '#7a4a26'], [5, '#f8a030']];
  for (const [row, col] of bands) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, y + row * scale, W, 7 * scale);
    ctx.clip();
    drawTextScaled(ctx, t, x, y, scale, col);
    ctx.restore();
  }
  const sx = ((frame * 3) % 500) - 100;
  ctx.save();
  ctx.beginPath();
  ctx.rect(sx, y, 10, 7 * scale);
  ctx.clip();
  drawTextScaled(ctx, t, x, y, scale, WHITE);
  ctx.restore();
}

function renderTitle(ctx: Ctx, game: Game) {
  const a = game.attract!;
  drawScene(ctx, a, game.cam, game.frame, false);
  ctx.fillStyle = 'rgba(0,0,0,0.5)';
  ctx.fillRect(0, 0, W, H);
  drawLogo(ctx, game.frame, 14);
  textC(ctx, 'MOLES WITH BAZOOKAS', W / 2, 70, 1, LIGHT);
  const s = game.settings;
  const bx = W / 2 - 150, by = 82;
  // Rows, with a heading and a gap where a section starts.
  const rowY: number[] = [];
  let y = by + 10;
  MENU.forEach((row) => {
    if (MENU_SECTIONS[row]) y += 14;
    rowY.push(y);
    y += 12;
  });
  drawBox(ctx, bx, by, 300, y - by + 6);
  const values: Record<MenuRow, string> = {
    'TEAM 1': TEAM_KINDS[s.teams[0]],
    'TEAM 2': TEAM_KINDS[s.teams[1]],
    'TEAM 3': TEAM_KINDS[s.teams[2]],
    'TEAM 4': TEAM_KINDS[s.teams[3]],
    MOLES: `${s.moles} PER TEAM`,
    MAP: MAPS[s.map],
    WIND: s.wind ? 'ON' : 'OFF',
    'TURN TIME': TIMES[s.time] ? `${TIMES[s.time]} SEC` : 'OFF',
    'SUDDEN DEATH': s.sudden ? `AFTER ${SUDDEN[s.sudden]} TURNS` : 'OFF',
    MUSIC: MUSIC_NAMES[s.music],
    HELP: 'HOW TO PLAY',
    START: '',
  };
  MENU.forEach((row, i) => {
    const y = rowY[i];
    const on = i === game.menuRow;
    const section = MENU_SECTIONS[row];
    if (section) drawText(ctx, section, bx + 20, y - 11, GREY);
    const teamRow = row.startsWith('TEAM');
    const col = teamRow && s.teams[+row.slice(5) - 1] ? TEAM_COLORS[+row.slice(5) - 1] : on ? YELLOW : WHITE;
    if (on) drawText(ctx, '>', bx + 10, y, YELLOW);
    if (row === 'START') drawTextScaled(ctx, 'START', bx + 20, y - 2, 2, on ? YELLOW : WHITE);
    else {
      drawText(ctx, row, bx + 20, y, on ? YELLOW : WHITE);
      const v = values[row];
      drawText(ctx, v, bx + 290 - textWidth(v) - 8, y, col);
    }
  });
  const humans = s.teams.filter((k) => k === 1).length;
  const hint = s.teams.filter((k) => k > 0).length < 2 ? 'TURN ON AT LEAST TWO TEAMS' : humans > 1 ? 'HUMANS SHARE THE KEYBOARD, TURN BY TURN' : 'ARROWS CHOOSE, ENTER STARTS';
  if (game.frame % 60 < 45) drawTextCentered(ctx, hint, W / 2, H - 50, LIGHT);
  drawTextCentered(ctx, 'ESC PAUSES   M MUSIC   H HELP', W / 2, H - 36, GREY);
}

function renderHelp(ctx: Ctx, game: Game) {
  const a = game.attract!;
  drawScene(ctx, a, game.cam, game.frame, false);
  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  ctx.fillRect(0, 0, W, H);
  const page = HELP_PAGES[game.helpPage];
  drawBox(ctx, 40, 20, W - 80, H - 40);
  textC(ctx, page.title, W / 2, 30, 2, YELLOW);
  let y = 54;
  for (const para of page.text) {
    if (!para) {
      y += 6;
      continue;
    }
    for (const line of wrapText(para, 86)) {
      drawText(ctx, line, 56, y, WHITE);
      y += 9;
    }
  }
  drawTextCentered(ctx, `${game.helpPage + 1}/${HELP_PAGES.length}   LEFT/RIGHT PAGES   ESC BACK`, W / 2, H - 36, LIGHT);
}

function renderOver(ctx: Ctx, game: Game, w: World) {
  if (game.overT < 40) return;
  const win = w.winner!;
  drawBox(ctx, W / 2 - 160, 60, 320, 70 + w.teams.length * 12 + 20);
  if (win < 0) textC(ctx, 'EVERYBODY LOST', W / 2, 72, 2, LIGHT);
  else textC(ctx, `${w.teams[win].name} TEAM WINS`, W / 2, 72, 2, TEAM_COLORS[win]);
  drawText(ctx, 'TEAM', W / 2 - 140, 100, GREY);
  drawText(ctx, 'DAMAGE', W / 2 + 20, 100, GREY);
  drawText(ctx, 'KILLS', W / 2 + 90, 100, GREY);
  w.teams.forEach((t, i) => {
    const y = 112 + i * 12;
    drawText(ctx, t.name, W / 2 - 140, y, TEAM_COLORS[t.index]);
    drawText(ctx, String(t.dealt), W / 2 + 20, y, WHITE);
    drawText(ctx, String(t.kills), W / 2 + 90, y, WHITE);
  });
  if (game.overT > 60 && game.frame % 60 < 45) drawTextCentered(ctx, 'PRESS ENTER', W / 2, 112 + w.teams.length * 12 + 10, YELLOW);
}

export function render(ctx: Ctx, game: Game) {
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, W, H);
  switch (game.phase) {
    case 'title':
      renderTitle(ctx, game);
      return;
    case 'help':
      renderHelp(ctx, game);
      return;
  }
  const w = game.world!;
  const cam = { x: Math.round(game.cam.x), y: Math.round(game.cam.y) };
  if (w.shake > 0) {
    cam.x += Math.round((Math.random() - 0.5) * w.shake);
    cam.y += Math.round((Math.random() - 0.5) * w.shake);
  }
  drawScene(ctx, w, cam, game.frame, game.phase === 'play');
  if (game.phase === 'play') drawHud(ctx, game, w);
  if (game.phase === 'over') renderOver(ctx, game, w);
  if (game.paused) {
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(0, 0, W, H);
    textC(ctx, 'PAUSED', W / 2, H / 2 - 20, 3, WHITE);
    drawTextCentered(ctx, 'ESC CONTINUES   BACKSPACE QUITS', W / 2, H / 2 + 16, LIGHT);
  }
  if (game.debug) drawText(ctx, `CAM ${cam.x},${cam.y} PH ${w.phase} T${w.turn}`, 8, H - 60, GOLD);
}
