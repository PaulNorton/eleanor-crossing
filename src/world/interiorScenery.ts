import * as THREE from 'three';
import { type FloorStyle } from '../home/home';
import { DARK_WOOD, DEFAULT_COLORS, type FurnitureKind, type Furnishing, ROOM_DEPTH, ROOM_WIDTH, type Room, WALL_HEIGHT, WOOD } from './interior';

export interface RoomColors {
  /** Color for beds, sofas, rugs, and armchairs that have none of their own. */
  accent: string;
  wall: string;
  floor: string;
  floorStyle: FloorStyle;
}

export function shade(hex: string, amount: number): string {
  const c = new THREE.Color(hex);
  const hsl = { h: 0, s: 0, l: 0 };
  c.getHSL(hsl);
  return `#${c.setHSL(hsl.h, hsl.s, THREE.MathUtils.clamp(hsl.l + amount, 0, 1)).getHexString()}`;
}

/** Adds boxes, cylinders, and spheres to a group with shared shadow settings. */
class Builder {
  constructor(readonly group: THREE.Group) {}

  private add(geometry: THREE.BufferGeometry, color: string, x: number, y: number, z: number): THREE.Mesh {
    const mesh = new THREE.Mesh(geometry, new THREE.MeshLambertMaterial({ color }));
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.group.add(mesh);
    return mesh;
  }

  /** A box sitting with its bottom at `y`. */
  box(w: number, h: number, d: number, color: string, x = 0, y = 0, z = 0): THREE.Mesh {
    return this.add(new THREE.BoxGeometry(w, h, d), color, x, y + h / 2, z);
  }

  cylinder(rTop: number, rBottom: number, h: number, color: string, x = 0, y = 0, z = 0): THREE.Mesh {
    return this.add(new THREE.CylinderGeometry(rTop, rBottom, h, 16), color, x, y + h / 2, z);
  }

  sphere(r: number, color: string, x = 0, y = 0, z = 0): THREE.Mesh {
    return this.add(new THREE.SphereGeometry(r, 16, 12), color, x, y, z);
  }
}

function glow(mesh: THREE.Mesh, color: string): void {
  (mesh.material as THREE.MeshLambertMaterial).emissive.set(color);
}

/** Each builder draws one piece centered on the origin, facing +z. `c` is its main color. */
const BUILDERS: Record<FurnitureKind, (b: Builder, c: string) => void> = {
  bed: (b, c) => {
    b.box(1.3, 0.3, 2.0, WOOD);
    b.box(1.35, 0.7, 0.12, DARK_WOOD, 0, 0, -0.96);
    b.box(1.2, 0.18, 1.9, '#ffffff', 0, 0.3, 0);
    b.box(1.24, 0.08, 1.25, c, 0, 0.46, 0.3);
    b.box(0.7, 0.14, 0.35, '#fdfdfd', 0, 0.48, -0.65);
  },
  bookshelf: (b, c) => {
    // A shallow back panel with shelves, so the books show from the front.
    b.box(1.4, 1.7, 0.12, c, 0, 0, -0.14);
    for (const side of [-1, 1]) b.box(0.06, 1.7, 0.4, c, side * 0.67, 0, 0);
    for (let shelf = 0; shelf < 4; shelf++) b.box(1.34, 0.05, 0.4, shade(c, -0.1), 0, shelf * 0.53 + 0.05, 0);
    const books = ['#e74c3c', '#3498db', '#f1c40f', '#2ecc71', '#9b59b6', '#e67e22'];
    for (let shelf = 0; shelf < 3; shelf++) {
      for (let i = 0; i < 6; i++) {
        const h = 0.3 + ((i * 7 + shelf * 3) % 4) * 0.03;
        b.box(0.16, h, 0.28, books[(i + shelf) % books.length], -0.5 + i * 0.2, 0.1 + shelf * 0.53, 0.02);
      }
    }
  },
  table: (b, c) => {
    b.cylinder(0.55, 0.55, 0.08, c, 0, 0.62);
    b.cylinder(0.08, 0.14, 0.62, shade(c, -0.12));
  },
  chair: (b, c) => {
    b.box(0.45, 0.08, 0.45, WOOD, 0, 0.38);
    b.box(0.4, 0.05, 0.4, c, 0, 0.46);
    b.box(0.45, 0.5, 0.08, WOOD, 0, 0.46, -0.19);
    for (const [x, z] of [[-0.18, -0.18], [0.18, -0.18], [-0.18, 0.18], [0.18, 0.18]]) {
      b.box(0.06, 0.38, 0.06, DARK_WOOD, x, 0, z);
    }
  },
  plant: (b, c) => {
    b.cylinder(0.2, 0.15, 0.35, c);
    b.sphere(0.32, '#4caf50', 0, 0.62, 0);
    b.sphere(0.2, '#5cb85c', 0.12, 0.88, 0.05);
  },
  lamp: (b, c) => {
    b.cylinder(0.15, 0.18, 0.05, DARK_WOOD);
    b.cylinder(0.03, 0.03, 1.1, DARK_WOOD, 0, 0.05);
    glow(b.cylinder(0.12, 0.22, 0.28, c, 0, 1.1), shade(c, -0.25));
  },
  sofa: (b, c) => {
    b.box(2.0, 0.4, 0.8, c);
    b.box(2.0, 0.5, 0.22, shade(c, -0.1), 0, 0.4, -0.29);
    for (const side of [-1, 1]) b.box(0.22, 0.28, 0.8, shade(c, -0.1), side * 0.89, 0.4, 0);
  },
  dresser: (b, c) => {
    b.box(1.2, 0.9, 0.5, c);
    for (let i = 0; i < 3; i++) {
      b.box(1.05, 0.22, 0.03, shade(c, 0.08), 0, 0.1 + i * 0.27, 0.25);
      b.sphere(0.03, '#f1c40f', 0, 0.21 + i * 0.27, 0.28);
    }
  },
  rug: (b, c) => {
    const rug = b.cylinder(1, 1, 0.02, c);
    rug.scale.set(1.5, 1, 1.1);
    rug.castShadow = false;
  },
  armchair: (b, c) => {
    b.box(0.9, 0.38, 0.8, c);
    b.box(0.9, 0.5, 0.2, shade(c, -0.1), 0, 0.38, -0.3);
    for (const side of [-1, 1]) b.box(0.16, 0.26, 0.8, shade(c, -0.1), side * 0.37, 0.38, 0);
  },
  tv: (b, c) => {
    b.box(1.1, 0.45, 0.45, c);
    b.box(0.9, 0.55, 0.06, '#2b2b2b', 0, 0.45, -0.05);
    glow(b.box(0.82, 0.47, 0.02, '#3b6ea5', 0, 0.49, -0.01), '#1d3b5c');
  },
  clock: (b, c) => {
    b.box(0.45, 1.8, 0.35, c);
    b.cylinder(0.17, 0.17, 0.03, '#fdf6e3', 0, 1.35, 0.17).rotation.x = Math.PI / 2;
    b.box(0.02, 0.12, 0.01, '#2b2b2b', 0, 1.35, 0.19);
    b.box(0.06, 0.4, 0.02, '#f1c40f', 0, 0.5, 0.18);
  },
  fishtank: (b, c) => {
    b.box(1.0, 0.55, 0.5, c);
    const water = b.box(0.94, 0.45, 0.44, '#7fd3f5', 0, 0.55, 0);
    const m = water.material as THREE.MeshLambertMaterial;
    m.transparent = true;
    m.opacity = 0.6;
    water.castShadow = false;
    b.sphere(0.05, '#ff8c42', -0.2, 0.8, 0.05).scale.set(1.6, 1, 0.6);
    b.sphere(0.05, '#f1c40f', 0.18, 0.72, -0.05).scale.set(1.6, 1, 0.6);
  },
  desk: (b, c) => {
    b.box(1.3, 0.06, 0.6, c, 0, 0.7);
    for (const side of [-1, 1]) b.box(0.08, 0.7, 0.56, shade(c, -0.12), side * 0.6, 0, 0);
    b.box(0.3, 0.02, 0.22, '#ffffff', -0.25, 0.76, 0.05);
    b.cylinder(0.05, 0.05, 0.1, '#e74c3c', 0.35, 0.76, -0.1);
  },
};

/** Pieces that take the room's accent color when they have no color of their own. */
const ACCENTED: ReadonlySet<FurnitureKind> = new Set(['bed', 'sofa', 'rug', 'armchair']);

export function buildFurnishing(f: Furnishing, fallbackColor?: string): THREE.Group {
  const group = new THREE.Group();
  BUILDERS[f.kind](new Builder(group), f.color ?? fallbackColor ?? DEFAULT_COLORS[f.kind]);
  group.position.set(f.x, 0, f.z);
  group.rotation.y = ((f.turns ?? 0) * Math.PI) / 2;
  return group;
}

/** Tints a piece to show it is selected (or held, or can't go here). Pass null to clear. */
export function tintFurnishing(group: THREE.Object3D, color: string | null): void {
  group.traverse((o) => {
    if (!(o instanceof THREE.Mesh)) return;
    const m = o.material as THREE.MeshLambertMaterial;
    m.userData.baseEmissive ??= m.emissive.getHex();
    if (color) m.emissive.set(color);
    else m.emissive.setHex(m.userData.baseEmissive as number);
  });
}

function buildFloor(b: Builder, colors: RoomColors): void {
  const hw = ROOM_WIDTH / 2;
  const hd = ROOM_DEPTH / 2;
  b.box(ROOM_WIDTH, 0.2, ROOM_DEPTH, colors.floor, 0, -0.2, 0).castShadow = false;
  const line = (w: number, d: number, x: number, z: number, color: string) => {
    b.box(w, 0.005, d, color, x, 0, z).castShadow = false;
  };
  switch (colors.floorStyle) {
    case 'wood':
      for (let i = 1; i < ROOM_WIDTH; i++) line(0.02, ROOM_DEPTH, -hw + i, 0, shade(colors.floor, -0.08));
      break;
    case 'tile':
      for (let i = 1; i < ROOM_WIDTH; i++) line(0.03, ROOM_DEPTH, -hw + i, 0, shade(colors.floor, -0.12));
      for (let j = 1; j < ROOM_DEPTH; j++) line(ROOM_WIDTH, 0.03, 0, -hd + j, shade(colors.floor, -0.12));
      break;
    case 'checker':
      for (let i = 0; i < ROOM_WIDTH; i++) {
        for (let j = 0; j < ROOM_DEPTH; j++) {
          if ((i + j) % 2) line(1, 1, -hw + i + 0.5, -hd + j + 0.5, shade(colors.floor, -0.18));
        }
      }
      break;
    case 'carpet':
      break;
  }
}

/** A dollhouse-style room: floor, three walls, a doormat, and furniture. No front wall, so the camera sees in. */
export function buildRoom(room: Room, colors: RoomColors): { group: THREE.Group; pieces: THREE.Group[] } {
  const group = new THREE.Group();
  const b = new Builder(group);
  const hw = ROOM_WIDTH / 2;
  const hd = ROOM_DEPTH / 2;

  buildFloor(b, colors);
  b.box(ROOM_WIDTH + 0.4, WALL_HEIGHT, 0.2, colors.wall, 0, -0.2, -hd - 0.1);
  for (const side of [-1, 1]) b.box(0.2, WALL_HEIGHT, ROOM_DEPTH, colors.wall, side * (hw + 0.1), -0.2, 0);
  // Baseboards and a window on the back wall.
  b.box(ROOM_WIDTH, 0.15, 0.04, DARK_WOOD, 0, 0, -hd + 0.02);
  b.box(1.6, 1.0, 0.05, '#ffffff', 0, 1.0, -hd + 0.02);
  b.box(1.45, 0.85, 0.06, '#a8dcf0', 0, 1.075, -hd + 0.03);
  b.box(1.4, 0.02, 0.6, '#c0392b', 0, 0, hd - 0.35).castShadow = false;

  const pieces = room.furniture.map((f, i) => {
    const piece = buildFurnishing(f, ACCENTED.has(f.kind) ? colors.accent : undefined);
    piece.userData.furnitureIndex = i;
    group.add(piece);
    return piece;
  });
  return { group, pieces };
}

/** Room colors for a villager, derived from their house color. */
export function villagerRoomColors(accent: string): RoomColors {
  return { accent, wall: shade(accent, 0.32), floor: '#d9b384', floorStyle: 'wood' };
}
