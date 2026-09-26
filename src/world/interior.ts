// House interiors: room size, furniture layout, and collision. Pure data with
// no rendering. Rooms use their own coordinates, centered on the origin, with
// the back wall at -z and the open front (where the camera sits) at +z.

import type { Point } from './map';
import type { Personality } from './npcs';

export const ROOM_WIDTH = 8;
export const ROOM_DEPTH = 7;
export const WALL_HEIGHT = 2.6;

/** Walking onto this part of the floor, near the front middle, leaves the house. */
const DOORMAT = { halfWidth: 0.7, depth: 0.7 };

export type FurnitureKind = 'bed' | 'bookshelf' | 'table' | 'chair' | 'plant' | 'lamp' | 'sofa' | 'dresser' | 'rug';

/** Footprints in room units: [width along x, depth along z] before rotation. */
export const FOOTPRINTS: Record<FurnitureKind, [number, number]> = {
  bed: [1.3, 2.0],
  bookshelf: [1.4, 0.4],
  table: [1.1, 1.1],
  chair: [0.5, 0.5],
  plant: [0.5, 0.5],
  lamp: [0.4, 0.4],
  sofa: [2.0, 0.8],
  dresser: [1.2, 0.5],
  rug: [3.0, 2.2],
};

/** Rugs lie flat; everything else blocks walking. */
const WALKABLE: ReadonlySet<FurnitureKind> = new Set(['rug']);

export interface Furnishing {
  kind: FurnitureKind;
  x: number;
  z: number;
  /** Quarter turns (0-3). Turn 0 faces +z, toward the camera. */
  turns?: number;
}

interface Layout {
  furniture: Furnishing[];
  /** Where the owner stands when you walk in. */
  ownerSpot: Point;
}

const LAYOUTS: Record<'cozy' | 'lounge' | 'study', Layout> = {
  cozy: {
    furniture: [
      { kind: 'rug', x: 0, z: 0 },
      { kind: 'bed', x: -2.9, z: -2.3 },
      { kind: 'lamp', x: -1.8, z: -3.0 },
      { kind: 'bookshelf', x: 1.4, z: -3.2 },
      { kind: 'plant', x: 3.4, z: -3.0 },
      { kind: 'table', x: 2.2, z: 0.2 },
      { kind: 'chair', x: 2.2, z: -0.75, turns: 2 },
      { kind: 'chair', x: 3.15, z: 0.2, turns: 1 },
    ],
    ownerSpot: { x: 0.2, z: -1.0 },
  },
  lounge: {
    furniture: [
      { kind: 'rug', x: 0, z: -0.6 },
      { kind: 'sofa', x: 0, z: -3.0 },
      { kind: 'table', x: 0, z: -1.2 },
      { kind: 'plant', x: -3.4, z: -3.0 },
      { kind: 'plant', x: 3.4, z: -3.0 },
      { kind: 'bed', x: 3.1, z: 0.4 },
      { kind: 'bookshelf', x: -3.6, z: -0.2, turns: 1 },
      { kind: 'lamp', x: -1.5, z: -3.1 },
    ],
    ownerSpot: { x: -1.2, z: 0.3 },
  },
  study: {
    furniture: [
      { kind: 'rug', x: -0.4, z: 0.2 },
      { kind: 'bed', x: 2.9, z: -2.3 },
      { kind: 'dresser', x: -2.6, z: -3.1 },
      { kind: 'bookshelf', x: -0.7, z: -3.2 },
      { kind: 'lamp', x: 1.8, z: -3.0 },
      { kind: 'table', x: -2.4, z: 0.3 },
      { kind: 'chair', x: -2.4, z: 1.2 },
      { kind: 'chair', x: -3.35, z: 0.3, turns: 3 },
      { kind: 'plant', x: 3.4, z: 1.2 },
    ],
    ownerSpot: { x: 0.8, z: -0.8 },
  },
};

const LAYOUT_BY_PERSONALITY: Record<Personality, keyof typeof LAYOUTS> = {
  cheerful: 'cozy',
  sweet: 'cozy',
  lazy: 'lounge',
  sporty: 'lounge',
  smart: 'study',
  grumpy: 'study',
};

export interface Rect {
  x: number;
  z: number;
  w: number;
  d: number;
}

export function footprint(f: Furnishing): Rect {
  const [w, d] = FOOTPRINTS[f.kind];
  const sideways = (f.turns ?? 0) % 2 === 1;
  return { x: f.x, z: f.z, w: sideways ? d : w, d: sideways ? w : d };
}

function circleHitsRect(x: number, z: number, r: number, rect: Rect): boolean {
  const nx = Math.max(rect.x - rect.w / 2, Math.min(x, rect.x + rect.w / 2));
  const nz = Math.max(rect.z - rect.d / 2, Math.min(z, rect.z + rect.d / 2));
  return (nx - x) ** 2 + (nz - z) ** 2 < r * r;
}

export class Room {
  readonly furniture: readonly Furnishing[];
  readonly ownerSpot: Point;
  /** Where the player appears after walking in. */
  readonly entrance: Point = { x: 0, z: ROOM_DEPTH / 2 - 1.2 };
  private readonly solids: Rect[];

  constructor(personality: Personality) {
    const layout = LAYOUTS[LAYOUT_BY_PERSONALITY[personality]];
    this.furniture = layout.furniture;
    this.ownerSpot = layout.ownerSpot;
    this.solids = layout.furniture.filter((f) => !WALKABLE.has(f.kind)).map(footprint);
  }

  canStand(x: number, z: number, radius: number): boolean {
    const hw = ROOM_WIDTH / 2 - radius;
    const hd = ROOM_DEPTH / 2 - radius;
    if (x < -hw || x > hw || z < -hd || z > hd) return false;
    return !this.solids.some((rect) => circleHitsRect(x, z, radius, rect));
  }

  /** Is this spot on the doormat, where walking toward the camera leaves? */
  onDoormat(x: number, z: number): boolean {
    return Math.abs(x) < DOORMAT.halfWidth && z > ROOM_DEPTH / 2 - DOORMAT.depth;
  }
}
