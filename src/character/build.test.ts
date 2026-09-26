import { describe, expect, it } from 'vitest';
import { buildCharacter } from './build';
import { EYE_STYLES, HAIR_STYLES, HATS, SPECIES, defaultAppearance } from './model';

describe('buildCharacter', () => {
  it('builds every species, eye, hair, and hat option', () => {
    for (const species of SPECIES) {
      for (const [i, hat] of HATS.entries()) {
        const rig = buildCharacter({
          ...defaultAppearance(),
          species,
          hat,
          hairStyle: HAIR_STYLES[i % HAIR_STYLES.length],
          eyeStyle: EYE_STYLES[i % EYE_STYLES.length],
        });
        expect(rig.eyes).toHaveLength(2);
        expect(rig.tail === null).toBe(species === 'human' || species === 'frog');
        rig.dispose();
      }
    }
  });
});
