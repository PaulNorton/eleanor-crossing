import { describe, expect, it } from 'vitest';
import type { Point } from './map';
import { type CanStand, STUCK_SECONDS, Wanderer, hasClearPath, slideMove } from './steering';

/** A 10x10 room with a wall along x = 5 from z = 0 to z = 8. */
const room: CanStand = (x, z) => x > 0 && x < 10 && z > 0 && z < 10 && !(Math.abs(x - 5) < 0.5 && z < 8);

describe('slideMove', () => {
  it('slides along a wall and reports only the distance moved', () => {
    const w = { x: 4.4, z: 2 };
    const moved = slideMove(w, 0.2, 0.05, room);
    expect(w).toEqual({ x: 4.4, z: 2.05 });
    expect(moved).toBeCloseTo(0.05);
  });

  it('returns 0 when fully blocked', () => {
    const w = { x: 4.4, z: 2 };
    expect(slideMove(w, 0.2, 0, room)).toBe(0);
    expect(w).toEqual({ x: 4.4, z: 2 });
  });
});

describe('hasClearPath', () => {
  it('sees walls between two free spots', () => {
    expect(room(2, 2) && room(8, 2)).toBe(true);
    expect(hasClearPath(room, { x: 2, z: 2 }, { x: 8, z: 2 })).toBe(false);
    expect(hasClearPath(room, { x: 2, z: 9 }, { x: 8, z: 9 })).toBe(true);
  });
});

describe('Wanderer', () => {
  const env = (spots: Point[], free: CanStand = room) => {
    let i = 0;
    return { standable: room, free, randomSpot: () => spots[i++ % spots.length], speed: 1.3, rand: () => 0.5 };
  };

  it('never picks a target behind a wall', () => {
    const w = { x: 2, z: 2 };
    const brain = new Wanderer(() => 0);
    brain.update(w, 0.1, env([{ x: 8, z: 2 }, { x: 3, z: 5 }]));
    expect(brain.target).toEqual({ x: 3, z: 5 });
  });

  it('gives up and stops its legs when something blocks the way', () => {
    const w = { x: 2, z: 2 };
    const brain = new Wanderer(() => 0);
    // A villager stands in the way after the target is chosen.
    const blocked: CanStand = (x, z) => room(x, z) && x < 2.5;
    const e = env([{ x: 4, z: 2 }], blocked);
    brain.update(w, 0.1, e);
    expect(brain.target).not.toBeNull();
    let lastMoved = Infinity;
    for (let t = 0; t < STUCK_SECONDS + 1 && brain.target; t += 1 / 60) {
      lastMoved = brain.update(w, 1 / 60, e).moved;
    }
    expect(brain.target).toBeNull();
    expect(lastMoved).toBe(0);
    expect(w.x).toBeLessThan(2.5);
  });

  it('never walks in place against a wall for long', () => {
    // Random targets across the whole room, many seconds of walking.
    let seed = 1;
    const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const w = { x: 2, z: 2 };
    const brain = new Wanderer(rand);
    const e = { standable: room, free: room, randomSpot: () => ({ x: rand() * 10, z: rand() * 10 }), speed: 1.3, rand };
    const dt = 1 / 60;
    let walkingInPlace = 0;
    for (let i = 0; i < 60 * 120; i++) {
      const { moved, facing } = brain.update(w, dt, e);
      walkingInPlace = facing !== null && moved < 1.3 * dt * 0.3 ? walkingInPlace + dt : 0;
      expect(walkingInPlace).toBeLessThanOrEqual(STUCK_SECONDS + dt);
      expect(room(w.x, w.z)).toBe(true);
    }
  });
});
