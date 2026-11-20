import * as THREE from 'three';
import { makeBox, getStandard } from '../world/Materials.js';
import { easeInOutQuad } from '../systems/AnimationManager.js';

const CELL = 0.58;     // côté d'une tuile
const PITCH = 0.64;    // distance entre deux tuiles
const CENTER_Y = -0.3; // centre de la grille sur la carte
const BAR_WIDTH = 1.8;
const BAR_Y = 1.12;
const TIME_Y = 0.95;

const COLORS = {
  tile: 0xeadcff,
  correct: 0xbdf2c0,
  hover: 0xfff0b3,
  number: 0x3a2260,
  frame: 0x4b2a85,
  barBack: 0x3a2260,
  good: 0x7dff7d,
  mid: 0xffc247,
  low: 0xff5a5a,
  text: 0xffffff
};

// Puzzle coulissant 3 x 3 en 3D : 8 tuiles numérotées et une case vide, avec une barre de temps.
// Il ne contient que l'affichage : les règles (déplacements autorisés, victoire) sont dans data/challenges.js.
export class SlidePuzzle3D {
  constructor(textFactory, board) {
    this.textFactory = textFactory;
    this.group = new THREE.Group();
    this.tiles = [];
    this.hoveredId = null;
    this.correctIds = new Set(); // tuiles bien placées
    this.timeText = null;
    this.shownSecond = -1;

    const frame = makeBox(PITCH * 3 + 0.02, PITCH * 3 + 0.02, 0.02, COLORS.frame, { radius: 0.02, roughness: 0.6 });
    frame.position.set(0, CENTER_Y, 0.01);
    this.group.add(frame);

    for (let id = 0; id < 8; id++) {
      const group = new THREE.Group();
      group.userData.answerIndex = id;
      const box = makeBox(CELL, CELL, 0.07, COLORS.tile, { radius: 0.03, roughness: 0.5 });
      box.position.z = 0.045;
      const label = textFactory.create(String(id + 1), { size: 0.3, color: COLORS.number, depth: 0.02 });
      label.position.z = 0.08;
      group.add(box, label);
      this.group.add(group);
      this.tiles.push({ group, box });
    }
    this.clickableMeshes = this.tiles.map((t) => t.group);

    // Barre de temps (le remplissage rétrécit vers la gauche)
    const back = makeBox(BAR_WIDTH + 0.06, 0.12, 0.02, COLORS.barBack, { radius: 0.02, roughness: 0.6 });
    back.position.set(0, BAR_Y, 0.01);
    this.fill = makeBox(BAR_WIDTH, 0.08, 0.03, COLORS.good, { radius: 0.02, roughness: 0.5 });
    this.fill.position.set(0, BAR_Y, 0.025);
    this.group.add(back, this.fill);

    this.place(board);
  }

  // Centre de l'emplacement pos (0 à 8) dans le repère de la carte
  slotPosition(pos) {
    const col = pos % 3;
    const row = Math.floor(pos / 3);
    return new THREE.Vector3((col - 1) * PITCH, CENTER_Y + (1 - row) * PITCH, 0.02);
  }

  // Place toutes les tuiles d'un coup selon le plateau (tableau de 9 valeurs)
  place(board) {
    board.forEach((value, pos) => {
      if (value > 0) this.tiles[value - 1].group.position.copy(this.slotPosition(pos));
    });
    this.updateColors(board);
  }

  // Fait glisser la tuile id vers l'emplacement toPos (la case vide)
  slide(id, toPos, animations) {
    const group = this.tiles[id].group;
    const from = group.position.clone();
    const to = this.slotPosition(toPos);
    return animations.animate(0.18, (eased) => group.position.lerpVectors(from, to, eased), easeInOutQuad);
  }

  // Une tuile bien placée devient verte
  updateColors(board) {
    this.correctIds = new Set();
    this.tiles.forEach((tile, id) => {
      if (board.indexOf(id + 1) === id) this.correctIds.add(id);
    });
    this.refreshColors();
  }

  refreshColors() {
    this.tiles.forEach((tile, id) => {
      const correct = this.correctIds.has(id);
      const hovered = this.hoveredId === id && !correct;
      tile.box.material = getStandard(correct ? COLORS.correct : (hovered ? COLORS.hover : COLORS.tile), { roughness: 0.5 });
    });
  }

  setHover(id) {
    this.hoveredId = id;
    this.refreshColors();
    this.tiles.forEach((tile, i) => tile.group.scale.setScalar(i === id ? 1.05 : 1));
  }

  // Met à jour la barre et le texte du temps restant
  setTime(seconds, total) {
    const ratio = Math.max(0, Math.min(1, seconds / total));
    this.fill.scale.x = Math.max(ratio, 0.0001);
    this.fill.position.x = -(BAR_WIDTH / 2) * (1 - ratio);
    const color = ratio > 0.5 ? COLORS.good : (ratio > 0.25 ? COLORS.mid : COLORS.low);
    this.fill.material = getStandard(color, { roughness: 0.5 });

    const second = Math.ceil(seconds);
    if (second !== this.shownSecond) {
      this.shownSecond = second;
      if (this.timeText) this.group.remove(this.timeText);
      this.timeText = this.textFactory.create(`Temps : ${second} s`, { size: 0.13, color: COLORS.text, anchor: 'top' });
      this.timeText.position.y = TIME_Y;
      this.group.add(this.timeText);
    }
  }
}
