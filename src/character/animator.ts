import type { CharacterRig } from './build';

const WAVE_SECONDS = 1.6;
const ARM_REST = 0.25;

/** Drives idle, walk, wave, and blink animation for one character rig. */
export class CharacterAnimator {
  private time = Math.random() * 10;
  private waveLeft = 0;
  private nextBlink = 1 + Math.random() * 3;
  private walkPhase = 0;
  /** 0 = standing, 1 = full stride. Eased so starts and stops look smooth. */
  private stride = 0;

  constructor(readonly rig: CharacterRig) {}

  wave(): void {
    this.waveLeft = WAVE_SECONDS;
  }

  /** @param speed Ground speed in character-heights per second. 0 means idle. */
  update(dt: number, speed = 0): void {
    const rig = this.rig;
    this.time += dt;
    this.waveLeft = Math.max(0, this.waveLeft - dt);
    const t = this.time;
    const ease = Math.min(1, dt * 10);

    const moving = speed > 0.05;
    this.stride += ((moving ? 1 : 0) - this.stride) * ease;
    this.walkPhase += dt * (4 + speed * 5);
    const swing = Math.sin(this.walkPhase) * this.stride;

    // Bob: a small breath when idle, a bounce per step when walking.
    const breath = Math.abs(Math.sin(t * 2)) * 0.02;
    const step = Math.abs(Math.sin(this.walkPhase)) * 0.06;
    rig.body.position.y = breath * (1 - this.stride) + step * this.stride;

    rig.head.rotation.z = Math.sin(t * 0.9) * 0.05 * (1 - this.stride);
    rig.head.rotation.y = Math.sin(t * 0.5) * 0.12 * (1 - this.stride);
    if (rig.tail) rig.tail.rotation.y = Math.sin(t * (moving ? 8 : 3)) * 0.35;

    rig.leftLeg.rotation.x = swing * 0.7;
    rig.rightLeg.rotation.x = -swing * 0.7;

    const idleSway = Math.sin(t * 2) * 0.04;
    rig.rightArm.rotation.x = swing * 0.8;
    rig.rightArm.rotation.z = -ARM_REST - idleSway;
    const leftTarget = this.waveLeft > 0 ? 2.6 + Math.sin(t * 14) * 0.35 : ARM_REST + idleSway;
    rig.leftArm.rotation.z += (leftTarget - rig.leftArm.rotation.z) * ease;
    rig.leftArm.rotation.x = this.waveLeft > 0 ? 0 : -swing * 0.8;

    if (t > this.nextBlink + 0.15) this.nextBlink = t + 2 + Math.random() * 3;
    const blink = t > this.nextBlink ? 0.1 : 1;
    for (const eye of rig.eyes) eye.scale.y = blink;
  }
}
