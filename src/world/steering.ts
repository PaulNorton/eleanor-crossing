// How characters move: sliding along walls, and villagers wandering between
// spots. Pure logic with no rendering, so it can be simulated in tests.

import type { Point } from './map';

/** Can the walker's body stand at this spot? */
export type CanStand = (x: number, z: number) => boolean;

export interface Walker {
  x: number;
  z: number;
}

/**
 * Moves by (dx, dz). If that is blocked, slides along whichever axis is free.
 * Returns the distance actually moved, which is 0 when fully blocked.
 */
export function slideMove(w: Walker, dx: number, dz: number, free: CanStand): number {
  if (free(w.x + dx, w.z + dz)) {
    w.x += dx;
    w.z += dz;
    return Math.hypot(dx, dz);
  }
  if (dx !== 0 && free(w.x + dx, w.z)) {
    w.x += dx;
    return Math.abs(dx);
  }
  if (dz !== 0 && free(w.x, w.z + dz)) {
    w.z += dz;
    return Math.abs(dz);
  }
  return 0;
}

/** Is every point along the straight line from `from` to `to` standable? */
export function hasClearPath(free: CanStand, from: Point, to: Point, step = 0.2): boolean {
  const dist = Math.hypot(to.x - from.x, to.z - from.z);
  const steps = Math.max(1, Math.ceil(dist / step));
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    if (!free(from.x + (to.x - from.x) * t, from.z + (to.z - from.z) * t)) return false;
  }
  return true;
}

/** Give up on a target after making almost no progress for this long. */
export const STUCK_SECONDS = 0.5;
/** Progress below this share of the intended step counts as stuck. */
const STUCK_PROGRESS = 0.3;
const ARRIVED = 0.1;

export interface WanderEnv {
  /** Static obstacles only: walls, furniture, trees. Used to choose targets. */
  standable: CanStand;
  /** Everything, including other characters. Used for each step. */
  free: CanStand;
  /** A candidate spot to walk to, not yet checked. */
  randomSpot(): Point;
  /** Extra rule for where to stop, e.g. not in a doorway. */
  allowed?(p: Point): boolean;
  speed: number;
  rand?: () => number;
}

/**
 * A villager's walking brain: wait a moment, pick a spot it can walk to in a
 * straight line, walk there, and repeat. If something blocks the way (a wall,
 * the player, another villager), it stops and picks again instead of walking
 * in place.
 */
export class Wanderer {
  target: Point | null = null;
  waitLeft: number;
  private stuckTime = 0;

  constructor(rand: () => number = Math.random) {
    this.waitLeft = rand() * 3;
  }

  /** Stops walking and waits before choosing somewhere new. */
  rest(seconds: number): void {
    this.target = null;
    this.stuckTime = 0;
    this.waitLeft = seconds;
  }

  /**
   * Advances one frame. Returns how far the walker moved and, when walking,
   * the direction it wants to face.
   */
  update(w: Walker, dt: number, env: WanderEnv): { moved: number; facing: number | null } {
    const rand = env.rand ?? Math.random;
    if (!this.target) {
      this.waitLeft -= dt;
      if (this.waitLeft <= 0) this.target = this.pickTarget(w, env);
      return { moved: 0, facing: null };
    }

    const dx = this.target.x - w.x;
    const dz = this.target.z - w.z;
    const dist = Math.hypot(dx, dz);
    if (dist < ARRIVED) {
      this.rest(1.5 + rand() * 4);
      return { moved: 0, facing: null };
    }
    const step = Math.min(dist, env.speed * dt);
    const moved = slideMove(w, (dx / dist) * step, (dz / dist) * step, env.free);
    this.stuckTime = moved < step * STUCK_PROGRESS ? this.stuckTime + dt : 0;
    if (this.stuckTime > STUCK_SECONDS) this.rest(0.5 + rand() * 1.5);
    return { moved, facing: Math.atan2(dx, dz) };
  }

  private pickTarget(w: Walker, env: WanderEnv): Point | null {
    for (let i = 0; i < 12; i++) {
      const p = env.randomSpot();
      if (!env.standable(p.x, p.z) || (env.allowed && !env.allowed(p))) continue;
      if (hasClearPath(env.standable, w, p)) return p;
    }
    this.waitLeft = 1;
    return null;
  }
}
