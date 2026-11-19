import * as THREE from 'three';
import { ChallengeCard, shapeMesh } from './ChallengeCard.js';
import { makeBox, getStandard } from '../world/Materials.js';
import { easeInOutQuad } from '../systems/AnimationManager.js';

const COLORS = {
  light: 0xffffff,
  cover: 0x5b2c9f,     // dos des cartes
  front: 0xfff6e0,     // face des cartes
  matched: 0xcdeccd    // face d'une paire trouvée (vert pâle)
};

const GRID_Y = -0.3;   // centre de la grille sur la carte
const MAX_SPACING = 0.62;

// Carte "Mémoire" : des petites cartes face cachée. On en retourne deux à la fois ;
// si elles sont identiques elles restent visibles, sinon elles se recachent (et une erreur coûte des points).
// Elle hérite de ChallengeCard : le titre, la consigne, les points de progression et le bandeau sont déjà prêts.
export class MemoryCard extends ChallengeCard {
  constructor(textFactory, animations) {
    super(textFactory);
    this.animations = animations;
    this.tiles = []; // { group, pivot, front, faceUp, matched }
  }

  // Affiche le paquet (liste de formes) face cachée. Chaque petite carte renvoie son indice quand on clique dessus.
  showMemory(deck) {
    this.kind = 'memory';
    this.setTitle('DÉFI : MÉMOIRE');
    this.setStatus('Trouve les paires !');

    // 6, 8 ou 10 cartes : 2 rangées de 3, 4 ou 5 cartes
    const cols = deck.length / 2;
    const spacing = Math.min(MAX_SPACING, 1.9 / cols);
    const width = spacing * 0.84;
    const height = width * 1.25;
    const rowGap = height + 0.08;

    deck.forEach((shape, index) => {
      const col = index % cols;
      const row = Math.floor(index / cols);
      const x = (col - (cols - 1) / 2) * spacing;
      const y = GRID_Y + (0.5 - row) * rowGap;
      this.addTile(shape, index, x, y, width, height);
    });
    this.clickableMeshes = this.tiles.map((tile) => tile.group);
    this.setProgress(0, deck.length / 2);
  }

  // Une petite carte = un pivot qui tourne : le dos (violet, "?") d'un côté, la face (la forme) de l'autre
  addTile(shape, index, x, y, width, height) {
    const group = new THREE.Group();
    group.userData.answerIndex = index;
    group.position.set(x, y, 0);

    const pivot = new THREE.Group();

    // Dos : visible au départ (tourné vers nous)
    const cover = makeBox(width, height, 0.05, COLORS.cover, { radius: 0.03, roughness: 0.5 });
    cover.position.z = 0.025;
    const mark = this.textFactory.create('?', { size: width * 0.55, color: COLORS.light, depth: 0.02 });
    mark.position.z = 0.05;
    pivot.add(cover, mark);

    // Face : placée derrière le dos et retournée ; elle apparaît quand le pivot fait un demi-tour
    const reveal = new THREE.Group();
    reveal.rotation.y = Math.PI;
    const front = makeBox(width, height, 0.05, COLORS.front, { radius: 0.03, roughness: 0.5 });
    front.position.z = 0.025;
    const icon = shapeMesh(shape, width * 0.62);
    icon.position.z = 0.05;
    reveal.add(front, icon);
    pivot.add(reveal);

    group.add(pivot);
    this.backContent.add(group);
    this.tiles.push({ group, pivot, front, faceUp: false, matched: false });
  }

  // Retourne une petite carte (faceUp = true : on voit la forme ; false : on la recache)
  flipTile(index, faceUp) {
    const tile = this.tiles[index];
    tile.faceUp = faceUp;
    const from = tile.pivot.rotation.y;
    const to = faceUp ? Math.PI : 0;
    return this.animations.animate(0.28, (eased, t) => {
      tile.pivot.rotation.y = THREE.MathUtils.lerp(from, to, eased);
      tile.group.position.z = Math.sin(Math.PI * t) * 0.12; // la carte se soulève pendant le demi-tour
      tile.group.scale.setScalar(1);
    }, easeInOutQuad);
  }

  // Une paire trouvée reste visible, avec une face verte
  markMatched(a, b) {
    for (const index of [a, b]) {
      const tile = this.tiles[index];
      tile.matched = true;
      tile.front.material = getStandard(COLORS.matched, { roughness: 0.5 });
    }
  }

  // Survol : seules les cartes encore cachées réagissent
  setHover(index) {
    if (this.locked || index === this.hoveredIndex) return;
    this.hoveredIndex = index;
    this.tiles.forEach((tile, i) => {
      const hovered = i === index && !tile.faceUp && !tile.matched;
      tile.group.scale.setScalar(hovered ? 1.08 : 1);
    });
  }
}
