import * as THREE from 'three';
import type { Home } from '../home/home';
import { DecoratePanel } from './decoratePanel';
import { DEFAULT_COLORS, FOOTPRINTS, type FurnitureKind, type Furnishing, ROOM_DEPTH, ROOM_WIDTH, canPlace } from './interior';
import { buildFurnishing, tintFurnishing } from './interiorScenery';

const SNAP = 0.25;
/** Taps that move further than this are drags, not taps. */
const TAP_SLOP_PX = 10;
const TINT = { selected: '#5a4a00', fits: '#1e6b2a', blocked: '#8b1a1a' };

/** The room of the house being decorated, as the world has currently built it. */
export interface EditableHouse {
  home: Home;
  group: THREE.Group;
  pieces: THREE.Group[];
}

export interface EditorHost {
  camera: THREE.Camera;
  canvas: HTMLCanvasElement;
  /** Store the changed home, rebuild what changed, and save it. */
  apply(home: Home): void;
  /** The editor closed itself (the Done button or Esc). */
  closed(): void;
}

interface Held {
  piece: Furnishing;
  /** Index of the piece being moved, or null for a new piece. */
  from: number | null;
  ghost: THREE.Group;
  fits: boolean;
}

/**
 * Decorating your own house: pick furniture from the catalog, tap the floor
 * to place it, and tap placed pieces to turn, move, recolor, or remove them.
 */
export class HomeEditor {
  readonly panel: DecoratePanel;
  private house: EditableHouse | null = null;
  private selected: number | null = null;
  private held: Held | null = null;
  private readonly raycaster = new THREE.Raycaster();
  private readonly floor = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  private down: { x: number; y: number } | null = null;
  private lastFloorPoint: THREE.Vector3 | null = null;
  private readonly cleanup: (() => void)[] = [];

  constructor(private readonly host: EditorHost) {
    this.panel = new DecoratePanel({
      add: (kind) => this.pickUp(kind),
      rotate: () => this.rotate(),
      move: () => this.moveSelected(),
      remove: () => this.removeSelected(),
      recolor: (color) => this.recolor(color),
      deselect: () => this.select(null),
      room: (change) => this.change({ ...this.home.interior, ...change }, this.home.exterior),
      outside: (change) => this.change(this.home.interior, { ...this.home.exterior, ...change }),
      done: () => this.close(),
    });
  }

  get isOpen(): boolean {
    return this.house !== null;
  }

  private get home(): Home {
    return this.house!.home;
  }

  open(house: EditableHouse): void {
    this.house = house;
    this.selected = null;
    this.held = null;
    this.panel.open(house.home);
    const canvas = this.host.canvas;
    this.listen(canvas, 'pointerdown', (e: PointerEvent) => (this.down = { x: e.clientX, y: e.clientY }));
    this.listen(canvas, 'pointermove', (e: PointerEvent) => this.onPointerMove(e));
    this.listen(canvas, 'pointerup', (e: PointerEvent) => this.onPointerUp(e));
    this.listen(window, 'keydown', (e: KeyboardEvent) => this.onKey(e));
  }

  close(): void {
    if (!this.house) return;
    this.dropHeld();
    this.select(null);
    this.cleanup.splice(0).forEach((fn) => fn());
    this.panel.close();
    this.house = null;
    this.host.closed();
  }

  /** The world rebuilt the room; point at the new meshes and keep the selection and held piece showing. */
  roomRebuilt(house: EditableHouse): void {
    this.house = house;
    if (this.held) {
      house.group.add(this.held.ghost);
      if (this.held.from !== null) house.pieces[this.held.from].visible = false;
    }
    if (this.selected !== null) tintFurnishing(house.pieces[this.selected], TINT.selected);
    this.panel.update(house.home, this.selected, this.held !== null);
  }

  private listen<E extends Event>(target: EventTarget, type: string, fn: (e: E) => void): void {
    const listener = fn as unknown as EventListener;
    target.addEventListener(type, listener);
    this.cleanup.push(() => target.removeEventListener(type, listener));
  }

  private change(interior: Home['interior'], exterior: Home['exterior']): void {
    this.host.apply({ ...this.home, interior, exterior });
  }

  private setFurniture(furniture: Furnishing[]): void {
    this.change({ ...this.home.interior, furniture }, this.home.exterior);
  }

  private select(index: number | null): void {
    if (this.selected !== null && this.house?.pieces[this.selected]) tintFurnishing(this.house.pieces[this.selected], null);
    this.selected = index;
    if (index !== null && this.house) tintFurnishing(this.house.pieces[index], TINT.selected);
    if (this.house) this.panel.update(this.home, this.selected, this.held !== null);
  }

  // ---------- Holding a piece ----------

  private pickUp(kind: FurnitureKind): void {
    this.dropHeld();
    this.select(null);
    const at = this.lastFloorPoint ?? new THREE.Vector3(0, 0, 0);
    this.hold({ kind, x: at.x, z: at.z, turns: 0, color: DEFAULT_COLORS[kind] }, null);
  }

  private moveSelected(): void {
    if (this.selected === null) return;
    const index = this.selected;
    this.select(null);
    this.hold({ ...this.home.interior.furniture[index] }, index);
    this.house!.pieces[index].visible = false;
  }

  private hold(piece: Furnishing, from: number | null): void {
    const ghost = buildFurnishing(piece);
    this.house!.group.add(ghost);
    this.held = { piece, from, ghost, fits: false };
    this.positionHeld(piece.x, piece.z);
    this.panel.update(this.home, null, true);
  }

  /** Moves the held piece to a floor spot, snapped and kept inside the walls. */
  private positionHeld(x: number, z: number): void {
    const held = this.held!;
    const [w, d] = FOOTPRINTS[held.piece.kind];
    const sideways = (held.piece.turns ?? 0) % 2 === 1;
    const hw = (ROOM_WIDTH - (sideways ? d : w)) / 2;
    const hd = (ROOM_DEPTH - (sideways ? w : d)) / 2;
    held.piece.x = THREE.MathUtils.clamp(Math.round(x / SNAP) * SNAP, -hw, hw);
    held.piece.z = THREE.MathUtils.clamp(Math.round(z / SNAP) * SNAP, -hd, hd);
    held.ghost.position.set(held.piece.x, 0.02, held.piece.z);
    held.ghost.rotation.y = ((held.piece.turns ?? 0) * Math.PI) / 2;
    const ignore = held.from === null ? undefined : this.home.interior.furniture[held.from];
    held.fits = canPlace(this.home.interior.furniture, held.piece, ignore);
    tintFurnishing(held.ghost, held.fits ? TINT.fits : TINT.blocked);
  }

  private placeHeld(): void {
    const held = this.held!;
    if (!held.fits) {
      this.panel.setHint("It doesn't fit there. Try another spot, or turn it with R.");
      return;
    }
    const furniture = [...this.home.interior.furniture];
    const placed: Furnishing = { ...held.piece };
    let index: number;
    if (held.from === null) {
      furniture.push(placed);
      index = furniture.length - 1;
    } else {
      furniture[held.from] = placed;
      index = held.from;
    }
    this.dropHeld();
    this.selected = index;
    this.setFurniture(furniture);
  }

  /** Puts the held piece back where it came from (or away, if new). */
  private dropHeld(): void {
    if (!this.held) return;
    this.held.ghost.removeFromParent();
    this.held.ghost.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        o.geometry.dispose();
        (o.material as THREE.Material).dispose();
      }
    });
    if (this.held.from !== null && this.house?.pieces[this.held.from]) this.house.pieces[this.held.from].visible = true;
    this.held = null;
    if (this.house) this.panel.update(this.home, this.selected, false);
  }

  // ---------- Changing a placed piece ----------

  private rotate(): void {
    if (this.held) {
      this.held.piece.turns = ((this.held.piece.turns ?? 0) + 1) % 4;
      this.positionHeld(this.held.piece.x, this.held.piece.z);
      return;
    }
    if (this.selected === null) return;
    const furniture = this.home.interior.furniture;
    const current = furniture[this.selected];
    // Try each later quarter turn until one fits.
    for (let step = 1; step < 4; step++) {
      const turned = { ...current, turns: ((current.turns ?? 0) + step) % 4 };
      if (canPlace(furniture, turned, current)) {
        this.setFurniture(furniture.map((f, i) => (i === this.selected ? turned : f)));
        return;
      }
    }
    this.panel.setHint('There is no room to turn it here. Move it first.');
  }

  private recolor(color: string): void {
    if (this.selected === null) return;
    this.setFurniture(this.home.interior.furniture.map((f, i) => (i === this.selected ? { ...f, color } : f)));
  }

  private removeSelected(): void {
    if (this.selected === null) return;
    const index = this.selected;
    this.selected = null;
    this.setFurniture(this.home.interior.furniture.filter((_, i) => i !== index));
  }

  // ---------- Pointer and keys ----------

  private floorPoint(e: PointerEvent): THREE.Vector3 | null {
    const rect = this.host.canvas.getBoundingClientRect();
    const ndc = new THREE.Vector2(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.host.camera);
    return this.raycaster.ray.intersectPlane(this.floor, new THREE.Vector3());
  }

  private pieceAt(e: PointerEvent): number | null {
    const rect = this.host.canvas.getBoundingClientRect();
    const ndc = new THREE.Vector2(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.host.camera);
    for (const hit of this.raycaster.intersectObjects(this.house!.pieces, true)) {
      let o: THREE.Object3D | null = hit.object;
      while (o && o.userData.furnitureIndex === undefined) o = o.parent;
      if (o) return o.userData.furnitureIndex as number;
    }
    return null;
  }

  private onPointerMove(e: PointerEvent): void {
    const p = this.floorPoint(e);
    if (p) this.lastFloorPoint = p;
    if (this.held && p) this.positionHeld(p.x, p.z);
  }

  private onPointerUp(e: PointerEvent): void {
    const down = this.down;
    this.down = null;
    if (!down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > TAP_SLOP_PX) return;
    if (this.held) {
      const p = this.floorPoint(e);
      if (p) this.positionHeld(p.x, p.z);
      this.placeHeld();
      return;
    }
    this.select(this.pieceAt(e));
  }

  private onKey(e: KeyboardEvent): void {
    if (e.target instanceof HTMLInputElement) return;
    if (e.code === 'KeyR') this.rotate();
    else if ((e.code === 'Delete' || e.code === 'Backspace') && !this.held) this.removeSelected();
    else if (e.code === 'Escape') {
      if (this.held) this.dropHeld();
      else if (this.selected !== null) this.select(null);
      else this.close();
    } else return;
    e.preventDefault();
  }
}
