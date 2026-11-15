import * as THREE from 'three';

// Environnement : sol invisible qui n'affiche que les ombres portées du plateau.
export class Environment {
  constructor() {
    this.group = new THREE.Group();
    this.buildGround();
  }

  // ShadowMaterial : transparent, il ne montre que les ombres
  buildGround() {
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(200, 200),
      new THREE.ShadowMaterial({ opacity: 0.22 })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.01;
    this.group.add(ground);
  }
}
