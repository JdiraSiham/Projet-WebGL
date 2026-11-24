import * as THREE from 'three';
import { Card3D } from '../cards/Card3D.js';
import { makeBox } from '../world/Materials.js';
import { easeOutCubic } from '../systems/AnimationManager.js';
import { addCardInset, CARD_VISUALS, makeRoundedSlab } from './CardVisuals3D.js';

const BUTTON_WIDTH = 1.88;
const BUTTON_HEIGHT = 0.48;

// Menu principal et pause : une vraie carte debout réutilisant la géométrie des cartes de jeu.
export class MenuCard3D extends Card3D {
  constructor(textFactory) {
    super({ color: CARD_VISUALS.wood, standing: true });
    this.textFactory = textFactory;
    this.buttons = new Map();
    this.hoveredIndex = null;
    this.escapeIndex = null;
    this.content.add(this.createMenuIcon());
    this.restLogo = this.createMenuIcon();
    this.restLogo.position.z = 0.19;
    this.restLogo.visible = false;
    this.flat.add(this.restLogo);
    this.width = 2.6;
    this.height = 3.6;
    this.skyColor = undefined;

    this.configure('main');
  }

  createMenuIcon() {
    const icon = new THREE.Group();
    for (const y of [-0.18, 0, 0.18]) {
      const bullet = makeBox(0.09, 0.09, 0.06, CARD_VISUALS.gold, { radius: 0.04, roughness: 0.5 });
      bullet.position.set(-0.36, y, 0.04);
      const bar = makeBox(0.57, 0.1, 0.06, 0xffedc7, { radius: 0.04, roughness: 0.5 });
      bar.position.set(0.08, y, 0.04);
      icon.add(bullet, bar);
    }
    icon.scale.setScalar(1.15);
    return icon;
  }

  makeLabel(text, { size, maxWidth, color, depth = 0.025 }) {
    const accentIndex = text.indexOf('È');
    const plain = text.replace('È', 'E');
    const label = this.textFactory.create(plain, { size, maxWidth, color, depth });
    if (accentIndex >= 0) {
      const width = this.textFactory.measure(plain, label.userData.size);
      const before = this.textFactory.measure(plain.slice(0, accentIndex), label.userData.size);
      const letter = this.textFactory.measure('E', label.userData.size);
      const accent = makeBox(label.userData.size * 0.34, label.userData.size * 0.09, depth, CARD_VISUALS.text, { radius: 0.005 });
      accent.position.set(-width / 2 + before + letter / 2, label.userData.size * 0.62, depth / 2);
      accent.rotation.z = -0.75;
      label.add(accent);
    }
    return label;
  }

  makeButton(index, label, y, secondary = false) {
    const group = new THREE.Group();
    group.userData.answerIndex = index;
    group.position.y = y;

    const shadow = makeRoundedSlab(BUTTON_WIDTH, BUTTON_HEIGHT, 0.035, CARD_VISUALS.woodShadow, { radius: 0.11, roughness: 0.75 });
    const edge = makeRoundedSlab(BUTTON_WIDTH, BUTTON_HEIGHT, 0.045, CARD_VISUALS.gold, { radius: 0.11, roughness: 0.55, metalness: 0.12 });
    const faceColor = secondary ? CARD_VISUALS.wood : CARD_VISUALS.button;
    const face = makeRoundedSlab(BUTTON_WIDTH - 0.09, BUTTON_HEIGHT - 0.09, 0.055,
      faceColor, { radius: 0.08, roughness: 0.62 });
    face.material = face.material.clone();
    edge.material = edge.material.clone();
    shadow.position.set(0, -0.025, 0.012);
    edge.position.z = 0.032;
    face.position.z = 0.055;

    const text = this.makeLabel(label, {
      size: secondary ? 0.17 : 0.19,
      maxWidth: BUTTON_WIDTH - 0.26,
      color: secondary ? CARD_VISUALS.cream : CARD_VISUALS.text,
      depth: 0.025
    });
    text.position.z = 0.095;
    group.add(shadow, edge, face, text);
    this.buttons.set(index, {
      group,
      face,
      edge,
      baseColor: new THREE.Color(faceColor),
      hoverColor: new THREE.Color(secondary ? CARD_VISUALS.woodLight : CARD_VISUALS.buttonHover),
      baseEdgeColor: new THREE.Color(CARD_VISUALS.gold),
      hoverEdgeColor: new THREE.Color(CARD_VISUALS.goldLight),
      baseZ: group.position.z,
      transitionId: 0
    });
    return group;
  }

  configure(mode, resetFlip = true) {
    if (this.backInset) {
      this.backInset.panel.geometry.dispose();
      this.backInset.panel.material.dispose();
    }
    this.backContent.clear();
    for (const button of this.buttons.values()) {
      button.transitionId += 1;
      button.face.material.dispose();
      button.edge.material.dispose();
    }
    this.buttons.clear();
    this.backContent.visible = false;
    this.content.visible = true;
    this.backInset = addCardInset(this.backContent);
    if (this.restLogo) this.restLogo.visible = false;
    if (resetFlip) this.setFlip(0);
    this.escapeIndex = mode === 'pause' ? 0 : null;

    const titleText = mode === 'pause' ? 'PAUSE' : 'MENU';
    const title = this.makeLabel(titleText, {
      size: mode === 'pause' ? 0.29 : 0.2,
      maxWidth: 1.92,
      color: CARD_VISUALS.gold,
      depth: 0.04
    });
    title.position.set(0, 1.2, 0.065);
    this.backContent.add(title);

    const rows = mode === 'pause'
      ? [{ index: 0, label: 'CONTINUER' }, { index: 1, label: 'SOLO' }, { index: 2, label: '2 JOUEURS' }, { index: 3, label: 'RÈGLES' }]
      : [{ index: 0, label: 'SOLO' }, { index: 1, label: '2 JOUEURS' }, { index: 2, label: 'RÈGLES' }];
    const firstY = mode === 'pause' ? 0.72 : 0.53;
    const step = mode === 'pause' ? 0.56 : 0.69;
    rows.forEach((row, i) => this.backContent.add(this.makeButton(row.index, row.label, firstY - i * step)));
    this.clickableMeshes = [...this.buttons.values()].map((button) => button.group);
    this.hoveredIndex = null;
    this.group.traverse((object) => {
      if (!object.isMesh) return;
      object.castShadow = true;
      object.receiveShadow = true;
    });
  }

  setHover(index, animations) {
    if (index === this.hoveredIndex) return;
    this.hoveredIndex = index;
    for (const [buttonIndex, button] of this.buttons) {
      const targetScale = buttonIndex === index ? 1.04 : 1;
      const targetZ = button.baseZ + (buttonIndex === index ? 0.025 : 0);
      const targetColor = buttonIndex === index ? button.hoverColor : button.baseColor;
      const targetEdgeColor = buttonIndex === index ? button.hoverEdgeColor : button.baseEdgeColor;
      const startScale = button.group.scale.x;
      const startZ = button.group.position.z;
      const startColor = button.face.material.color.clone();
      const startEdgeColor = button.edge.material.color.clone();
      const transitionId = ++button.transitionId;
      if (!animations) {
        button.group.scale.setScalar(targetScale);
        button.group.position.z = targetZ;
        button.face.material.color.copy(targetColor);
        button.edge.material.color.copy(targetEdgeColor);
        continue;
      }
      void animations.animate(0.18, (eased) => {
        if (button.transitionId !== transitionId) return;
        button.group.scale.setScalar(THREE.MathUtils.lerp(startScale, targetScale, eased));
        button.group.position.z = THREE.MathUtils.lerp(startZ, targetZ, eased);
        button.face.material.color.copy(startColor).lerp(targetColor, eased);
        button.edge.material.color.copy(startEdgeColor).lerp(targetEdgeColor, eased);
      }, easeOutCubic, { ui: true }).then(() => {
        if (button.transitionId !== transitionId) return;
        button.group.scale.setScalar(targetScale);
        button.group.position.z = targetZ;
        button.face.material.color.copy(targetColor);
        button.edge.material.color.copy(targetEdgeColor);
      });
    }
  }

  playPress(index, animations) {
    const button = this.buttons.get(index);
    if (!button) return Promise.resolve();
    const { group } = button;
    const transitionId = ++button.transitionId;
    const startY = group.position.y;
    const startZ = group.position.z;
    const startScale = group.scale.x;
    return animations.animate(0.12, (eased) => {
      group.position.y = startY - 0.035 * eased;
      group.position.z = THREE.MathUtils.lerp(startZ, button.baseZ + 0.04, eased);
      group.scale.setScalar(THREE.MathUtils.lerp(startScale, 0.96, eased));
    }, easeOutCubic, { ui: true }).then(() => {
      if (button.transitionId !== transitionId) return;
      group.position.y = startY;
      group.position.z = button.baseZ;
      group.scale.setScalar(1);
      button.face.material.color.copy(button.baseColor);
      button.edge.material.color.copy(button.baseEdgeColor);
    });
  }
}
