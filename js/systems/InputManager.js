import * as THREE from 'three';

// Détecte le clic sur le dé avec un Raycaster.
// On distingue un vrai clic d'un glisser de souris (rotation de la caméra avec OrbitControls).
export class InputManager {
  constructor(domElement, camera, dice, { canRoll, onDiceClick }) {
    this.domElement = domElement;
    this.camera = camera;
    this.dice = dice;
    this.canRoll = canRoll;
    this.onDiceClick = onDiceClick;

    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();
    this.downX = 0;
    this.downY = 0;

    domElement.addEventListener('pointerdown', (e) => this.onPointerDown(e));
    domElement.addEventListener('pointerup', (e) => this.onPointerUp(e));
    domElement.addEventListener('pointermove', (e) => this.onPointerMove(e));
    domElement.addEventListener('pointerleave', () => this.setHover(false));
  }

  isOverDice(event) {
    const rect = this.domElement.getBoundingClientRect();
    this.pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(this.pointer, this.camera);
    return this.raycaster.intersectObject(this.dice.group, true).length > 0;
  }

  setHover(active) {
    this.dice.setHover(active);
    this.domElement.style.cursor = active ? 'pointer' : '';
  }

  onPointerDown(event) {
    this.downX = event.clientX;
    this.downY = event.clientY;
  }

  onPointerUp(event) {
    if (event.button !== 0) return;
    const moved = Math.hypot(event.clientX - this.downX, event.clientY - this.downY);
    if (moved > 5) return; // c'était un glisser (rotation caméra), pas un clic
    if (this.canRoll() && this.isOverDice(event)) {
      this.setHover(false);
      this.onDiceClick();
    }
  }

  onPointerMove(event) {
    this.setHover(this.canRoll() && this.isOverDice(event));
  }
}
