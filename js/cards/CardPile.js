import * as THREE from 'three';
import { Card3D, CARD_STEP } from './Card3D.js';
import { makeBox } from '../world/Materials.js';

const TRAY_HEIGHT = 0.08;

// Une pile de cartes 3D posée sur un petit plateau (socle beige).
export class CardPile {
  constructor({ key, color, symbol, count = 8 }) {
    this.key = key;
    this.group = new THREE.Group();
    this.cards = [];

    const tray = makeBox(3.1, TRAY_HEIGHT, 4.1, 0xcdb98c, { roughness: 0.8 });
    tray.position.y = TRAY_HEIGHT / 2;
    this.group.add(tray);

    for (let i = 0; i < count; i++) {
      const isTop = i === count - 1;
      const card = new Card3D({ color, symbol: isTop ? symbol : null });
      // Petits décalages déterministes pour un aspect de pile naturelle
      card.group.position.set(Math.cos(i * 7.3) * 0.04, TRAY_HEIGHT + 0.02 + i * CARD_STEP, Math.sin(i * 5.1) * 0.04);
      if (!isTop) card.group.rotation.y = Math.sin(i * 12.9898) * 0.04;
      this.group.add(card.group);
      this.cards.push(card);
    }

    this.topCard = this.cards[this.cards.length - 1];
    this.topBaseY = this.topCard.group.position.y;
    this.phase = Math.random() * Math.PI * 2;
  }

  // La carte du dessus flotte doucement pour attirer l'œil
  update(time) {
    this.topCard.group.position.y = this.topBaseY + 0.08 + Math.sin(time * 2 + this.phase) * 0.05;
  }
}
