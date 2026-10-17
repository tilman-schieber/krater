// The maps' looks: terrain texture and rim colours, sky, water and the two parallax layers behind.
// Textures and background strips come from PixelLab (see tools/ASSETS.md); everything else is colour.

export interface Theme {
  id: string;
  name: string;
  /** Sprite names of the fill texture and the two background strips. */
  texture: string;
  far: string;
  near: string;
  /** Sky gradient, top to bottom. */
  skyTop: string;
  skyBottom: string;
  /** The far layer's bottom colour, filled below it. */
  farBottom: string;
  /** Edge pixels of the terrain, and the surface rim (bright, then dark) under them. */
  edge: string;
  rim: string;
  rimDark: string;
  /** Water, top band and body, plus the foam colour. */
  water: string;
  waterDeep: string;
  foam: string;
  /** Debris thrown by explosions. */
  debris: string[];
  /** Cloud colour, or none. */
  cloud: string | null;
}

export const THEMES: Theme[] = [
  {
    id: 'jungle',
    name: 'JUNGLE',
    texture: 'terrain/dirt',
    far: 'bg/jungle_far',
    near: 'bg/jungle_near',
    skyTop: '#5ab4e8',
    skyBottom: '#c8faf7',
    farBottom: '#053748',
    edge: '#2a1608',
    rim: '#6ad04c',
    rimDark: '#3c9030',
    water: '#3c8cd8',
    waterDeep: '#1c4c98',
    foam: '#d8f4ff',
    debris: ['#7a4a26', '#5a3418', '#a06838', '#3c9030'],
    cloud: '#ffffff',
  },
  {
    id: 'arctic',
    name: 'ARCTIC',
    texture: 'terrain/ice',
    far: 'bg/arctic_far',
    near: 'bg/arctic_near',
    skyTop: '#2c4c84',
    skyBottom: '#9dd5ef',
    farBottom: '#aad0ea',
    edge: '#243c68',
    rim: '#ffffff',
    rimDark: '#c8e0f4',
    water: '#2c6cb8',
    waterDeep: '#143468',
    foam: '#e8f8ff',
    debris: ['#c8e0f4', '#90b8dc', '#ffffff', '#6c94c0'],
    cloud: '#e0ecf8',
  },
  {
    id: 'volcano',
    name: 'VOLCANO',
    texture: 'terrain/basalt',
    far: 'bg/volcano_far',
    near: 'bg/volcano_near',
    skyTop: '#180810',
    skyBottom: '#0e0119',
    farBottom: '#040213',
    edge: '#100808',
    rim: '#f8b030',
    rimDark: '#c04818',
    water: '#f06818',
    waterDeep: '#a02808',
    foam: '#ffe070',
    debris: ['#383038', '#605058', '#f06818', '#201818'],
    cloud: null,
  },
];

export const themeById = (id: string) => THEMES.find((t) => t.id === id) ?? THEMES[0];
