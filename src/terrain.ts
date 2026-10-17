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

/** Smooth 2D value noise on a grid of `nx` by `ny` cells. */
function noise2(rng: Rng, nx: number, ny: number) {
  const v = new Float32Array((nx + 1) * (ny + 1));
  for (let i = 0; i < v.length; i++) v[i] = rng();
  return (x: number, y: number) => {
    const i = Math.floor(x), j = Math.floor(y);
    const fx = x - i, fy = y - j;
    const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
    const a = v[j * (nx + 1) + i], b = v[j * (nx + 1) + i + 1];
    const c = v[(j + 1) * (nx + 1) + i], d = v[(j + 1) * (nx + 1) + i + 1];
    return (a * (1 - sx) + b * sx) * (1 - sy) + (c * (1 - sx) + d * sx) * sy;
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
    const top = h * 0.22;
    const base = waterY - 40;
    // Three octaves of hills, then the islands: stretches where the ground dips under the water.
    const n1 = noise1(rng, 6), n2 = noise1(rng, 14), n3 = noise1(rng, 40);
    const gaps = noise1(rng, 5);
    const surface = new Float32Array(w);
    for (let x = 0; x < w; x++) {
      const t = x / w;
      let r = n1(t * 6) * 0.6 + n2(t * 14) * 0.3 + n3(t * 40) * 0.1;
      // Ground slopes into the water at both ends, and dips where the gap noise is low.
      const edge = Math.min(1, Math.min(x, w - 1 - x) / 160);
      const g = gaps(t * 5);
      const dip = g < 0.3 ? (0.3 - g) / 0.3 : 0;
      r = r * edge - dip * 0.9 + (1 - edge) * -0.2;
      surface[x] = base - r * (base - top);
    }
    // Caves and overhangs: 2D noise carves the interior, but never the rim near the surface.
    const caves = noise2(rng, Math.ceil(w / 48), Math.ceil(h / 40));
    const caves2 = noise2(rng, Math.ceil(w / 20), Math.ceil(h / 18));
    for (let x = 0; x < w; x++) {
      const s = surface[x];
      for (let y = Math.max(0, Math.floor(s)); y < h; y++) {
        const depth = y - s;
        let v = EARTH;
        if (depth > 14) {
          const c = caves(x / 48, y / 40) * 0.7 + caves2(x / 20, y / 18) * 0.3;
          // Deeper down the caves get a little bigger; near the water they close again.
          const bias = Math.min(0.12, depth / 400) - Math.max(0, (y - (waterY - 30)) / 60);
          if (c + bias > 0.68) v = AIR;
        }
        this.solid[y * w + x] = v;
      }
    }
    // Floating chunks over the gaps, so there is something to stand on and to shoot over.
    const chunks = 2 + Math.floor(rng() * 3);
    for (let k = 0; k < chunks; k++) {
      const cx = 200 + rng() * (w - 400);
      const cy = top + 40 + rng() * (base - top - 120);
      if (surface[Math.floor(cx)] - cy < 90) continue;
      const rw = 50 + rng() * 70, rh = 16 + rng() * 18;
      this.fillBlob(cx, cy, rw, rh, rng);
    }
  }

  private fillBlob(cx: number, cy: number, rw: number, rh: number, rng: Rng) {
    const n = noise1(rng, 8);
    for (let x = Math.floor(cx - rw); x <= cx + rw; x++) {
      const u = (x - cx) / rw;
      if (Math.abs(u) > 1) continue;
      const half = Math.sqrt(1 - u * u) * rh * (0.7 + 0.6 * n(((u + 1) / 2) * 8));
      for (let y = Math.floor(cy - half * 0.6); y <= cy + half; y++) if (y >= 0 && y < this.h) this.solid[y * this.w + x] = EARTH;
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
