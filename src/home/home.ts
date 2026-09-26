// A player's house: which plot it sits on, its outside colors, and its room.
// Plain JSON so the server stores and checks it with the same code.

import { DEFAULT_COLORS, FURNITURE_KINDS, type FurnitureKind, type Furnishing, canPlace } from '../world/interior';

export const FLOOR_STYLES = ['wood', 'tile', 'checker', 'carpet'] as const;
export type FloorStyle = (typeof FLOOR_STYLES)[number];

export const MAX_FURNITURE = 40;

export interface HomeExterior {
  roof: string;
  walls: string;
  door: string;
}

export interface HomeInterior {
  wallpaper: string;
  floorStyle: FloorStyle;
  floorColor: string;
  furniture: Furnishing[];
}

export interface Home {
  characterId: string;
  /** Index into the island's player plots. The server assigns it. */
  plot: number;
  exterior: HomeExterior;
  interior: HomeInterior;
  updatedAt: string;
}

export interface CatalogEntry {
  kind: FurnitureKind;
  label: string;
  icon: string;
}

export const CATALOG: readonly CatalogEntry[] = [
  { kind: 'bed', label: 'Bed', icon: '🛏️' },
  { kind: 'sofa', label: 'Sofa', icon: '🛋️' },
  { kind: 'armchair', label: 'Armchair', icon: '💺' },
  { kind: 'chair', label: 'Chair', icon: '🪑' },
  { kind: 'table', label: 'Table', icon: '🍽️' },
  { kind: 'desk', label: 'Desk', icon: '✏️' },
  { kind: 'dresser', label: 'Dresser', icon: '🗄️' },
  { kind: 'bookshelf', label: 'Bookshelf', icon: '📚' },
  { kind: 'tv', label: 'TV', icon: '📺' },
  { kind: 'lamp', label: 'Lamp', icon: '💡' },
  { kind: 'clock', label: 'Clock', icon: '🕰️' },
  { kind: 'fishtank', label: 'Fish tank', icon: '🐠' },
  { kind: 'plant', label: 'Plant', icon: '🪴' },
  { kind: 'rug', label: 'Rug', icon: '🟫' },
];

export const HOME_PALETTE = [
  '#e74c3c', '#f39c12', '#f1c40f', '#2ecc71', '#1abc9c', '#3498db', '#9b59b6', '#ff8fb1',
  '#ffffff', '#fff4dc', '#d9b384', '#a0703f', '#7a5230', '#9aa0a6', '#34495e', '#2b2b2b',
] as const;

/** Starter furniture for a new house. */
function starterFurniture(): Furnishing[] {
  return [
    { kind: 'rug', x: 0, z: -0.5, turns: 0, color: '#f7c6d9' },
    { kind: 'bed', x: -2.9, z: -2.3, turns: 0, color: '#3498db' },
    { kind: 'lamp', x: -1.8, z: -3, turns: 0, color: DEFAULT_COLORS.lamp },
    { kind: 'plant', x: 3.4, z: -3, turns: 0, color: DEFAULT_COLORS.plant },
  ];
}

export function defaultHome(characterId: string, plot: number, roof = '#e74c3c'): Home {
  return {
    characterId,
    plot,
    exterior: { roof, walls: '#fff4dc', door: '#8b5e3c' },
    interior: { wallpaper: '#fdf1d6', floorStyle: 'wood', floorColor: '#d9b384', furniture: starterFurniture() },
    updatedAt: new Date().toISOString(),
  };
}

/** The lowest plot not in `taken`, or null if all are used. */
export function freePlot(taken: Iterable<number>, count: number): number | null {
  const used = new Set(taken);
  for (let i = 0; i < count; i++) if (!used.has(i)) return i;
  return null;
}

const HEX = /^#[0-9a-f]{6}$/i;
const color = (v: unknown, fallback: string) => (typeof v === 'string' && HEX.test(v) ? v.toLowerCase() : fallback);
const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/** Coerces untrusted furniture into pieces that fit, in order. Pieces that don't fit are dropped. */
export function normalizeFurniture(raw: unknown): Furnishing[] {
  const placed: Furnishing[] = [];
  if (!Array.isArray(raw)) return placed;
  for (const item of raw.slice(0, MAX_FURNITURE)) {
    if (!item || typeof item !== 'object') continue;
    const r = item as Record<string, unknown>;
    if (!FURNITURE_KINDS.includes(r.kind as FurnitureKind) || !finite(r.x) || !finite(r.z)) continue;
    const kind = r.kind as FurnitureKind;
    const piece: Furnishing = {
      kind,
      x: Math.round(r.x * 100) / 100,
      z: Math.round(r.z * 100) / 100,
      turns: Number.isInteger(r.turns) ? (((r.turns as number) % 4) + 4) % 4 : 0,
      color: color(r.color, DEFAULT_COLORS[kind]),
    };
    if (canPlace(placed, piece)) placed.push(piece);
  }
  return placed;
}

/**
 * Coerces untrusted data into a Home. The caller supplies the id and plot,
 * which the client never gets to choose.
 */
export function normalizeHome(raw: unknown, characterId: string, plot: number): Home {
  const d = defaultHome(characterId, plot);
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const ext = (r.exterior && typeof r.exterior === 'object' ? r.exterior : {}) as Record<string, unknown>;
  const int = (r.interior && typeof r.interior === 'object' ? r.interior : {}) as Record<string, unknown>;
  return {
    characterId,
    plot,
    exterior: {
      roof: color(ext.roof, d.exterior.roof),
      walls: color(ext.walls, d.exterior.walls),
      door: color(ext.door, d.exterior.door),
    },
    interior: {
      wallpaper: color(int.wallpaper, d.interior.wallpaper),
      floorStyle: FLOOR_STYLES.includes(int.floorStyle as FloorStyle) ? (int.floorStyle as FloorStyle) : d.interior.floorStyle,
      floorColor: color(int.floorColor, d.interior.floorColor),
      furniture: 'furniture' in int ? normalizeFurniture(int.furniture) : d.interior.furniture,
    },
    updatedAt: typeof r.updatedAt === 'string' ? r.updatedAt : d.updatedAt,
  };
}
