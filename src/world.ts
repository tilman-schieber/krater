// The battle: moles, projectiles, crates and the turn order on a terrain. Everything that moves is
// stepped here at 60 frames a second; the game feeds it inputs and reads it to draw. Projectile
// flight is a pure function of the terrain, so the CPU players can try shots on the same code.
import { Rng } from 'arcade-kit/rng';
import { Terrain } from './terrain';
import { Theme } from './themes';
import { Weapon, WeaponId, weapon, startingAmmo, CRATE_WEAPONS } from './weapons';

export const FPS = 60;
export const GRAVITY = 0.2;
/** Full-power launch speed in pixels per frame. */
export const MAX_SPEED = 14;
export const MIN_SPEED = 3;
/** Wind of 1 pushes a shell this much per frame. */
export const WIND_ACC = 0.018;
/** Frames the fire button takes to charge a shot fully. */
export const CHARGE_FRAMES = 50;

/** A mole's hitbox: half width and height, standing on its feet at (x, y). */
export const HW = 7;
export const HH = 24;
/** Where blasts measure to, above the feet. */
export const MID = 12;
const WALK = 1;
const CLIMB = 5;
const DROP = 5;
const TERMINAL = 12;
/** Landing faster than this hurts: a backflip's own height is still safe, a long fall is not. */
const FALL_SAFE = 7;
const FALL_DMG = 10;
const AIM_SPEED = 0.02;
const MAX_HP = 100;
const DEATH_FRAMES = 60;
const TURN_INTRO = 90;
const SETTLE_MIN = 40;
/** Frames the active mole can do nothing after a hot seat change (shows the banner). */
const CRATE_CHANCE = 0.35;
const WATER_RISE = 14;
const ROPE_LEN_MAX = 160;

export type Action = 'left' | 'right' | 'up' | 'down' | 'fire' | 'jump' | 'flip' | 'weapons' | 'start' | 'back' | 'mute' | 'quit' | 'zoom';

export interface Input {
  held: Set<Action>;
  pressed: Set<Action>;
  released: Set<Action>;
  /** Fuse digit pressed this frame (1-5), if any. */
  fuse?: number;
  /** Cursor moved by a pointer this frame, in map coordinates. */
  pointer?: { x: number; y: number; click: boolean };
}

export interface Mole {
  id: number;
  team: number;
  name: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  onGround: boolean;
  /** Knocked about: no control until it comes to rest. */
  flying: boolean;
  facing: 1 | -1;
  /** Aim above (positive) or below the horizontal, in radians. */
  aim: number;
  hp: number;
  alive: boolean;
  /** Counting down through the death animation; then the mole blows up and leaves a grave. */
  dying: number;
  drowning: number;
  anim: 'idle' | 'walk' | 'jump' | 'flip' | 'hurt' | 'death' | 'throw';
  animT: number;
  /** Frames of white flash after a hit. */
  flash: number;
  /** Hanging from the rope, if so. */
  rope: { ax: number; ay: number; len: number; angle: number; vel: number } | null;
  /** Damage taken this turn, shown once things settle. */
  hurtBy: number;
  hurtShow: number;
}

export interface Team {
  index: number;
  name: string;
  cpu: boolean;
  /** CPU skill 0..1. */
  skill: number;
  ammo: Record<WeaponId, number>;
  weapon: WeaponId;
  fuse: number;
  /** Which of the team's moles goes next. */
  next: number;
  dealt: number;
  kills: number;
}

/** What flies: a weapon, or the bomblets and bombs some of them drop. */
export type ProjKind = WeaponId | 'bomblet' | 'bomb';

export interface Proj {
  kind: ProjKind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** Frames to go; -1 is no fuse. */
  fuse: number;
  radius: number;
  damage: number;
  bounce: boolean;
  wind: boolean;
  /** The mole that fired it is safe from it for the first frames. */
  owner: number;
  age: number;
  /** A grenade lying still. */
  rest: boolean;
  /** Bomblets only split once. */
  split: boolean;
  spin: number;
}

export interface Explosion {
  x: number;
  y: number;
  r: number;
  t: number;
  /** Frame scale, so small blasts show small. */
  scale: number;
}

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  color: string;
  size: number;
}

export interface Crate {
  x: number;
  y: number;
  kind: 'health' | 'weapon';
  weapon?: WeaponId;
  landed: boolean;
}

export interface Grave {
  x: number;
  y: number;
  team: number;
}

export interface Plane {
  x: number;
  y: number;
  dir: 1 | -1;
  /** x positions where bombs still fall. */
  drops: number[];
  /** How far before a mark a bomb leaves the plane, for the forward speed it carries. */
  lead: number;
  life: number;
}

/** Where the airstrike plane flies, and its speed; bombs leave it with a share of that. */
const PLANE_Y = 30;
const PLANE_SPEED = 5;
const BOMB_VX = 2.4;

export interface Float {
  x: number;
  y: number;
  text: string;
  color: string;
  t: number;
}

export type Phase = 'intro' | 'move' | 'retreat' | 'settle' | 'over';

export type Event =
  | 'fire'
  | 'boom'
  | 'bigboom'
  | 'smallboom'
  | 'bounce'
  | 'splash'
  | 'jump'
  | 'hurt'
  | 'death'
  | 'pickup'
  | 'teleport'
  | 'girder'
  | 'shot'
  | 'bat'
  | 'plane'
  | 'turn'
  | 'tick'
  | 'rope'
  | 'skip'
  | 'win';

export interface Settings {
  teams: { cpu: boolean; skill: number }[];
  molesPerTeam: number;
  wind: boolean;
  turnSeconds: number;
  /** Turns until the water starts rising; 0 for never. */
  suddenDeath: number;
  /** Seconds a turn lasts; 0 for no clock. */
}

const MOLE_NAMES = [
  ['DIGBY', 'MOLLY', 'TUNNEL', 'BURROW'],
  ['SPADE', 'CLAW', 'DUSTY', 'NOSE'],
  ['PEBBLE', 'SNUFF', 'GRUB', 'MUDDY'],
  ['TALPA', 'HUMUS', 'ROOTY', 'WORMY'],
];

export class World {
  readonly terrain: Terrain;
  readonly moles: Mole[] = [];
  readonly teams: Team[] = [];
  projs: Proj[] = [];
  explosions: Explosion[] = [];
  particles: Particle[] = [];
  crates: Crate[] = [];
  graves: Grave[] = [];
  planes: Plane[] = [];
  floats: Float[] = [];
  events: Event[] = [];
  waterY: number;
  wind = 0;
  phase: Phase = 'intro';
  timer = TURN_INTRO;
  /** Frames left in the turn. */
  turnLeft = 0;
  retreatLeft = 0;
  settleT = 0;
  /** Team turns taken. */
  turn = 0;
  activeTeam = 0;
  activeMole: Mole | null = null;
  /** Charging a shot: 0..1. */
  charge = 0;
  charging = false;
  shotsLeft = 0;
  /** Where cursor weapons point, in map coordinates. */
  cursor = { x: 0, y: 0 };
  girderAngle = 0;
  /** The weapon panel is open. */
  panel = false;
  panelIndex = 0;
  suddenDeath = false;
  winner: number | null = null;
  /** What the camera should look at. */
  focus: { x: number; y: number } | null = null;
  shake = 0;
  frame = 0;
  /** A hot-seat handover: a human team just got the turn. */
  handover = false;
  private nextId = 1;

  constructor(
    readonly settings: Settings,
    readonly theme: Theme,
    readonly rng: Rng,
    readonly w: number,
    readonly h: number,
  ) {
    this.waterY = h - 48;
    this.terrain = new Terrain(w, h, theme, rng, this.waterY);
    settings.teams.forEach((t, i) => {
      this.teams.push({ index: i, name: ['RED', 'BLUE', 'GREEN', 'YELLOW'][i], cpu: t.cpu, skill: t.skill, ammo: startingAmmo(), weapon: 'bazooka', fuse: 3, next: 0, dealt: 0, kills: 0 });
    });
    this.placeMoles();
    this.rollWind();
    this.activeTeam = this.teams.length - 1;
    this.startTurn();
  }

  // ---------- setup ----------

  /** A standable spot near x, or -1. */
  private spotNear(x: number, taken: number[], gap: number) {
    for (let d = 0; d < 400; d += 6)
      for (const xx of d ? [x - d, x + d] : [x]) {
        if (xx < 30 || xx > this.w - 30) continue;
        if (taken.some((s) => Math.abs(s - xx) < gap)) continue;
        const g = this.terrain.groundBelow(xx, 0);
        if (g < 0 || g > this.waterY - 30) continue;
        if (!this.terrain.boxFree(xx, g, HW, HH)) continue;
        return xx;
      }
    return -1;
  }

  /** Each team starts together in its own stretch of the map, in a random order of stretches. */
  private placeMoles() {
    const n = this.settings.molesPerTeam;
    const order = this.teams.map((t) => t.index).sort(() => this.rng() - 0.5);
    const zone = this.w / this.teams.length;
    const taken: number[] = [];
    for (let m = 0; m < n; m++)
      for (const t of this.teams) {
        const centre = zone * (order.indexOf(t.index) + 0.5);
        const want = centre + (this.rng() - 0.5) * zone * 0.5;
        let x = this.spotNear(want, taken, 44);
        if (x < 0) x = this.spotNear(want, taken, 20);
        if (x < 0) x = Math.round(want);
        taken.push(x);
        const y = Math.max(0, this.terrain.groundBelow(x, 0));
        this.moles.push({
          id: this.nextId++,
          team: t.index,
          name: MOLE_NAMES[t.index][m % 4],
          x,
          y,
          vx: 0,
          vy: 0,
          onGround: true,
          flying: false,
          facing: x < this.w / 2 ? 1 : -1,
          aim: 0,
          hp: MAX_HP,
          alive: true,
          dying: 0,
          drowning: 0,
          anim: 'idle',
          animT: 0,
          flash: 0,
          rope: null,
          hurtBy: 0,
          hurtShow: 0,
        });
      }
  }

  private rollWind() {
    this.wind = this.settings.wind ? Math.round((this.rng() * 2 - 1) * 10) / 10 : 0;
  }

  // ---------- queries ----------

  get team() {
    return this.teams[this.activeTeam];
  }

  get weapon(): Weapon {
    return weapon(this.team.weapon);
  }

  teamMoles(t: number) {
    return this.moles.filter((m) => m.team === t && m.alive);
  }

  teamHp(t: number) {
    return this.teamMoles(t).reduce((s, m) => s + m.hp, 0);
  }

  aliveTeams() {
    return this.teams.filter((t) => this.teamMoles(t.index).length > 0);
  }

  /** Whether the active mole can be controlled right now. */
  get controllable() {
    const m = this.activeMole;
    return !!m && m.alive && !m.flying && (this.phase === 'move' || this.phase === 'retreat');
  }

  /** The cursor weapon is being aimed (no walking). */
  get cursorMode() {
    return this.phase === 'move' && this.weapon.use === 'cursor' && !this.panel;
  }

  /** Where the gun's muzzle is, for the active mole. */
  muzzle(m: Mole) {
    const a = m.aim;
    return { x: m.x + Math.cos(a) * m.facing * 14, y: m.y - MID - Math.sin(a) * 14 };
  }

  /** Whether any body is still moving. */
  private settled() {
    if (this.projs.length || this.planes.length) return false;
    if (this.explosions.some((e) => e.t < 10)) return false;
    for (const m of this.moles) {
      if (m.dying > 0 || m.drowning > 0) return false;
      if (m.alive && (m.flying || (!m.onGround && !m.rope))) return false;
    }
    if (this.crates.some((c) => !c.landed)) return false;
    return true;
  }

  // ---------- turns ----------

  private startTurn() {
    const alive = this.aliveTeams();
    if (alive.length <= 1) return this.finish(alive[0]?.index ?? -1);
    // Next team with a mole left, then its next mole in the rotation.
    let t = this.activeTeam;
    do t = (t + 1) % this.teams.length;
    while (this.teamMoles(t).length === 0);
    const wasCpu = this.team.cpu;
    this.activeTeam = t;
    const team = this.teams[t];
    const list = this.teamMoles(t);
    this.activeMole = list[team.next % list.length];
    team.next++;
    this.turn++;
    this.phase = 'intro';
    this.timer = TURN_INTRO;
    this.turnLeft = this.settings.turnSeconds * FPS;
    this.charge = 0;
    this.charging = false;
    this.shotsLeft = this.weapon.shots;
    this.panel = false;
    this.panelIndex = 0;
    this.cursor = { x: this.activeMole.x, y: this.activeMole.y - 40 };
    this.handover = !team.cpu && (wasCpu || this.teams.filter((x) => !x.cpu).length > 1);
    if (this.settings.suddenDeath && this.turn > this.settings.suddenDeath * this.teams.length && !this.suddenDeath) this.suddenDeath = true;
    this.focus = { x: this.activeMole.x, y: this.activeMole.y };
    this.events.push('turn');
    // The weapon chosen last turn stays, unless it ran out.
    if (team.ammo[team.weapon] === 0) team.weapon = 'bazooka';
    this.shotsLeft = this.weapon.shots;
  }

  private endTurn() {
    if (this.phase === 'settle' || this.phase === 'over') return;
    this.phase = 'settle';
    this.settleT = 0;
    this.charging = false;
    this.panel = false;
    if (this.activeMole?.rope) this.releaseRope(this.activeMole);
  }

  private finish(winner: number) {
    this.phase = 'over';
    this.winner = winner;
    this.events.push('win');
  }

  /** The hand-over between turns: damage tallies, water, crates, then the next team. */
  private betweenTurns() {
    for (const m of this.moles) {
      m.hurtBy = 0;
    }
    if (this.suddenDeath) {
      this.waterY -= WATER_RISE;
      this.events.push('splash');
    }
    this.rollWind();
    if (this.rng() < CRATE_CHANCE) this.dropCrate();
    this.startTurn();
  }

  private dropCrate() {
    for (let k = 0; k < 20; k++) {
      const x = 60 + this.rng() * (this.w - 120);
      const g = this.terrain.groundBelow(x, 0);
      if (g < 0 || g > this.waterY - 20) continue;
      if (this.rng() < 0.45) this.crates.push({ x, y: -20, kind: 'health', landed: false });
      else this.crates.push({ x, y: -20, kind: 'weapon', weapon: CRATE_WEAPONS[Math.floor(this.rng() * CRATE_WEAPONS.length)], landed: false });
      return;
    }
  }

  // ---------- the frame ----------

  step(input: Input) {
    this.frame++;
    this.events.length = 0;
    if (this.shake > 0) this.shake--;
    if (this.phase === 'over') {
      this.stepBodies();
      return;
    }
    switch (this.phase) {
      case 'intro':
        if (--this.timer <= 0 || (this.timer < TURN_INTRO - 20 && input.pressed.size && !this.handover)) {
          this.timer = 0;
          this.phase = 'move';
        } else if (this.handover && input.pressed.has('start')) {
          this.timer = 0;
          this.phase = 'move';
        }
        break;
      case 'move':
        this.control(input);
        if (this.settings.turnSeconds) {
          if (--this.turnLeft <= 0) this.endTurn();
          else if (this.turnLeft % FPS === 0 && this.turnLeft <= 5 * FPS) this.events.push('tick');
        }
        break;
      case 'retreat':
        this.control(input);
        if (--this.retreatLeft <= 0) this.phase = 'settle';
        break;
      case 'settle':
        if (++this.settleT > SETTLE_MIN && this.settled()) this.betweenTurns();
        break;
    }
    this.stepBodies();
    // The active mole dying or being knocked about ends the turn.
    const m = this.activeMole;
    if ((this.phase === 'move' || this.phase === 'retreat') && m && (!m.alive || m.flying)) this.endTurn();
  }

  /** Every moving thing, whichever phase. */
  private stepBodies() {
    for (const m of this.moles) this.stepMole(m);
    this.stepProjs();
    this.stepPlanes();
    this.stepCrates();
    this.stepGraves();
    for (const e of this.explosions) e.t++;
    this.explosions = this.explosions.filter((e) => e.t < 12 * 5);
    for (const p of this.particles) {
      p.x += p.vx;
      p.y += p.vy;
      p.vy += GRAVITY * 0.8;
      p.life--;
      if (this.terrain.isSolid(p.x, p.y)) p.life = Math.min(p.life, 3);
    }
    this.particles = this.particles.filter((p) => p.life > 0 && p.y < this.waterY + 8);
    for (const f of this.floats) f.t++;
    this.floats = this.floats.filter((f) => f.t < 70);
    if (this.phase !== 'over' && this.phase !== 'settle' && this.activeMole) this.focus = { x: this.activeMole.x, y: this.activeMole.y - MID };
    const p = this.projs[0];
    if (p && !p.rest) this.focus = { x: p.x, y: p.y };
    else if (this.planes[0]) this.focus = { x: this.planes[0].x, y: this.planes[0].y + 130 };
    else if (this.phase === 'settle') {
      const f = this.moles.find((m) => m.alive && m.flying) ?? this.moles.find((m) => m.dying > 0);
      if (f) this.focus = { x: f.x, y: f.y };
    }
  }

  // ---------- controls ----------

  private control(input: Input) {
    const m = this.activeMole;
    if (!m || !this.controllable) return;
    const team = this.team;
    const wp = this.weapon;
    const canShoot = this.phase === 'move' && this.shotsLeft > 0;

    // Weapon panel.
    if (input.pressed.has('weapons') && this.phase === 'move' && !this.charging) {
      this.panel = !this.panel;
      if (this.panel) this.panelIndex = Math.max(0, WEAPON_ORDER.indexOf(team.weapon));
    }
    if (this.panel) {
      this.panelControl(input);
      return;
    }
    if (input.fuse && wp.bounce) team.fuse = input.fuse;

    // Charged shots.
    if (canShoot && wp.use === 'charge') {
      if (input.pressed.has('fire') && !this.charging && !m.rope) {
        this.charging = true;
        this.charge = 0;
      }
      if (this.charging) {
        this.charge = Math.min(1, this.charge + 1 / CHARGE_FRAMES);
        if (input.released.has('fire') || !input.held.has('fire') || this.charge >= 1) this.fireCharged(m, this.charge);
      }
    } else if (canShoot && input.pressed.has('fire')) {
      if (wp.use === 'instant') this.fireInstant(m);
      else if (wp.use === 'place') this.place(m);
      else if (wp.use === 'cursor') this.useCursor(m);
    }
    if (m.rope) {
      if (input.pressed.has('fire') && wp.id === 'rope') this.releaseRope(m);
      if (input.pressed.has('jump')) this.releaseRope(m);
      this.ropeControl(m, input);
      return;
    }
    if (this.charging) return;

    // Cursor weapons steer the cursor instead of the mole.
    if (this.cursorMode) {
      const sp = 4;
      if (input.held.has('left')) this.cursor.x -= sp;
      if (input.held.has('right')) this.cursor.x += sp;
      if (wp.id === 'girder') {
        if (input.pressed.has('up')) this.girderAngle = (this.girderAngle + 1) & 3;
        if (input.pressed.has('down')) this.girderAngle = (this.girderAngle + 3) & 3;
      } else {
        if (input.held.has('up')) this.cursor.y -= sp;
        if (input.held.has('down')) this.cursor.y += sp;
      }
      if (input.pointer) {
        // A click on the mark fires; a click elsewhere (a tap on a phone) moves the mark there.
        const near = Math.hypot(input.pointer.x - this.cursor.x, input.pointer.y - this.cursor.y) < 10;
        this.cursor.x = input.pointer.x;
        this.cursor.y = input.pointer.y;
        if (input.pointer.click && near && canShoot) this.useCursor(m);
      }
      this.cursor.x = Math.max(0, Math.min(this.w, this.cursor.x));
      this.cursor.y = Math.max(-200, Math.min(this.waterY, this.cursor.y));
      return;
    }

    // Aim.
    if (input.held.has('up')) m.aim = Math.min(Math.PI / 2, m.aim + AIM_SPEED);
    if (input.held.has('down')) m.aim = Math.max(-Math.PI / 2, m.aim - AIM_SPEED);

    // Walk and jump, but not between the shotgun's barrels.
    const between = wp.id === 'shotgun' && this.shotsLeft < wp.shots && this.phase === 'move';
    if (between || !m.onGround) return;
    if (input.pressed.has('jump')) {
      m.vx = m.facing * 2.2;
      m.vy = -4.2;
      m.onGround = false;
      m.anim = 'jump';
      m.animT = 0;
      this.events.push('jump');
      return;
    }
    if (input.pressed.has('flip')) {
      m.vx = -m.facing * 0.8;
      m.vy = -6.2;
      m.onGround = false;
      m.anim = 'flip';
      m.animT = 0;
      this.events.push('jump');
      return;
    }
    const dir = input.held.has('left') ? -1 : input.held.has('right') ? 1 : 0;
    if (dir) {
      if (m.facing !== dir) m.facing = dir;
      this.walk(m, dir);
      m.anim = 'walk';
      m.animT++;
    } else if (m.anim === 'walk') m.anim = 'idle';
  }

  private panelControl(input: Input) {
    const cols = 6;
    const n = WEAPON_ORDER.length;
    let i = this.panelIndex;
    if (input.pressed.has('left')) i = (i + n - 1) % n;
    if (input.pressed.has('right')) i = (i + 1) % n;
    if (input.pressed.has('up')) i = (i + n - cols) % n;
    if (input.pressed.has('down')) i = (i + cols) % n;
    this.panelIndex = i;
    if (input.pointer?.click) {
      // The game maps the click to a panel index before it gets here.
    }
    if (input.pressed.has('fire') || input.pressed.has('start')) this.pickWeapon(WEAPON_ORDER[i]);
    if (input.pressed.has('back')) this.panel = false;
  }

  /** Chooses a weapon (from the panel or the game's pointer handling). */
  pickWeapon(id: WeaponId) {
    const team = this.team;
    if (team.ammo[id] === 0) return;
    const m = this.activeMole;
    if (m?.rope && id !== 'rope') return;
    team.weapon = id;
    this.shotsLeft = this.weapon.shots;
    this.panel = false;
    if (this.weapon.use === 'cursor' && m) this.cursor = { x: m.x + m.facing * 80, y: m.y - 40 };
  }

  // ---------- moles ----------

  private standing(m: Mole) {
    const t = this.terrain;
    return t.isSolid(m.x - HW + 2, m.y) || t.isSolid(m.x, m.y) || t.isSolid(m.x + HW - 2, m.y);
  }

  private walk(m: Mole, dir: number) {
    const t = this.terrain;
    const nx = m.x + dir * WALK;
    for (let up = 0; up <= CLIMB; up++) {
      if (t.boxFree(nx, m.y - up, HW, HH)) {
        m.x = nx;
        m.y -= up;
        break;
      }
      if (up === CLIMB) return; // a wall
    }
    // Keep the feet on the ground down a small step; otherwise start falling.
    if (!this.standing(m)) {
      for (let d = 1; d <= DROP; d++) {
        if (t.isSolid(m.x - HW + 2, m.y + d) || t.isSolid(m.x, m.y + d) || t.isSolid(m.x + HW - 2, m.y + d)) {
          m.y += d;
          return;
        }
      }
      m.onGround = false;
      m.vx = dir * 0.6;
      m.vy = 0;
    }
  }

  private stepMole(m: Mole) {
    if (m.flash > 0) m.flash--;
    if (m.hurtShow > 0) m.hurtShow--;
    if (!m.alive) {
      if (m.drowning > 0) {
        m.drowning--;
        m.y += 0.6;
      }
      return;
    }
    if (m.dying > 0) {
      if (--m.dying === 0) this.die(m);
      return;
    }
    if (m.rope) return this.stepRope(m);
    // The water takes anyone it reaches, standing or not (it rises in sudden death).
    if (m.y >= this.waterY) return this.drown(m);
    const t = this.terrain;
    if (m.onGround) {
      // Ground gone from under the feet (a crater): fall.
      if (!this.standing(m)) {
        m.onGround = false;
        m.vx = 0;
        m.vy = 0;
      } else {
        if (m.anim !== 'walk' && m.anim !== 'throw' && m.anim !== 'hurt') m.anim = 'idle';
        if (m.anim === 'hurt' && ++m.animT > 30) m.anim = 'idle';
        if (m.anim === 'throw' && ++m.animT > 30) m.anim = 'idle';
      }
    }
    if (!m.onGround) {
      m.vy = Math.min(TERMINAL, m.vy + GRAVITY);
      m.animT++;
      const steps = Math.ceil(Math.max(Math.abs(m.vx), Math.abs(m.vy)));
      const dx = m.vx / steps, dy = m.vy / steps;
      for (let i = 0; i < steps; i++) {
        // Horizontal first: a small step up is taken in stride, a wall stops or bounces.
        if (dx !== 0) {
          const nx = m.x + dx;
          let moved = false;
          for (let up = 0; up <= 4 && !moved; up++)
            if (t.boxFree(nx, m.y - up, HW, HH)) {
              m.x = nx;
              m.y -= up;
              moved = true;
            }
          if (!moved) m.vx = m.flying ? -m.vx * 0.4 : 0;
        }
        const ny = m.y + dy;
        if (dy > 0) {
          if (t.isSolid(m.x - HW + 2, ny) || t.isSolid(m.x, ny) || t.isSolid(m.x + HW - 2, ny)) {
            // Landed: the feet sit on the first solid row.
            m.y = Math.floor(ny);
            this.land(m);
            break;
          }
          m.y = ny;
        } else if (dy < 0) {
          if (t.boxFree(m.x, ny, HW, HH)) m.y = ny;
          else {
            m.vy = 0;
            break;
          }
        }
      }
      if (m.y >= this.waterY) return this.drown(m);
      if (m.x < -20 || m.x > this.w + 20) return this.drown(m);
    }
  }

  private land(m: Mole) {
    const speed = m.vy;
    if (m.flying && speed > 2.5) {
      // Tumble: bounce a little and slide.
      m.vy = -speed * 0.35;
      m.vx *= 0.6;
      if (speed > FALL_SAFE) this.hurt(m, Math.round((speed - FALL_SAFE) * FALL_DMG * 0.6), 'fall');
      return;
    }
    if (speed > FALL_SAFE) this.hurt(m, Math.round((speed - FALL_SAFE) * FALL_DMG), 'fall');
    m.vy = 0;
    m.vx = 0;
    m.onGround = true;
    m.flying = false;
    m.anim = m.anim === 'hurt' ? 'hurt' : 'idle';
  }

  private drown(m: Mole) {
    m.alive = false;
    m.drowning = 90;
    m.hp = 0;
    m.rope = null;
    this.events.push('splash');
    this.splash(m.x, this.waterY, 14);
    if (this.activeMole === m) this.endTurn();
  }

  /** Damage from a blast, a fall or a bat; kills if it is enough. */
  hurt(m: Mole, dmg: number, by: 'blast' | 'fall' | 'bat', from?: number) {
    if (!m.alive || dmg <= 0 || m.dying > 0) return;
    m.hp = Math.max(0, m.hp - dmg);
    m.hurtBy += dmg;
    m.hurtShow = 90;
    m.flash = 8;
    m.anim = 'hurt';
    m.animT = 0;
    this.floats.push({ x: m.x, y: m.y - HH - 8, text: `-${dmg}`, color: ['#f83800', '#3c8cf8', '#58d854', '#f8d838'][m.team], t: 0 });
    this.events.push('hurt');
    if (from !== undefined && from >= 0 && from !== m.team) this.teams[from].dealt += dmg;
    if (m.hp <= 0) {
      m.dying = DEATH_FRAMES;
      m.anim = 'death';
      m.animT = 0;
      m.rope = null;
      if (from !== undefined && from >= 0 && from !== m.team) this.teams[from].kills++;
      if (this.activeMole === m) this.endTurn();
    }
    void by;
  }

  /** The end of the death animation: a last blast and a grave. */
  private die(m: Mole) {
    m.alive = false;
    this.graves.push({ x: m.x, y: m.y, team: m.team });
    this.events.push('death');
    this.explode(m.x, m.y - MID, 30, 25, -1, m.id);
  }

  // ---------- rope ----------

  private fireRope(m: Mole) {
    const t = this.terrain;
    const dx = Math.cos(m.aim) * m.facing, dy = -Math.sin(m.aim);
    const { x: sx, y: sy } = this.muzzle(m);
    for (let d = 0; d < ROPE_LEN_MAX; d += 2) {
      const x = sx + dx * d, y = sy + dy * d;
      if (t.isSolid(x, y)) {
        const ax = x, ay = y;
        const px = m.x, py = m.y - MID;
        const len = Math.hypot(ax - px, ay - py);
        m.rope = { ax, ay, len, angle: Math.atan2(px - ax, py - ay), vel: m.vx * 0.02 };
        m.onGround = false;
        m.flying = false;
        this.events.push('rope');
        return;
      }
    }
    this.events.push('shot');
  }

  private ropeControl(m: Mole, input: Input) {
    const r = m.rope!;
    const swing = 0.0025;
    if (input.held.has('left')) r.vel -= swing * Math.cos(r.angle);
    if (input.held.has('right')) r.vel += swing * Math.cos(r.angle);
    if (input.held.has('up')) r.len = Math.max(12, r.len - 2);
    if (input.held.has('down')) r.len = Math.min(ROPE_LEN_MAX, r.len + 2);
    if (input.held.has('left')) m.facing = -1;
    if (input.held.has('right')) m.facing = 1;
  }

  private stepRope(m: Mole) {
    const r = m.rope!;
    // A pendulum: angle measured from straight down.
    r.vel += (-GRAVITY / r.len) * Math.sin(r.angle);
    r.vel *= 0.995;
    r.angle += r.vel;
    const nx = r.ax + Math.sin(r.angle) * r.len, ny = r.ay + Math.cos(r.angle) * r.len + MID;
    if (this.terrain.boxFree(nx, ny, HW - 2, HH - 4)) {
      m.x = nx;
      m.y = ny;
    } else {
      // Hit the ground: stop the swing, slide the length up a little.
      r.vel = -r.vel * 0.3;
      r.len = Math.max(12, r.len - 2);
    }
    m.anim = 'jump';
    if (m.y >= this.waterY) this.drown(m);
    if (!this.terrain.isSolid(r.ax, r.ay)) this.releaseRope(m);
  }

  releaseRope(m: Mole) {
    const r = m.rope;
    if (!r) return;
    // Carry the swing's speed on.
    m.vx = Math.cos(r.angle) * r.vel * r.len;
    m.vy = -Math.sin(r.angle) * r.vel * r.len;
    m.rope = null;
    m.onGround = false;
    m.anim = 'jump';
  }

  // ---------- firing ----------

  private fireCharged(m: Mole, power: number) {
    this.charging = false;
    const wp = this.weapon;
    const speed = MIN_SPEED + (MAX_SPEED - MIN_SPEED) * power;
    const { x, y } = this.muzzle(m);
    const vx = Math.cos(m.aim) * m.facing * speed, vy = -Math.sin(m.aim) * speed;
    this.launch(wp, x, y, vx, vy, m.id, this.team.fuse);
    m.anim = 'throw';
    m.animT = 0;
    this.spend(wp);
    this.events.push('fire');
    this.afterShot(wp);
  }

  private launch(wp: Weapon, x: number, y: number, vx: number, vy: number, owner: number, fuse: number) {
    this.projs.push({
      kind: wp.id,
      x,
      y,
      vx,
      vy,
      fuse: wp.bounce ? fuse * FPS : -1,
      radius: wp.radius,
      damage: wp.damage,
      bounce: wp.bounce,
      wind: wp.wind,
      owner,
      age: 0,
      rest: false,
      split: wp.id === 'cluster',
      spin: 0,
    });
  }

  private fireInstant(m: Mole) {
    const wp = this.weapon;
    switch (wp.id) {
      case 'shotgun':
        this.shotgun(m);
        m.anim = 'throw';
        m.animT = 0;
        this.events.push('shot');
        break;
      case 'bat':
        this.bat(m);
        break;
      case 'rope':
        if (!m.rope) this.fireRope(m);
        return;
      case 'skip':
        this.events.push('skip');
        this.shotsLeft = 0;
        this.endTurn();
        return;
    }
    this.spend(wp);
    this.afterShot(wp);
  }

  private shotgun(m: Mole) {
    const t = this.terrain;
    const dx = Math.cos(m.aim) * m.facing, dy = -Math.sin(m.aim);
    let { x, y } = this.muzzle(m);
    for (let d = 0; d < 1400; d += 1) {
      x += dx;
      y += dy;
      if (y > this.waterY) return this.splash(x, this.waterY, 6);
      if (x < -50 || x > this.w + 50) return;
      if (t.isSolid(x, y) || this.moleAt(x, y, m.id)) {
        this.explode(x, y, this.weapon.radius, this.weapon.damage, m.team, m.id, 0.5);
        return;
      }
    }
  }

  private bat(m: Mole) {
    this.events.push('bat');
    m.anim = 'throw';
    m.animT = 0;
    for (const o of this.moles) {
      if (o === m || !o.alive) continue;
      const dx = o.x - m.x, dy = o.y - m.y;
      if (Math.abs(dy) < HH && dx * m.facing > 0 && Math.abs(dx) < 26) {
        this.hurt(o, this.weapon.damage, 'bat', m.team);
        o.vx = m.facing * 7 * Math.cos(m.aim) + m.facing * 2;
        o.vy = -5 - 4 * Math.max(0, Math.sin(m.aim));
        o.onGround = false;
        o.flying = true;
        o.rope = null;
      }
    }
  }

  private place(m: Mole) {
    const wp = this.weapon;
    this.projs.push({
      kind: wp.id,
      x: m.x + m.facing * 6,
      y: m.y - 4,
      vx: 0,
      vy: 0,
      fuse: wp.fuse * FPS,
      radius: wp.radius,
      damage: wp.damage,
      bounce: true,
      wind: false,
      owner: m.id,
      age: 0,
      rest: false,
      split: false,
      spin: 0,
    });
    this.spend(wp);
    this.events.push('fire');
    this.afterShot(wp);
  }

  private useCursor(m: Mole) {
    const wp = this.weapon;
    const c = this.cursor;
    switch (wp.id) {
      case 'airstrike': {
        const dir: 1 | -1 = c.x >= m.x ? 1 : -1;
        const drops = [-2, -1, 0, 1, 2].map((k) => c.x + k * 22);
        // The bombs keep some forward speed: drop them early enough to come down on the mark.
        const fall = Math.max(60, c.y - PLANE_Y);
        const lead = BOMB_VX * Math.sqrt((2 * fall) / GRAVITY);
        this.planes.push({ x: dir > 0 ? -80 : this.w + 80, y: PLANE_Y, dir, drops, lead, life: 0 });
        this.events.push('plane');
        break;
      }
      case 'teleport': {
        const y = Math.round(c.y);
        if (!this.terrain.boxFree(c.x, y, HW, HH) || y >= this.waterY) return;
        m.x = Math.round(c.x);
        m.y = y;
        m.onGround = false;
        m.vx = 0;
        m.vy = 0;
        this.events.push('teleport');
        this.burst(m.x, m.y - MID, 14, '#3cbcfc', 2);
        break;
      }
      case 'girder': {
        if (Math.hypot(c.x - m.x, c.y - m.y) > 220) return;
        const a = (this.girderAngle * Math.PI) / 4;
        if (this.moles.some((o) => o.alive && Math.abs(o.x - c.x) < 44 && Math.abs(o.y - MID - c.y) < 44 && !this.terrain.girderFree(c.x, c.y, 0, 0, 0))) return;
        if (this.moles.some((o) => o.alive && onBar(o.x, o.y - MID, c.x, c.y, 64, 8 + HH, a))) return;
        this.terrain.girder(c.x, c.y, 64, 8, a);
        this.events.push('girder');
        break;
      }
    }
    this.spend(wp);
    this.afterShot(wp);
  }

  private spend(wp: Weapon) {
    const team = this.team;
    if (team.ammo[wp.id] > 0 && this.shotsLeft === wp.shots) team.ammo[wp.id]--;
  }

  private afterShot(wp: Weapon) {
    this.shotsLeft--;
    if (this.shotsLeft > 0) return;
    if (!wp.endsTurn) {
      // Girders and the rope don't end the turn, but a spent weapon drops back to the bazooka.
      if (this.team.ammo[wp.id] === 0) this.pickWeapon('bazooka');
      this.shotsLeft = this.weapon.shots;
      return;
    }
    this.phase = 'retreat';
    this.retreatLeft = wp.retreat * FPS;
    if (this.retreatLeft === 0) this.phase = 'settle';
    this.settleT = 0;
  }

  // ---------- projectiles ----------

  moleAt(x: number, y: number, except = -1) {
    for (const m of this.moles) {
      if (!m.alive || m.id === except || m.dying > 0) continue;
      if (Math.abs(x - m.x) <= HW && y <= m.y && y >= m.y - HH) return m;
    }
    return null;
  }

  /**
   * One frame of a projectile's flight. Pure apart from the projectile itself, so the CPU can run
   * it on a copy. Returns what happened.
   */
  flyStep(p: Proj): 'fly' | 'explode' | 'gone' | 'splash' {
    p.age++;
    if (p.fuse > 0 && --p.fuse === 0) return 'explode';
    if (p.rest) {
      // A resting grenade falls if the ground goes.
      if (!this.terrain.isSolid(p.x, p.y + 2)) p.rest = false;
      else return 'fly';
    }
    p.vy += GRAVITY;
    if (p.wind) p.vx += this.wind * WIND_ACC;
    p.spin += p.vx * 0.05;
    const steps = Math.max(1, Math.ceil(Math.max(Math.abs(p.vx), Math.abs(p.vy))));
    const dx = p.vx / steps, dy = p.vy / steps;
    const t = this.terrain;
    for (let i = 0; i < steps; i++) {
      const nx = p.x + dx, ny = p.y + dy;
      if (ny > this.waterY) {
        p.x = nx;
        p.y = ny;
        return 'splash';
      }
      if (nx < -300 || nx > this.w + 300 || ny > this.h + 100 || ny < -4000) return 'gone';
      const hitMole = !p.bounce && p.age > 6 ? this.moleAt(nx, ny, p.age < 20 ? p.owner : -1) : null;
      if (t.isSolid(nx, ny) || hitMole) {
        if (!p.bounce) {
          return 'explode';
        }
        // Bounce off whichever axis is blocked, losing speed.
        const hx = t.isSolid(nx, p.y), hy = t.isSolid(p.x, ny);
        if (hx || (!hx && !hy)) p.vx = -p.vx * 0.45;
        if (hy || (!hx && !hy)) {
          p.vy = -p.vy * 0.45;
          p.vx *= 0.7;
        }
        if (Math.abs(p.vx) < 0.15 && Math.abs(p.vy) < 0.6 && hy && dy > 0) {
          p.vx = 0;
          p.vy = 0;
          p.rest = true;
        }
        return 'fly';
      }
      p.x = nx;
      p.y = ny;
    }
    return 'fly';
  }

  private stepProjs() {
    const keep: Proj[] = [];
    for (const p of this.projs) {
      const was = { x: p.x, y: p.y, vy: p.vy };
      const r = this.flyStep(p);
      if (r === 'fly') {
        if (p.bounce && !p.rest && (Math.abs(p.vy - was.vy) > 1.5 || Math.abs(p.x - was.x) > Math.abs(p.vx) + 0.5)) this.events.push('bounce');
        if (p.kind === 'bazooka' || p.kind === 'bomb') this.smoke(p.x, p.y);
        keep.push(p);
        continue;
      }
      if (r === 'splash') {
        this.splash(p.x, this.waterY, 8);
        this.events.push('splash');
        continue;
      }
      if (r === 'gone') continue;
      // Explode.
      const owner = this.moles.find((m) => m.id === p.owner);
      this.explode(p.x, p.y, p.radius, p.damage, owner?.team ?? -1, -1);
      if (p.split) {
        for (let k = 0; k < 5; k++) {
          const a = -Math.PI / 2 + (k - 2) * 0.35 + (this.rng() - 0.5) * 0.2;
          const s = 3.5 + this.rng() * 1.5;
          this.projs.push({
            kind: 'bomblet',
            x: p.x,
            y: p.y - 2,
            vx: Math.cos(a) * s,
            vy: Math.sin(a) * s,
            fuse: -1,
            radius: 20,
            damage: 20,
            bounce: false,
            wind: false,
            owner: p.owner,
            age: 10,
            rest: false,
            split: false,
            spin: 0,
          });
        }
      }
    }
    // Bomblets pushed while iterating are in this.projs beyond the old length; keep them too.
    for (const p of this.projs) if (p.kind === 'bomblet' && !keep.includes(p) && p.age === 10) keep.push(p);
    this.projs = keep;
  }

  private stepPlanes() {
    for (const pl of this.planes) {
      pl.x += pl.dir * PLANE_SPEED;
      pl.life++;
      const rest: number[] = [];
      for (const d of pl.drops) {
        if ((pl.dir > 0 && pl.x >= d - pl.lead) || (pl.dir < 0 && pl.x <= d + pl.lead)) {
          const wp = weapon('airstrike');
          this.projs.push({
            kind: 'bomb',
            x: pl.x,
            y: pl.y + 8,
            vx: pl.dir * BOMB_VX,
            vy: 0,
            fuse: -1,
            radius: wp.radius,
            damage: wp.damage,
            bounce: false,
            wind: true,
            owner: this.activeMole?.id ?? -1,
            age: 10,
            rest: false,
            split: false,
            spin: 0,
          });
        } else rest.push(d);
      }
      pl.drops = rest;
    }
    this.planes = this.planes.filter((pl) => pl.x > -200 && pl.x < this.w + 200);
  }

  /** Graves fall when the ground under them goes, and the water takes them. */
  private stepGraves() {
    const t = this.terrain;
    for (const g of this.graves) {
      if (!t.isSolid(g.x, g.y + 1) && !t.isSolid(g.x - 4, g.y + 1) && !t.isSolid(g.x + 4, g.y + 1)) g.y += 2;
      if (g.y >= this.waterY && g.y < this.waterY + 2) this.splash(g.x, this.waterY, 6);
    }
    this.graves = this.graves.filter((g) => g.y < this.waterY);
  }

  private stepCrates() {
    const t = this.terrain;
    for (const c of this.crates) {
      if (!c.landed) {
        c.y += 1;
        if (t.isSolid(c.x, c.y) || t.isSolid(c.x - 6, c.y) || t.isSolid(c.x + 6, c.y)) c.landed = true;
        else if (c.y > this.waterY) c.landed = true;
      } else if (!t.isSolid(c.x, c.y + 1) && !t.isSolid(c.x - 6, c.y + 1) && !t.isSolid(c.x + 6, c.y + 1)) c.y += 2;
      if (c.y > this.waterY) {
        c.y = this.waterY + 100; // gone
        continue;
      }
      // Picked up by walking into it.
      for (const m of this.moles) {
        if (!m.alive || m.dying > 0) continue;
        if (Math.abs(m.x - c.x) < HW + 8 && m.y >= c.y - 20 && m.y <= c.y + 4) {
          this.pickUp(c, m);
          c.y = this.waterY + 100;
          break;
        }
      }
    }
    this.crates = this.crates.filter((c) => c.y <= this.waterY);
  }

  private pickUp(c: Crate, m: Mole) {
    this.events.push('pickup');
    const team = this.teams[m.team];
    if (c.kind === 'health') {
      m.hp += 25;
      this.floats.push({ x: m.x, y: m.y - HH - 8, text: '+25', color: '#58d854', t: 0 });
    } else if (c.weapon) {
      const n = c.weapon === 'girder' ? 2 : 1;
      team.ammo[c.weapon] = team.ammo[c.weapon] < 0 ? -1 : team.ammo[c.weapon] + n;
      this.floats.push({ x: m.x, y: m.y - HH - 8, text: weapon(c.weapon).name, color: '#f8d838', t: 0 });
    }
  }

  // ---------- blasts ----------

  /** Damage a blast at (x, y) would do to each mole, without doing it. */
  blastDamage(x: number, y: number, r: number, dmg: number) {
    const out: [Mole, number][] = [];
    for (const m of this.moles) {
      if (!m.alive || m.dying > 0) continue;
      const d = Math.hypot(m.x - x, m.y - MID - y);
      const f = 1 - d / (r + HW + 4);
      if (f <= 0) continue;
      out.push([m, Math.max(1, Math.round(dmg * Math.min(1, f * 1.3)))]);
    }
    return out;
  }

  explode(x: number, y: number, r: number, dmg: number, byTeam: number, except: number, scale = r / 42) {
    this.terrain.carve(x, y, r);
    this.explosions.push({ x, y, r, t: 0, scale: Math.max(0.4, scale) });
    this.events.push(r >= 60 ? 'bigboom' : r <= 16 ? 'smallboom' : 'boom');
    this.shake = Math.max(this.shake, Math.round(r / 5));
    this.burst(x, y, Math.round(r / 2.5), this.theme.debris, 1);
    for (const [m, d] of this.blastDamage(x, y, r, dmg)) {
      if (m.id === except) continue;
      const dx = m.x - x, dy = m.y - MID - y;
      const dist = Math.max(1, Math.hypot(dx, dy));
      const f = 1 - dist / (r + HW + 4);
      const k = (3 + 7 * f) * Math.sqrt(r / 42);
      m.vx += (dx / dist) * k;
      m.vy += (dy / dist) * k - 2 * f;
      m.onGround = false;
      m.flying = true;
      m.rope = null;
      this.hurt(m, d, 'blast', byTeam);
    }
    // Crates in the blast go up too; a weapon crate takes its neighbours with it.
    for (const c of this.crates) {
      if (c.y > this.waterY) continue; // already gone
      if (Math.hypot(c.x - x, c.y - 8 - y) < r + 8) {
        const cx = c.x, cy = c.y - 8;
        c.y = this.waterY + 100;
        if (c.kind === 'weapon') this.explode(cx, cy, 30, 30, byTeam, -1);
      }
    }
  }

  // ---------- particles ----------

  private burst(x: number, y: number, n: number, color: string | string[], size: number) {
    for (let i = 0; i < n; i++) {
      const a = this.rng() * Math.PI * 2, s = 1 + this.rng() * 4;
      this.particles.push({
        x,
        y,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s - 2,
        life: 30 + this.rng() * 40,
        color: typeof color === 'string' ? color : color[Math.floor(this.rng() * color.length)],
        size: size + (this.rng() < 0.3 ? 1 : 0),
      });
    }
  }

  private smoke(x: number, y: number) {
    if (this.frame % 2) return;
    this.particles.push({ x, y, vx: (this.rng() - 0.5) * 0.4, vy: -0.3 - this.rng() * 0.3 - GRAVITY * 0.8 * 1, life: 20 + this.rng() * 15, color: 'smoke', size: 2 });
  }

  private splash(x: number, y: number, n: number) {
    for (let i = 0; i < n; i++) {
      this.particles.push({ x: x + (this.rng() - 0.5) * 10, y, vx: (this.rng() - 0.5) * 3, vy: -2 - this.rng() * 4, life: 30 + this.rng() * 20, color: this.theme.foam, size: 2 });
    }
  }
}

/** Whether (px, py) lies within a bar of `len` by `thick` centred on (cx, cy) at `angle`. */
function onBar(px: number, py: number, cx: number, cy: number, len: number, thick: number, angle: number) {
  const c = Math.cos(angle), s = Math.sin(angle);
  const dx = px - cx, dy = py - cy;
  const u = dx * c + dy * s, v = -dx * s + dy * c;
  return Math.abs(u) <= len / 2 + HW && Math.abs(v) <= thick / 2;
}

/** The weapons as the panel lists them. */
export const WEAPON_ORDER: WeaponId[] = ['bazooka', 'grenade', 'cluster', 'shotgun', 'dynamite', 'airstrike', 'teleport', 'girder', 'rope', 'bat', 'skip'];
