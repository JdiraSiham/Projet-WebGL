import * as THREE from 'three';
import { Card3D } from './Card3D.js';
import { makeBox, getStandard } from '../world/Materials.js';
import { shapeMesh } from './Shapes3D.js';

const VIOLET = 0x8a4fd8;
const COLORS = {
  light: 0xffffff,
  correct: 0x3fbf5f,
  wrong: 0xe03a3a,
  slot: 0xfff6e0,
  hover: 0xffe3a0,
  placeholder: 0x5b2c9f,
  base: 0x3a2260,
  dotOff: 0xcdb8f5,
  dotOn: 0x7dff7d
};

const CRYSTAL_COLORS = [0xe53935, 0x1e88e5, 0x43a047, 0xfdd835];
const CRYSTAL_POSITIONS = [[-0.55, 0.3], [0.55, 0.3], [-0.55, -0.65], [0.55, -0.65]];
const LABEL_Y = 1.36;
const STATUS_Y = 0.95;

// Géométries partagées par toutes les cartes de défi
const crystalGeometry = new THREE.OctahedronGeometry(0.27);
const baseGeometry = new THREE.CylinderGeometry(0.33, 0.37, 0.06, 24);
const dotGeometry = new THREE.SphereGeometry(0.07, 12, 12);

// Carte de défi violette. Le recto montre la pièce de puzzle ; le verso porte l'épreuve :
// des cristaux à mémoriser (kind 'crystals') ou une suite de symboles à compléter (kind 'symbols').
export class ChallengeCard extends Card3D {
  constructor(textFactory) {
    super({ color: VIOLET, symbol: 'defi', standing: true });
    this.textFactory = textFactory;
    this.kind = null;
    this.locked = false;
    this.hoveredIndex = null;
    this.crystals = [];   // { group, material, color, lit }
    this.choices = [];    // { group, box, kind }
    this.puzzle = null;
    this.selected = null;
    this.placeholder = null;
    this.title = null;
    this.status = null;
    this.progress = null;
    this.banner = null;
    this.component = null; // jeu monté sur la carte (puzzle coulissant, mémoire)
    this.setFlip(0);
  }

  // ----- Textes -----

  setTitle(text) {
    if (this.title) this.backContent.remove(this.title);
    this.title = this.textFactory.create(text, { size: 0.15, color: COLORS.light, depth: 0.02 });
    this.title.position.y = LABEL_Y;
    this.backContent.add(this.title);
  }

  // Consigne affichée sous le titre (remplacée à chaque changement d'étape)
  setStatus(text) {
    if (this.status) this.backContent.remove(this.status);
    this.status = this.textFactory.create(text, {
      size: 0.14, maxWidth: 1.95, maxLines: 2, color: COLORS.light, anchor: 'top'
    });
    this.status.position.y = STATUS_Y;
    this.backContent.add(this.status);
  }

  // ----- Jeux montés (puzzle coulissant, mémoire) -----

  // Place un composant 3D (avec group, clickableMeshes, setHover) sur le verso de la carte
  mountGame(component, kind, title) {
    this.kind = kind;
    this.component = component;
    this.setTitle(title);
    this.backContent.add(component.group);
    this.clickableMeshes = component.clickableMeshes;
  }

  // ----- Défi Cristaux -----

  showCrystals(length, { final = false } = {}) {
    this.kind = 'crystals';
    this.setTitle(final ? 'FINALE' : 'DÉFI : CRISTAUX');
    this.setStatus('Prépare-toi...');

    CRYSTAL_COLORS.forEach((color, i) => {
      const [x, y] = CRYSTAL_POSITIONS[i];
      const group = new THREE.Group();
      group.userData.answerIndex = i;
      group.position.set(x, y, 0);

      const base = new THREE.Mesh(baseGeometry, getStandard(COLORS.base, { roughness: 0.6 }));
      base.rotation.x = Math.PI / 2; // le cylindre se couche : son axe pointe hors de la carte
      base.position.z = 0.03;

      const material = new THREE.MeshPhongMaterial({ color, flatShading: true, shininess: 90 });
      const crystal = new THREE.Mesh(crystalGeometry, material);
      crystal.scale.y = 1.3;
      crystal.position.z = 0.31;

      group.add(base, crystal);
      this.backContent.add(group);
      this.crystals.push({ group, material, color, lit: false });
      this.setLit(i, false);
    });

    this.clickableMeshes = this.crystals.map((c) => c.group);
    this.setProgress(0, length);
  }

  // Allume ou éteint un cristal (couleur vive + lueur + léger agrandissement)
  setLit(index, lit) {
    const crystal = this.crystals[index];
    crystal.lit = lit;
    crystal.material.color.setHex(crystal.color);
    if (!lit) crystal.material.color.multiplyScalar(0.45);
    crystal.material.emissive.setHex(lit ? crystal.color : 0x000000);
    crystal.material.emissiveIntensity = lit ? 0.9 : 0;
    this.updateCrystalScales();
  }

  updateCrystalScales() {
    this.crystals.forEach((crystal, i) => {
      const scale = crystal.lit ? 1.2 : (i === this.hoveredIndex ? 1.12 : 1);
      crystal.group.scale.setScalar(scale);
    });
  }

  // Petits points qui montrent la progression (vert = bon cristal déjà cliqué)
  setProgress(done, total) {
    if (this.progress) this.backContent.remove(this.progress);
    this.progress = new THREE.Group();
    for (let i = 0; i < total; i++) {
      const dot = new THREE.Mesh(dotGeometry, getStandard(i < done ? COLORS.dotOn : COLORS.dotOff, { roughness: 0.5 }));
      dot.position.set((i - (total - 1) / 2) * 0.22, -1.38, 0.05);
      this.progress.add(dot);
    }
    this.backContent.add(this.progress);
  }

  // ----- Défi Symboles -----

  showSymbols(puzzle) {
    this.kind = 'symbols';
    this.puzzle = puzzle;
    this.setTitle('DÉFI : SYMBOLES');
    this.setStatus('Quel symbole continue la suite ?');

    // La suite, suivie d'une case "?" à compléter
    const items = puzzle.sequence.length + 1;
    const spacing = Math.min(0.42, 1.9 / items);
    const size = spacing * 0.72;
    const xOf = (i) => (i - (items - 1) / 2) * spacing;

    puzzle.sequence.forEach((kind, i) => {
      const mesh = shapeMesh(kind, size);
      mesh.position.set(xOf(i), 0.3, 0.02);
      this.backContent.add(mesh);
    });

    this.placeholder = new THREE.Group();
    this.placeholder.position.set(xOf(items - 1), 0.3, 0);
    const slot = makeBox(size * 1.15, size * 1.15, 0.03, COLORS.placeholder, { radius: 0.02, roughness: 0.5 });
    slot.position.z = 0.015;
    const mark = this.textFactory.create('?', { size: size * 0.9, color: COLORS.light, depth: 0.02 });
    mark.position.z = 0.03;
    this.placeholder.add(slot, mark);
    this.placeholderMark = mark;
    this.backContent.add(this.placeholder);

    // Les 4 propositions, cliquables
    puzzle.choices.forEach((kind, i) => {
      const group = new THREE.Group();
      group.userData.answerIndex = i;
      group.position.set((i - 1.5) * 0.5, -0.85, 0);
      const box = makeBox(0.4, 0.4, 0.05, COLORS.slot, { radius: 0.03, roughness: 0.5 });
      box.position.z = 0.025;
      const mesh = shapeMesh(kind, 0.28);
      mesh.position.z = 0.05;
      group.add(box, mesh);
      this.backContent.add(group);
      this.choices.push({ group, box, kind });
    });
    this.clickableMeshes = this.choices.map((c) => c.group);
  }

  // Valide UNE proposition. Retourne true si c'est la bonne, null si une réponse a déjà été validée.
  submitSymbol(index) {
    if (this.locked) return null;
    this.locked = true;
    this.selected = index;
    const correct = index === this.puzzle.correctIndex;

    this.choices.forEach((choice, i) => {
      choice.group.scale.setScalar(1);
      if (i === this.puzzle.correctIndex) choice.box.material = getStandard(COLORS.correct, { roughness: 0.5 });
      else if (i === index) choice.box.material = getStandard(COLORS.wrong, { roughness: 0.5 });
    });

    // La bonne forme vient remplir la case "?"
    this.placeholder.remove(this.placeholderMark);
    const answer = shapeMesh(this.puzzle.answer, 0.28);
    answer.position.z = 0.04;
    this.placeholder.add(answer);
    return correct;
  }

  // ----- Survol -----

  setHover(index) {
    if (this.locked || index === this.hoveredIndex) return;
    this.hoveredIndex = index;
    if (this.component) {
      this.component.setHover(index);
    } else if (this.kind === 'crystals') {
      this.updateCrystalScales();
    } else if (this.kind === 'symbols') {
      this.choices.forEach((choice, i) => {
        const hovered = i === index;
        choice.box.material = getStandard(hovered ? COLORS.hover : COLORS.slot, { roughness: 0.5 });
        choice.group.scale.setScalar(hovered ? 1.08 : 1);
      });
    }
  }

  // Bandeau de résultat en haut de la carte (vert si réussi, rouge sinon)
  showFeedback(text, success) {
    if (this.title) this.backContent.remove(this.title);
    const pill = makeBox(1.95, 0.5, 0.04, success ? COLORS.correct : COLORS.wrong, { radius: 0.03, roughness: 0.5 });
    pill.position.z = 0.02;
    const label = this.textFactory.create(text, { size: 0.11, maxWidth: 1.85, maxLines: 3, color: COLORS.light, depth: 0.02 });
    label.position.z = 0.04;

    this.banner = new THREE.Group();
    this.banner.position.y = LABEL_Y - 0.03; // le bandeau (0,5 de haut) reste dans la face colorée
    this.banner.add(pill, label);
    this.backContent.add(this.banner);
  }
}
