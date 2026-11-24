import * as THREE from 'three';
import { InfoCard } from './InfoCard.js';
import { makeBox, getStandard } from '../world/Materials.js';
import { buildRewardIcon } from './RewardIcons.js';
import { easeOutBack, easeInOutQuad } from '../systems/AnimationManager.js';

const RED = 0xe03a3a;
const SIGN_Y = -0.05;
const ICON_Y = 0.1;

// Carte rouge : au verso, un panneau de danger qui secoue, puis la conséquence du piège apparaît
// (recul, tour passé, dé réduit, retour au checkpoint ou aucun danger).
export class TrapCard extends InfoCard {
  constructor(textFactory) {
    super(textFactory, { color: RED, symbol: 'piege', textColor: 0xffffff });
    this.sign = null;
    this.icon = null;
  }

  // Panneau triangulaire jaune avec point d'exclamation noir
  showSign() {
    this.setTitle('DANGER');
    this.setStatus('Attention...');

    const triangle = new THREE.Shape();
    triangle.moveTo(0, 0.8);
    triangle.lineTo(-0.92, -0.7);
    triangle.lineTo(0.92, -0.7);
    triangle.closePath();
    const plate = new THREE.Mesh(
      new THREE.ExtrudeGeometry(triangle, { depth: 0.07, bevelEnabled: true, bevelThickness: 0.02, bevelSize: 0.03, bevelSegments: 2 }),
      getStandard(0xffd54a, { roughness: 0.4 })
    );
    plate.position.z = 0.03;

    const black = getStandard(0x1c1c1c, { roughness: 0.5 });
    const bar = new THREE.Mesh(makeBox(0.16, 0.6, 0.05, 0x1c1c1c).geometry, black);
    bar.position.set(0, 0.12, 0.15);
    const dot = new THREE.Mesh(new THREE.SphereGeometry(0.09, 16, 16), black);
    dot.position.set(0, -0.37, 0.15);

    this.sign = new THREE.Group();
    this.sign.position.y = SIGN_Y;
    this.sign.add(plate, bar, dot);
    this.backContent.add(this.sign);
  }

  // Alerte : le panneau pulse et tremble pendant `duration` secondes
  alert(animations, duration = 1.4) {
    return animations.animate(duration, (eased, t) => {
      this.sign.scale.setScalar(1 + 0.1 * Math.abs(Math.sin(t * Math.PI * 4)));
      this.sign.rotation.z = Math.sin(t * Math.PI * 14) * 0.08 * (1 - t * 0.4);
    }, (t) => t);
  }

  // Le panneau disparaît et l'icône de la conséquence prend sa place
  async reveal(iconKind, positive, label, animations) {
    this.clearStatus();
    await animations.animate(0.25, (eased) => {
      this.sign.scale.setScalar(Math.max(1 - eased, 0.001));
    }, easeInOutQuad);
    this.backContent.remove(this.sign);

    this.icon = buildRewardIcon(iconKind, positive);
    this.icon.position.set(0, ICON_Y, 0.1);
    this.backContent.add(this.icon);
    await animations.animate(0.5, (eased, t) => {
      this.icon.scale.setScalar(Math.max(easeOutBack(t), 0.001));
    }, easeInOutQuad);
    this.setLabel(label);
  }
}
