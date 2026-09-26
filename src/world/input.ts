const MOVE_KEYS: Record<string, [number, number]> = {
  KeyW: [0, -1],
  ArrowUp: [0, -1],
  KeyS: [0, 1],
  ArrowDown: [0, 1],
  KeyA: [-1, 0],
  ArrowLeft: [-1, 0],
  KeyD: [1, 0],
  ArrowRight: [1, 0],
};
const ACTION_KEYS = new Set(['KeyE', 'Space', 'Enter']);
const RUN_KEYS = new Set(['ShiftLeft', 'ShiftRight']);
const JOYSTICK_RADIUS = 48;

/**
 * Keyboard and touch input. `move` is a direction on the ground plane
 * (x right, z toward the camera) with length 0..1.
 */
export class Input {
  private readonly held = new Set<string>();
  private stick = { x: 0, z: 0 };
  private actionQueued = false;
  private readonly cleanup: (() => void)[] = [];

  constructor(joystick: HTMLElement, knob: HTMLElement, actionButton: HTMLElement) {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return;
      // Let a focused button handle its own Enter/Space as a click.
      if (e.target instanceof HTMLButtonElement && (e.code === 'Enter' || e.code === 'Space')) return;
      if (e.code in MOVE_KEYS || RUN_KEYS.has(e.code)) {
        this.held.add(e.code);
        e.preventDefault();
      }
      if (ACTION_KEYS.has(e.code) && !e.repeat) {
        this.actionQueued = true;
        e.preventDefault();
      }
    };
    const onKeyUp = (e: KeyboardEvent) => void this.held.delete(e.code);
    const onBlur = () => this.held.clear();
    this.listen(window, 'keydown', onKeyDown);
    this.listen(window, 'keyup', onKeyUp);
    this.listen(window, 'blur', onBlur);

    let pointerId: number | null = null;
    const updateStick = (e: PointerEvent) => {
      const rect = joystick.getBoundingClientRect();
      let dx = e.clientX - (rect.left + rect.width / 2);
      let dz = e.clientY - (rect.top + rect.height / 2);
      const len = Math.hypot(dx, dz);
      if (len > JOYSTICK_RADIUS) {
        dx = (dx / len) * JOYSTICK_RADIUS;
        dz = (dz / len) * JOYSTICK_RADIUS;
      }
      knob.style.transform = `translate(${dx}px, ${dz}px)`;
      this.stick = { x: dx / JOYSTICK_RADIUS, z: dz / JOYSTICK_RADIUS };
    };
    const release = (e: PointerEvent) => {
      if (e.pointerId !== pointerId) return;
      pointerId = null;
      knob.style.transform = '';
      this.stick = { x: 0, z: 0 };
    };
    this.listen(joystick, 'pointerdown', ((e: PointerEvent) => {
      pointerId = e.pointerId;
      joystick.setPointerCapture(e.pointerId);
      updateStick(e);
    }));
    this.listen(joystick, 'pointermove', ((e: PointerEvent) => {
      if (e.pointerId === pointerId) updateStick(e);
    }));
    this.listen(joystick, 'pointerup', release);
    this.listen(joystick, 'pointercancel', release);
    this.listen(actionButton, 'click', () => {
      this.actionQueued = true;
    });
  }

  get move(): { x: number; z: number } {
    let x = this.stick.x;
    let z = this.stick.z;
    for (const code of this.held) {
      const dir = MOVE_KEYS[code];
      if (dir) {
        x += dir[0];
        z += dir[1];
      }
    }
    const len = Math.hypot(x, z);
    return len > 1 ? { x: x / len, z: z / len } : { x, z };
  }

  get running(): boolean {
    return [...RUN_KEYS].some((k) => this.held.has(k)) || Math.hypot(this.stick.x, this.stick.z) > 0.95;
  }

  /** True once per press of the action key or button. */
  consumeAction(): boolean {
    const queued = this.actionQueued;
    this.actionQueued = false;
    return queued;
  }

  dispose(): void {
    this.cleanup.forEach((fn) => fn());
  }

  private listen<E extends Event>(target: EventTarget, type: string, fn: (e: E) => void): void {
    const listener = fn as unknown as EventListener;
    target.addEventListener(type, listener);
    this.cleanup.push(() => target.removeEventListener(type, listener));
  }
}
