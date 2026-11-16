import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { getPhong } from '../world/Materials.js';
import { easeOutCubic } from '../systems/AnimationManager.js';

// Faces opposées de somme 7 : 1/6, 2/5, 3/4. n = normale, u et v = axes de la face.
export const DICE_FACES = [
  { value: 1, n: [0, 1, 0],  u: [1, 0, 0], v: [0, 0, 1] },
  { value: 6, n: [0, -1, 0], u: [1, 0, 0], v: [0, 0, 1] },
  { value: 2, n: [0, 0, 1],  u: [1, 0, 0], v: [0, 1, 0] },
  { value: 5, n: [0, 0, -1], u: [1, 0, 0], v: [0, 1, 0] },
  { value: 3, n: [1, 0, 0],  u: [0, 0, 1], v: [0, 1, 0] },
  { value: 4, n: [-1, 0, 0], u: [0, 0, 1], v: [0, 1, 0] }
];

const A = 0.25; // écart des points par rapport au centre de la face
const PIPS = {
  1: [[0, 0]],
  2: [[-A, A], [A, -A]],
  3: [[-A, A], [0, 0], [A, -A]],
  4: [[-A, A], [A, A], [-A, -A], [A, -A]],
  5: [[-A, A], [A, A], [0, 0], [-A, -A], [A, -A]],
  6: [[-A, A], [-A, 0], [-A, -A], [A, A], [A, 0], [A, -A]]
};

const UP = new THREE.Vector3(0, 1, 0);
const ROLL_DURATION = 1.5;
const ROLL_HEIGHT = 2.6;
const EXTRA_TURNS = 3;

export class Dice {
  constructor(size = 1.5) {
    this.size = size;
    this.rolling = false;
    this.hasRolled = false;
    this.value = 1;
    this.restY = 0;
    this.hovered = false;
    this.group = new THREE.Group(); // position, rotation lente au repos
    this.cube = new THREE.Group();  // orientation du cube (inclinée au repos)
    this.cube.rotation.set(0.5, 0, 0.25);
    this.group.add(this.cube);
    this.build();
  }

  build() {
    const body = new THREE.Mesh(
      new RoundedBoxGeometry(this.size, this.size, this.size, 4, 0.14),
      getPhong(0xfafafa, 90)
    );
    this.cube.add(body);

    const pipGeometry = new THREE.SphereGeometry(this.size * 0.075, 12, 12);
    const pipMaterial = getPhong(0x111111, 40);
    const half = this.size / 2;

    for (const face of DICE_FACES) {
      for (const [px, py] of PIPS[face.value]) {
        const pip = new THREE.Mesh(pipGeometry, pipMaterial);
        pip.position
          .set(...face.n).multiplyScalar(half - 0.015)
          .addScaledVector(new THREE.Vector3(...face.u), px * this.size)
          .addScaledVector(new THREE.Vector3(...face.v), py * this.size);
        this.cube.add(pip);
      }
    }
  }

  // Position de repos (au centre du plateau)
  setRestPosition(position) {
    this.group.position.copy(position);
    this.restY = position.y;
  }

  // Retour à l'état de départ (nouvelle partie) : le dé reprend sa rotation lente
  reset() {
    this.hasRolled = false;
    this.value = 1;
  }

  // Léger agrandissement quand la souris est sur le dé et qu'on peut lancer
  setHover(active) {
    this.hovered = active;
  }

  // Lancer : le dé saute, tourne sur lui-même, puis retombe avec la face `value` vers le haut.
  // Retourne une Promise résolue quand le dé est immobile.
  roll(value, animations) {
    this.rolling = true;
    this.cube.position.y = 0;

    // Orientation finale : on aligne la normale de la face voulue avec l'axe vertical,
    // puis on ajoute une rotation aléatoire autour de la verticale pour un rendu naturel.
    const face = DICE_FACES.find((f) => f.value === value);
    const qAlign = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(...face.n), UP);
    const qYaw = new THREE.Quaternion().setFromAxisAngle(UP, Math.random() * Math.PI * 2);
    const qTarget = qYaw.multiply(qAlign);

    const qStart = this.cube.quaternion.clone();
    const qBase = new THREE.Quaternion();
    const qExtra = new THREE.Quaternion();
    const axis = new THREE.Vector3(Math.random() - 0.5, Math.random() + 0.3, Math.random() - 0.5).normalize();

    return animations
      .animate(ROLL_DURATION, (eased, t) => {
        qBase.slerpQuaternions(qStart, qTarget, eased);
        qExtra.setFromAxisAngle(axis, (1 - eased) * EXTRA_TURNS * Math.PI * 2); // tours qui s'arrêtent
        this.cube.quaternion.copy(qExtra).multiply(qBase);
        this.group.position.y = this.restY + Math.sin(Math.PI * t) * ROLL_HEIGHT; // saut en arc
      }, easeOutCubic)
      .then(() => {
        this.group.position.y = this.restY;
        this.value = value;
        this.hasRolled = true;
        this.rolling = false;
      });
  }

  update(deltaTime, time) {
    // Agrandissement progressif au survol
    const target = this.hovered ? 1.1 : 1;
    const s = this.group.scale.x + (target - this.group.scale.x) * (1 - Math.exp(-12 * deltaTime));
    this.group.scale.setScalar(s);

    if (this.rolling) return;
    // Au repos : rotation lente (arrêtée après le premier lancer pour bien lire le résultat) et petit flottement
    if (!this.hasRolled) this.group.rotation.y += deltaTime * 0.6;
    this.cube.position.y = Math.sin(time * 2) * 0.06;
  }
}
