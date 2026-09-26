import { describe, expect, it } from 'vitest';
import {
  NAME_MAX_LENGTH,
  createCharacter,
  defaultAppearance,
  newId,
  normalizeAppearance,
  normalizeCharacter,
  randomAppearance,
  validateName,
} from './model';

describe('validateName', () => {
  it('rejects blank names', () => {
    expect(validateName('   ')).not.toBeNull();
  });

  it('rejects names that are too long', () => {
    expect(validateName('x'.repeat(NAME_MAX_LENGTH + 1))).not.toBeNull();
  });

  it('accepts a normal name', () => {
    expect(validateName('Eleanor')).toBeNull();
  });
});

describe('normalizeAppearance', () => {
  it('keeps valid data', () => {
    const a = randomAppearance();
    expect(normalizeAppearance(a)).toEqual(a);
  });

  it('replaces invalid fields with defaults', () => {
    const a = normalizeAppearance({ species: 'dragon', shirtColor: 'red', hat: 'crown' });
    expect(a.species).toBe(defaultAppearance().species);
    expect(a.shirtColor).toBe(defaultAppearance().shirtColor);
    expect(a.hat).toBe('crown');
  });

  it('handles non-objects', () => {
    expect(normalizeAppearance(null)).toEqual(defaultAppearance());
  });
});

describe('normalizeCharacter', () => {
  it('round-trips a created character through JSON', () => {
    const c = createCharacter('  Eleanor ', randomAppearance());
    expect(c.name).toBe('Eleanor');
    expect(normalizeCharacter(JSON.parse(JSON.stringify(c)))).toEqual(c);
  });

  it('rejects records without an id or valid name', () => {
    expect(normalizeCharacter({ name: 'Eleanor' })).toBeNull();
    expect(normalizeCharacter({ id: 'a', name: '' })).toBeNull();
  });
});

describe('createCharacter', () => {
  it('throws on an invalid name', () => {
    expect(() => createCharacter('', defaultAppearance())).toThrow();
  });
});

describe('newId', () => {
  it('makes a v4 UUID without crypto.randomUUID', () => {
    const original = crypto.randomUUID;
    Object.defineProperty(crypto, 'randomUUID', { value: undefined, configurable: true });
    try {
      expect(newId()).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    } finally {
      Object.defineProperty(crypto, 'randomUUID', { value: original, configurable: true });
    }
  });
});
