import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

// Caches : on partage matériaux et géométries pour économiser la mémoire.
const materials = new Map();
const geometries = new Map();

export function getStandard(color, { roughness = 0.7, metalness = 0, flatShading = false } = {}) {
  const key = `std|${color}|${roughness}|${metalness}|${flatShading}`;
  if (!materials.has(key)) {
    materials.set(key, new THREE.MeshStandardMaterial({ color, roughness, metalness, flatShading }));
  }
  return materials.get(key);
}

export function getPhong(color, shininess = 80, flatShading = false) {
  const key = `phong|${color}|${shininess}|${flatShading}`;
  if (!materials.has(key)) {
    materials.set(key, new THREE.MeshPhongMaterial({ color, shininess, flatShading }));
  }
  return materials.get(key);
}

// Boîte aux arêtes légèrement arrondies (aspect "jouet", moins rigide qu'un cube parfait).
// radius = 0 donne un BoxGeometry classique.
export function getBoxGeometry(w, h, d, radius = 0.05) {
  const key = `box|${w}|${h}|${d}|${radius}`;
  if (!geometries.has(key)) {
    const r = Math.min(radius, Math.min(w, h, d) / 2 - 0.001);
    geometries.set(
      key,
      r > 0.005 ? new RoundedBoxGeometry(w, h, d, 2, r) : new THREE.BoxGeometry(w, h, d)
    );
  }
  return geometries.get(key);
}

export function makeBox(w, h, d, color, { radius = 0.05, ...materialOptions } = {}) {
  return new THREE.Mesh(getBoxGeometry(w, h, d, radius), getStandard(color, materialOptions));
}
