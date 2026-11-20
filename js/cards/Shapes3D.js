import * as THREE from 'three';
import { getStandard } from '../world/Materials.js';

// Formes 3D simples utilisées par les suites de symboles et le jeu de mémoire.
export const SHAPE_COLORS = {
  cercle: 0xffd54a,
  carre: 0x4dd0e1,
  triangle: 0xff7043,
  etoile: 0xffffff,
  losange: 0x9ccc65,
  croix: 0xf06292
};

const geometries = {};

function getShapeGeometry(kind) {
  if (!geometries[kind]) {
    const shape = new THREE.Shape();
    const polygon = (points) => {
      points.forEach(([x, y], i) => (i === 0 ? shape.moveTo(x, y) : shape.lineTo(x, y)));
      shape.closePath();
    };
    switch (kind) {
      case 'cercle': shape.absarc(0, 0, 0.45, 0, Math.PI * 2, false); break;
      case 'carre': polygon([[-0.4, -0.4], [0.4, -0.4], [0.4, 0.4], [-0.4, 0.4]]); break;
      case 'triangle': polygon([[0, 0.5], [-0.5, -0.4], [0.5, -0.4]]); break;
      case 'losange': polygon([[0, 0.55], [0.4, 0], [0, -0.55], [-0.4, 0]]); break;
      case 'croix': polygon([
        [-0.15, 0.45], [0.15, 0.45], [0.15, 0.15], [0.45, 0.15], [0.45, -0.15], [0.15, -0.15],
        [0.15, -0.45], [-0.15, -0.45], [-0.15, -0.15], [-0.45, -0.15], [-0.45, 0.15], [-0.15, 0.15]
      ]); break;
      default: { // étoile à 5 branches
        const points = [];
        for (let i = 0; i < 10; i++) {
          const r = i % 2 === 0 ? 0.5 : 0.22;
          const a = Math.PI / 2 + (i * Math.PI) / 5;
          points.push([Math.cos(a) * r, Math.sin(a) * r]);
        }
        polygon(points);
      }
    }
    geometries[kind] = new THREE.ExtrudeGeometry(shape, {
      depth: 0.05, bevelEnabled: true, bevelThickness: 0.012, bevelSize: 0.012, bevelSegments: 1, curveSegments: 16
    });
  }
  return geometries[kind];
}

// Forme 3D de la taille demandée (géométrie partagée, matériau partagé)
export function shapeMesh(kind, size) {
  const mesh = new THREE.Mesh(getShapeGeometry(kind), getStandard(SHAPE_COLORS[kind], { roughness: 0.4 }));
  mesh.scale.set(size, size, 1);
  return mesh;
}
