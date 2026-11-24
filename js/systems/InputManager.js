import * as THREE from 'three';

// Gère la souris avec un Raycaster. Chaque "interaction" décrit un groupe d'objets cliquables :
//   isActive()   : l'interaction est-elle utilisable en ce moment ?
//   getObjects() : les objets 3D visés (le dé, les réponses d'une carte...)
//   onHover(hit) : appelée avec l'objet survolé (ou null)
//   onClick(hit) : appelée quand on clique sur un objet
// On distingue un vrai clic d'un glisser de souris (rotation de la caméra avec OrbitControls).
export class InputManager {
  constructor(domElement, camera) {
    this.domElement = domElement;
    this.camera = camera;
    this.interactions = [];

    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();
    this.lastPointerPosition = null;
    this.downX = 0;
    this.downY = 0;

    domElement.addEventListener('pointerdown', (e) => this.onPointerDown(e));
    domElement.addEventListener('pointerup', (e) => this.onPointerUp(e));
    domElement.addEventListener('pointerenter', (e) => this.onPointerMove(e));
    domElement.addEventListener('pointermove', (e) => this.onPointerMove(e));
    domElement.addEventListener('pointerleave', () => {
      this.lastPointerPosition = null;
      this.clearHover();
    });
  }

  addInteraction(interaction) {
    this.interactions.push(interaction);
  }

  // Touche du clavier (ex. 'Escape' pour la pause)
  addKeyHandler(key, handler) {
    window.addEventListener('keydown', (event) => {
      if (event.key === key && !event.repeat) handler(event);
    });
  }

  // Premier objet touché par le rayon sous la souris (ou null)
  pick(event, objects) {
    if (objects.length === 0) return null;
    const rect = this.domElement.getBoundingClientRect();
    this.pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    this.camera.updateWorldMatrix(true, false);
    for (const object of objects) object.updateWorldMatrix(true, true);
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hits = this.raycaster.intersectObjects(objects, true);
    return hits.length > 0 ? hits[0].object : null;
  }

  clearHover() {
    for (const interaction of this.interactions) interaction.onHover?.(null);
    this.domElement.style.cursor = '';
  }

  onPointerDown(event) {
    this.downX = event.clientX;
    this.downY = event.clientY;
  }

  onPointerUp(event) {
    if (event.button !== 0) return;
    const moved = Math.hypot(event.clientX - this.downX, event.clientY - this.downY);
    if (moved > 5) return; // c'était un glisser (rotation caméra), pas un clic

    for (const interaction of this.interactions) {
      if (!interaction.isActive()) continue;
      const hit = this.pick(event, interaction.getObjects());
      if (hit) {
        interaction.onHover?.(null);
        interaction.onClick(hit);
        return;
      }
    }
  }

  onPointerMove(event) {
    this.lastPointerPosition = { clientX: event.clientX, clientY: event.clientY };
    let overSomething = false;
    for (const interaction of this.interactions) {
      if (!interaction.isActive()) {
        interaction.onHover?.(null);
        continue;
      }
      const hit = this.pick(event, interaction.getObjects());
      interaction.onHover?.(hit);
      if (hit) overSomething = true;
    }
    this.domElement.style.cursor = overSomething ? 'pointer' : '';
  }

  refreshHover() {
    if (this.lastPointerPosition) this.onPointerMove(this.lastPointerPosition);
  }
}
