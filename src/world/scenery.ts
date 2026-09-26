import * as THREE from 'three';
import { FOUNTAIN_TILE, HOUSE_SIZE, type HouseSite, type IslandMap, MAP_SIZE, type Prop, Tile, mulberry32, tileCenter } from './map';

export const WATER_Y = -0.22;
const RIVERBED_Y = -0.5;
const GROUND_DEPTH = 1.5;

const TILE_COLORS: Record<Tile, [string, string]> = {
  [Tile.Ocean]: ['#5fc0e8', '#5fc0e8'],
  [Tile.Sand]: ['#f3e2b3', '#efdcaa'],
  [Tile.Grass]: ['#8fd16f', '#86c966'],
  [Tile.Path]: ['#d9c28f', '#d3bb87'],
  [Tile.River]: ['#c9b27f', '#c9b27f'],
  [Tile.Bridge]: ['#c9b27f', '#c9b27f'],
  [Tile.Plaza]: ['#e6d3a3', '#dcc896'],
};

/** Colors used by both the 3D scenery and the minimap. */
export function tileColor(t: Tile, tx: number, tz: number): string {
  return TILE_COLORS[t][(tx + tz) % 2];
}

const lambert = (color: string) => new THREE.MeshLambertMaterial({ color });

/** One InstancedMesh placed at a list of transforms, with optional per-instance colors. */
function instanced(
  geometry: THREE.BufferGeometry,
  material: THREE.Material,
  items: { matrix: THREE.Matrix4; color?: string }[],
  castShadow = true,
): THREE.InstancedMesh {
  const mesh = new THREE.InstancedMesh(geometry, material, Math.max(items.length, 1));
  mesh.count = items.length;
  const color = new THREE.Color();
  items.forEach((item, i) => {
    mesh.setMatrixAt(i, item.matrix);
    if (item.color) mesh.setColorAt(i, color.set(item.color));
  });
  mesh.castShadow = castShadow;
  mesh.receiveShadow = true;
  return mesh;
}

function transform(x: number, y: number, z: number, sx = 1, sy = 1, sz = 1, rotY = 0): THREE.Matrix4 {
  return new THREE.Matrix4().compose(
    new THREE.Vector3(x, y, z),
    new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rotY),
    new THREE.Vector3(sx, sy, sz),
  );
}

export interface HouseStyle {
  owner: string;
  roofColor: string;
}

/** Builds all static scenery: ground, water, bridges, trees, rocks, flowers, houses, fountain. */
export function buildScenery(map: IslandMap, styles: readonly HouseStyle[]): THREE.Group {
  const group = new THREE.Group();
  const rand = mulberry32(7);

  const water = new THREE.Mesh(new THREE.PlaneGeometry(MAP_SIZE * 4, MAP_SIZE * 4), lambert('#5fc0e8'));
  water.rotation.x = -Math.PI / 2;
  water.position.y = WATER_Y;
  water.receiveShadow = true;
  group.add(water);

  // Ground: one box per land tile, top flush with y = 0 (riverbeds sit lower).
  const ground: { matrix: THREE.Matrix4; color: string }[] = [];
  const planks: { matrix: THREE.Matrix4 }[] = [];
  const rails: { matrix: THREE.Matrix4 }[] = [];
  for (let tz = 0; tz < MAP_SIZE; tz++) {
    for (let tx = 0; tx < MAP_SIZE; tx++) {
      const t = map.tileAt(tx, tz);
      if (t === Tile.Ocean) continue;
      const { x, z } = tileCenter(tx, tz);
      const wet = t === Tile.River || t === Tile.Bridge;
      const top = wet ? RIVERBED_Y : 0;
      ground.push({ matrix: transform(x, top - GROUND_DEPTH / 2, z, 1, GROUND_DEPTH, 1), color: tileColor(t, tx, tz) });
      if (t === Tile.Bridge) {
        planks.push({ matrix: transform(x, 0.02, z, 1, 0.1, 1) });
        // Rails along any edge that faces open river.
        for (const [dx, dz] of [[0, -1], [0, 1], [-1, 0], [1, 0]]) {
          if (map.tileAt(tx + dx, tz + dz) !== Tile.River) continue;
          const alongX = dz !== 0;
          rails.push({
            matrix: transform(x + dx * 0.45, 0.25, z + dz * 0.45, alongX ? 1 : 0.1, 0.35, alongX ? 0.1 : 1),
          });
        }
      }
    }
  }
  group.add(instanced(new THREE.BoxGeometry(1, 1, 1), lambert('#ffffff'), ground, false));
  group.add(instanced(new THREE.BoxGeometry(1, 1, 1), lambert('#a0703f'), planks));
  group.add(instanced(new THREE.BoxGeometry(1, 1, 1), lambert('#8b5e3c'), rails));

  // Props.
  const byKind: Record<Prop, THREE.Vector3[]> = { tree: [], rock: [], flower: [] };
  for (const [index, prop] of map.props) {
    const tx = index % MAP_SIZE;
    const tz = Math.floor(index / MAP_SIZE);
    const { x, z } = tileCenter(tx, tz);
    byKind[prop].push(new THREE.Vector3(x, 0, z));
  }

  const trunks: { matrix: THREE.Matrix4 }[] = [];
  const canopy: { matrix: THREE.Matrix4; color: string }[] = [];
  const leafColors = ['#4caf50', '#43a047', '#5cb85c', '#3e9b46'];
  for (const p of byKind.tree) {
    const s = 0.85 + rand() * 0.35;
    const color = leafColors[Math.floor(rand() * leafColors.length)];
    trunks.push({ matrix: transform(p.x, 0.45 * s, p.z, s, s, s) });
    canopy.push({ matrix: transform(p.x, 1.15 * s, p.z, 0.75 * s, 0.7 * s, 0.75 * s), color });
    canopy.push({ matrix: transform(p.x, 1.65 * s, p.z, 0.55 * s, 0.5 * s, 0.55 * s), color });
  }
  group.add(instanced(new THREE.CylinderGeometry(0.1, 0.14, 0.9, 8), lambert('#8b5e3c'), trunks));
  group.add(instanced(new THREE.SphereGeometry(1, 14, 10), lambert('#ffffff'), canopy));

  const rocks = byKind.rock.map((p) => ({
    matrix: transform(p.x, 0.12, p.z, 0.4, 0.3, 0.35, rand() * Math.PI),
  }));
  group.add(instanced(new THREE.DodecahedronGeometry(1, 0), lambert('#9aa0a6'), rocks));

  const blooms: { matrix: THREE.Matrix4; color: string }[] = [];
  const bloomColors = ['#ff8fb1', '#f1c40f', '#ffffff', '#e74c3c', '#9b59b6', '#ff9f43'];
  for (const p of byKind.flower) {
    const color = bloomColors[Math.floor(rand() * bloomColors.length)];
    for (let i = 0; i < 3; i++) {
      blooms.push({
        matrix: transform(p.x + (rand() - 0.5) * 0.6, 0.08, p.z + (rand() - 0.5) * 0.6, 0.08, 0.08, 0.08),
        color,
      });
    }
  }
  group.add(instanced(new THREE.SphereGeometry(1, 8, 6), lambert('#ffffff'), blooms, false));

  for (const house of map.houses) {
    const style = styles.find((s) => s.owner === house.owner);
    group.add(buildHouse(house, { roof: style?.roofColor ?? '#c0392b', walls: '#fff4dc', door: '#8b5e3c' }));
  }
  group.add(buildFountain());
  return group;
}

export interface HouseColors {
  roof: string;
  walls: string;
  door: string;
}

export function buildHouse({ tx, tz }: HouseSite, colors: HouseColors): THREE.Group {
  const roofColor = colors.roof;
  const house = new THREE.Group();
  const center = tileCenter(tx + (HOUSE_SIZE - 1) / 2, tz + (HOUSE_SIZE - 1) / 2);
  house.position.set(center.x, 0, center.z);

  const add = (mesh: THREE.Mesh, x: number, y: number, z: number) => {
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    house.add(mesh);
    return mesh;
  };
  add(new THREE.Mesh(new THREE.BoxGeometry(2.6, 1.6, 2.6), lambert(colors.walls)), 0, 0.8, 0);
  const roof = add(new THREE.Mesh(new THREE.ConeGeometry(2.3, 1.3, 4), lambert(roofColor)), 0, 2.25, 0);
  roof.rotation.y = Math.PI / 4;
  add(new THREE.Mesh(new THREE.BoxGeometry(0.6, 1, 0.08), lambert(colors.door)), 0, 0.5, 1.31);
  add(new THREE.Mesh(new THREE.SphereGeometry(0.04, 8, 6), lambert('#f1c40f')), 0.18, 0.5, 1.37);
  for (const side of [-1, 1]) {
    add(new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.45, 0.06), lambert('#a8dcf0')), side * 0.8, 0.95, 1.31);
  }
  // Mailbox beside the door.
  add(new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.6, 6), lambert('#8b5e3c')), 1.05, 0.3, 1.75);
  add(new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.18, 0.3), lambert(roofColor)), 1.05, 0.66, 1.75);
  return house;
}

/** An empty plot: a dirt patch, a low fence, and a sign. */
export function buildEmptyLot({ tx, tz }: HouseSite): THREE.Group {
  const lot = new THREE.Group();
  const center = tileCenter(tx + (HOUSE_SIZE - 1) / 2, tz + (HOUSE_SIZE - 1) / 2);
  lot.position.set(center.x, 0, center.z);
  const add = (mesh: THREE.Mesh, x: number, y: number, z: number) => {
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    lot.add(mesh);
    return mesh;
  };
  add(new THREE.Mesh(new THREE.BoxGeometry(2.9, 0.03, 2.9), lambert('#c9a66b')), 0, 0.015, 0).castShadow = false;
  const post = new THREE.CylinderGeometry(0.05, 0.05, 0.5, 6);
  const wood = lambert('#a0703f');
  for (let i = 0; i <= 6; i++) {
    const t = -1.4 + (i * 2.8) / 6;
    for (const [x, z] of [[t, -1.4], [t, 1.4], [-1.4, t], [1.4, t]]) add(new THREE.Mesh(post, wood), x, 0.25, z);
  }
  for (const [x, z, sx, sz] of [[0, -1.4, 2.8, 0.05], [0, 1.4, 2.8, 0.05], [-1.4, 0, 0.05, 2.8], [1.4, 0, 0.05, 2.8]]) {
    add(new THREE.Mesh(new THREE.BoxGeometry(sx, 0.06, sz), wood), x, 0.38, z);
  }
  add(new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1, 6), wood), 0, 0.5, 1.1);
  add(new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.45, 0.06), lambert('#fff4dc')), 0, 0.95, 1.14);
  return lot;
}

function buildFountain(): THREE.Group {
  const f = new THREE.Group();
  const c = tileCenter(FOUNTAIN_TILE.tx, FOUNTAIN_TILE.tz);
  f.position.set(c.x + 0.5, 0, c.z + 0.5);
  const stone = lambert('#c8c8c8');
  const water = lambert('#7fd3f5');
  const parts: [THREE.BufferGeometry, THREE.Material, number][] = [
    [new THREE.CylinderGeometry(0.95, 1, 0.35, 24), stone, 0.175],
    [new THREE.CylinderGeometry(0.82, 0.82, 0.05, 24), water, 0.33],
    [new THREE.CylinderGeometry(0.12, 0.16, 0.8, 12), stone, 0.6],
    [new THREE.CylinderGeometry(0.4, 0.15, 0.18, 16), stone, 1.0],
    [new THREE.CylinderGeometry(0.32, 0.32, 0.04, 16), water, 1.08],
    [new THREE.SphereGeometry(0.1, 12, 8), water, 1.2],
  ];
  for (const [geometry, material, y] of parts) {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.y = y;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    f.add(mesh);
  }
  return f;
}
