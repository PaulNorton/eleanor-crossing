import * as THREE from 'three';
import type { Appearance, Species } from './model';

// Chibi proportions: short body, big head. The character stands on y = 0.
const HEAD_CENTER = new THREE.Vector3(0, 1.45, 0);
const HEAD_RADIUS = 0.55;
const SHOULDER_Y = 0.88;
const HIP_Y = 0.4;

const WHITE = '#ffffff';
const DARK = '#2b2b2b';
const PINK = '#f7a1b5';
const BLUSH = '#ff8fa3';

/** Three-step gradient that gives MeshToonMaterial its cel-shaded look. */
const toonGradient = (() => {
  const data = new Uint8Array([90, 170, 255]);
  const texture = new THREE.DataTexture(data, data.length, 1, THREE.RedFormat);
  texture.minFilter = THREE.NearestFilter;
  texture.magFilter = THREE.NearestFilter;
  texture.needsUpdate = true;
  return texture;
})();

function shade(hex: string, amount: number): string {
  const c = new THREE.Color(hex);
  const hsl = { h: 0, s: 0, l: 0 };
  c.getHSL(hsl);
  c.setHSL(hsl.h, hsl.s, THREE.MathUtils.clamp(hsl.l + amount, 0, 1));
  return `#${c.getHexString()}`;
}

/** Builds meshes with one shared material per color. */
class PartFactory {
  private materials = new Map<string, THREE.Material>();

  material(color: string, doubleSided = false): THREE.Material {
    const key = `${color}:${doubleSided}`;
    let m = this.materials.get(key);
    if (!m) {
      m = new THREE.MeshToonMaterial({
        color,
        gradientMap: toonGradient,
        side: doubleSided ? THREE.DoubleSide : THREE.FrontSide,
      });
      this.materials.set(key, m);
    }
    return m;
  }

  mesh(geometry: THREE.BufferGeometry, color: string): THREE.Mesh {
    const m = new THREE.Mesh(geometry, this.material(color));
    m.castShadow = true;
    return m;
  }

  sphere(radius: number, color: string, scale: [number, number, number] = [1, 1, 1]): THREE.Mesh {
    const m = this.mesh(new THREE.SphereGeometry(radius, 32, 24), color);
    m.scale.set(...scale);
    return m;
  }

  capsule(radius: number, length: number, color: string): THREE.Mesh {
    return this.mesh(new THREE.CapsuleGeometry(radius, length, 8, 16), color);
  }

  cone(radius: number, height: number, color: string, segments = 24): THREE.Mesh {
    return this.mesh(new THREE.ConeGeometry(radius, height, segments), color);
  }

  /** A curved stroke, used for smiles and closed eyes. */
  arc(radius: number, thickness: number, angle: number, color: string): THREE.Mesh {
    const m = this.mesh(new THREE.TorusGeometry(radius, thickness, 8, 24, angle), color);
    m.castShadow = false;
    return m;
  }

  dispose(): void {
    this.materials.forEach((m) => m.dispose());
  }
}

/** Direction on the head sphere. yaw: left/right (radians, + is the character's left). pitch: up/down. */
function headDir(yaw: number, pitch: number): THREE.Vector3 {
  return new THREE.Vector3(
    Math.sin(yaw) * Math.cos(pitch),
    Math.sin(pitch),
    Math.cos(yaw) * Math.cos(pitch),
  );
}

/** Places a part on the head surface with its local +z facing outward. */
function onHead(object: THREE.Object3D, yaw: number, pitch: number, lift = 0, radius = HEAD_RADIUS): THREE.Object3D {
  const dir = headDir(yaw, pitch);
  object.position.copy(dir).multiplyScalar(radius + lift);
  object.lookAt(dir.multiplyScalar(radius * 3));
  return object;
}

export interface CharacterRig {
  root: THREE.Group;
  body: THREE.Group;
  head: THREE.Group;
  leftArm: THREE.Group;
  rightArm: THREE.Group;
  leftLeg: THREE.Group;
  rightLeg: THREE.Group;
  eyes: THREE.Object3D[];
  tail: THREE.Object3D | null;
  dispose(): void;
}

export function buildCharacter(a: Appearance): CharacterRig {
  const f = new PartFactory();
  const root = new THREE.Group();
  root.name = 'character';
  const body = new THREE.Group();
  root.add(body);

  // Legs pivot at the hip so they can swing when walking.
  const legs: THREE.Group[] = [];
  for (const side of [-1, 1]) {
    const hip = new THREE.Group();
    hip.position.set(side * 0.13, HIP_Y, 0);
    const leg = f.capsule(0.11, 0.2, a.pantsColor);
    leg.position.y = 0.26 - HIP_Y;
    const shoe = f.sphere(0.13, a.shoeColor, [1, 0.6, 1.35]);
    shoe.position.set(0, 0.07 - HIP_Y, 0.04);
    hip.add(leg, shoe);
    body.add(hip);
    legs.push(hip);
  }

  // Torso: shirt over a short pants band.
  const hips = f.mesh(new THREE.CylinderGeometry(0.27, 0.28, 0.14, 24), a.pantsColor);
  hips.position.y = 0.42;
  const torso = f.mesh(new THREE.CylinderGeometry(0.22, 0.3, 0.46, 24), a.shirtColor);
  torso.position.y = 0.7;
  const collar = f.mesh(new THREE.TorusGeometry(0.17, 0.035, 8, 24), shade(a.shirtColor, -0.12));
  collar.rotation.x = Math.PI / 2;
  collar.position.y = 0.93;
  body.add(hips, torso, collar);

  // Arms pivot at the shoulder so they can swing and wave.
  const arms: THREE.Group[] = [];
  for (const side of [-1, 1]) {
    const arm = new THREE.Group();
    arm.position.set(side * 0.27, SHOULDER_Y, 0);
    const sleeve = f.capsule(0.08, 0.14, a.shirtColor);
    sleeve.position.y = -0.12;
    const hand = f.sphere(0.075, a.bodyColor);
    hand.position.y = -0.29;
    arm.add(sleeve, hand);
    arm.rotation.z = side * 0.25;
    body.add(arm);
    arms.push(arm);
  }

  // Head group is centered on the head so it can tilt naturally.
  const head = new THREE.Group();
  head.position.copy(HEAD_CENTER);
  body.add(head);
  const skull = f.sphere(HEAD_RADIUS, a.bodyColor, a.species === 'frog' ? [1.12, 0.88, 1] : [1, 0.95, 0.96]);
  head.add(skull);

  const eyes = addEyes(f, head, a);
  addMouth(f, head, a);
  if (a.blush) {
    for (const side of [-1, 1]) {
      head.add(onHead(f.sphere(0.075, BLUSH, [1.2, 0.7, 0.2]), side * 0.62, -0.18, 0.005));
    }
  }
  addSpeciesFeatures(f, head, a);
  addHair(f, head, a);
  addHat(f, head, a);

  const tail = addTail(f, body, a);

  return {
    root,
    body,
    head,
    leftArm: arms[1],
    rightArm: arms[0],
    leftLeg: legs[1],
    rightLeg: legs[0],
    eyes,
    tail,
    dispose() {
      root.traverse((o) => {
        if (o instanceof THREE.Mesh) o.geometry.dispose();
      });
      f.dispose();
    },
  };
}

function addEyes(f: PartFactory, head: THREE.Group, a: Appearance): THREE.Object3D[] {
  const eyes: THREE.Object3D[] = [];
  const frog = a.species === 'frog';
  for (const side of [-1, 1]) {
    const eye = new THREE.Group();
    if (frog) {
      // Frog eyes sit on bumps on top of the head.
      const bump = f.sphere(0.17, a.bodyColor);
      onHead(bump, side * 0.42, 0.62, -0.05);
      head.add(bump);
      onHead(eye, side * 0.42, 0.62, 0.1);
    } else {
      onHead(eye, side * 0.36, 0.02, 0.002);
    }

    switch (a.eyeStyle) {
      case 'round':
      case 'sparkle': {
        const big = a.eyeStyle === 'sparkle';
        const pupil = f.sphere(big ? 0.1 : 0.085, a.eyeColor, [0.85, 1.1, 0.25]);
        const shine = f.sphere(big ? 0.035 : 0.025, WHITE, [1, 1, 0.3]);
        shine.position.set(0.025, 0.04, 0.02);
        eye.add(pupil, shine);
        if (big) {
          const shine2 = f.sphere(0.018, WHITE, [1, 1, 0.3]);
          shine2.position.set(-0.03, -0.035, 0.02);
          eye.add(shine2);
        }
        break;
      }
      case 'sleepy': {
        const lid = f.arc(0.07, 0.016, Math.PI, a.eyeColor);
        lid.rotation.z = Math.PI;
        eye.add(lid);
        break;
      }
      case 'happy': {
        const arc = f.arc(0.07, 0.018, Math.PI, a.eyeColor);
        arc.position.y = -0.03;
        eye.add(arc);
        break;
      }
    }
    head.add(eye);
    eyes.push(eye);
  }
  return eyes;
}

function addMouth(f: PartFactory, head: THREE.Group, a: Appearance): void {
  const frog = a.species === 'frog';
  const mouth = new THREE.Group();
  onHead(mouth, 0, frog ? -0.12 : -0.3, 0.002);
  const smile = f.arc(frog ? 0.2 : 0.06, 0.014, Math.PI, DARK);
  smile.rotation.z = Math.PI;
  mouth.add(smile);
  head.add(mouth);
}

function addSpeciesFeatures(f: PartFactory, head: THREE.Group, a: Appearance): void {
  const inner = shade(a.bodyColor, 0.18);
  const muzzleColor = shade(a.bodyColor, 0.22);
  const addEar = (ear: THREE.Object3D, side: number, yaw: number, pitch: number, lift: number, tilt: number) => {
    onHead(ear, side * yaw, pitch, lift);
    // Point the ear's local +y away from the head, then lean it.
    ear.rotateX(Math.PI / 2);
    ear.rotateZ(side * tilt);
    head.add(ear);
  };

  switch (a.species) {
    case 'human': {
      head.add(onHead(f.sphere(0.05, shade(a.bodyColor, -0.06), [1, 0.9, 0.8]), 0, -0.14, -0.005));
      for (const side of [-1, 1]) {
        const ear = f.sphere(0.09, a.bodyColor, [0.5, 1, 0.8]);
        ear.position.set(side * HEAD_RADIUS * 0.98, -0.02, 0);
        head.add(ear);
      }
      break;
    }
    case 'cat':
    case 'fox': {
      const fox = a.species === 'fox';
      for (const side of [-1, 1]) {
        const ear = new THREE.Group();
        const outer = f.cone(fox ? 0.17 : 0.15, fox ? 0.34 : 0.26, a.bodyColor, 4);
        outer.scale.z = 0.5;
        const innerEar = f.cone(fox ? 0.1 : 0.09, fox ? 0.22 : 0.16, fox ? DARK : PINK, 4);
        innerEar.scale.z = 0.3;
        innerEar.position.set(0, -0.02, 0.03);
        ear.add(outer, innerEar);
        addEar(ear, side, 0.5, 1.05, 0.02, -0.25);
      }
      if (fox) {
        const snout = f.cone(0.16, 0.3, muzzleColor);
        onHead(snout, 0, -0.2, 0.08);
        snout.rotateX(Math.PI / 2);
        head.add(snout, onHead(f.sphere(0.045, DARK), 0, -0.2, 0.23));
      } else {
        head.add(onHead(f.cone(0.04, 0.05, PINK, 3).rotateX(Math.PI / 2), 0, -0.14, 0.005));
        for (const side of [-1, 1]) {
          for (const tilt of [-0.12, 0.12]) {
            const whisker = f.mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.2, 6), DARK);
            onHead(whisker, side * 0.42, -0.18 + tilt * 0.5, 0.01);
            whisker.rotateZ(Math.PI / 2 + side * tilt);
            head.add(whisker);
          }
        }
      }
      break;
    }
    case 'dog': {
      for (const side of [-1, 1]) {
        const ear = f.sphere(0.15, shade(a.bodyColor, -0.15), [0.55, 1.4, 0.9]);
        ear.position.set(side * 0.52, 0.02, -0.05);
        ear.rotation.z = side * 0.3;
        head.add(ear);
      }
      head.add(onHead(f.sphere(0.17, muzzleColor, [1.1, 0.8, 0.8]), 0, -0.22, -0.06));
      head.add(onHead(f.sphere(0.06, DARK, [1.2, 0.9, 1]), 0, -0.12, 0.06));
      break;
    }
    case 'bunny': {
      for (const side of [-1, 1]) {
        const ear = new THREE.Group();
        const outer = f.capsule(0.09, 0.42, a.bodyColor);
        outer.scale.z = 0.6;
        outer.position.y = 0.25;
        const innerEar = f.capsule(0.05, 0.34, PINK);
        innerEar.scale.z = 0.4;
        innerEar.position.set(0, 0.25, 0.035);
        ear.add(outer, innerEar);
        addEar(ear, side, 0.22, 1.15, -0.02, -0.12);
      }
      head.add(onHead(f.sphere(0.04, PINK), 0, -0.13, 0));
      break;
    }
    case 'bear': {
      for (const side of [-1, 1]) {
        const ear = new THREE.Group();
        ear.add(f.sphere(0.13, a.bodyColor, [1, 1, 0.6]));
        const innerEar = f.sphere(0.075, inner, [1, 1, 0.4]);
        innerEar.position.z = 0.05;
        ear.add(innerEar);
        onHead(ear, side * 0.62, 0.78, -0.02);
        head.add(ear);
      }
      head.add(onHead(f.sphere(0.16, muzzleColor, [1.1, 0.8, 0.6]), 0, -0.22, -0.05));
      head.add(onHead(f.sphere(0.055, DARK, [1.3, 0.9, 1]), 0, -0.14, 0.04));
      break;
    }
    case 'frog':
      break;
  }
}

function addHair(f: PartFactory, head: THREE.Group, a: Appearance): void {
  if (a.hairStyle === 'none') return;
  const c = a.hairColor;

  // A cap of hair over the crown, tilted back so the forehead shows.
  const cap = f.mesh(
    new THREE.SphereGeometry(HEAD_RADIUS * 1.05, 32, 16, 0, Math.PI * 2, 0, Math.PI * 0.42),
    c,
  );
  cap.rotation.x = -0.45;
  cap.scale.set(1, 0.97, 0.99);
  head.add(cap);
  // Bangs.
  for (const yaw of [-0.35, 0, 0.35]) {
    head.add(onHead(f.sphere(0.13, c, [1.3, 0.7, 0.6]), yaw, 0.62, -0.02));
  }

  switch (a.hairStyle) {
    case 'long': {
      const back = f.sphere(HEAD_RADIUS * 0.98, c, [1.05, 1.25, 0.8]);
      back.position.set(0, -0.2, -0.15);
      head.add(back);
      break;
    }
    case 'bun': {
      const bun = f.sphere(0.2, c);
      bun.position.set(0, 0.52, -0.22);
      head.add(bun);
      break;
    }
    case 'spiky': {
      for (let i = 0; i < 7; i++) {
        const spike = f.cone(0.1, 0.26, c, 12);
        onHead(spike, (i - 3) * 0.45, 0.95 - Math.abs(i - 3) * 0.12, 0);
        spike.rotateX(Math.PI / 2);
        head.add(spike);
      }
      break;
    }
    case 'pigtails': {
      for (const side of [-1, 1]) {
        const tail = f.sphere(0.17, c, [0.9, 1.3, 0.9]);
        tail.position.set(side * 0.62, 0.1, -0.15);
        tail.rotation.z = side * -0.4;
        head.add(tail);
      }
      break;
    }
    case 'short':
      break;
  }
}

function addHat(f: PartFactory, head: THREE.Group, a: Appearance): void {
  const c = a.hatColor;
  switch (a.hat) {
    case 'cap': {
      const crown = f.mesh(
        new THREE.SphereGeometry(HEAD_RADIUS * 1.09, 32, 16, 0, Math.PI * 2, 0, Math.PI * 0.4),
        c,
      );
      crown.rotation.x = -0.2;
      const brim = f.mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.03, 24, 1, false, -Math.PI / 2, Math.PI), shade(c, -0.1));
      brim.position.set(0, 0.35, 0.38);
      brim.rotation.x = 0.25;
      head.add(crown, brim);
      break;
    }
    case 'beanie': {
      const crown = f.mesh(
        new THREE.SphereGeometry(HEAD_RADIUS * 1.1, 32, 16, 0, Math.PI * 2, 0, Math.PI * 0.45),
        c,
      );
      crown.rotation.x = -0.25;
      const band = f.mesh(new THREE.TorusGeometry(HEAD_RADIUS * 1.02, 0.06, 12, 40), shade(c, -0.1));
      band.rotation.x = Math.PI / 2 - 0.25;
      band.position.set(0, 0.08, -0.02);
      const pom = f.sphere(0.1, WHITE);
      pom.position.set(0, 0.62, -0.15);
      head.add(crown, band, pom);
      break;
    }
    case 'bow': {
      const bow = new THREE.Group();
      for (const side of [-1, 1]) {
        const loop = f.cone(0.12, 0.2, c, 16);
        loop.rotation.z = side * (Math.PI / 2);
        loop.position.x = side * 0.1;
        loop.scale.z = 0.5;
        bow.add(loop);
      }
      bow.add(f.sphere(0.05, shade(c, -0.1)));
      onHead(bow, 0.5, 0.75, 0.03);
      head.add(bow);
      break;
    }
    case 'flower': {
      const flower = new THREE.Group();
      for (let i = 0; i < 5; i++) {
        const petal = f.sphere(0.07, c, [1, 1, 0.4]);
        const angle = (i / 5) * Math.PI * 2;
        petal.position.set(Math.cos(angle) * 0.08, Math.sin(angle) * 0.08, 0);
        flower.add(petal);
      }
      const center = f.sphere(0.05, '#f1c40f', [1, 1, 0.5]);
      center.position.z = 0.02;
      flower.add(center);
      onHead(flower, 0.62, 0.55, 0.02);
      head.add(flower);
      break;
    }
    case 'crown': {
      const crown = new THREE.Group();
      const band = f.mesh(new THREE.CylinderGeometry(0.25, 0.23, 0.12, 24, 1, true), c);
      band.material = f.material(c, true);
      crown.add(band);
      for (let i = 0; i < 5; i++) {
        const angle = (i / 5) * Math.PI * 2;
        const point = f.cone(0.05, 0.13, c, 8);
        point.position.set(Math.sin(angle) * 0.24, 0.12, Math.cos(angle) * 0.24);
        const gem = f.sphere(0.028, '#e74c3c');
        gem.position.set(Math.sin(angle) * 0.25, 0, Math.cos(angle) * 0.25);
        crown.add(point, gem);
      }
      crown.position.y = HEAD_RADIUS * 0.92;
      crown.rotation.x = -0.1;
      head.add(crown);
      break;
    }
    case 'none':
      break;
  }
}

const TAILS: Partial<Record<Species, (f: PartFactory, a: Appearance) => THREE.Object3D>> = {
  cat: (f, a) => {
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(0, 0.08, -0.2),
      new THREE.Vector3(0, 0.3, -0.3),
      new THREE.Vector3(0.05, 0.45, -0.22),
    ]);
    return f.mesh(new THREE.TubeGeometry(curve, 20, 0.045, 10), a.bodyColor);
  },
  dog: (f, a) => {
    const tail = f.capsule(0.05, 0.16, a.bodyColor);
    tail.rotation.x = -0.8;
    tail.position.set(0, 0.08, -0.08);
    return tail;
  },
  bunny: (f) => f.sphere(0.1, WHITE),
  bear: (f, a) => f.sphere(0.08, a.bodyColor),
  fox: (f, a) => {
    const tail = new THREE.Group();
    const fluff = f.sphere(0.15, a.bodyColor, [0.8, 0.8, 1.9]);
    fluff.position.set(0, 0.12, -0.22);
    fluff.rotation.x = 0.6;
    const tip = f.sphere(0.1, WHITE, [0.9, 0.9, 1.2]);
    tip.position.set(0, 0.3, -0.45);
    tail.add(fluff, tip);
    return tail;
  },
};

function addTail(f: PartFactory, body: THREE.Group, a: Appearance): THREE.Object3D | null {
  const make = TAILS[a.species];
  if (!make) return null;
  const pivot = new THREE.Group();
  pivot.position.set(0, 0.45, -0.27);
  pivot.add(make(f, a));
  body.add(pivot);
  return pivot;
}
