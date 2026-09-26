// Character data model. Plain JSON-serializable data so it can move from
// localStorage to a server without changes.

export const SCHEMA_VERSION = 1;

export const SPECIES = ['human', 'cat', 'dog', 'bunny', 'bear', 'fox', 'frog'] as const;
export const EYE_STYLES = ['round', 'sleepy', 'sparkle', 'happy'] as const;
export const HAIR_STYLES = ['none', 'short', 'long', 'bun', 'spiky', 'pigtails'] as const;
export const HATS = ['none', 'cap', 'beanie', 'bow', 'flower', 'crown'] as const;

export type Species = (typeof SPECIES)[number];
export type EyeStyle = (typeof EYE_STYLES)[number];
export type HairStyle = (typeof HAIR_STYLES)[number];
export type Hat = (typeof HATS)[number];

export interface Appearance {
  species: Species;
  bodyColor: string;
  eyeStyle: EyeStyle;
  eyeColor: string;
  blush: boolean;
  hairStyle: HairStyle;
  hairColor: string;
  shirtColor: string;
  pantsColor: string;
  shoeColor: string;
  hat: Hat;
  hatColor: string;
}

export interface Character {
  schemaVersion: number;
  id: string;
  name: string;
  appearance: Appearance;
  createdAt: string;
  updatedAt: string;
}

export const LABELS: Record<Species | EyeStyle | HairStyle | Hat, string> = {
  human: 'Person',
  cat: 'Cat',
  dog: 'Dog',
  bunny: 'Bunny',
  bear: 'Bear',
  fox: 'Fox',
  frog: 'Frog',
  round: 'Round',
  sleepy: 'Sleepy',
  sparkle: 'Sparkle',
  happy: 'Happy',
  none: 'None',
  short: 'Short',
  long: 'Long',
  bun: 'Bun',
  spiky: 'Spiky',
  pigtails: 'Pigtails',
  cap: 'Cap',
  beanie: 'Beanie',
  bow: 'Bow',
  flower: 'Flower',
  crown: 'Crown',
};

export const PALETTES = {
  skin: ['#ffe0c7', '#f5c9a3', '#e0a878', '#c68652', '#8d5a36', '#5c3a22'],
  fur: ['#f4a259', '#d9b38c', '#8b5e3c', '#4a3b33', '#f2f2f2', '#9aa0a6', '#f7c6d9', '#7fc97f', '#e2725b'],
  eyes: ['#2b2b2b', '#4a6fa5', '#3f7f4f', '#7a4b2a', '#8e44ad'],
  hair: ['#2b1d14', '#6b3e26', '#c68b4b', '#f1d38a', '#e8e8e8', '#d94f70', '#4f7cd9', '#6fbf73', '#9b59b6'],
  clothes: ['#e74c3c', '#f39c12', '#f1c40f', '#2ecc71', '#1abc9c', '#3498db', '#9b59b6', '#ff8fb1', '#ffffff', '#34495e'],
} as const;

export const DEFAULT_BODY_COLOR: Record<Species, string> = {
  human: '#f5c9a3',
  cat: '#f4a259',
  dog: '#d9b38c',
  bunny: '#f2f2f2',
  bear: '#8b5e3c',
  fox: '#e2725b',
  frog: '#7fc97f',
};

export const NAME_MAX_LENGTH = 12;

export function defaultAppearance(): Appearance {
  return {
    species: 'human',
    bodyColor: DEFAULT_BODY_COLOR.human,
    eyeStyle: 'round',
    eyeColor: PALETTES.eyes[0],
    blush: true,
    hairStyle: 'short',
    hairColor: PALETTES.hair[1],
    shirtColor: PALETTES.clothes[5],
    pantsColor: PALETTES.clothes[9],
    shoeColor: PALETTES.clothes[0],
    hat: 'none',
    hatColor: PALETTES.clothes[0],
  };
}

function pick<T>(items: readonly T[], rand: () => number): T {
  return items[Math.floor(rand() * items.length)];
}

export function randomAppearance(rand: () => number = Math.random): Appearance {
  const species = pick(SPECIES, rand);
  const isHuman = species === 'human';
  return {
    species,
    bodyColor: pick(isHuman ? PALETTES.skin : PALETTES.fur, rand),
    eyeStyle: pick(EYE_STYLES, rand),
    eyeColor: pick(PALETTES.eyes, rand),
    blush: rand() < 0.6,
    // Animals mostly go without hair; people mostly have some.
    hairStyle: isHuman ? pick(HAIR_STYLES.slice(1), rand) : rand() < 0.25 ? pick(HAIR_STYLES, rand) : 'none',
    hairColor: pick(PALETTES.hair, rand),
    shirtColor: pick(PALETTES.clothes, rand),
    pantsColor: pick(PALETTES.clothes, rand),
    shoeColor: pick(PALETTES.clothes, rand),
    hat: rand() < 0.4 ? pick(HATS.slice(1), rand) : 'none',
    hatColor: pick(PALETTES.clothes, rand),
  };
}

/** Returns an error message, or null when the name is valid. */
export function validateName(name: string): string | null {
  const trimmed = name.trim();
  if (trimmed.length === 0) return 'Please enter a name.';
  if (trimmed.length > NAME_MAX_LENGTH) return `Names can be at most ${NAME_MAX_LENGTH} characters.`;
  return null;
}

const HEX_COLOR = /^#[0-9a-f]{6}$/i;

function oneOf<T extends string>(options: readonly T[], value: unknown, fallback: T): T {
  return options.includes(value as T) ? (value as T) : fallback;
}

function color(value: unknown, fallback: string): string {
  return typeof value === 'string' && HEX_COLOR.test(value) ? value : fallback;
}

/** Coerces untrusted stored data into a valid Appearance, filling gaps with defaults. */
export function normalizeAppearance(raw: unknown): Appearance {
  const d = defaultAppearance();
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const species = oneOf(SPECIES, r.species, d.species);
  return {
    species,
    bodyColor: color(r.bodyColor, DEFAULT_BODY_COLOR[species]),
    eyeStyle: oneOf(EYE_STYLES, r.eyeStyle, d.eyeStyle),
    eyeColor: color(r.eyeColor, d.eyeColor),
    blush: typeof r.blush === 'boolean' ? r.blush : d.blush,
    hairStyle: oneOf(HAIR_STYLES, r.hairStyle, d.hairStyle),
    hairColor: color(r.hairColor, d.hairColor),
    shirtColor: color(r.shirtColor, d.shirtColor),
    pantsColor: color(r.pantsColor, d.pantsColor),
    shoeColor: color(r.shoeColor, d.shoeColor),
    hat: oneOf(HATS, r.hat, d.hat),
    hatColor: color(r.hatColor, d.hatColor),
  };
}

/** Coerces untrusted stored data into a Character, or returns null if it is unusable. */
export function normalizeCharacter(raw: unknown): Character | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.id !== 'string' || r.id === '') return null;
  if (typeof r.name !== 'string' || validateName(r.name)) return null;
  const now = new Date().toISOString();
  return {
    schemaVersion: SCHEMA_VERSION,
    id: r.id,
    name: r.name.trim(),
    appearance: normalizeAppearance(r.appearance),
    createdAt: typeof r.createdAt === 'string' ? r.createdAt : now,
    updatedAt: typeof r.updatedAt === 'string' ? r.updatedAt : now,
  };
}

export function createCharacter(name: string, appearance: Appearance): Character {
  const error = validateName(name);
  if (error) throw new Error(error);
  const now = new Date().toISOString();
  return {
    schemaVersion: SCHEMA_VERSION,
    id: crypto.randomUUID(),
    name: name.trim(),
    appearance: { ...appearance },
    createdAt: now,
    updatedAt: now,
  };
}
