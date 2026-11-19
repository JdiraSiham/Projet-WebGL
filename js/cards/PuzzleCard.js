import * as THREE from 'three';
import { ChallengeCard } from './ChallengeCard.js';
import { makeBox, getStandard } from '../world/Materials.js';
import { isSlideSolved, trySlide, SLIDE_SIZE } from '../data/challenges.js';
import { easeInOutQuad } from '../systems/AnimationManager.js';

const COLORS = {
  light: 0xffffff,
  barBack: 0x3a2260,
  solved: 0x3fbf5f,
  timeHigh: 0x3fbf5f,
  timeMid: 0xf5a623,
  timeLow: 0xe03a3a
};

// Une couleur par tuile (1 à 8) : même une fois mélangées, on les reconnaît facilement
const TILE_COLORS = [0xe8574a, 0xef8a17, 0xc9a40a, 0x52a447, 0x1fa3b0, 0x3a7bd5, 0x7b52c9, 0xc2467f];

const CELL = 0.6;    // distance entre les centres de deux tuiles
const TILE = 0.54;   // côté d'une tuile
const GRID_Y = -0.3; // centre de la grille sur la carte
const BAR = { y: -1.42, width: 1.8, height: 0.22 }; // barre de temps en bas de la carte

// Carte "Puzzle" : un taquin 3 x 3 à remettre dans l'ordre (1 à 8) avant la fin du temps.
// Elle hérite de ChallengeCard : le titre, la consigne et le bandeau de résultat sont déjà prêts.
// Les tuiles sont cliquables : une tuile à côté de la case vide glisse vers elle.
export class PuzzleCard extends ChallengeCard {
  constructor(textFactory, animations) {
    super(textFactory);
    this.animations = animations;
    this.layout = [];          // layout[case] = numéro de la tuile (0 = case vide)
    this.tileById = {};        // numéro -> { group, box }
    this.timeFill = null;
    this.timeText = null;
    this.shownSeconds = null;
  }

  // Centre d'une case de la grille (case 0 = en haut à gauche)
  slotPosition(slot) {
    const col = slot % SLIDE_SIZE;
    const row = Math.floor(slot / SLIDE_SIZE);
    return { x: (col - 1) * CELL, y: GRID_Y - (row - 1) * CELL };
  }

  // Affiche le puzzle mélangé : { tiles, time }
  showPuzzle(slide) {
    this.kind = 'puzzle';
    this.layout = [...slide.tiles];
    this.setTitle('DÉFI : PUZZLE');
    this.setStatus('Range les tuiles\nde 1 à 8 !');

    this.layout.forEach((id, slot) => {
      if (id !== 0) this.addTile(id, slot);
    });
    this.clickableMeshes = Object.values(this.tileById).map((tile) => tile.group);

    this.buildTimeBar();
    this.setTime(slide.time, slide.time);
  }

  addTile(id, slot) {
    const group = new THREE.Group();
    group.userData.answerIndex = id; // le clic renvoie le numéro de la tuile
    const { x, y } = this.slotPosition(slot);
    group.position.set(x, y, 0);

    const box = makeBox(TILE, TILE, 0.07, TILE_COLORS[id - 1], { radius: 0.04, roughness: 0.5 });
    box.position.z = 0.035;
    const label = this.textFactory.create(String(id), { size: 0.3, color: COLORS.light, depth: 0.03 });
    label.position.z = 0.07;

    group.add(box, label);
    this.backContent.add(group);
    this.tileById[id] = { group, box };
  }

  // Barre de temps : fond sombre + barre colorée qui rétrécit, avec les secondes restantes au-dessus
  buildTimeBar() {
    const back = makeBox(BAR.width, BAR.height, 0.03, COLORS.barBack, { radius: 0.03, roughness: 0.6 });
    back.position.set(0, BAR.y, 0.015);
    this.timeFill = makeBox(BAR.width, BAR.height - 0.06, 0.03, COLORS.timeHigh, { radius: 0.02, roughness: 0.5 });
    this.timeFill.position.set(0, BAR.y, 0.04);
    this.backContent.add(back, this.timeFill);
  }

  // Met à jour la barre et le nombre de secondes (appelée à chaque image pendant le chrono)
  setTime(remaining, total) {
    const ratio = Math.max(0, Math.min(1, remaining / total));
    this.timeFill.scale.x = Math.max(ratio, 0.001);
    this.timeFill.position.x = -BAR.width / 2 + (BAR.width * ratio) / 2; // la barre reste collée à gauche
    const color = ratio > 0.5 ? COLORS.timeHigh : (ratio > 0.25 ? COLORS.timeMid : COLORS.timeLow);
    this.timeFill.material = getStandard(color, { roughness: 0.5 });

    // Le texte n'est recréé que lorsque le nombre de secondes change
    const seconds = Math.ceil(remaining);
    if (seconds === this.shownSeconds) return;
    this.shownSeconds = seconds;
    if (this.timeText) this.backContent.remove(this.timeText);
    this.timeText = this.textFactory.create(`${seconds} s`, { size: 0.13, color: COLORS.light, depth: 0.02 });
    this.timeText.position.set(0, BAR.y, 0.06);
    this.backContent.add(this.timeText);
  }

  // Clic sur la tuile n° `id`. Retourne { moved, solved }.
  // Une tuile qui n'est pas à côté de la case vide ne bouge pas : elle "refuse" avec une petite secousse.
  async slideTile(id) {
    if (this.locked) return { moved: false, solved: false };
    const tile = this.tileById[id];
    const slot = this.layout.indexOf(id);
    const next = trySlide(this.layout, slot);

    if (!next) {
      await this.animations.animate(0.2, (eased, t) => {
        tile.group.rotation.z = Math.sin(t * Math.PI * 4) * 0.12 * (1 - t);
      });
      tile.group.rotation.z = 0;
      return { moved: false, solved: false };
    }

    const from = tile.group.position.clone();
    const to = this.slotPosition(this.layout.indexOf(0)); // la case vide actuelle
    this.layout = next;
    await this.animations.animate(0.12, (eased) => {
      tile.group.position.x = THREE.MathUtils.lerp(from.x, to.x, eased);
      tile.group.position.y = THREE.MathUtils.lerp(from.y, to.y, eased);
    }, easeInOutQuad);
    return { moved: true, solved: isSlideSolved(next) };
  }

  // Les tuiles deviennent vertes quand le puzzle est réussi
  markSolved() {
    for (const tile of Object.values(this.tileById)) {
      tile.box.material = getStandard(COLORS.solved, { roughness: 0.5 });
    }
  }

  // Fin de l'épreuve (réussite ou temps écoulé) : plus aucune tuile ne réagit
  lock() {
    this.locked = true;
    this.setHover(null);
  }

  // Survol d'une tuile (id) ou aucun survol (null)
  setHover(id) {
    if (id === this.hoveredIndex) return;
    this.hoveredIndex = id;
    for (const [tileId, tile] of Object.entries(this.tileById)) {
      tile.group.scale.setScalar(Number(tileId) === id && !this.locked ? 1.08 : 1);
    }
  }
}
