import * as THREE from 'three';
import { Card3D } from './Card3D.js';
import { makeBox } from '../world/Materials.js';

const TITLE_Y = 1.36;
const STATUS_Y = 0.95;

// Base des cartes Bonus et Piège : titre, consigne, libellé de résultat et bandeau de conclusion,
// tous sur le verso de la carte (révélé par le retournement).
export class InfoCard extends Card3D {
  constructor(textFactory, { color, symbol, textColor }) {
    super({ color, symbol, standing: true });
    this.textFactory = textFactory;
    this.textColor = textColor;
    this.title = null;
    this.status = null;
    this.label = null;
    this.banner = null;
    this.setFlip(0);
  }

  setTitle(text) {
    if (this.title) this.backContent.remove(this.title);
    this.title = this.textFactory.create(text, { size: 0.15, color: this.textColor, depth: 0.02 });
    this.title.position.y = TITLE_Y;
    this.backContent.add(this.title);
  }

  setStatus(text) {
    this.clearStatus();
    this.status = this.textFactory.create(text, {
      size: 0.15, maxWidth: 1.95, maxLines: 2, color: this.textColor, anchor: 'top'
    });
    this.status.position.y = STATUS_Y;
    this.backContent.add(this.status);
  }

  clearStatus() {
    if (this.status) this.backContent.remove(this.status);
    this.status = null;
  }

  // Libellé du résultat sous l'illustration (ex. "+75 points")
  setLabel(text) {
    if (this.label) this.backContent.remove(this.label);
    this.label = this.textFactory.create(text, { size: 0.21, maxWidth: 1.95, maxLines: 1, color: this.textColor, depth: 0.02 });
    this.label.position.y = -1.2;
    this.backContent.add(this.label);
  }

  // Bandeau de conclusion en haut de la carte
  showFeedback(text, pillColor) {
    if (this.title) this.backContent.remove(this.title);
    const pill = makeBox(1.95, 0.5, 0.04, pillColor, { radius: 0.03, roughness: 0.5 });
    pill.position.z = 0.02;
    const label = this.textFactory.create(text, { size: 0.11, maxWidth: 1.85, maxLines: 3, color: 0xffffff, depth: 0.02 });
    label.position.z = 0.04;

    this.banner = new THREE.Group();
    this.banner.position.y = TITLE_Y - 0.03; // le bandeau (0,5 de haut) reste dans la face colorée
    this.banner.add(pill, label);
    this.backContent.add(this.banner);
  }
}
