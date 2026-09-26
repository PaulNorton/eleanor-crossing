import { describe, expect, it } from 'vitest';
import { ROOM_DEPTH, ROOM_WIDTH, Room, footprint } from './interior';
import type { Personality } from './npcs';

const RADIUS = 0.28;
const PERSONALITIES: Personality[] = ['cheerful', 'lazy', 'grumpy', 'smart', 'sporty', 'sweet'];

/** Flood-fills walkable spots on a fine grid, starting from the entrance. */
function reachable(room: Room, step = 0.1): (x: number, z: number) => boolean {
  const key = (i: number, j: number) => `${i},${j}`;
  const toWorld = (i: number) => i * step;
  const start = [Math.round(room.entrance.x / step), Math.round(room.entrance.z / step)];
  const seen = new Set([key(start[0], start[1])]);
  const queue = [start];
  while (queue.length) {
    const [i, j] = queue.pop()!;
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const k = key(i + di, j + dj);
      if (seen.has(k) || !room.canStand(toWorld(i + di), toWorld(j + dj), RADIUS)) continue;
      seen.add(k);
      queue.push([i + di, j + dj]);
    }
  }
  return (x, z) => seen.has(key(Math.round(x / step), Math.round(z / step)));
}

describe.each(PERSONALITIES)('a %s villager’s room', (personality) => {
  const room = Room.forPersonality(personality);

  it('keeps all furniture inside the walls', () => {
    for (const f of room.furniture) {
      const r = footprint(f);
      expect(Math.abs(r.x) + r.w / 2, f.kind).toBeLessThanOrEqual(ROOM_WIDTH / 2);
      expect(Math.abs(r.z) + r.d / 2, f.kind).toBeLessThanOrEqual(ROOM_DEPTH / 2);
    }
  });

  it('has no overlapping solid furniture', () => {
    const solids = room.furniture.filter((f) => f.kind !== 'rug').map(footprint);
    for (let i = 0; i < solids.length; i++) {
      for (let j = i + 1; j < solids.length; j++) {
        const a = solids[i];
        const b = solids[j];
        const overlap = Math.abs(a.x - b.x) < (a.w + b.w) / 2 && Math.abs(a.z - b.z) < (a.d + b.d) / 2;
        expect(overlap, `${room.furniture[i].kind} / ${room.furniture[j].kind}`).toBe(false);
      }
    }
  });

  it('lets you walk from the door to the owner and back to the doormat', () => {
    expect(room.canStand(room.entrance.x, room.entrance.z, RADIUS)).toBe(true);
    expect(room.onDoormat(room.entrance.x, room.entrance.z)).toBe(false);
    const canReach = reachable(room);
    expect(canReach(room.ownerSpot.x, room.ownerSpot.z)).toBe(true);
    expect(canReach(0, ROOM_DEPTH / 2 - RADIUS - 0.05)).toBe(true);
    expect(room.onDoormat(0, ROOM_DEPTH / 2 - RADIUS - 0.05)).toBe(true);
  });
});

describe('Room.canStand', () => {
  it('blocks walls and furniture but not rugs', () => {
    const room = Room.forPersonality('cheerful');
    expect(room.canStand(ROOM_WIDTH / 2, 0, RADIUS)).toBe(false);
    const bed = room.furniture.find((f) => f.kind === 'bed')!;
    expect(room.canStand(bed.x, bed.z, RADIUS)).toBe(false);
    const rug = room.furniture.find((f) => f.kind === 'rug')!;
    expect(room.canStand(rug.x, rug.z, RADIUS)).toBe(true);
  });
});
