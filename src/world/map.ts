// The island map: tiles, props, houses, and collision. Pure data with no
// rendering, so a server can generate or validate the same map later.

export const MAP_SIZE = 64;

export const Tile = {
  Ocean: 0,
  Sand: 1,
  Grass: 2,
  Path: 3,
  River: 4,
  Bridge: 5,
  Plaza: 6,
} as const;
export type Tile = (typeof Tile)[keyof typeof Tile];

export type Prop = 'tree' | 'rock' | 'flower';

export interface HouseSite {
  /** Id of the villager who lives here, or `plot-N` for a player plot. */
  owner: string;
  /** Top-left tile of the 3x3 footprint. The door faces +z. */
  tx: number;
  tz: number;
}

export interface Point {
  x: number;
  z: number;
}

/** Solid props are circles of this radius centered in their tile. */
export const PROP_RADIUS = 0.35;
export const HOUSE_SIZE = 3;
/** The fountain fills a 2x2 block in the middle of the plaza. */
export const FOUNTAIN_TILE = { tx: MAP_SIZE / 2 - 1, tz: MAP_SIZE / 2 - 1 };

const HALF = MAP_SIZE / 2;

/** Small deterministic PRNG so every player gets the same island. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** World coordinates of a tile's center. The map is centered on the origin. */
export function tileCenter(tx: number, tz: number): Point {
  return { x: tx - HALF + 0.5, z: tz - HALF + 0.5 };
}

export function worldToTile(x: number, z: number): { tx: number; tz: number } {
  return { tx: Math.floor(x + HALF), tz: Math.floor(z + HALF) };
}

export function houseDoor(h: HouseSite): Point {
  // Just outside the middle of the front wall.
  return tileCenter(h.tx + 1, h.tz + HOUSE_SIZE);
}

export class IslandMap {
  readonly tiles = new Uint8Array(MAP_SIZE * MAP_SIZE);
  /** Tiles covered by buildings (houses, fountain). */
  readonly blocked = new Uint8Array(MAP_SIZE * MAP_SIZE);
  readonly props = new Map<number, Prop>();
  readonly houses: HouseSite[] = [];
  /** Plots for players' houses, in plot-number order. Always all present; empty ones show a sign. */
  readonly plots: HouseSite[] = [];
  readonly spawn: Point;

  constructor(houses: readonly Omit<HouseSite, 'tx' | 'tz'>[] = [], seed = 20260926) {
    const rand = mulberry32(seed);
    this.shapeIsland();
    this.carveRiver();
    this.layPlaza();
    HOUSE_SPOTS.slice(0, houses.length).forEach((spot, i) => {
      this.houses.push(this.placeHouse({ owner: houses[i].owner, ...spot }));
    });
    PLOT_SPOTS.forEach((spot, i) => this.plots.push(this.placeHouse({ owner: plotId(i), ...spot })));
    this.scatterProps(rand);
    this.spawn = tileCenter(HALF, HALF + 3);
  }

  index(tx: number, tz: number): number {
    return tz * MAP_SIZE + tx;
  }

  inBounds(tx: number, tz: number): boolean {
    return tx >= 0 && tz >= 0 && tx < MAP_SIZE && tz < MAP_SIZE;
  }

  tileAt(tx: number, tz: number): Tile {
    return this.inBounds(tx, tz) ? (this.tiles[this.index(tx, tz)] as Tile) : Tile.Ocean;
  }

  /** True if the tile itself can be walked on, ignoring round props. */
  isOpenTile(tx: number, tz: number): boolean {
    if (!this.inBounds(tx, tz) || this.blocked[this.index(tx, tz)]) return false;
    const t = this.tileAt(tx, tz);
    return t !== Tile.Ocean && t !== Tile.River;
  }

  isSolidProp(tx: number, tz: number): boolean {
    const p = this.props.get(this.index(tx, tz));
    return p === 'tree' || p === 'rock';
  }

  /** Can a round body of the given radius stand at this world position? */
  canStand(x: number, z: number, radius: number): boolean {
    for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1], [0, 0]]) {
      const { tx, tz } = worldToTile(x + dx * radius, z + dz * radius);
      if (!this.isOpenTile(tx, tz)) return false;
    }
    const { tx, tz } = worldToTile(x, z);
    const minGap = radius + PROP_RADIUS;
    for (let j = tz - 1; j <= tz + 1; j++) {
      for (let i = tx - 1; i <= tx + 1; i++) {
        if (!this.isSolidProp(i, j)) continue;
        const c = tileCenter(i, j);
        if ((c.x - x) ** 2 + (c.z - z) ** 2 < minGap * minGap) return false;
      }
    }
    return true;
  }

  private set(tx: number, tz: number, tile: Tile): void {
    if (this.inBounds(tx, tz)) this.tiles[this.index(tx, tz)] = tile;
  }

  /** A roughly round island with a wobbly coastline and a sandy beach. */
  private shapeIsland(): void {
    for (let tz = 0; tz < MAP_SIZE; tz++) {
      for (let tx = 0; tx < MAP_SIZE; tx++) {
        const dx = tx + 0.5 - HALF;
        const dz = tz + 0.5 - HALF;
        const d = Math.hypot(dx, dz) / HALF;
        const angle = Math.atan2(dz, dx);
        const edge = 0.84 + 0.05 * Math.sin(angle * 3) + 0.03 * Math.sin(angle * 5 + 1);
        this.set(tx, tz, d > edge ? Tile.Ocean : d > edge - 0.08 ? Tile.Sand : Tile.Grass);
      }
    }
  }

  /** A river from the north coast to the south coast, east of the plaza. */
  private carveRiver(): void {
    for (let tz = 0; tz < MAP_SIZE; tz++) {
      const center = 42 + 2.5 * Math.sin(tz / 6);
      for (let tx = Math.floor(center - 1); tx <= Math.floor(center + 1); tx++) {
        if (this.tileAt(tx, tz) !== Tile.Ocean) this.set(tx, tz, Tile.River);
      }
    }
  }

  private layPlaza(): void {
    for (let tz = HALF - 5; tz < HALF + 5; tz++) {
      for (let tx = HALF - 5; tx < HALF + 5; tx++) this.set(tx, tz, Tile.Plaza);
    }
    const { tx, tz } = FOUNTAIN_TILE;
    for (const [i, j] of [[0, 0], [1, 0], [0, 1], [1, 1]]) this.blocked[this.index(tx + i, tz + j)] = 1;
  }

  private placeHouse(site: HouseSite): HouseSite {    for (let j = 0; j < HOUSE_SIZE; j++) {
      for (let i = 0; i < HOUSE_SIZE; i++) {
        this.set(site.tx + i, site.tz + j, Tile.Grass);
        this.blocked[this.index(site.tx + i, site.tz + j)] = 1;
      }
    }
    // A two-wide path from the door to the plaza: to the plaza row, then across.
    // Doors face +z, so houses south of the plaza first step out beside the house.
    const doorX = site.tx + 1;
    const doorZ = site.tz + HOUSE_SIZE;
    const step = (a: number, b: number) => (a < b ? 1 : -1);
    let x = doorX;
    let z = doorZ;
    if (doorZ > HALF) {
      const besideX = site.tx + HOUSE_SIZE + 1;
      while (x !== besideX) {
        this.paveAt(x, z);
        x += step(x, besideX);
      }
    }
    while (z !== HALF) {
      this.paveAt(x, z);
      z += step(z, HALF);
    }
    while (x !== HALF) {
      this.paveAt(x, z);
      x += step(x, HALF);
    }
    return site;
  }

  /** Paves a 2x2 block. Pavement over the river becomes a bridge. */
  private paveAt(tx: number, tz: number): void {
    for (const [i, j] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
      const t = this.tileAt(tx + i, tz + j);
      if (t === Tile.River) this.set(tx + i, tz + j, Tile.Bridge);
      else if (t === Tile.Grass || t === Tile.Sand) this.set(tx + i, tz + j, Tile.Path);
    }
  }

  /** Is anything other than plain grass within `r` tiles? Keeps props off paths and buildings. */
  private nearFeature(tx: number, tz: number, r: number): boolean {
    for (let j = tz - r; j <= tz + r; j++) {
      for (let i = tx - r; i <= tx + r; i++) {
        if (this.tileAt(i, j) !== Tile.Grass || (this.inBounds(i, j) && this.blocked[this.index(i, j)])) return true;
      }
    }
    return false;
  }

  private scatterProps(rand: () => number): void {
    const spawnTile = { tx: HALF, tz: HALF + 3 };
    for (let tz = 0; tz < MAP_SIZE; tz++) {
      for (let tx = 0; tx < MAP_SIZE; tx++) {
        if (this.tileAt(tx, tz) !== Tile.Grass || this.blocked[this.index(tx, tz)]) continue;
        const roll = rand();
        const nearSpawn = Math.abs(tx - spawnTile.tx) < 4 && Math.abs(tz - spawnTile.tz) < 4;
        if (roll < 0.09 && !nearSpawn && !this.nearFeature(tx, tz, 1)) this.props.set(this.index(tx, tz), 'tree');
        else if (roll < 0.1 && !nearSpawn && !this.nearFeature(tx, tz, 1)) this.props.set(this.index(tx, tz), 'rock');
        else if (roll < 0.16) this.props.set(this.index(tx, tz), 'flower');
      }
    }
  }
}

/** Where houses go, in the order NPCs are assigned. Two sit across the river. */
const HOUSE_SPOTS = [
  { tx: 16, tz: 16 },
  { tx: 24, tz: 11 },
  { tx: 13, tz: 38 },
  { tx: 24, tz: 45 },
  { tx: 49, tz: 20 },
  { tx: 50, tz: 41 },
] as const;

export const MAX_HOUSES = HOUSE_SPOTS.length;

/** Plots for players' houses. Each playable character gets the lowest free one. */
const PLOT_SPOTS = [
  { tx: 29, tz: 17 },
  { tx: 34, tz: 17 },
  { tx: 30, tz: 40 },
  { tx: 19, tz: 39 },
  { tx: 10, tz: 24 },
  { tx: 12, tz: 19 },
  { tx: 18, tz: 47 },
  { tx: 46, tz: 26 },
] as const;

export const PLOT_COUNT = PLOT_SPOTS.length;

export const plotId = (index: number) => `plot-${index}`;
