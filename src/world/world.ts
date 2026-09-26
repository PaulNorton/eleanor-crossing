import * as THREE from 'three';
import { CharacterAnimator } from '../character/animator';
import { buildCharacter } from '../character/build';
import type { Appearance, Character } from '../character/model';
import type { PlayerState, WorldStateRepository } from '../storage/worldStateRepository';
import { Hud } from './hud';
import { Input } from './input';
import { IslandMap, type Point, houseDoor } from './map';
import { type Villager, conversation, dayPart } from './npcs';
import { buildScenery } from './scenery';

/** Characters are built about 2 units tall; the island uses 1-unit tiles. */
const ACTOR_SCALE = 0.6;
const ACTOR_HEIGHT = 2 * ACTOR_SCALE;
const ACTOR_RADIUS = 0.28;
const WALK_SPEED = 3;
const RUN_SPEED = 5.5;
const NPC_SPEED = 1.3;
const NPC_WANDER_RADIUS = 6;
const TALK_DISTANCE = 1.6;
const CAMERA_OFFSET = new THREE.Vector3(0, 6, 7.5);
const SAVE_EVERY_SECONDS = 3;

interface Actor {
  animator: CharacterAnimator;
  x: number;
  z: number;
  heading: number;
  speed: number;
}

interface Npc extends Actor {
  villager: Villager;
  home: Point;
  target: Point | null;
  waitLeft: number;
  talking: boolean;
}

function makeActor(appearance: Appearance, at: Point, heading = 0): Actor {
  const rig = buildCharacter(appearance);
  rig.root.scale.setScalar(ACTOR_SCALE);
  return { animator: new CharacterAnimator(rig), x: at.x, z: at.z, heading, speed: 0 };
}

/** Turns `from` toward `to` by at most `maxStep` radians, taking the short way round. */
function turnToward(from: number, to: number, maxStep: number): number {
  const diff = Math.atan2(Math.sin(to - from), Math.cos(to - from));
  return from + Math.max(-maxStep, Math.min(maxStep, diff));
}

const SKY: Record<ReturnType<typeof dayPart>, { sky: string; sun: string; sunIntensity: number; ambient: number }> = {
  morning: { sky: '#bfe6ff', sun: '#fff1d6', sunIntensity: 2.2, ambient: 1.4 },
  afternoon: { sky: '#a6dcff', sun: '#ffffff', sunIntensity: 2.5, ambient: 1.5 },
  evening: { sky: '#ffc49b', sun: '#ffb070', sunIntensity: 1.6, ambient: 1.1 },
  night: { sky: '#223358', sun: '#9fb4ff', sunIntensity: 0.6, ambient: 0.6 },
};

export interface WorldOptions {
  container: HTMLElement;
  character: Character;
  villagers: readonly Villager[];
  stateRepo: WorldStateRepository;
  onEditCharacter: () => void;
}

/** The walkable island: player, villagers, camera, and HUD. */
export class World {
  private readonly renderer = new THREE.WebGLRenderer({ antialias: true });
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(38, 1, 0.1, 200);
  private readonly timer = new THREE.Timer();
  private readonly sun = new THREE.DirectionalLight();
  private readonly ambient = new THREE.HemisphereLight('#ffffff', '#6fae5a');
  private readonly map: IslandMap;
  private readonly hud: Hud;
  private readonly input: Input;
  private readonly player: Actor;
  private readonly npcs: Npc[];
  private readonly resizeObserver: ResizeObserver;
  private talkingTo: Npc | null = null;
  private sinceSave = 0;
  private dirty = false;
  private skyPart: ReturnType<typeof dayPart> | null = null;
  private readonly saveOnHide = () => void this.savePosition();

  private constructor(
    private readonly opts: WorldOptions,
    map: IslandMap,
    start: PlayerState,
  ) {
    const { container, villagers } = opts;
    this.map = map;

    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    container.append(this.renderer.domElement);

    const houseColors = new Map(villagers.map((v) => [v.id, v.color]));
    this.hud = new Hud(this.map, houseColors);
    container.append(this.hud.root);
    this.hud.setPlayer(opts.character.name);
    this.hud.editButton.addEventListener('click', () => opts.onEditCharacter());
    this.input = new Input(this.hud.joystick, this.hud.knob, this.hud.actionButton);

    this.scene.add(this.ambient, this.sun, this.sun.target);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    Object.assign(this.sun.shadow.camera, { left: -16, right: 16, top: 16, bottom: -16, near: 1, far: 50 });
    this.sun.shadow.bias = -0.0008;
    this.scene.add(buildScenery(this.map, villagers.map((v) => ({ owner: v.id, roofColor: v.color }))));

    this.player = makeActor(opts.character.appearance, start, start.heading);
    this.scene.add(this.player.animator.rig.root);
    this.npcs = villagers.map((villager) => {
      const house = this.map.houses.find((h) => h.owner === villager.id)!;
      const home = houseDoor(house);
      const npc: Npc = { ...makeActor(villager.appearance, home), villager, home, target: null, waitLeft: Math.random() * 3, talking: false };
      this.scene.add(npc.animator.rig.root);
      return npc;
    });

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(container);
    this.resize();
    this.updateSky(new Date());
    this.placeCamera(true);
    this.player.animator.wave();
    window.addEventListener('pagehide', this.saveOnHide);
    this.renderer.setAnimationLoop((time) => this.frame(time));
  }

  /** Loads the player's last position (or the plaza spawn) and starts the game loop. */
  static async create(opts: WorldOptions): Promise<World> {
    const map = new IslandMap(opts.villagers.map((v) => ({ owner: v.id })));
    const saved = await opts.stateRepo.getPlayerState(opts.character.id).catch((err: unknown) => {
      console.warn('Could not load the saved position; starting at the plaza.', err);
      return null;
    });
    const start = saved && map.canStand(saved.x, saved.z, ACTOR_RADIUS) ? saved : { ...map.spawn, heading: 0 };
    return new World(opts, map, start);
  }

  async dispose(): Promise<void> {
    this.renderer.setAnimationLoop(null);
    window.removeEventListener('pagehide', this.saveOnHide);
    this.resizeObserver.disconnect();
    this.input.dispose();
    await this.savePosition();
    this.scene.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        o.geometry.dispose();
        (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => m.dispose());
      }
    });
    this.renderer.dispose();
    this.renderer.domElement.remove();
    this.hud.root.remove();
  }

  private async savePosition(): Promise<void> {
    const { x, z, heading } = this.player;
    this.dirty = false;
    this.sinceSave = 0;
    try {
      await this.opts.stateRepo.setPlayerState(this.opts.character.id, { x, z, heading });
    } catch (err) {
      // Try again on the next save tick.
      this.dirty = true;
      console.warn('Could not save the position.', err);
    }
  }

  private resize(): void {
    const { clientWidth: w, clientHeight: h } = this.opts.container;
    if (w === 0 || h === 0) return;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    // Portrait screens need a wider view to see the same amount of island.
    this.camera.fov = w / h < 0.8 ? 58 : 40;
    this.camera.updateProjectionMatrix();
  }

  private frame(time: number): void {
    this.timer.update(time);
    const dt = Math.min(this.timer.getDelta(), 0.05);

    this.updatePlayer(dt);
    for (const npc of this.npcs) this.updateNpc(npc, dt);
    for (const actor of [this.player, ...this.npcs]) this.syncActor(actor, dt);
    this.updateTalkPrompt();
    this.hud.update(dt);
    this.placeCamera(false, dt);

    const now = new Date();
    this.updateSky(now);
    this.hud.setClock(now);
    this.hud.drawMinimap([
      ...this.npcs.map((n) => ({ x: n.x, z: n.z, color: n.villager.color })),
      { x: this.player.x, z: this.player.z, color: '#ffffff', player: true },
    ]);

    this.sinceSave += dt;
    if (this.dirty && this.sinceSave > SAVE_EVERY_SECONDS) void this.savePosition();

    this.renderer.render(this.scene, this.camera);
  }

  private updatePlayer(dt: number): void {
    const p = this.player;
    const action = this.input.consumeAction();

    if (this.talkingTo) {
      p.speed = 0;
      if (action && !this.hud.advanceDialogue()) {
        this.talkingTo.talking = false;
        this.talkingTo.waitLeft = 2;
        this.talkingTo = null;
      }
      return;
    }

    if (action) {
      const npc = this.nearestNpc();
      if (npc) {
        this.startTalking(npc);
        return;
      }
    }

    const move = this.input.move;
    const amount = Math.hypot(move.x, move.z);
    if (amount < 0.1) {
      p.speed = 0;
      return;
    }
    const speed = (this.input.running ? RUN_SPEED : WALK_SPEED) * Math.min(1, amount);
    p.heading = turnToward(p.heading, Math.atan2(move.x, move.z), dt * 14);
    p.speed = this.moveActor(p, (move.x / amount) * speed * dt, (move.z / amount) * speed * dt) ? speed : 0;
  }

  private startTalking(npc: Npc): void {
    this.talkingTo = npc;
    npc.talking = true;
    npc.target = null;
    npc.speed = 0;
    this.player.speed = 0;
    this.player.heading = Math.atan2(npc.x - this.player.x, npc.z - this.player.z);
    const lines = conversation(npc.villager, this.opts.character.name, new Date().getHours());
    this.hud.openDialogue(npc.villager.name, npc.villager.color, lines);
    this.hud.showPrompt('', null);
  }

  private updateNpc(npc: Npc, dt: number): void {
    const toPlayer = Math.hypot(this.player.x - npc.x, this.player.z - npc.z);
    // Stop and look at the player when they come close or are talking.
    if (npc.talking || toPlayer < TALK_DISTANCE) {
      npc.speed = 0;
      npc.heading = turnToward(npc.heading, Math.atan2(this.player.x - npc.x, this.player.z - npc.z), dt * 6);
      return;
    }

    if (!npc.target) {
      npc.speed = 0;
      npc.waitLeft -= dt;
      if (npc.waitLeft <= 0) npc.target = this.pickWanderTarget(npc);
      return;
    }

    const dx = npc.target.x - npc.x;
    const dz = npc.target.z - npc.z;
    const dist = Math.hypot(dx, dz);
    const step = Math.min(dist, NPC_SPEED * dt);
    npc.heading = turnToward(npc.heading, Math.atan2(dx, dz), dt * 8);
    const moved = dist > 0.05 && this.moveActor(npc, (dx / dist) * step, (dz / dist) * step);
    npc.speed = moved ? NPC_SPEED : 0;
    if (!moved || dist < 0.1) {
      npc.target = null;
      npc.waitLeft = 1.5 + Math.random() * 4;
    }
  }

  private pickWanderTarget(npc: Npc): Point | null {
    for (let i = 0; i < 10; i++) {
      const angle = Math.random() * Math.PI * 2;
      const r = Math.random() * NPC_WANDER_RADIUS;
      const x = npc.home.x + Math.cos(angle) * r;
      const z = npc.home.z + Math.sin(angle) * r;
      if (this.map.canStand(x, z, ACTOR_RADIUS)) return { x, z };
    }
    npc.waitLeft = 1;
    return null;
  }

  /** Moves an actor, sliding along walls. Returns true if it moved at all. */
  private moveActor(actor: Actor, dx: number, dz: number): boolean {
    const free = (x: number, z: number) => this.canStand(actor, x, z);
    if (free(actor.x + dx, actor.z + dz)) {
      actor.x += dx;
      actor.z += dz;
    } else if (dx !== 0 && free(actor.x + dx, actor.z)) {
      actor.x += dx;
    } else if (dz !== 0 && free(actor.x, actor.z + dz)) {
      actor.z += dz;
    } else {
      return false;
    }
    if (actor === this.player) this.dirty = true;
    return true;
  }

  private canStand(actor: Actor, x: number, z: number): boolean {
    if (!this.map.canStand(x, z, ACTOR_RADIUS)) return false;
    const minGap = ACTOR_RADIUS * 2;
    for (const other of [this.player, ...this.npcs]) {
      if (other === actor) continue;
      const before = Math.hypot(other.x - actor.x, other.z - actor.z);
      const after = Math.hypot(other.x - x, other.z - z);
      // Block moving closer to someone we overlap; always allow moving apart.
      if (after < minGap && after < before) return false;
    }
    return true;
  }

  private nearestNpc(): Npc | null {
    let best: Npc | null = null;
    let bestDist = TALK_DISTANCE;
    for (const npc of this.npcs) {
      const d = Math.hypot(npc.x - this.player.x, npc.z - this.player.z);
      if (d < bestDist) {
        best = npc;
        bestDist = d;
      }
    }
    return best;
  }

  private syncActor(actor: Actor, dt: number): void {
    const root = actor.animator.rig.root;
    root.position.set(actor.x, 0, actor.z);
    root.rotation.y = actor.heading;
    actor.animator.update(dt, actor.speed / ACTOR_HEIGHT);
  }

  private updateTalkPrompt(): void {
    const npc = this.talkingTo ? null : this.nearestNpc();
    if (!npc) {
      this.hud.showPrompt('', null);
      return;
    }
    const head = new THREE.Vector3(npc.x, ACTOR_HEIGHT + 0.3, npc.z).project(this.camera);
    const { clientWidth: w, clientHeight: h } = this.opts.container;
    this.hud.showPrompt(`💬 Talk to ${npc.villager.name}`, { x: ((head.x + 1) / 2) * w, y: ((1 - head.y) / 2) * h });
  }

  private placeCamera(snap: boolean, dt = 0): void {
    const focus = new THREE.Vector3(this.player.x, 0.6, this.player.z);
    const wanted = focus.clone().add(CAMERA_OFFSET);
    if (snap) this.camera.position.copy(wanted);
    else this.camera.position.lerp(wanted, Math.min(1, dt * 5));
    this.camera.lookAt(this.camera.position.clone().sub(CAMERA_OFFSET));

    // Keep the shadow-casting light centered on the player.
    this.sun.position.set(focus.x + 6, 14, focus.z + 5);
    this.sun.target.position.copy(focus);
  }

  private updateSky(now: Date): void {
    const part = dayPart(now.getHours());
    if (part === this.skyPart) return;
    this.skyPart = part;
    const s = SKY[part];
    this.scene.background = new THREE.Color(s.sky);
    this.scene.fog = new THREE.Fog(s.sky, 25, 60);
    this.sun.color.set(s.sun);
    this.sun.intensity = s.sunIntensity;
    this.ambient.intensity = s.ambient;
  }
}
