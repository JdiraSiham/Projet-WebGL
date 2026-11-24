import * as THREE from 'three';
import { Card3D } from '../cards/Card3D.js';
import { makeBox } from '../world/Materials.js';
import { easeOutCubic } from '../systems/AnimationManager.js';
import { addCardInset, CARD_VISUALS, makeRoundedSlab } from './CardVisuals3D.js';

export class RulesCard3D extends Card3D {
  constructor(textFactory) {
    super({ color: CARD_VISUALS.wood, symbol: null, standing: true });
    this.textFactory = textFactory;
    this.escapeIndex = 0;
    this.clickableMeshes = [];
    this.hoveredIndex = null;
    this.content.add(this.createBookIcon());
    this.buildRules();
    this.restLogo = this.createBookIcon();
    this.restLogo.position.z = 0.19;
    this.restLogo.visible = false;
    this.flat.add(this.restLogo);
  }

  createBookIcon() {
    const icon = new THREE.Group();
    for (const side of [-1, 1]) {
      const page = makeBox(0.38, 0.62, 0.07, 0xffedc7, { radius: 0.03, roughness: 0.5 });
      page.position.set(side * 0.21, 0, 0.04);
      page.rotation.z = side * -0.12;
      icon.add(page);
      for (const y of [-0.12, 0, 0.12]) {
        const line = makeBox(0.2, 0.025, 0.025, 0xd5ad62, { radius: 0.01, roughness: 0.5 });
        line.position.set(side * 0.22, y, 0.125);
        icon.add(line);
      }
    }
    const spine = makeBox(0.06, 0.66, 0.09, 0x563a2b, { radius: 0.02, roughness: 0.6 });
    spine.position.z = 0.05;
    icon.add(spine);
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

  buildRules() {
    addCardInset(this.backContent, {
      width: 2.14,
      height: 3.04,
      topColor: CARD_VISUALS.parchmentTop,
      bottomColor: CARD_VISUALS.parchmentBottom,
      borderColor: CARD_VISUALS.gold
    });

    const title = this.makeLabel('RÈGLE', {
      size: 0.22, maxWidth: 1.4, color: CARD_VISUALS.text, depth: 0.02
    });
    title.position.set(0, 1.22, 0.065);
    this.backContent.add(title);
    const divider = makeBox(0.68, 0.025, 0.015, CARD_VISUALS.gold, { radius: 0.01, roughness: 0.5 });
    divider.position.set(0, 1.0, 0.065);
    this.backContent.add(divider);

    const text = this.textFactory.create([
      'But : réussir le défi de la case 30.',
      'Clique sur le dé pour avancer.',
      'Réussir = bonus.',
      'Échouer = danger.',
      'Bonus : avancer, rejouer, dé ×2.',
      'Danger : recul, tour sauté, dé ÷2.',
      'Les portails téléportent le pion.',
      'Checkpoints : cases 10 et 20.',
      'Solo : trois échecs finaux = défaite.',
      'Échap : pause.'
    ].join('\n'), {
      size: 0.105, maxWidth: 1.72, maxLines: 10, minSize: 0.085,
      color: CARD_VISUALS.text, depth: 0.015, anchor: 'top'
    });
    text.position.set(0, 0.78, 0.065);
    this.backContent.add(text);

    this.returnButton = new THREE.Group();
    this.returnButton.userData.answerIndex = 0;
    this.returnButton.position.set(0, -1.25, 0.065);
    const shadow = makeRoundedSlab(1.55, 0.42, 0.035, CARD_VISUALS.woodShadow, { radius: 0.1, roughness: 0.75 });
    const edge = makeRoundedSlab(1.55, 0.42, 0.045, CARD_VISUALS.gold, { radius: 0.1, roughness: 0.55, metalness: 0.12 });
    const face = makeRoundedSlab(1.46, 0.33, 0.055, CARD_VISUALS.return, { radius: 0.08, roughness: 0.62 });
    face.material = face.material.clone();
    edge.material = edge.material.clone();
    shadow.position.set(0, -0.025, 0.012);
    edge.position.z = 0.032;
    face.position.z = 0.055;
    const label = this.textFactory.create('RETOUR', {
      size: 0.16, maxWidth: 1.25, maxLines: 1, color: CARD_VISUALS.cream, depth: 0.02
    });
    label.position.z = 0.095;
    this.returnButton.add(shadow, edge, face, label);
    this.backContent.add(this.returnButton);
    this.returnFace = face;
    this.returnEdge = edge;
    this.returnBaseColor = new THREE.Color(CARD_VISUALS.return);
    this.returnHoverColor = new THREE.Color(CARD_VISUALS.returnHover);
    this.returnBaseEdgeColor = new THREE.Color(CARD_VISUALS.gold);
    this.returnHoverEdgeColor = new THREE.Color(CARD_VISUALS.goldLight);
    this.returnBaseZ = this.returnButton.position.z;
    this.hoverTransitionId = 0;
    this.clickableMeshes = [this.returnButton];
  }

  setHover(index, animations) {
    if (index === this.hoveredIndex) return;
    this.hoveredIndex = index;
    const hovered = index === 0;
    const targetScale = hovered ? 1.045 : 1;
    const targetZ = this.returnBaseZ + (hovered ? 0.025 : 0);
    const targetColor = hovered ? this.returnHoverColor : this.returnBaseColor;
    const targetEdgeColor = hovered ? this.returnHoverEdgeColor : this.returnBaseEdgeColor;
    const startScale = this.returnButton.scale.x;
    const startZ = this.returnButton.position.z;
    const startColor = this.returnFace.material.color.clone();
    const startEdgeColor = this.returnEdge.material.color.clone();
    const transitionId = ++this.hoverTransitionId;
    if (!animations) {
      this.returnButton.scale.setScalar(targetScale);
      this.returnButton.position.z = targetZ;
      this.returnFace.material.color.copy(targetColor);
      this.returnEdge.material.color.copy(targetEdgeColor);
      return;
    }
    void animations.animate(0.18, (eased) => {
      if (this.hoverTransitionId !== transitionId) return;
      this.returnButton.scale.setScalar(THREE.MathUtils.lerp(startScale, targetScale, eased));
      this.returnButton.position.z = THREE.MathUtils.lerp(startZ, targetZ, eased);
      this.returnFace.material.color.copy(startColor).lerp(targetColor, eased);
      this.returnEdge.material.color.copy(startEdgeColor).lerp(targetEdgeColor, eased);
    }, easeOutCubic, { ui: true }).then(() => {
      if (this.hoverTransitionId !== transitionId) return;
      this.returnButton.scale.setScalar(targetScale);
      this.returnButton.position.z = targetZ;
      this.returnFace.material.color.copy(targetColor);
      this.returnEdge.material.color.copy(targetEdgeColor);
    });
  }

  playPress(index, animations) {
    if (index !== 0) return Promise.resolve();
    const transitionId = ++this.hoverTransitionId;
    const startY = this.returnButton.position.y;
    const startZ = this.returnButton.position.z;
    const startScale = this.returnButton.scale.x;
    return animations.animate(0.12, (eased) => {
      this.returnButton.position.y = startY - 0.025 * eased;
      this.returnButton.position.z = THREE.MathUtils.lerp(startZ, this.returnBaseZ + 0.04, eased);
      this.returnButton.scale.setScalar(THREE.MathUtils.lerp(startScale, 0.96, eased));
    }, easeOutCubic, { ui: true }).then(() => {
      if (this.hoverTransitionId !== transitionId) return;
      this.returnButton.position.y = startY;
      this.returnButton.position.z = this.returnBaseZ;
      this.returnButton.scale.setScalar(1);
      this.returnFace.material.color.copy(this.returnBaseColor);
      this.returnEdge.material.color.copy(this.returnBaseEdgeColor);
    });
  }
}
