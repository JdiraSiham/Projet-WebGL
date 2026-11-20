import * as THREE from 'three';
import { makeBox, getStandard } from '../world/Materials.js';
import { shapeMesh } from './Shapes3D.js';
import { easeInOutQuad } from '../systems/AnimationManager.js';

const CARD_W = 0.4;
const CARD_H = 0.5;
const GAP = 0.1;
const CENTER_Y = -0.3;

const COLORS = {
  body: 0xfff6e0,
  matched: 0xcdf2cf,
  wrong: 0xf7b3b3,
  back: 0x5b2c9f,
  mark: 0xffffff
};

// Jeu de mémoire en 3D : des petites cartes face cachée (violet avec "?") que l'on retourne deux par deux.
// Il ne contient que l'affichage : les règles (paires, erreurs, pénalité) sont dans EventManager et RuleEngine.
export class MemoryBoard3D {
  constructor(textFactory, deck, cols) {
    this.deck = deck;
    this.group = new THREE.Group();
    this.cards = [];
    const rows = Math.ceil(deck.length / cols);

    deck.forEach((kind, index) => {
      const col = index % cols;
      const row = Math.floor(index / cols);
      const group = new THREE.Group();
      group.userData.answerIndex = index;
      group.position.set(
        (col - (cols - 1) / 2) * (CARD_W + GAP),
        CENTER_Y + ((rows - 1) / 2 - row) * (CARD_H + GAP),
        0.035
      );

      // pivot : tourne autour de l'axe vertical. Dos violet côté +z, forme côté -z (visible après 180°)
      const pivot = new THREE.Group();
      const body = makeBox(CARD_W, CARD_H, 0.06, COLORS.body, { radius: 0.025, roughness: 0.5 });

      const back = makeBox(CARD_W * 0.84, CARD_H * 0.86, 0.02, COLORS.back, { radius: 0.015, roughness: 0.5 });
      back.position.z = 0.035;
      const mark = textFactory.create('?', { size: 0.22, color: COLORS.mark, depth: 0.02 });
      mark.position.z = 0.045;

      const front = new THREE.Group();
      front.rotation.y = Math.PI;
      const shape = shapeMesh(kind, Math.min(CARD_W, CARD_H) * 0.75);
      shape.position.z = 0.03;
      front.add(shape);

      pivot.add(body, back, mark, front);
      group.add(pivot);
      this.group.add(group);
      this.cards.push({ group, pivot, body, kind, faceUp: false, matched: false });
    });
    this.clickableMeshes = this.cards.map((c) => c.group);
  }

  paint(index, color) {
    this.cards[index].body.material = getStandard(color, { roughness: 0.5 });
  }

  // Retourne une carte (faceUp = true : montre la forme ; false : remet le dos)
  flip(index, faceUp, animations) {
    const card = this.cards[index];
    const from = card.pivot.rotation.y;
    const to = faceUp ? Math.PI : 0;
    card.faceUp = faceUp;
    return animations.animate(0.3, (eased) => {
      card.pivot.rotation.y = THREE.MathUtils.lerp(from, to, eased);
    }, easeInOutQuad);
  }

  markMatched(first, second) {
    for (const i of [first, second]) {
      this.cards[i].matched = true;
      this.paint(i, COLORS.matched);
    }
  }

  markWrong(first, second) {
    this.paint(first, COLORS.wrong);
    this.paint(second, COLORS.wrong);
  }

  clearWrong(first, second) {
    this.paint(first, COLORS.body);
    this.paint(second, COLORS.body);
  }

  // Survol : seule une carte face cachée grossit un peu
  setHover(index) {
    this.cards.forEach((card, i) => {
      const hoverable = !card.faceUp && !card.matched;
      card.group.scale.setScalar(i === index && hoverable ? 1.07 : 1);
    });
  }
}
