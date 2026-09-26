import { describe, expect, it } from 'vitest';
import { normalizeAppearance } from '../character/model';
import { VILLAGERS, conversation, dayPart } from './npcs';

describe('villagers', () => {
  it('have unique ids and valid appearances', () => {
    expect(new Set(VILLAGERS.map((v) => v.id)).size).toBe(VILLAGERS.length);
    for (const v of VILLAGERS) expect(normalizeAppearance(v.appearance)).toEqual(v.appearance);
  });
});

describe('dayPart', () => {
  it.each([
    [6, 'morning'],
    [13, 'afternoon'],
    [18, 'evening'],
    [23, 'night'],
    [2, 'night'],
  ])('hour %i is %s', (hour, part) => {
    expect(dayPart(hour)).toBe(part);
  });
});

describe('conversation', () => {
  it('greets the player by name and fills in placeholders', () => {
    for (const v of VILLAGERS) {
      for (let i = 0; i < v.lines.length; i++) {
        const lines = conversation(v, 'Eleanor', 9, () => i / v.lines.length);
        expect(lines[0]).toBe(`Good morning, Eleanor, ${v.catchphrase}!`);
        expect(lines[1]).not.toContain('{player}');
      }
    }
  });
});
