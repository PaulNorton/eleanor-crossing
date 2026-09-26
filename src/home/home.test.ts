import { describe, expect, it } from 'vitest';
import { ENTRANCE_CLEAR, ROOM_WIDTH, Room, canPlace } from '../world/interior';
import { CATALOG, MAX_FURNITURE, defaultHome, freePlot, normalizeFurniture, normalizeHome } from './home';

describe('defaultHome', () => {
  it('starts with furniture that fits and a walkable entrance', () => {
    const home = defaultHome('abc', 0);
    expect(normalizeFurniture(home.interior.furniture)).toEqual(home.interior.furniture);
    const room = new Room(home.interior.furniture);
    expect(room.canStand(room.entrance.x, room.entrance.z, 0.28)).toBe(true);
  });
});

describe('freePlot', () => {
  it('picks the lowest free plot, or null when full', () => {
    expect(freePlot([], 3)).toBe(0);
    expect(freePlot([0, 2], 3)).toBe(1);
    expect(freePlot([0, 1, 2], 3)).toBeNull();
  });
});

describe('canPlace', () => {
  it('rejects pieces outside the walls, on top of others, or in the entrance', () => {
    expect(canPlace([], { kind: 'bed', x: ROOM_WIDTH / 2, z: 0 })).toBe(false);
    expect(canPlace([{ kind: 'table', x: 0, z: 0 }], { kind: 'chair', x: 0.2, z: 0.2 })).toBe(false);
    expect(canPlace([], { kind: 'plant', x: ENTRANCE_CLEAR.x, z: ENTRANCE_CLEAR.z })).toBe(false);
  });

  it('lets rugs go under things and lets a piece move over its own old spot', () => {
    const table = { kind: 'table' as const, x: 0, z: 0 };
    expect(canPlace([table], { kind: 'rug', x: 0, z: 0 })).toBe(true);
    expect(canPlace([{ kind: 'rug', x: 0, z: 0 }], table)).toBe(true);
    expect(canPlace([table], { ...table, x: 0.25 }, table)).toBe(true);
  });

  it('checks the turned footprint', () => {
    // A bed is 1.3 wide and 2.0 deep; turned, it needs 2.0 across.
    expect(canPlace([], { kind: 'bed', x: 3.2, z: 0, turns: 0 })).toBe(true);
    expect(canPlace([], { kind: 'bed', x: 3.2, z: 0, turns: 1 })).toBe(false);
  });
});

describe('normalizeHome', () => {
  it('keeps the given id and plot, whatever the data says', () => {
    const home = normalizeHome({ characterId: 'evil', plot: 99 }, 'abc', 2);
    expect(home.characterId).toBe('abc');
    expect(home.plot).toBe(2);
  });

  it('cleans colors, floor styles, and furniture', () => {
    const home = normalizeHome(
      {
        exterior: { roof: '#ABCDEF', walls: 'red', door: '#123456' },
        interior: {
          wallpaper: '#ffffff',
          floorStyle: 'lava',
          floorColor: '#000000',
          furniture: [
            { kind: 'bed', x: -2.9, z: -2.3, turns: 5, color: 'blue' },
            { kind: 'bed', x: -2.9, z: -2.3 },
            { kind: 'spaceship', x: 0, z: 0 },
            { kind: 'plant', x: 'left', z: 0 },
            { kind: 'plant', x: 99, z: 0 },
          ],
        },
      },
      'abc',
      0,
    );
    expect(home.exterior).toEqual({ roof: '#abcdef', walls: '#fff4dc', door: '#123456' });
    expect(home.interior.floorStyle).toBe('wood');
    expect(home.interior.furniture).toEqual([{ kind: 'bed', x: -2.9, z: -2.3, turns: 1, color: '#3498db' }]);
  });

  it(`caps furniture at ${MAX_FURNITURE} pieces`, () => {
    const rugs = Array.from({ length: MAX_FURNITURE + 10 }, () => ({ kind: 'rug', x: 0, z: 0 }));
    expect(normalizeFurniture(rugs)).toHaveLength(MAX_FURNITURE);
  });

  it('offers every furniture kind in the catalog', () => {
    expect(new Set(CATALOG.map((c) => c.kind)).size).toBe(CATALOG.length);
  });
});
