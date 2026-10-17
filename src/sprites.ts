// Sprite registry: every PNG under src/assets, keyed by path without extension ("icons/bazooka").
// Numbered files ("mole/walk_3") also form frame strips ("mole/walk"). Anything missing gets a
// plain placeholder, so the game runs before the art is in. Team colours, mirrored and turned
// copies are made once and kept.

const URLS = import.meta.glob(['./assets/**/*.png'], { eager: true, query: '?url', import: 'default' }) as Record<string, string>;

export type Sprite = HTMLCanvasElement;

const sprites = new Map<string, Sprite>();
const strips = new Map<string, Sprite[]>();

export function canvas(w: number, h: number) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

function loadImage(url: string) {
  return new Promise<HTMLImageElement | null>((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

/** Loads every asset; call once before the game starts. */
export async function loadSprites() {
  await Promise.all(
    Object.entries(URLS).map(async ([path, url]) => {
      const img = await loadImage(url);
      if (!img) return;
      const c = canvas(img.width, img.height);
      c.getContext('2d')!.drawImage(img, 0, 0);
      sprites.set(path.replace(/^\.\/assets\//, '').replace(/\.png$/, ''), c);
    }),
  );
  const groups = new Map<string, [number, Sprite][]>();
  for (const [name, s] of sprites) {
    const m = /^(.*)_(\d+)$/.exec(name);
    if (!m) continue;
    if (!groups.has(m[1])) groups.set(m[1], []);
    groups.get(m[1])!.push([+m[2], s]);
  }
  for (const [name, fr] of groups) strips.set(name, fr.sort((a, b) => a[0] - b[0]).map((f) => f[1]));
}

export const has = (name: string) => sprites.has(name);

// ---------- placeholders ----------

const PLACEHOLDER: Record<string, [number, number, string]> = {
  'mole/idle': [40, 40, '#6a4a30'],
  'terrain/dirt': [64, 64, '#7a4a26'],
  'terrain/ice': [64, 64, '#b8d8f0'],
  'terrain/basalt': [64, 64, '#383038'],
  'fx/explosion': [64, 64, '#f8a030'],
  'items/crate_health': [32, 32, '#c89050'],
  'items/crate_weapon': [32, 32, '#c89050'],
  'items/parachute': [32, 32, '#f0f0f0'],
  'items/grave': [32, 32, '#9c9ca8'],
  'items/plane': [32, 32, '#788090'],
  'proj/shell': [16, 16, '#58d854'],
  'proj/grenade': [16, 16, '#3c9030'],
  'proj/bomblet': [16, 16, '#7c7c7c'],
  'proj/dynamite': [16, 16, '#f83800'],
  'proj/bomb': [16, 16, '#505860'],
  'proj/hook': [16, 16, '#9c9ca8'],
};

function placeholder(name: string): Sprite {
  const [w, h, color] = PLACEHOLDER[name] ?? [16, 16, '#f0f'];
  const c = canvas(w, h);
  const g = c.getContext('2d')!;
  g.fillStyle = color;
  if (name.startsWith('terrain/')) {
    // A speckled fill, so the ground reads even without its texture.
    g.fillRect(0, 0, w, h);
    g.fillStyle = 'rgba(0,0,0,0.18)';
    for (let i = 0; i < 120; i++) g.fillRect((i * 37) % w, (i * 53) % h, 2, 1);
  } else {
    g.beginPath();
    g.arc(w / 2, h / 2, Math.min(w, h) / 2 - 1, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = '#000';
    g.stroke();
  }
  return c;
}

/** The sprite by name, or its placeholder. */
export function spr(name: string): Sprite {
  let s = sprites.get(name);
  if (!s) {
    s = placeholder(name);
    sprites.set(name, s);
  }
  return s;
}

/** The frames of a strip ("mole/walk"), or the single sprite of that name. */
export function frames(name: string): Sprite[] {
  return strips.get(name) ?? [spr(name)];
}

// ---------- derived copies ----------

const derived = new Map<string, Sprite>();

function derive(key: string, make: () => Sprite) {
  let s = derived.get(key);
  if (!s) {
    s = make();
    derived.set(key, s);
  }
  return s;
}

/** The sprite mirrored left to right. */
export function flipped(s: Sprite, key: string) {
  return derive(`flip:${key}`, () => {
    const c = canvas(s.width, s.height);
    const g = c.getContext('2d')!;
    g.translate(s.width, 0);
    g.scale(-1, 1);
    g.drawImage(s, 0, 0);
    return c;
  });
}

/** The sprite turned by `angle` radians (clockwise on screen), in 32 steps, on a canvas big enough. */
export function rotated(s: Sprite, key: string, angle: number) {
  const step = Math.round((angle / (Math.PI * 2)) * 32) & 31;
  return derive(`rot:${key}:${step}`, () => {
    const d = Math.ceil(Math.hypot(s.width, s.height));
    const c = canvas(d, d);
    const g = c.getContext('2d')!;
    g.imageSmoothingEnabled = false;
    g.translate(d / 2, d / 2);
    g.rotate((step / 32) * Math.PI * 2);
    g.drawImage(s, -s.width / 2, -s.height / 2);
    return c;
  });
}

/** Team colours, in the order of the teams; the mole's red bandana is swapped for them. */
export const TEAM_COLORS = ['#f83800', '#3c8cf8', '#58d854', '#f8d838'];
export const TEAM_NAMES = ['RED', 'BLUE', 'GREEN', 'YELLOW'];

function rgb(c: string): [number, number, number] {
  return [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)];
}

/** The sprite with its red parts (the bandana) in the team's colour. */
export function teamed(s: Sprite, key: string, team: number) {
  if (team === 0) return s;
  return derive(`team:${key}:${team}`, () => {
    const c = canvas(s.width, s.height);
    const g = c.getContext('2d')!;
    g.drawImage(s, 0, 0);
    const img = g.getImageData(0, 0, c.width, c.height);
    const d = img.data;
    const [tr, tg, tb] = rgb(TEAM_COLORS[team]);
    for (let i = 0; i < d.length; i += 4) {
      const r = d[i], gg = d[i + 1], b = d[i + 2];
      // Red: clearly more red than green and blue, and not pink skin (which is light all round).
      if (r > 120 && r > gg * 1.8 && r > b * 1.8 && gg < 110) {
        const lum = r / 255;
        d[i] = Math.round(tr * lum);
        d[i + 1] = Math.round(tg * lum);
        d[i + 2] = Math.round(tb * lum);
      }
    }
    g.putImageData(img, 0, 0);
    return c;
  });
}

/** The sprite painted solid white (for hit flashes). */
export function white(s: Sprite, key: string) {
  return derive(`white:${key}`, () => {
    const c = canvas(s.width, s.height);
    const g = c.getContext('2d')!;
    g.drawImage(s, 0, 0);
    g.globalCompositeOperation = 'source-in';
    g.fillStyle = '#fff';
    g.fillRect(0, 0, c.width, c.height);
    return c;
  });
}

/** Draws a sprite with its centre at (x, y). */
export function drawAt(ctx: CanvasRenderingContext2D, s: Sprite, x: number, y: number) {
  ctx.drawImage(s, Math.round(x - s.width / 2), Math.round(y - s.height / 2));
}
