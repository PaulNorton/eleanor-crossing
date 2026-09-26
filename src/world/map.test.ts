import { describe, expect, it } from 'vitest';
import { IslandMap, MAP_SIZE, MAX_HOUSES, Tile, houseDoor, tileCenter, worldToTile } from './map';
import { VILLAGERS } from './npcs';

const RADIUS = 0.28;
const map = new IslandMap(VILLAGERS.map((v) => ({ owner: v.id })));

/** Tiles reachable on foot from the spawn, ignoring round props. */
function reachableTiles(m: IslandMap): Set<number> {
  const start = worldToTile(m.spawn.x, m.spawn.z);
  const seen = new Set([m.index(start.tx, start.tz)]);
  const queue = [start];
  while (queue.length) {
    const { tx, tz } = queue.shift()!;
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const n = { tx: tx + dx, tz: tz + dz };
      const i = m.index(n.tx, n.tz);
      if (!m.isOpenTile(n.tx, n.tz) || m.isSolidProp(n.tx, n.tz) || seen.has(i)) continue;
      seen.add(i);
      queue.push(n);
    }
  }
  return seen;
}

describe('IslandMap', () => {
  it('is the same every time', () => {
    const again = new IslandMap(VILLAGERS.map((v) => ({ owner: v.id })));
    expect(again.tiles).toEqual(map.tiles);
    expect([...again.props]).toEqual([...map.props]);
  });

  it('has a house for every villager', () => {
    expect(VILLAGERS.length).toBeLessThanOrEqual(MAX_HOUSES);
    expect(map.houses.map((h) => h.owner)).toEqual(VILLAGERS.map((v) => v.id));
  });

  it('is surrounded by ocean', () => {
    for (let i = 0; i < MAP_SIZE; i++) {
      expect(map.tileAt(i, 0)).toBe(Tile.Ocean);
      expect(map.tileAt(0, i)).toBe(Tile.Ocean);
    }
  });

  it('lets the player stand at the spawn', () => {
    expect(map.canStand(map.spawn.x, map.spawn.z, RADIUS)).toBe(true);
  });

  it('blocks water, houses, and trees', () => {
    const ocean = tileCenter(0, 0);
    expect(map.canStand(ocean.x, ocean.z, RADIUS)).toBe(false);
    const house = map.houses[0];
    const inside = tileCenter(house.tx + 1, house.tz + 1);
    expect(map.canStand(inside.x, inside.z, RADIUS)).toBe(false);
    const [treeIndex] = [...map.props].find(([, p]) => p === 'tree')!;
    const tree = tileCenter(treeIndex % MAP_SIZE, Math.floor(treeIndex / MAP_SIZE));
    expect(map.canStand(tree.x, tree.z, RADIUS)).toBe(false);
  });

  it('has a river crossed by a bridge', () => {
    expect(map.tiles.includes(Tile.River)).toBe(true);
    expect(map.tiles.includes(Tile.Bridge)).toBe(true);
  });

  it('can reach every front door from the spawn', () => {
    const reachable = reachableTiles(map);
    for (const house of map.houses) {
      const door = houseDoor(house);
      expect(map.canStand(door.x, door.z, RADIUS)).toBe(true);
      const { tx, tz } = worldToTile(door.x, door.z);
      expect(reachable.has(map.index(tx, tz)), `door of ${house.owner}`).toBe(true);
    }
  });
});
