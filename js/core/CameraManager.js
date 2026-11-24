import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

export class CameraManager {
  constructor(domElement, aspect) {
    this.camera = new THREE.PerspectiveCamera(38, aspect, 0.1, 300);
    this.target = new THREE.Vector3(0, 1.8, 0);
    // Vue de face légèrement tournée (~33° d'élévation) : le départ est bien en bas à droite,
    // et on voit l'épaisseur des cases et du support
    this.direction = new THREE.Vector3(0.4, 0.7, 1).normalize();
    this.userMoved = false;
    this.lockCount = 0; // plusieurs verrous peuvent se superposer (carte ouverte + pause)

    this.controls = new OrbitControls(this.camera, domElement);
    this.controls.target.copy(this.target);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.enablePan = false;
    this.controls.minDistance = 15;
    this.controls.maxDistance = 90;
    this.controls.minPolarAngle = Math.PI * 0.2;  // jamais une vue presque verticale
    this.controls.maxPolarAngle = Math.PI * 0.48; // jamais sous le plateau
    this.controls.addEventListener('start', () => { this.userMoved = true; });

    this.fitToAspect(aspect);
  }

  // Recule la caméra si l'écran est étroit, pour garder tout le plateau visible
  fitToAspect(aspect) {
    const distance = Math.max(38, 50 / aspect);
    this.camera.position.copy(this.target).addScaledVector(this.direction, distance);
    this.camera.lookAt(this.target);
    this.controls.update();
  }

  onResize(aspect) {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
    if (!this.userMoved) this.fitToAspect(aspect);
  }

  // Fige la caméra (carte ou menu affiché) ou la libère. Les verrous se cumulent : la caméra n'est libre
  // que lorsque tous ont été relâchés. Au blocage, l'élan de la souris est stoppé net.
  setLocked(locked) {
    if (locked) {
      if (this.lockCount === 0) {
        this.controls.enableDamping = false;
        this.controls.update(); // applique et annule le mouvement en cours (amortissement)
        this.controls.enabled = false;
      }
      this.lockCount++;
    } else {
      this.lockCount = Math.max(0, this.lockCount - 1);
      if (this.lockCount === 0) {
        this.controls.enableDamping = true;
        this.controls.enabled = true;
      }
    }
  }

  // Libère tous les verrous d'un coup (retour au menu principal)
  reset() {
    this.lockCount = 0;
    this.controls.enableDamping = true;
    this.controls.enabled = true;
  }

  get locked() {
    return this.lockCount > 0;
  }

  update() {
    this.controls.update();
  }
}
