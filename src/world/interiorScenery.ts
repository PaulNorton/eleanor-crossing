import * as THREE from 'three';
import { type FurnitureKind, type Furnishing, ROOM_DEPTH, ROOM_WIDTH, type Room, WALL_HEIGHT } from './interior';

export interface RoomColors {
  /** The owner's color: used for the bedding, sofa, and rug. */
  accent: string;
  wall: string;
  floor: string;
}

const WOOD = '#a0703f';
const DARK_WOOD = '#7a5230';

function shade(hex: string, amount: number): string {
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

const BUILDERS: Record<FurnitureKind, (b: Builder, accent: string) => void> = {
  bed: (b, accent) => {
    b.box(1.3, 0.3, 2.0, WOOD);
    b.box(1.35, 0.7, 0.12, DARK_WOOD, 0, 0, -0.96);
    b.box(1.2, 0.18, 1.9, '#ffffff', 0, 0.3, 0);
    b.box(1.24, 0.08, 1.25, accent, 0, 0.46, 0.3);
    b.box(0.7, 0.14, 0.35, '#fdfdfd', 0, 0.48, -0.65);
  },
  bookshelf: (b) => {
    // A shallow back panel with shelves, so the books show from the front.
    b.box(1.4, 1.7, 0.12, WOOD, 0, 0, -0.14);
    for (const side of [-1, 1]) b.box(0.06, 1.7, 0.4, WOOD, side * 0.67, 0, 0);
    for (let shelf = 0; shelf < 4; shelf++) b.box(1.34, 0.05, 0.4, DARK_WOOD, 0, shelf * 0.53 + 0.05, 0);
    const books = ['#e74c3c', '#3498db', '#f1c40f', '#2ecc71', '#9b59b6', '#e67e22'];
    for (let shelf = 0; shelf < 3; shelf++) {
      for (let i = 0; i < 6; i++) {
        const h = 0.3 + ((i * 7 + shelf * 3) % 4) * 0.03;
        b.box(0.16, h, 0.28, books[(i + shelf) % books.length], -0.5 + i * 0.2, 0.1 + shelf * 0.53, 0.02);
      }
    }
  },
  table: (b) => {
    b.cylinder(0.55, 0.55, 0.08, WOOD, 0, 0.62);
    b.cylinder(0.08, 0.14, 0.62, DARK_WOOD);
  },
  chair: (b) => {
    b.box(0.45, 0.08, 0.45, WOOD, 0, 0.38);
    b.box(0.45, 0.5, 0.08, WOOD, 0, 0.46, -0.19);
    for (const [x, z] of [[-0.18, -0.18], [0.18, -0.18], [-0.18, 0.18], [0.18, 0.18]]) {
      b.box(0.06, 0.38, 0.06, DARK_WOOD, x, 0, z);
    }
  },
  plant: (b) => {
    b.cylinder(0.2, 0.15, 0.35, '#c96f4a');
    b.sphere(0.32, '#4caf50', 0, 0.62, 0);
    b.sphere(0.2, '#5cb85c', 0.12, 0.88, 0.05);
  },
  lamp: (b) => {
    b.cylinder(0.15, 0.18, 0.05, DARK_WOOD);
    b.cylinder(0.03, 0.03, 1.1, DARK_WOOD, 0, 0.05);
    const shade = b.cylinder(0.12, 0.22, 0.28, '#fff3c4', 0, 1.1);
    (shade.material as THREE.MeshLambertMaterial).emissive.set('#fff0b0');
  },
  sofa: (b, accent) => {
    b.box(2.0, 0.4, 0.8, accent);
    b.box(2.0, 0.5, 0.22, shade(accent, -0.1), 0, 0.4, -0.29);
    for (const side of [-1, 1]) b.box(0.22, 0.28, 0.8, shade(accent, -0.1), side * 0.89, 0.4, 0);
  },
  dresser: (b) => {
    b.box(1.2, 0.9, 0.5, WOOD);
    for (let i = 0; i < 3; i++) {
      b.box(1.05, 0.22, 0.03, '#b98450', 0, 0.1 + i * 0.27, 0.25);
      b.sphere(0.03, '#f1c40f', 0, 0.21 + i * 0.27, 0.28);
    }
  },
  rug: (b, accent) => {
    const rug = b.cylinder(1, 1, 0.02, shade(accent, 0.2));
    rug.scale.set(1.5, 1, 1.1);
    rug.castShadow = false;
  },
};

function buildFurnishing(f: Furnishing, accent: string): THREE.Group {
  const group = new THREE.Group();
  BUILDERS[f.kind](new Builder(group), accent);
  group.position.set(f.x, 0, f.z);
  group.rotation.y = ((f.turns ?? 0) * Math.PI) / 2;
  return group;
}

/** A dollhouse-style room: floor, three walls, a doormat, and furniture. No front wall, so the camera sees in. */
export function buildRoom(room: Room, colors: RoomColors): THREE.Group {
  const group = new THREE.Group();
  const b = new Builder(group);
  const hw = ROOM_WIDTH / 2;
  const hd = ROOM_DEPTH / 2;

  const floor = b.box(ROOM_WIDTH, 0.2, ROOM_DEPTH, colors.floor, 0, -0.2, 0);
  floor.castShadow = false;
  // Floorboards.
  for (let i = 1; i < 8; i++) {
    b.box(0.02, 0.005, ROOM_DEPTH, shade(colors.floor, -0.08), -hw + i, 0, 0).castShadow = false;
  }

  b.box(ROOM_WIDTH + 0.4, WALL_HEIGHT, 0.2, colors.wall, 0, -0.2, -hd - 0.1);
  for (const side of [-1, 1]) b.box(0.2, WALL_HEIGHT, ROOM_DEPTH, colors.wall, side * (hw + 0.1), -0.2, 0);
  // Baseboards and a window on the back wall.
  b.box(ROOM_WIDTH, 0.15, 0.04, DARK_WOOD, 0, 0, -hd + 0.02);
  b.box(1.6, 1.0, 0.05, '#ffffff', 0, 1.0, -hd + 0.02);
  b.box(1.45, 0.85, 0.06, '#a8dcf0', 0, 1.075, -hd + 0.03);

  const mat = b.box(1.4, 0.02, 0.6, '#c0392b', 0, 0, hd - 0.35);
  mat.castShadow = false;

  for (const f of room.furniture) group.add(buildFurnishing(f, colors.accent));
  return group;
}

export function roomColors(accent: string): RoomColors {
  return { accent, wall: shade(accent, 0.32), floor: '#d9b384' };
}
