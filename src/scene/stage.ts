import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { buildCharacter, type CharacterRig } from '../character/build';
import type { Appearance } from '../character/model';

const WAVE_SECONDS = 1.6;

/** The 3D preview: a small island with the character standing on it. */
export class Stage {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(35, 1, 0.1, 100);
  private readonly controls: OrbitControls;
  private readonly timer = new THREE.Timer();
  private rig: CharacterRig | null = null;
  private waveUntil = 0;
  private nextBlink = 2;

  constructor(private readonly container: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    container.appendChild(this.renderer.domElement);

    this.camera.position.set(0, 1.6, 5.2);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.target.set(0, 0.95, 0);
    this.controls.enablePan = false;
    this.controls.enableDamping = true;
    this.controls.minDistance = 2.5;
    this.controls.maxDistance = 8;
    this.controls.minPolarAngle = 0.5;
    this.controls.maxPolarAngle = Math.PI / 2 - 0.05;
    this.controls.update();

    this.buildWorld();
    new ResizeObserver(() => this.resize()).observe(container);
    this.resize();
    this.renderer.setAnimationLoop((time) => this.frame(time));
  }

  setAppearance(appearance: Appearance): void {
    if (this.rig) {
      this.scene.remove(this.rig.root);
      this.rig.dispose();
    }
    this.rig = buildCharacter(appearance);
    this.scene.add(this.rig.root);
  }

  wave(): void {
    this.waveUntil = this.timer.getElapsed() + WAVE_SECONDS;
  }

  private resize(): void {
    const { clientWidth: w, clientHeight: h } = this.container;
    if (w === 0 || h === 0) return;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    // Pull back on narrow screens so the whole character fits.
    this.camera.fov = w / h < 0.8 ? 45 : 35;
    this.camera.updateProjectionMatrix();
  }

  private buildWorld(): void {
    const s = this.scene;
    s.background = new THREE.Color('#bfe6ff');
    s.fog = new THREE.Fog('#bfe6ff', 12, 30);

    s.add(new THREE.HemisphereLight('#ffffff', '#6fae5a', 1.4));
    const sun = new THREE.DirectionalLight('#fff4e0', 2.2);
    sun.position.set(3, 6, 4);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    sun.shadow.camera.left = -3;
    sun.shadow.camera.right = 3;
    sun.shadow.camera.top = 3;
    sun.shadow.camera.bottom = -3;
    sun.shadow.bias = -0.0005;
    s.add(sun);

    const mat = (color: string) => new THREE.MeshLambertMaterial({ color });

    const water = new THREE.Mesh(new THREE.CircleGeometry(40, 48), mat('#6cc4e8'));
    water.rotation.x = -Math.PI / 2;
    water.position.y = -0.35;
    s.add(water);

    const sand = new THREE.Mesh(new THREE.CylinderGeometry(6.3, 6.6, 0.4, 48), mat('#f3e2b3'));
    sand.position.y = -0.3;
    s.add(sand);

    const grass = new THREE.Mesh(new THREE.CylinderGeometry(5.6, 5.8, 0.3, 48), mat('#8fd16f'));
    grass.position.y = -0.15;
    grass.receiveShadow = true;
    s.add(grass);

    const addTree = (x: number, z: number, scale: number) => {
      const tree = new THREE.Group();
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 1, 10), mat('#8b5e3c'));
      trunk.position.y = 0.5;
      tree.add(trunk);
      for (const [y, r] of [[1.25, 0.7], [1.75, 0.55], [2.15, 0.35]]) {
        const leaves = new THREE.Mesh(new THREE.SphereGeometry(r, 16, 12), mat('#4caf50'));
        leaves.position.y = y;
        leaves.castShadow = true;
        tree.add(leaves);
      }
      tree.position.set(x, 0, z);
      tree.scale.setScalar(scale);
      s.add(tree);
    };
    addTree(-2.8, -2.2, 1.1);
    addTree(3.1, -3, 1.3);
    addTree(-4, 1.2, 0.9);

    const flowerColors = ['#ff8fb1', '#f1c40f', '#ffffff', '#e74c3c', '#9b59b6'];
    for (let i = 0; i < 24; i++) {
      const angle = i * 2.4;
      const r = 1.8 + ((i * 7) % 10) * 0.3;
      const flower = new THREE.Mesh(
        new THREE.SphereGeometry(0.07, 8, 6),
        mat(flowerColors[i % flowerColors.length]),
      );
      flower.position.set(Math.cos(angle) * r, 0.05, Math.sin(angle) * r);
      s.add(flower);
    }
  }

  private frame(time: number): void {
    this.timer.update(time);
    const dt = this.timer.getDelta();
    const t = this.timer.getElapsed();
    this.controls.update();
    if (this.rig) this.animate(this.rig, t, dt);
    this.renderer.render(this.scene, this.camera);
  }

  private animate(rig: CharacterRig, t: number, dt: number): void {
    // Idle: gentle breathing and a slow head sway.
    rig.body.position.y = Math.abs(Math.sin(t * 2)) * 0.02;
    rig.head.rotation.z = Math.sin(t * 0.9) * 0.05;
    rig.head.rotation.y = Math.sin(t * 0.5) * 0.12;
    if (rig.tail) rig.tail.rotation.y = Math.sin(t * 3) * 0.35;

    const waving = t < this.waveUntil;
    const target = waving ? 2.6 + Math.sin(t * 14) * 0.35 : 0.25 + Math.sin(t * 2) * 0.04;
    rig.leftArm.rotation.z += (target - rig.leftArm.rotation.z) * Math.min(1, dt * 10);
    rig.rightArm.rotation.z = -0.25 - Math.sin(t * 2) * 0.04;

    // Blink every few seconds.
    if (t > this.nextBlink + 0.15) this.nextBlink = t + 2 + Math.random() * 3;
    const blink = t > this.nextBlink ? 0.1 : 1;
    for (const eye of rig.eyes) eye.scale.y = blink;
  }
}
