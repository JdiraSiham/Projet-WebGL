import * as THREE from 'three';

export class SceneManager {
  constructor(container) {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0xd8d8e8);

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(container.clientWidth, container.clientHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    container.appendChild(this.renderer.domElement);

    this.setupLights();
  }

  setupLights() {
    // Lumière générale douce : ciel clair, sol chaud
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0xb08a64, 1.0));

    // Lumière principale avec ombres
    const sun = new THREE.DirectionalLight(0xfff1dc, 2.2);
    sun.position.set(20, 34, 14);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = -26;
    sun.shadow.camera.right = 26;
    sun.shadow.camera.top = 26;
    sun.shadow.camera.bottom = -26;
    sun.shadow.camera.near = 1;
    sun.shadow.camera.far = 100;
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.02;
    this.scene.add(sun);

    // Lueur chaude locale au-dessus de la zone des cartes
    const glow = new THREE.PointLight(0xffc870, 25, 20, 2);
    glow.position.set(0, 6, 0);
    this.scene.add(glow);
  }

  // Active ombres projetées et reçues sur tous les objets (sauf le sol d'ombres)
  enableShadows(root) {
    root.traverse((obj) => {
      if (!obj.isMesh) return;
      obj.receiveShadow = true;
      obj.castShadow = !obj.material.isShadowMaterial;
    });
  }

  resize(width, height) {
    this.renderer.setSize(width, height);
  }

  render(camera) {
    this.renderer.render(this.scene, camera);
  }
}
