// The destructible ground: a solid-or-not bitmap the size of the map, generated from noise, and a
// canvas painted from it (texture fill, a grass rim where there is air above, dark edges), repainted
// only where craters and girders change it.
import { Rng } from 'arcade-kit/rng';
import { Theme } from './themes';
import { spr } from './sprites';

/** Values in the solid map. */
export const AIR = 0;
export const EARTH = 1;
export const STEEL = 2;

/** Width of the raised rim at each end of the map, and its height as a share of the terrain's range. */
const RIM_W = 170;
const RIM_H = 0.78;

/** The surface rim is this many pixels deep below the top edge. */
const RIM = 5;

// ---------- noise ----------

/** Smooth 1D value noise over `n` control points, repeated in octaves. */
function noise1(rng: Rng, points: number) {
  const v = Array.from({ length: points + 1 }, () => rng());
  return (t: number) => {
    const i = Math.floor(t);
    const f = t - i;
    const s = f * f * (3 - 2 * f);
    return v[i % points] * (1 - s) + v[(i + 1) % points] * s;
  };
}

export class Terrain {
  readonly solid: Uint8Array;
  readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  /** The texture's pixels, read once. */
  private tex: ImageData | null = null;

  constructor(
    readonly w: number,
    readonly h: number,
    readonly theme: Theme,
    rng: Rng,
    /** Water surface: the ground never reaches below it by much, and the generator leaves gaps down to it. */
    readonly waterY: number,
  ) {
    this.solid = new Uint8Array(w * h);
    this.canvas = document.createElement('canvas');
    this.canvas.width = w;
    this.canvas.height = h;
    this.ctx = this.canvas.getContext('2d')!;
    this.generate(rng);
    this.repaint(0, 0, w, h);
  }

  /** Solid at a map pixel; outside the map is air. */
  at(x: number, y: number) {
    x |= 0;
    y |= 0;
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return AIR;
    return this.solid[y * this.w + x];
  }

  isSolid(x: number, y: number) {
    return this.at(x, y) !== AIR;
  }

  // ---------- generation ----------

  private generate(rng: Rng) {
    const { w, h, waterY } = this;
    const top = h * 0.3;
    const base = waterY - 50;
    // Rolling hills in three octaves, mostly gentle, and now and then a gap down to the water.
    const n1 = noise1(rng, 5), n2 = noise1(rng, 12), n3 = noise1(rng, 36);
    const gaps = noise1(rng, 4);
    const surface = new Float32Array(w);
    for (let x = 0; x < w; x++) {
      const t = x / w;
      let r = n1(t * 5) * 0.6 + n2(t * 12) * 0.3 + n3(t * 36) * 0.1;
      // Dips to the water where the gap noise is very low, but not near the ends: both ends rise
      // into a rim of high ground, so a mole knocked outward lands on it instead of in the sea.
      const d = Math.min(x, w - 1 - x) / RIM_W;
      const rim = d >= 1 ? 0 : (1 - d) * (1 - d) * (3 - 2 * (1 - d));
      const g = gaps(t * 4);
      const dip = g < 0.14 ? (0.14 - g) / 0.14 : 0;
      r = 0.15 + r * 0.85 - dip * 1.2 * (1 - rim);
      r = r * (1 - rim) + (RIM_H + n2(t * 12) * 0.15) * rim;
      surface[x] = base - r * (base - top);
    }
    for (let x = 0; x < w; x++) for (let y = Math.max(0, Math.floor(surface[x])); y < h; y++) this.solid[y * w + x] = EARTH;

    // Caverns: a few rounded chambers well under the surface.
    const caverns = 1 + Math.floor(rng() * 3);
    for (let k = 0; k < caverns; k++) {
      const cx = 120 + rng() * (w - 240);
      const s = surface[Math.floor(cx)];
      const room = waterY - 40 - s;
      if (room < 120) continue;
      const cy = s + 60 + rng() * (room - 90);
      this.carveBlob(cx, cy, 30 + rng() * 40, 18 + rng() * 18, rng);
    }
    // Tunnels: wandering passages from one side of a hill toward the other.
    const tunnels = 1 + Math.floor(rng() * 2);
    for (let k = 0; k < tunnels; k++) {
      let x = 150 + rng() * (w - 300);
      let y = surface[Math.floor(x)] + 50 + rng() * 40;
      let dir = (rng() < 0.5 ? 1 : -1) * (0.6 + rng() * 0.6);
      let slope = 0;
      const len = 120 + rng() * 180;
      for (let i = 0; i < len; i += 3) {
        slope += (rng() - 0.5) * 0.3;
        slope = Math.max(-0.7, Math.min(0.7, slope));
        x += dir * 3;
        y += slope * 3;
        if (x < 40 || x > w - 40 || y > waterY - 50) break;
        // Never closer than 28px to the surface, so the roof holds.
        if (y - surface[Math.floor(x)] < 28) slope = Math.abs(slope) + 0.2;
        this.carveDisc(x, y, 11 + Math.sin(i * 0.1) * 2);
      }
    }
    // A floating chunk or two, something to stand on and to shoot over.
    const chunks = 1 + Math.floor(rng() * 2);
    for (let k = 0; k < chunks; k++) {
      const cx = 200 + rng() * (w - 400);
      const cy = top + 20 + rng() * (base - top - 140);
      if (surface[Math.floor(cx)] - cy < 100) continue;
      this.fillBlob(cx, cy, 50 + rng() * 60, 16 + rng() * 14, rng);
    }
    this.smooth(2);
    this.tidy();
  }

  /** A pixel disc of air. */
  private carveDisc(cx: number, cy: number, r: number) {
    for (let y = Math.floor(cy - r); y <= cy + r; y++) {
      if (y < 0 || y >= this.h) continue;
      const half = Math.sqrt(Math.max(0, r * r - (y - cy) * (y - cy)));
      for (let x = Math.max(0, Math.floor(cx - half)); x <= Math.min(this.w - 1, cx + half); x++) this.solid[y * this.w + x] = AIR;
    }
  }

  /** An ellipse of air with a wavy edge. */
  private carveBlob(cx: number, cy: number, rw: number, rh: number, rng: Rng) {
    const n = noise1(rng, 8);
    for (let a = 0; a < Math.PI * 2; a += 0.05) {
      const k = 0.75 + 0.3 * n((a / (Math.PI * 2)) * 8);
      this.carveDisc(cx + Math.cos(a) * rw * k * 0.6, cy + Math.sin(a) * rh * k * 0.6, Math.min(rw, rh) * 0.45);
    }
  }

  private fillBlob(cx: number, cy: number, rw: number, rh: number, rng: Rng) {
    const n = noise1(rng, 8);
    for (let x = Math.floor(cx - rw); x <= cx + rw; x++) {
      if (x < 0 || x >= this.w) continue;
      const u = (x - cx) / rw;
      if (Math.abs(u) > 1) continue;
      const half = Math.sqrt(1 - u * u) * rh * (0.7 + 0.6 * n(((u + 1) / 2) * 8));
      for (let y = Math.floor(cy - half * 0.6); y <= cy + half; y++) if (y >= 0 && y < this.h) this.solid[y * this.w + x] = EARTH;
    }
  }

  /** Rounds every edge: a pixel follows the majority of its neighbourhood. */
  private smooth(passes: number) {
    const { w, h } = this;
    const src = new Uint8Array(this.solid);
    for (let p = 0; p < passes; p++) {
      for (let y = 1; y < h - 1; y++)
        for (let x = 1; x < w - 1; x++) {
          let n = 0;
          for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (src[(y + dy) * w + x + dx]) n++;
          this.solid[y * w + x] = n >= 5 ? EARTH : AIR;
        }
      src.set(this.solid);
    }
  }

  /** Drops specks of ground and fills pinholes, by the size of their connected areas. */
  private tidy() {
    const { w, h, solid } = this;
    const seen = new Uint8Array(w * h);
    const stack: number[] = [];
    const minGround = 500, minHole = 200;
    for (let i = 0; i < w * h; i++) {
      if (seen[i]) continue;
      const v = solid[i];
      // Air that touches the map's border is the open sky, never a hole.
      let open = false;
      const cells: number[] = [];
      stack.push(i);
      seen[i] = 1;
      while (stack.length) {
        const c = stack.pop()!;
        cells.push(c);
        const x = c % w, y = (c - x) / w;
        if (x === 0 || y === 0 || x === w - 1 || y === h - 1) open = true;
        for (const d of [c - 1, c + 1, c - w, c + w]) {
          if (d < 0 || d >= w * h || seen[d] || solid[d] !== v) continue;
          if ((d === c - 1 && x === 0) || (d === c + 1 && x === w - 1)) continue;
          seen[d] = 1;
          stack.push(d);
        }
        if (cells.length > 20000 && (v === AIR ? open : true)) {
          // Big enough to keep; just mark the rest as seen without collecting.
          while (stack.length) {
            const r = stack.pop()!;
            const rx = r % w, ry = (r - rx) / w;
            void ry;
            for (const d of [r - 1, r + 1, r - w, r + w]) {
              if (d < 0 || d >= w * h || seen[d] || solid[d] !== v) continue;
              if ((d === r - 1 && rx === 0) || (d === r + 1 && rx === w - 1)) continue;
              seen[d] = 1;
              stack.push(d);
            }
          }
          cells.length = 0;
          break;
        }
      }
      if (!cells.length) continue;
      if (v !== AIR && cells.length < minGround) for (const c of cells) solid[c] = AIR;
      else if (v === AIR && !open && cells.length < minHole) for (const c of cells) solid[c] = EARTH;
    }
  }

  // ---------- changes ----------

  /** Blows a disc of ground away; returns whether anything was solid there. */
  carve(cx: number, cy: number, r: number) {
    let hit = false;
    const x0 = Math.max(0, Math.floor(cx - r)), x1 = Math.min(this.w - 1, Math.ceil(cx + r));
    const y0 = Math.max(0, Math.floor(cy - r)), y1 = Math.min(this.h - 1, Math.ceil(cy + r));
    for (let y = y0; y <= y1; y++)
      for (let x = x0; x <= x1; x++) {
        const dx = x + 0.5 - cx, dy = y + 0.5 - cy;
        if (dx * dx + dy * dy <= r * r && this.solid[y * this.w + x] !== AIR) {
          this.solid[y * this.w + x] = AIR;
          hit = true;
        }
      }
    if (hit) this.repaint(x0 - 2, y0 - 2, x1 - x0 + 5, y1 - y0 + RIM + 4);
    return hit;
  }

  /** Adds a steel girder: a `len` by `thick` bar centred on (cx, cy), turned by `angle` radians. */
  girder(cx: number, cy: number, len: number, thick: number, angle: number) {
    const c = Math.cos(angle), s = Math.sin(angle);
    const ext = len / 2 + thick / 2;
    const x0 = Math.max(0, Math.floor(cx - ext)), x1 = Math.min(this.w - 1, Math.ceil(cx + ext));
    const y0 = Math.max(0, Math.floor(cy - ext)), y1 = Math.min(this.h - 1, Math.ceil(cy + ext));
    for (let y = y0; y <= y1; y++)
      for (let x = x0; x <= x1; x++) {
        const dx = x + 0.5 - cx, dy = y + 0.5 - cy;
        const u = dx * c + dy * s, v = -dx * s + dy * c;
        if (Math.abs(u) <= len / 2 && Math.abs(v) <= thick / 2) this.solid[y * this.w + x] = STEEL;
      }
    this.repaint(x0 - 2, y0 - 2, x1 - x0 + 5, y1 - y0 + RIM + 4);
  }

  /** Whether a `len` by `thick` bar there overlaps nothing solid (so a girder can go in). */
  girderFree(cx: number, cy: number, len: number, thick: number, angle: number) {
    const c = Math.cos(angle), s = Math.sin(angle);
    for (let u = -len / 2; u <= len / 2; u += 2)
      for (let v = -thick / 2; v <= thick / 2; v += 2) if (this.isSolid(cx + u * c - v * s, cy + u * s + v * c)) return false;
    return true;
  }

  /** The surface under (x, y): the first solid pixel at or below y, or -1 if only water. */
  groundBelow(x: number, y: number) {
    for (let yy = Math.max(0, Math.floor(y)); yy < this.h; yy++) if (this.isSolid(x, yy)) return yy;
    return -1;
  }

  /** Whether a box with its bottom centre at (x, y) stands in air. */
  boxFree(x: number, y: number, hw: number, hh: number) {
    for (let yy = y - hh; yy < y; yy += 2) for (let xx = x - hw; xx <= x + hw; xx += 2) if (this.isSolid(xx, yy)) return false;
    return true;
  }

  // ---------- painting ----------

  private texel(x: number, y: number) {
    if (!this.tex) {
      const t = spr(this.theme.texture);
      this.tex = t.getContext('2d')!.getImageData(0, 0, t.width, t.height);
    }
    const { width: tw, height: th } = this.tex;
    // The textures tile (their seams were inpainted away), so plain repetition will do.
    return ((y % th) * tw + (x % tw)) * 4;
  }

  private repaint(x0: number, y0: number, w: number, h: number) {
    x0 = Math.max(0, x0);
    y0 = Math.max(0, y0);
    w = Math.min(this.w - x0, w);
    h = Math.min(this.h - y0, h);
    if (w <= 0 || h <= 0) return;
    const img = this.ctx.createImageData(w, h);
    const d = img.data;
    const edge = hex(this.theme.edge), rim = hex(this.theme.rim), rimDark = hex(this.theme.rimDark);
    const W = this.w, solid = this.solid;
    for (let y = y0; y < y0 + h; y++) {
      for (let x = x0; x < x0 + w; x++) {
        const v = solid[y * W + x];
        if (v === AIR) continue;
        const o = ((y - y0) * w + (x - x0)) * 4;
        let col: number[] | null = null;
        // An edge: any of the 4 neighbours is air (or the map's top).
        const air = (xx: number, yy: number) => xx < 0 || xx >= W || yy < 0 || yy >= this.h || solid[yy * W + xx] === AIR;
        if (air(x - 1, y) || air(x + 1, y) || air(x, y - 1) || air(x, y + 1)) col = v === STEEL ? [40, 40, 48] : edge;
        else if (v === STEEL) {
          const stripe = ((x + y) >> 2) & 1;
          col = stripe ? [150, 154, 166] : [112, 116, 128];
          if (((x >> 3) & 3) === 0 && ((y >> 3) & 3) === 0) col = [190, 194, 204];
        } else {
          // Depth of earth above, up to the rim depth: a grass rim where the sky is close.
          let depth = 0;
          while (depth < RIM && !air(x, y - depth - 1) && solid[(y - depth - 1) * W + x] !== STEEL) depth++;
          if (depth < RIM) col = depth < 3 ? rim : rimDark;
          else {
            const t = this.texel(x, y);
            d[o] = this.tex!.data[t];
            d[o + 1] = this.tex!.data[t + 1];
            d[o + 2] = this.tex!.data[t + 2];
            d[o + 3] = 255;
            continue;
          }
        }
        d[o] = col[0];
        d[o + 1] = col[1];
        d[o + 2] = col[2];
        d[o + 3] = 255;
      }
    }
    this.ctx.clearRect(x0, y0, w, h);
    this.ctx.putImageData(img, x0, y0);
  }
}

function hex(c: string) {
  return [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)];
}
