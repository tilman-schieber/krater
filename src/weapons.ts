// The arsenal. Each weapon says how it is used (charged shot, instant, placed at the cursor) and
// what its projectile does; the world does the rest.

export type WeaponId =
  | 'bazooka'
  | 'grenade'
  | 'cluster'
  | 'shotgun'
  | 'dynamite'
  | 'airstrike'
  | 'teleport'
  | 'girder'
  | 'rope'
  | 'bat'
  | 'skip';

export type Use =
  /** Hold fire to charge, release to shoot in the aimed direction. */
  | 'charge'
  /** Fire shoots straight away in the aimed direction. */
  | 'instant'
  /** Fire places it at the mole's feet. */
  | 'place'
  /** Fire confirms the cursor position. */
  | 'cursor';

export interface Weapon {
  id: WeaponId;
  name: string;
  icon: string;
  use: Use;
  /** Ammo at the start of a round; -1 is unlimited. */
  ammo: number;
  /** Blast radius and the damage at its centre, where it blows up. */
  radius: number;
  damage: number;
  /** Launch speed relative to the bazooka's, for charged weapons. */
  speed: number;
  /** Turns the wind can push it. */
  wind: boolean;
  /** Bounces instead of blowing up on contact; it has a fuse then. */
  bounce: boolean;
  /** Seconds a bouncing weapon waits, adjustable with the number keys. */
  fuse: number;
  /** How many shots one turn has (the shotgun's two barrels). */
  shots: number;
  /** Whether the turn ends when it has been used (the rope and teleport are moves, not shots). */
  endsTurn: boolean;
  /** Retreat time after using it, in seconds. */
  retreat: number;
  /** Shown in the weapon panel. */
  blurb: string;
}

const W = (w: Partial<Weapon> & Pick<Weapon, 'id' | 'name' | 'use' | 'blurb'>): Weapon => ({
  icon: `icons/${w.id}`,
  ammo: -1,
  radius: 0,
  damage: 0,
  speed: 1,
  wind: false,
  bounce: false,
  fuse: 3,
  shots: 1,
  endsTurn: true,
  retreat: 3,
  ...w,
});

export const WEAPONS: Weapon[] = [
  W({ id: 'bazooka', name: 'BAZOOKA', use: 'charge', radius: 42, damage: 50, wind: true, blurb: 'BLOWS UP ON CONTACT. THE WIND BENDS IT.' }),
  W({ id: 'grenade', name: 'GRENADE', use: 'charge', radius: 42, damage: 50, speed: 0.7, bounce: true, blurb: 'BOUNCES. FIRE AGAIN TO SET IT OFF, OR WAIT FOR THE FUSE (1-5).' }),
  W({ id: 'cluster', name: 'CLUSTER', use: 'charge', ammo: 2, radius: 26, damage: 20, speed: 0.7, blurb: 'FIRE AGAIN IN FLIGHT: IT RAINS FIVE BOMBLETS.' }),
  W({ id: 'shotgun', name: 'SHOTGUN', use: 'instant', radius: 16, damage: 30, shots: 2, retreat: 0, blurb: 'TWO STRAIGHT SHOTS. AIM AGAIN BETWEEN THEM.' }),
  W({ id: 'dynamite', name: 'DYNAMITE', use: 'place', ammo: 2, radius: 72, damage: 75, fuse: 5, retreat: 5, blurb: 'DROP IT AND RUN. FIVE SECONDS.' }),
  W({ id: 'airstrike', name: 'AIRSTRIKE', use: 'cursor', ammo: 1, radius: 26, damage: 24, wind: true, blurb: 'FIVE BOMBS FROM ABOVE. MARK THE SPOT.' }),
  W({ id: 'teleport', name: 'TELEPORT', use: 'cursor', ammo: 2, endsTurn: true, retreat: 0, blurb: 'GO ANYWHERE IN ONE BLINK.' }),
  W({ id: 'girder', name: 'GIRDER', use: 'cursor', ammo: 3, endsTurn: false, retreat: 0, blurb: 'A STEEL BEAM. UP/DOWN TURNS IT.' }),
  W({ id: 'rope', name: 'ROPE', use: 'instant', endsTurn: false, retreat: 0, blurb: 'HOOK ON AND SWING. FIRE AGAIN TO LET GO.' }),
  W({ id: 'bat', name: 'BAT', use: 'instant', radius: 0, damage: 35, blurb: 'A SWING THAT SENDS THEM FLYING. AIM SETS THE ANGLE.' }),
  W({ id: 'skip', name: 'SKIP', use: 'instant', retreat: 0, blurb: 'END THE TURN WITHOUT A SHOT.' }),
];

export const weapon = (id: WeaponId) => WEAPONS.find((w) => w.id === id)!;

/** Fresh ammo for a team. */
export const startingAmmo = () => Object.fromEntries(WEAPONS.map((w) => [w.id, w.ammo])) as Record<WeaponId, number>;

/** Columns in the weapon panel. */
export const PANEL_COLS = 6;

/** What a weapon crate can hold. */
export const CRATE_WEAPONS: WeaponId[] = ['cluster', 'dynamite', 'airstrike', 'teleport', 'girder'];
