import * as THREE from 'three';
import { CharacterAnimator } from '../character/animator';
import { buildCharacter } from '../character/build';
import type { Appearance, Character } from '../character/model';
import type { Home } from '../home/home';
import type { CharacterRepository } from '../storage/characterRepository';
import type { HomeRepository } from '../storage/homeRepository';
import type { PlayerState, WorldStateRepository } from '../storage/worldStateRepository';
import { HomeEditor } from './homeEditor';
import { Hud } from './hud';
import { Input } from './input';
import { Room } from './interior';
import { type RoomColors, buildRoom, villagerRoomColors } from './interiorScenery';
import { type HouseSite, IslandMap, type Point, houseDoor } from './map';
import { type Villager, conversation, dayPart } from './npcs';
import { buildEmptyLot, buildHouse, buildScenery } from './scenery';

/** Characters are built about 2 units tall; the island uses 1-unit tiles. */
const ACTOR_SCALE = 0.6;
const ACTOR_HEIGHT = 2 * ACTOR_SCALE;
const ACTOR_RADIUS = 0.28;
const WALK_SPEED = 3;
const RUN_SPEED = 5.5;
const NPC_SPEED = 1.3;
const NPC_WANDER_RADIUS = { island: 6, room: 2.5 };
const TALK_DISTANCE = 1.6;
const DOOR_PROMPT_DISTANCE = 1.3;
const CAMERA_OFFSET = new THREE.Vector3(0, 6, 7.5);
const SAVE_EVERY_SECONDS = 3;
const HOME_SAVE_DELAY_MS = 500;
const EMPTY_LOT_COLOR = '#c9a66b';
/** Heading that faces the camera (+z); its opposite faces into the screen. */
const FACE_CAMERA = 0;
const FACE_AWAY = Math.PI;

/**
 * The island is one area; each house interior is another. Villager houses
 * are keyed by the villager's id, player houses by `home-<characterId>`.
 */
const ISLAND = 'island';
const homeKey = (characterId: string) => `home-${characterId}`;

interface Area {
  canStand(x: number, z: number, radius: number): boolean;
}

interface Actor {
  animator: CharacterAnimator;
  area: string;
  x: number;
  z: number;
  heading: number;
  speed: number;
}

interface Npc extends Actor {
  villager: Villager;
  house: HouseSite;
  target: Point | null;
  waitLeft: number;
  talking: boolean;
}

interface House {
  key: string;
  site: HouseSite;
  /** Whose house it is, for the door label. */
  name: string;
  villager?: Villager;
  home?: Home;
  room: Room;
  group: THREE.Group;
  pieces: THREE.Group[];
  /** A player house as seen on the island. Rebuilt when its colors change. */
  outside?: THREE.Group;
}

function homeRoomColors(home: Home): RoomColors {
  const i = home.interior;
  return { accent: home.exterior.roof, wall: i.wallpaper, floor: i.floorColor, floorStyle: i.floorStyle };
}

function makeActor(appearance: Appearance, area: string, at: Point, heading = 0): Actor {
  const rig = buildCharacter(appearance);
  rig.root.scale.setScalar(ACTOR_SCALE);
  return { animator: new CharacterAnimator(rig), area, x: at.x, z: at.z, heading, speed: 0 };
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
  homeRepo: HomeRepository;
  characterRepo: CharacterRepository;
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
  private readonly islandGroup: THREE.Group;
  private readonly houses = new Map<string, House>();
  private readonly hud: Hud;
  private readonly input: Input;
  private readonly player: Actor;
  private readonly npcs: Npc[];
  private readonly resizeObserver: ResizeObserver;
  private readonly editor: HomeEditor;
  private homeSaveTimer: number | undefined;
  private pendingHome: Home | null = null;
  private talkingTo: Npc | null = null;
  /** True while the screen fades between areas. Input is ignored. */
  private transitioning = false;
  private sinceSave = 0;
  private dirty = false;
  private skyKey = '';
  private readonly saveOnHide = () => void this.savePosition();

  private constructor(
    private readonly opts: WorldOptions,
    map: IslandMap,
    start: PlayerState,
    homes: Home[],
    names: Map<string, string>,
  ) {
    const { container, villagers } = opts;
    this.map = map;
    for (const villager of villagers) {
      const site = map.houses.find((h) => h.owner === villager.id)!;
      this.addHouse({ key: villager.id, site, name: villager.name, villager, room: Room.forPersonality(villager.personality) });
    }
    for (const home of homes) {
      const site = map.plots[home.plot];
      if (!site) continue;
      const name = names.get(home.characterId) ?? 'Someone';
      this.addHouse({ key: homeKey(home.characterId), site, name, home, room: new Room(home.interior.furniture) });
    }

    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    container.append(this.renderer.domElement);

    this.hud = new Hud(this.map, this.minimapColors());
    container.append(this.hud.root);
    this.hud.setPlayer(opts.character.name);
    this.hud.editButton.addEventListener('click', () => opts.onEditCharacter());
    this.hud.decorateButton.addEventListener('click', () => this.startDecorating());
    this.input = new Input(this.hud.joystick, this.hud.knob, this.hud.actionButton);
    this.editor = new HomeEditor({
      camera: this.camera,
      canvas: this.renderer.domElement,
      apply: (home) => this.applyHome(home),
      closed: () => this.stopDecorating(),
    });
    this.hud.root.append(this.editor.panel.root);

    this.scene.add(this.ambient, this.sun, this.sun.target);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    Object.assign(this.sun.shadow.camera, { left: -16, right: 16, top: 16, bottom: -16, near: 1, far: 50 });
    this.sun.shadow.bias = -0.0008;
    this.islandGroup = buildScenery(this.map, villagers.map((v) => ({ owner: v.id, roofColor: v.color })));
    this.scene.add(this.islandGroup);
    for (const site of map.plots) {
      const house = [...this.houses.values()].find((h) => h.site === site);
      if (house) this.buildOutside(house);
      else this.islandGroup.add(buildEmptyLot(site));
    }

    this.player = makeActor(opts.character.appearance, start.inside ?? ISLAND, start, start.heading);
    this.scene.add(this.player.animator.rig.root);
    this.npcs = villagers.map((villager) => {
      const house = this.houses.get(villager.id)!;
      const npc: Npc = {
        ...makeActor(villager.appearance, ISLAND, this.besideDoor(house.site)),
        villager,
        house: house.site,
        target: null,
        waitLeft: Math.random() * 3,
        talking: false,
      };
      this.scene.add(npc.animator.rig.root);
      return npc;
    });
    // If we start inside a villager's house, they are home.
    const startHouse = start.inside ? this.houses.get(start.inside) : undefined;
    if (startHouse?.villager) this.bringOwnerInside(startHouse);
    this.updateVisibility();

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(container);
    this.resize();
    this.updateSky(new Date());
    this.placeCamera(true);
    this.player.animator.wave();
    window.addEventListener('pagehide', this.saveOnHide);
    this.renderer.setAnimationLoop((time) => this.frame(time));
  }

  /** Loads the player's last position (or the plaza spawn) and every house, then starts the game loop. */
  static async create(opts: WorldOptions): Promise<World> {
    const map = new IslandMap(opts.villagers.map((v) => ({ owner: v.id })));
    const warn = (what: string) => (err: unknown) => {
      console.warn(`Could not load ${what}.`, err);
      return null;
    };
    const [saved, homes, residents] = await Promise.all([
      opts.stateRepo.getPlayerState(opts.character.id).catch(warn('the saved position')),
      opts.homeRepo.list().catch(warn('houses')),
      opts.characterRepo.list().catch(warn('residents')),
    ]);
    const names = new Map((residents ?? []).map((c) => [c.id, c.name]));
    names.set(opts.character.id, opts.character.name);
    const roomFor = (key: string): Room | null => {
      const villager = opts.villagers.find((v) => v.id === key);
      if (villager) return Room.forPersonality(villager.personality);
      const home = homes?.find((h) => homeKey(h.characterId) === key);
      return home ? new Room(home.interior.furniture) : null;
    };
    return new World(opts, map, World.validStart(map, roomFor, saved), homes ?? [], names);
  }

  /** The saved position if it is still a valid place to stand, otherwise the plaza. */
  private static validStart(map: IslandMap, roomFor: (key: string) => Room | null, saved: PlayerState | null): PlayerState {
    const plaza = { ...map.spawn, heading: FACE_CAMERA };
    if (!saved) return plaza;
    if (saved.inside) {
      const room = roomFor(saved.inside);
      if (!room) return plaza;
      return room.canStand(saved.x, saved.z, ACTOR_RADIUS) ? saved : { ...room.entrance, heading: FACE_AWAY, inside: saved.inside };
    }
    return map.canStand(saved.x, saved.z, ACTOR_RADIUS) ? saved : plaza;
  }

  private addHouse(house: Omit<House, 'group' | 'pieces'>): void {
    const full = house as House;
    full.group = new THREE.Group();
    full.pieces = [];
    this.houses.set(house.key, full);
    this.buildInside(full);
  }

  /** (Re)builds a house's room from its current furniture and colors. */
  private buildInside(house: House): void {
    const old = house.group;
    const colors = house.home ? homeRoomColors(house.home) : villagerRoomColors(house.villager!.color);
    const { group, pieces } = buildRoom(house.room, colors);
    group.visible = old.visible;
    old.removeFromParent();
    disposeTree(old);
    house.group = group;
    house.pieces = pieces;
    this.scene.add(group);
  }

  /** (Re)builds a player house on the island in its chosen colors. */
  private buildOutside(house: House): void {
    if (house.outside) {
      house.outside.removeFromParent();
      disposeTree(house.outside);
    }
    house.outside = buildHouse(house.site, house.home!.exterior);
    this.islandGroup.add(house.outside);
  }

  /** Colors for houses on the minimap, keyed by site owner. */
  private minimapColors(): Map<string, string> {
    const colors = new Map<string, string>(this.map.plots.map((p) => [p.owner, EMPTY_LOT_COLOR]));
    for (const house of this.houses.values()) {
      colors.set(house.site.owner, house.villager?.color ?? house.home!.exterior.roof);
    }
    return colors;
  }

  // ---------- Decorating ----------

  private get ownHouse(): House | undefined {
    return this.houses.get(homeKey(this.opts.character.id));
  }

  private startDecorating(): void {
    const house = this.ownHouse;
    if (!house || this.player.area !== house.key || this.editor.isOpen) return;
    this.hud.root.classList.add('decorating');
    this.hud.showPrompt('', null);
    this.editor.open({ home: house.home!, group: house.group, pieces: house.pieces });
    this.updateVisibility();
  }

  private stopDecorating(): void {
    this.hud.root.classList.remove('decorating');
    // New furniture might sit where the player was standing.
    const house = this.ownHouse!;
    if (!house.room.canStand(this.player.x, this.player.z, ACTOR_RADIUS)) {
      this.player.x = house.room.entrance.x;
      this.player.z = house.room.entrance.z;
      this.dirty = true;
    }
    this.flushHomeSave();
    this.updateVisibility();
  }

  /** The editor changed the house: rebuild it and save soon. */
  private applyHome(home: Home): void {
    const house = this.ownHouse!;
    const outsideChanged = JSON.stringify(home.exterior) !== JSON.stringify(house.home!.exterior);
    house.home = home;
    house.room = new Room(home.interior.furniture);
    this.buildInside(house);
    if (outsideChanged) {
      this.buildOutside(house);
      this.hud.setHouseColors(this.map, this.minimapColors());
    }
    this.editor.roomRebuilt({ home, group: house.group, pieces: house.pieces });
    this.pendingHome = home;
    window.clearTimeout(this.homeSaveTimer);
    this.homeSaveTimer = window.setTimeout(() => this.flushHomeSave(), HOME_SAVE_DELAY_MS);
  }

  private flushHomeSave(): void {
    window.clearTimeout(this.homeSaveTimer);
    const home = this.pendingHome;
    if (!home) return;
    this.pendingHome = null;
    this.opts.homeRepo.save(home).catch((err: unknown) => {
      console.warn('Could not save the house.', err);
      this.editor.panel.setHint('Could not save. Check the connection; changes will retry.');
      this.pendingHome ??= home;
    });
  }

  async dispose(): Promise<void> {
    this.renderer.setAnimationLoop(null);
    window.removeEventListener('pagehide', this.saveOnHide);
    if (this.editor.isOpen) this.editor.close();
    this.flushHomeSave();
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
    const { x, z, heading, area } = this.player;
    const state: PlayerState = area === ISLAND ? { x, z, heading } : { x, z, heading, inside: area };
    this.dirty = false;
    this.sinceSave = 0;
    try {
      await this.opts.stateRepo.setPlayerState(this.opts.character.id, state);
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
    this.updatePrompt();
    this.hud.update(dt);
    this.placeCamera(false, dt);

    const now = new Date();
    this.updateSky(now);
    this.hud.setClock(now);
    this.hud.drawMinimap([
      ...this.npcs.map((n) => ({ ...this.islandPosition(n), color: n.villager.color })),
      { ...this.islandPosition(this.player), color: '#ffffff', player: true },
    ]);

    this.sinceSave += dt;
    if (this.dirty && this.sinceSave > SAVE_EVERY_SECONDS) void this.savePosition();

    this.renderer.render(this.scene, this.camera);
  }

  /** Where an actor shows on the island minimap: their own spot, or the door of the house they are in. */
  private islandPosition(actor: Actor): Point {
    return actor.area === ISLAND ? { x: actor.x, z: actor.z } : houseDoor(this.houses.get(actor.area)!.site);
  }

  private areaOf(actor: Actor): Area {
    return actor.area === ISLAND ? this.map : this.houses.get(actor.area)!.room;
  }

  private updatePlayer(dt: number): void {
    const p = this.player;
    const action = this.input.consumeAction();
    if (this.transitioning || this.editor.isOpen) {
      p.speed = 0;
      return;
    }

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

    // Walking into a front door goes in; walking onto the doormat comes back out.
    if (p.area === ISLAND && move.z < -0.3) {
      const house = this.doorAt(p.x, p.z);
      if (house) void this.enterHouse(house);
    } else if (p.area !== ISLAND && move.z > 0.3 && this.houses.get(p.area)!.room.onDoormat(p.x, p.z)) {
      void this.leaveHouse(this.houses.get(p.area)!);
    }
  }

  /** The house whose front door is right in front of this spot, if any. */
  private doorAt(x: number, z: number): House | null {
    for (const house of this.houses.values()) {
      const door = houseDoor(house.site);
      // The house's front wall is half a tile behind the door tile's center.
      const wallZ = door.z - 0.5;
      if (Math.abs(x - door.x) < 0.45 && z - wallZ < ACTOR_RADIUS + 0.15) return house;
    }
    return null;
  }

  private nearestDoor(): House | null {
    if (this.player.area !== ISLAND) return null;
    let best: House | null = null;
    let bestDist = DOOR_PROMPT_DISTANCE;
    for (const house of this.houses.values()) {
      const door = houseDoor(house.site);
      const d = Math.hypot(door.x - this.player.x, door.z - this.player.z);
      if (d < bestDist) {
        best = house;
        bestDist = d;
      }
    }
    return best;
  }

  private async enterHouse(house: House): Promise<void> {
    await this.transition(() => {
      const p = this.player;
      p.area = house.key;
      p.x = house.room.entrance.x;
      p.z = house.room.entrance.z;
      p.heading = FACE_AWAY;
      if (house.villager) this.bringOwnerInside(house);
    });
  }

  private async leaveHouse(house: House): Promise<void> {
    await this.transition(() => {
      const p = this.player;
      const door = houseDoor(house.site);
      p.area = ISLAND;
      p.x = door.x;
      p.z = door.z;
      p.heading = FACE_CAMERA;
      // A villager follows you out, stepping to one side of the path.
      const owner = this.npcs.find((n) => n.villager === house.villager);
      if (owner?.area === house.key) this.placeNpc(owner, ISLAND, this.besideDoor(house.site), FACE_CAMERA);
    });
  }

  /** A spot next to a house's front path, where its owner hangs around without blocking the door. */
  private besideDoor(site: HouseSite): Point {
    const door = houseDoor(site);
    const spots = [[1.6, 0.8], [-1.6, 0.8], [1.6, 2], [-1.6, 2], [0, 2.5]].map(([dx, dz]) => ({ x: door.x + dx, z: door.z + dz }));
    return spots.find((s) => this.map.canStand(s.x, s.z, ACTOR_RADIUS)) ?? door;
  }

  /** Villagers never stop to idle right in front of a door. */
  private nearAnyDoor(x: number, z: number): boolean {
    for (const house of this.houses.values()) {
      const door = houseDoor(house.site);
      if (Math.hypot(door.x - x, door.z - z) < 1.2) return true;
    }
    return false;
  }

  private bringOwnerInside(house: House): void {
    const owner = this.npcs.find((n) => n.villager === house.villager)!;
    this.placeNpc(owner, house.key, house.room.ownerSpot, FACE_CAMERA);
  }

  private placeNpc(npc: Npc, area: string, at: Point, heading: number): void {
    npc.area = area;
    npc.x = at.x;
    npc.z = at.z;
    npc.heading = heading;
    npc.target = null;
    npc.speed = 0;
    npc.waitLeft = 2 + Math.random() * 2;
  }

  /** Fades out, runs the change, snaps the camera, and fades back in. */
  private async transition(change: () => void): Promise<void> {
    if (this.transitioning) return;
    this.transitioning = true;
    this.hud.showPrompt('', null);
    await this.hud.fade(true);
    change();
    this.updateVisibility();
    this.updateSky(new Date());
    this.placeCamera(true);
    this.dirty = true;
    await this.hud.fade(false);
    this.transitioning = false;
  }

  /** Shows only the area the player is in, and only the characters in it. */
  private updateVisibility(): void {
    const area = this.player.area;
    this.islandGroup.visible = area === ISLAND;
    for (const [id, house] of this.houses) house.group.visible = id === area;
    for (const npc of this.npcs) npc.animator.rig.root.visible = npc.area === area;
    this.hud.decorateButton.hidden = area !== this.ownHouse?.key || this.editor.isOpen;
  }

  private startTalking(npc: Npc): void {
    this.talkingTo = npc;
    npc.talking = true;
    npc.target = null;
    npc.speed = 0;
    this.player.speed = 0;
    this.player.heading = Math.atan2(npc.x - this.player.x, npc.z - this.player.z);
    const atHome = npc.area === npc.villager.id;
    const lines = conversation(npc.villager, this.opts.character.name, new Date().getHours(), Math.random, atHome);
    this.hud.openDialogue(npc.villager.name, npc.villager.color, lines);
    this.hud.showPrompt('', null);
  }

  private updateNpc(npc: Npc, dt: number): void {
    const sameArea = npc.area === this.player.area;
    const toPlayer = sameArea ? Math.hypot(this.player.x - npc.x, this.player.z - npc.z) : Infinity;
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
    const outside = npc.area === ISLAND;
    const home = outside ? this.besideDoor(npc.house) : this.houses.get(npc.area)!.room.ownerSpot;
    const radius = outside ? NPC_WANDER_RADIUS.island : NPC_WANDER_RADIUS.room;
    const area = this.areaOf(npc);
    for (let i = 0; i < 10; i++) {
      const angle = Math.random() * Math.PI * 2;
      const r = Math.random() * radius;
      const x = home.x + Math.cos(angle) * r;
      const z = home.z + Math.sin(angle) * r;
      if (area.canStand(x, z, ACTOR_RADIUS) && !(outside && this.nearAnyDoor(x, z))) return { x, z };
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
    if (!this.areaOf(actor).canStand(x, z, ACTOR_RADIUS)) return false;
    const minGap = ACTOR_RADIUS * 2;
    for (const other of [this.player, ...this.npcs]) {
      if (other === actor || other.area !== actor.area) continue;
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
      if (npc.area !== this.player.area) continue;
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

  /** Shows "Talk to…" over a nearby villager, or the owner's name over a nearby door. */
  private updatePrompt(): void {
    if (this.talkingTo || this.transitioning || this.editor.isOpen) {
      this.hud.showPrompt('', null);
      return;
    }
    const npc = this.nearestNpc();
    if (npc) {
      this.showPromptAt(`💬 Talk to ${npc.villager.name}`, new THREE.Vector3(npc.x, ACTOR_HEIGHT + 0.3, npc.z));
      return;
    }
    const house = this.nearestDoor();
    if (house) {
      const door = houseDoor(house.site);
      const label = house === this.ownHouse ? '🏠 Your house' : `🚪 ${house.name}'s house`;
      this.showPromptAt(label, new THREE.Vector3(door.x, 1.9, door.z - 0.5));
      return;
    }
    const lot = this.nearestEmptyLot();
    if (lot) {
      const door = houseDoor(lot);
      this.showPromptAt('🪧 For sale: a new resident gets this lot', new THREE.Vector3(door.x, 1.3, door.z - 0.4));
      return;
    }
    this.hud.showPrompt('', null);
  }

  private nearestEmptyLot(): HouseSite | null {
    if (this.player.area !== ISLAND) return null;
    const taken = new Set([...this.houses.values()].map((h) => h.site));
    return (
      this.map.plots.find((site) => {
        if (taken.has(site)) return false;
        const door = houseDoor(site);
        return Math.hypot(door.x - this.player.x, door.z - this.player.z) < DOOR_PROMPT_DISTANCE;
      }) ?? null
    );
  }

  private showPromptAt(text: string, at: THREE.Vector3): void {
    const p = at.project(this.camera);
    const { clientWidth: w, clientHeight: h } = this.opts.container;
    this.hud.showPrompt(text, { x: ((p.x + 1) / 2) * w, y: ((1 - p.y) / 2) * h });
  }

  private placeCamera(snap: boolean, dt = 0): void {
    const focus = new THREE.Vector3(this.player.x, 0.6, this.player.z);
    let offset = CAMERA_OFFSET;
    if (this.editor.isOpen) {
      // Decorating: frame the whole room in the space the panel leaves free.
      // Wide screens have the panel on the right, so aim right of center to
      // shift the room left. Portrait screens have it along the bottom, so
      // pull back and aim forward to lift the room up.
      const portrait = this.camera.aspect < 0.8;
      focus.set(portrait ? 0 : 1.6, 0.6, portrait ? 3.4 : 0.4);
      offset = CAMERA_OFFSET.clone().multiplyScalar(portrait ? 1.55 : 1.05);
    } else if (this.player.area !== ISLAND) {
      // Indoors, drift only a little so the whole room stays in view.
      focus.x = THREE.MathUtils.clamp(focus.x, -1.2, 1.2);
      focus.z = THREE.MathUtils.clamp(focus.z, -1.5, 0.8);
    }
    const wanted = focus.clone().add(offset);
    if (snap) this.camera.position.copy(wanted);
    else this.camera.position.lerp(wanted, Math.min(1, dt * 5));
    this.camera.lookAt(this.camera.position.clone().sub(offset));

    // Keep the shadow-casting light centered on the player.
    this.sun.position.set(focus.x + 6, 14, focus.z + 5);
    this.sun.target.position.copy(focus);
  }

  private updateSky(now: Date): void {
    const part = dayPart(now.getHours());
    const indoors = this.player.area !== ISLAND;
    const key = `${part}:${indoors}`;
    if (key === this.skyKey) return;
    this.skyKey = key;
    const s = SKY[part];
    this.sun.color.set(s.sun);
    this.sun.intensity = s.sunIntensity;
    this.ambient.intensity = s.ambient;
    if (indoors) {
      // A dark surround, and lamps on so rooms stay bright at night.
      this.scene.background = new THREE.Color('#2b2119');
      this.scene.fog = null;
      this.ambient.intensity = Math.max(s.ambient, 1.3);
      this.sun.intensity = Math.max(s.sunIntensity, 1.6);
    } else {
      this.scene.background = new THREE.Color(s.sky);
      this.scene.fog = new THREE.Fog(s.sky, 25, 60);
    }
  }
}

function disposeTree(root: THREE.Object3D): void {
  root.traverse((o) => {
    if (o instanceof THREE.Mesh) {
      o.geometry.dispose();
      (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => m.dispose());
    }
  });
}
