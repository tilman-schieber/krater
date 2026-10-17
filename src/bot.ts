// CPU teams. On its turn a bot tries shots on the world's own flight code (angles and powers for
// the bazooka and grenade, a straight line for the shotgun, the sky over a target for an
// airstrike), scores each by the damage it would do to the enemy minus what it would do to its
// own side, and takes the best. If nothing is worth firing, it walks toward the nearest enemy
// and looks again. Skill blurs the chosen angle and power and thins the search.
import { World, Mole, Proj, Input, Action, MID, HH, CHARGE_FRAMES, FPS, BOMBLET_R, BOMBLET_DMG, bombletVelocities, launchSpeed } from './world';
import { WeaponId, weapon } from './weapons';

interface Shot {
  weapon: WeaponId;
  facing: 1 | -1;
  /** Aim in the mole's own terms: above the horizontal is positive. */
  aim: number;
  power: number;
  fuse: number;
  score: number;
  /** For the airstrike: where to put the cursor. */
  cursor?: { x: number; y: number };
  /** For the cluster: frames after launch to burst it, if in flight is better than on impact. */
  burstAt?: number;
}

type Plan =
  | { kind: 'shoot'; shot: Shot; state: 'turn' | 'aim' | 'charge' | 'wait'; t: number }
  | { kind: 'walk'; dir: 1 | -1; t: number; stuck: number; lastX: number; jumped: boolean }
  | { kind: 'wait'; t: number }
  | { kind: 'skip' };

const SIM_FRAMES = 500;

export class Bot {
  private plan: Plan | null = null;
  private walks = 0;
  private turn = -1;
  /** Where the dynamite went, to run from. */
  private danger: { x: number; y: number } | null = null;

  constructor(
    readonly team: number,
    readonly skill: number,
  ) {}

  /** The bot's input for this frame. */
  think(w: World): Input {
    const input: Input = { held: new Set<Action>(), pressed: new Set<Action>(), released: new Set<Action>() };
    const m = w.activeMole;
    if (!m || m.team !== this.team) return input;
    if (w.turn !== this.turn) {
      this.turn = w.turn;
      this.plan = null;
      this.walks = 0;
      this.danger = null;
    }
    if (w.phase === 'retreat') {
      this.retreat(w, m, input);
      return input;
    }
    if (!w.controllable || w.phase !== 'move') return input;
    // A moment's thought before acting, so it reads as a turn.
    if (!this.plan) this.plan = { kind: 'wait', t: 30 + Math.round((1 - this.skill) * 30) };
    const p = this.plan;
    switch (p.kind) {
      case 'wait':
        if (--p.t <= 0) this.plan = this.decide(w, m);
        break;
      case 'skip':
        w.pickWeapon('skip');
        input.pressed.add('fire');
        break;
      case 'walk':
        this.walk(w, m, p, input);
        break;
      case 'shoot':
        this.shoot(w, m, p, input);
        break;
    }
    return input;
  }

  // ---------- deciding ----------

  private decide(w: World, m: Mole): Plan {
    const best = this.bestShot(w, m);
    const threshold = this.walks >= 2 ? 1 : 12;
    if (best && best.score >= threshold) return { kind: 'shoot', shot: best, state: 'turn', t: 0 };
    // Out of walks or out of budget: take what there is, or lob one toward the enemy anyway.
    const settle = (): Plan => ({ kind: 'shoot', shot: best && best.score > 0 ? best : this.lob(w, m), state: 'turn', t: 0 });
    if (this.walks >= 2) return settle();
    if (w.budgeted && w.moveLeft < 20) {
      this.walks = 2;
      return settle();
    }
    const e = this.nearestEnemy(w, m);
    this.walks++;
    const dir: 1 | -1 = e ? (e.x > m.x ? 1 : -1) : m.facing;
    let t = 60 + Math.round(w.rng() * 60);
    if (w.budgeted) t = Math.min(t, w.moveLeft);
    return { kind: 'walk', dir, t, stuck: 0, lastX: m.x, jumped: false };
  }

  /** A bazooka shot in the general direction of the nearest enemy: better than standing still. */
  private lob(w: World, m: Mole): Shot {
    const e = this.nearestEnemy(w, m);
    const dx = e ? e.x - m.x : m.facing * 300;
    const facing: 1 | -1 = dx >= 0 ? 1 : -1;
    const power = Math.max(0.35, Math.min(1, Math.abs(dx) / 650 + (w.rng() - 0.5) * 0.2));
    return { weapon: w.team.ammo.bazooka === 0 ? 'grenade' : 'bazooka', facing, aim: 0.75 + (w.rng() - 0.5) * 0.3, power, fuse: 3, score: 0 };
  }

  private enemies(w: World) {
    return w.moles.filter((o) => o.alive && o.dying === 0 && o.team !== this.team);
  }

  private nearestEnemy(w: World, m: Mole) {
    let best: Mole | null = null, bd = Infinity;
    for (const e of this.enemies(w)) {
      const d = Math.hypot(e.x - m.x, e.y - m.y);
      if (d < bd) {
        bd = d;
        best = e;
      }
    }
    return best;
  }

  /** Scores what a blast there would do: enemy damage counts, own damage counts against. */
  private scoreBlast(w: World, x: number, y: number, r: number, dmg: number, self: Mole) {
    let s = 0;
    for (const [o, d] of w.blastDamage(x, y, r, dmg)) {
      if (o.team === this.team) s -= d * (o === self ? 3 : 1.5);
      else {
        s += d;
        if (d >= o.hp) s += 40;
        // Near the water's edge, a knock is worth more.
        if (w.terrain.groundBelow(o.x + Math.sign(o.x - x) * 30, o.y - 5) < 0) s += 15;
      }
    }
    return s;
  }

  private bestShot(w: World, m: Mole): Shot | null {
    // Lesser bots misjudge the wind: they try their shots with only part of it.
    const wind = w.wind;
    w.wind = wind * Math.min(1, this.skill / 0.8);
    try {
      return this.bestShotIn(w, m);
    } finally {
      w.wind = wind;
    }
  }

  private bestShotIn(w: World, m: Mole): Shot | null {
    const team = w.teams[this.team];
    const cands: Shot[] = [];
    const push = (s: Shot | null) => s && cands.push(s);
    const enemies = this.enemies(w);
    if (!enemies.length) return null;
    const fine = this.skill > 0.6;
    const angleStep = fine ? 0.07 : 0.11;
    const powerStep = fine ? 0.1 : 0.15;
    const target = this.nearestEnemy(w, m)!;

    for (const id of ['bazooka', 'grenade', 'cluster'] as WeaponId[]) {
      if (team.ammo[id] === 0) continue;
      if (id === 'cluster' && this.skill < 0.4) continue;
      const wp = weapon(id);
      const fuses = id === 'bazooka' ? [3] : this.skill > 0.5 ? [2, 3, 4] : [3];
      for (const facing of [1, -1] as const) {
        // Mostly toward the target, but a lob the other way round can work too.
        if (facing !== (target.x >= m.x ? 1 : -1) && w.rng() < 0.6) continue;
        for (let aim = -1.2; aim <= 1.5; aim += angleStep)
          for (let power = 0.15; power <= 1.001; power += powerStep)
            for (const fuse of fuses) {
              const { score, burstAt } = this.simulate(w, m, wp.id, facing, aim, power, fuse);
              if (score > 0) push({ weapon: id, facing, aim, power, fuse, score, burstAt });
            }
      }
    }
    // Shotgun: straight lines at every enemy.
    if (team.ammo.shotgun !== 0)
      for (const e of enemies) {
        const dx = e.x - m.x, dy = e.y - MID - (m.y - MID);
        const facing: 1 | -1 = dx >= 0 ? 1 : -1;
        const aim = Math.atan2(-dy, Math.abs(dx));
        if (Math.abs(aim) > Math.PI / 2) continue;
        const hit = this.ray(w, m, facing, aim);
        if (hit === e) push({ weapon: 'shotgun', facing, aim, power: 0, fuse: 0, score: 25 * 2 * (this.skill > 0.3 ? 1 : 0.7) + (e.hp <= 50 ? 20 : 0) });
      }
    // Dynamite and the bat when standing next to someone.
    for (const e of enemies) {
      const dx = e.x - m.x;
      if (Math.abs(e.y - m.y) > HH || Math.abs(dx) > 26) continue;
      const facing: 1 | -1 = dx >= 0 ? 1 : -1;
      if (team.ammo.dynamite !== 0 && m.hp > 30) push({ weapon: 'dynamite', facing, aim: 0, power: 0, fuse: 5, score: 75 + (e.hp <= 75 ? 40 : 0) - 10 });
      push({ weapon: 'bat', facing, aim: 0.5, power: 0, fuse: 0, score: 30 + (w.terrain.groundBelow(e.x + facing * 50, e.y - 5) < 0 ? 50 : 0) });
    }
    // Airstrike on anyone under open sky.
    if (team.ammo.airstrike !== 0 && this.skill > 0.35)
      for (const e of enemies) {
        let open = true;
        for (let y = e.y - HH; y > -60; y -= 4) if (w.terrain.isSolid(e.x, y)) open = false;
        if (!open) continue;
        const wp = weapon('airstrike');
        const score = this.scoreBlast(w, e.x, e.y - MID, wp.radius, wp.damage, m) * 2 + this.scoreBlast(w, e.x - 22, e.y - MID, wp.radius, wp.damage, m) + this.scoreBlast(w, e.x + 22, e.y - MID, wp.radius, wp.damage, m);
        if (score > 20) push({ weapon: 'airstrike', facing: m.facing, aim: 0, power: 0, fuse: 0, score, cursor: { x: e.x, y: e.y - 40 } });
      }
    if (!cands.length) return null;
    cands.sort((a, b) => b.score - a.score);
    // Lesser bots don't always pick the best of what they saw, and their hands shake.
    const slack = 1 - this.skill;
    const pick = cands[Math.min(cands.length - 1, Math.floor(w.rng() * slack * 16))];
    const blur = 0.35 * slack;
    return { ...pick, aim: pick.aim + (w.rng() - 0.5) * blur, power: Math.min(1, Math.max(0.1, pick.power + (w.rng() - 0.5) * blur)) };
  }

  /** The first mole a straight shot would hit, or null (terrain or nothing). */
  private ray(w: World, m: Mole, facing: 1 | -1, aim: number) {
    const dx = Math.cos(aim) * facing, dy = -Math.sin(aim);
    let x = m.x + dx * 14, y = m.y - MID + dy * 14;
    for (let d = 0; d < 1200; d++) {
      x += dx;
      y += dy;
      if (w.terrain.isSolid(x, y) || y > w.waterY) return null;
      const o = w.moleAt(x, y, m.id);
      if (o) return o;
    }
    return null;
  }

  /** A cluster's bomblets from here, scored. */
  private scoreBomblets(w: World, p: Proj, inFlight: boolean, m: Mole) {
    let s = 0;
    let j = 0.5;
    for (const [vx, vy] of bombletVelocities(p, inFlight, () => (j = j === 0.5 ? 0.3 : 0.5))) {
      const b: Proj = { ...p, kind: 'bomblet', vx, vy, fuse: -1, radius: BOMBLET_R, damage: BOMBLET_DMG, bounce: false, split: false, age: 10, y: p.y - 2 };
      for (let g = 0; g < 240; g++) {
        const rb = w.flyStep(b);
        if (rb === 'fly') continue;
        if (rb === 'explode') s += this.scoreBlast(w, b.x, b.y, BOMBLET_R, BOMBLET_DMG, m);
        break;
      }
    }
    return s;
  }

  /** Flies a shot on the world's code and scores where it ends (and, for a cluster, the best burst). */
  private simulate(w: World, m: Mole, id: WeaponId, facing: 1 | -1, aim: number, power: number, fuse: number): { score: number; burstAt?: number } {
    const wp = weapon(id);
    const speed = launchSpeed(wp, power);
    const p: Proj = {
      kind: id,
      x: m.x + Math.cos(aim) * facing * 14,
      y: m.y - MID - Math.sin(aim) * 14,
      vx: Math.cos(aim) * facing * speed,
      vy: -Math.sin(aim) * speed,
      fuse: wp.bounce ? fuse * FPS : -1,
      radius: wp.radius,
      damage: wp.damage,
      bounce: wp.bounce,
      wind: wp.wind,
      owner: m.id,
      age: 0,
      rest: false,
      split: id === 'cluster',
      spin: 0,
    };
    // A cluster can be burst in flight and a grenade set off early: try that every few frames
    // near an enemy (a weak CPU doesn't know the trick).
    let bestBurst = -Infinity, burstAt: number | undefined;
    const enemies = this.enemies(w);
    const early = id === 'grenade' ? this.skill > 0.3 : p.split;
    for (let f = 0; f < SIM_FRAMES; f++) {
      const r = w.flyStep(p);
      if (r === 'fly') {
        if (early && f % 5 === 0 && (p.vy > 0 || p.rest) && enemies.some((e) => Math.abs(e.x - p.x) < 220 && Math.abs(e.y - p.y) < 220)) {
          const s = p.split ? this.scoreBomblets(w, { ...p }, true, m) : this.scoreBlast(w, p.x, p.y, p.radius, p.damage, m);
          if (s > bestBurst) {
            bestBurst = s;
            burstAt = f + 1;
          }
        }
        continue;
      }
      if (r !== 'explode') return { score: bestBurst > 0 ? bestBurst : -1, burstAt: bestBurst > 0 ? burstAt : undefined };
      let s = this.scoreBlast(w, p.x, p.y, p.radius, p.damage, m);
      if (p.split) s += this.scoreBomblets(w, p, false, m);
      return bestBurst > s ? { score: bestBurst, burstAt } : { score: s };
    }
    return { score: -1 };
  }

  // ---------- doing ----------

  private shoot(w: World, m: Mole, p: Plan & { kind: 'shoot' }, input: Input) {
    const s = p.shot;
    if (w.team.weapon !== s.weapon) w.pickWeapon(s.weapon);
    if (w.teams[this.team].fuse !== s.fuse && weapon(s.weapon).bounce) w.teams[this.team].fuse = s.fuse;
    p.t++;
    switch (p.state) {
      case 'turn':
        if (m.facing !== s.facing) {
          // One tap of the key turns round (and steps a pixel; fine).
          input.held.add(s.facing > 0 ? 'right' : 'left');
          if (p.t > 2) p.state = 'aim';
        } else p.state = 'aim';
        break;
      case 'aim': {
        const wp = weapon(s.weapon);
        if (wp.use === 'cursor') {
          if (s.cursor) w.cursor = { ...s.cursor };
          if (p.t > 20) {
            input.pressed.add('fire');
            p.state = 'wait';
            p.t = 0;
          }
          break;
        }
        const d = s.aim - m.aim;
        if (Math.abs(d) > 0.015) input.held.add(d > 0 ? 'up' : 'down');
        else {
          p.state = 'charge';
          p.t = 0;
          if (wp.use === 'charge') {
            input.pressed.add('fire');
            input.held.add('fire');
          } else {
            input.pressed.add('fire');
            if (s.weapon === 'dynamite') this.danger = { x: m.x, y: m.y };
            p.state = 'wait';
          }
        }
        break;
      }
      case 'charge': {
        const frames = Math.max(1, Math.round(s.power * CHARGE_FRAMES));
        if (p.t < frames) input.held.add('fire');
        else {
          input.released.add('fire');
          p.state = 'wait';
          p.t = 0;
        }
        break;
      }
      case 'wait':
        // A cluster bursts, or a grenade goes off, at the frame the simulation liked.
        if (s.burstAt !== undefined && p.t >= s.burstAt) {
          input.pressed.add('fire');
          s.burstAt = undefined;
        }
        // The shotgun's second barrel: aim again.
        if (s.weapon === 'shotgun' && w.shotsLeft > 0 && p.t > 25) {
          const again = this.bestShot(w, m);
          this.plan = again && again.weapon === 'shotgun' ? { kind: 'shoot', shot: again, state: 'turn', t: 0 } : { kind: 'shoot', shot: s, state: 'aim', t: 0 };
        }
        break;
    }
  }

  private walk(w: World, m: Mole, p: Plan & { kind: 'walk' }, input: Input) {
    if (--p.t <= 0) {
      this.plan = { kind: 'wait', t: 10 };
      return;
    }
    // Don't walk into the water or off a cliff.
    const ahead = w.terrain.groundBelow(m.x + p.dir * 16, m.y - 30);
    if (ahead < 0 || ahead > m.y + 70) {
      this.plan = { kind: 'wait', t: 5 };
      this.walks = 2;
      return;
    }
    input.held.add(p.dir > 0 ? 'right' : 'left');
    if (Math.abs(m.x - p.lastX) < 0.5) p.stuck++;
    else p.stuck = 0;
    p.lastX = m.x;
    if (p.stuck > 8 && m.onGround) {
      if (!p.jumped) {
        // One jump over whatever is in the way; if that fails too, it is a wall: stop walking.
        input.pressed.add('jump');
        p.jumped = true;
        p.stuck = 0;
      } else {
        this.plan = { kind: 'wait', t: 5 };
        this.walks = 2;
      }
    }
  }

  /** After a shot: get away from dynamite, otherwise stand still. */
  private retreat(w: World, m: Mole, input: Input) {
    if (!this.danger || !m.onGround) return;
    const dir: 1 | -1 = m.x >= this.danger.x ? 1 : -1;
    const ahead = w.terrain.groundBelow(m.x + dir * 16, m.y - 30);
    if (ahead < 0 || ahead > m.y + 70) return;
    input.held.add(dir > 0 ? 'right' : 'left');
    if (w.frame % 40 === 0) input.pressed.add('jump');
  }
}
