import * as THREE from 'three';
import { Card3D } from './Card3D.js';
import { makeBox, getStandard } from '../world/Materials.js';

const BLUE = 0x2f7de1;
const COLORS = {
  button: 0xfff6e0,
  hover: 0xffe3a0,
  correct: 0x3fbf5f,
  wrong: 0xe03a3a,
  dark: 0x4a3320,
  light: 0xffffff
};

// Positions sur la carte (repère local : la face colorée va de y = -1.6 à +1.6)
const LAYOUT = {
  labelY: 1.36,
  questionY: 1.08,
  buttonWidth: 1.95,
  buttonHeight: 0.4,
  buttonDepth: 0.06,
  firstButtonY: 0.18,
  buttonStep: 0.48
};

const LETTERS = ['A', 'B', 'C', 'D'];

// Carte de quiz : une question et 4 réponses cliquables, entièrement en 3D.
// Le recto montre le "?" ; la question et les réponses sont sur le verso, révélé par un retournement.
export class QuizCard extends Card3D {
  constructor(textFactory) {
    super({ color: BLUE, symbol: 'quiz', standing: true }); // même "?" que la carte de la pile
    this.textFactory = textFactory;
    this.question = null;
    this.selected = null;     // indice de la réponse choisie
    this.locked = false;      // une seule réponse est validée
    this.hoveredIndex = null;
    this.buttons = [];
    this.title = null;
    this.banner = null;
    this.setFlip(0); // au départ : face "?" visible, comme la carte de la pile
  }

  // Retournement de la carte : 0 = recto (symbole "?"), 1 = verso (question et réponses)
  setFlip(amount) {
    this.flat.rotation.y = Math.PI * amount;
  }

  // Affiche la question et les 4 propositions
  showQuestion(question) {
    this.question = question;
    this.selected = null;
    this.locked = false;

    this.title = this.textFactory.create('QUIZ', { size: 0.15, color: COLORS.light, depth: 0.02 });
    this.title.position.y = LAYOUT.labelY;
    this.backContent.add(this.title);

    const text = this.textFactory.create(question.text, {
      size: 0.17, maxWidth: 1.95, maxLines: 3, color: COLORS.light, anchor: 'top'
    });
    text.position.y = LAYOUT.questionY;
    this.backContent.add(text);

    question.choices.forEach((choice, index) => this.addButton(choice, index));
    this.clickableMeshes = this.buttons.map((b) => b.group);
  }

  addButton(choice, index) {
    const group = new THREE.Group();
    group.userData.answerIndex = index;
    group.position.y = LAYOUT.firstButtonY - index * LAYOUT.buttonStep;

    const box = makeBox(LAYOUT.buttonWidth, LAYOUT.buttonHeight, LAYOUT.buttonDepth, COLORS.button, { radius: 0.03, roughness: 0.5 });
    box.position.z = LAYOUT.buttonDepth / 2;

    const label = this.textFactory.create(`${LETTERS[index]}. ${choice}`, {
      size: 0.12, maxWidth: 1.8, maxLines: 2, color: COLORS.dark, depth: 0.02
    });
    label.position.z = LAYOUT.buttonDepth;

    group.add(box, label);
    this.backContent.add(group);
    this.buttons.push({ group, box, label, index });
  }

  paintButton(button, boxColor, textColor) {
    button.box.material = getStandard(boxColor, { roughness: 0.5 });
    this.textFactory.setColor(button.label, textColor);
  }

  // Survol d'une réponse (index) ou aucun survol (null)
  setHover(index) {
    if (this.locked || index === this.hoveredIndex) return;
    this.hoveredIndex = index;
    for (const button of this.buttons) {
      const hovered = button.index === index;
      this.paintButton(button, hovered ? COLORS.hover : COLORS.button, COLORS.dark);
      button.group.scale.setScalar(hovered ? 1.04 : 1);
    }
  }

  // Valide UNE réponse : colore la bonne en vert et, si besoin, la mauvaise en rouge.
  // Retourne true si la réponse est correcte, null si une réponse a déjà été validée.
  submitAnswer(index) {
    if (this.locked) return null;
    this.locked = true;
    this.selected = index;

    const correct = index === this.question.correctIndex;
    for (const button of this.buttons) {
      button.group.scale.setScalar(1);
      if (button.index === this.question.correctIndex) this.paintButton(button, COLORS.correct, COLORS.light);
      else if (button.index === index) this.paintButton(button, COLORS.wrong, COLORS.light);
    }
    return correct;
  }

  // Bandeau de résultat en haut de la carte (vert si réussi, rouge sinon)
  showFeedback(text, correct) {
    if (this.title) this.backContent.remove(this.title);

    const pill = makeBox(1.95, 0.42, 0.04, correct ? COLORS.correct : COLORS.wrong, { radius: 0.03, roughness: 0.5 });
    pill.position.z = 0.02;
    const label = this.textFactory.create(text, { size: 0.12, maxWidth: 1.85, maxLines: 2, color: COLORS.light, depth: 0.02 });
    label.position.z = 0.04;

    this.banner = new THREE.Group();
    this.banner.position.y = LAYOUT.labelY;
    this.banner.add(pill, label);
    this.backContent.add(this.banner);
  }
}