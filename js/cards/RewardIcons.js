import * as THREE from 'three';
import { makeBox, getStandard } from '../world/Materials.js';

// Icônes 3D des récompenses et pénalités (étoile, pièce, cœur, flèche, pause), posées sur un disque blanc
// pour rester lisibles sur les cartes jaune et rouge. Dessinées dans le plan XY, face vers +Z.

const geometries = {};

function extrusion(shape, depth = 0.06) {
  return new THREE.ExtrudeGeometry(shape, {
    depth, bevelEnabled: true, bevelThickness: 0.015, bevelSize: 0.015, bevelSegments: 1, curveSegments: 16
  });
}

function centered(geometry, scale = 1) {
  geometry.scale(scale, scale, 1);
  geometry.computeBoundingBox();
  const c = geometry.boundingBox.getCenter(new THREE.Vector3());
  geometry.translate(-c.x, -c.y, 0);
  return geometry;
}

function polygon(points) {
  const shape = new THREE.Shape();
  points.forEach(([x, y], i) => (i === 0 ? shape.moveTo(x, y) : shape.lineTo(x, y)));
  shape.closePath();
  return shape;
}

function getGeometry(name) {
  if (geometries[name]) return geometries[name];
  let geometry;
  switch (name) {
    case 'heart': {
      const s = new THREE.Shape(); // cœur : courbes de Bézier
      s.moveTo(25, 25);
      s.bezierCurveTo(25, 25, 20, 0, 0, 0);
      s.bezierCurveTo(-30, 0, -30, 35, -30, 35);
      s.bezierCurveTo(-30, 55, -10, 77, 25, 95);
      s.bezierCurveTo(60, 77, 80, 55, 80, 35);
      s.bezierCurveTo(80, 35, 80, 0, 50, 0);
      s.bezierCurveTo(35, 0, 25, 25, 25, 25);
      geometry = centered(extrusion(s), 0.0085);
      break;
    }
    case 'star': {
      const pts = [];
      for (let i = 0; i < 10; i++) {
        const r = i % 2 === 0 ? 0.48 : 0.21;
        const a = Math.PI / 2 + (i * Math.PI) / 5;
        pts.push([Math.cos(a) * r, Math.sin(a) * r]);
      }
      geometry = centered(extrusion(polygon(pts)));
      break;
    }
    case 'arrow':
      geometry = centered(extrusion(polygon([
        [-0.5, 0.16], [0.08, 0.16], [0.08, 0.42], [0.55, 0], [0.08, -0.42], [0.08, -0.16], [-0.5, -0.16]
      ])));
      break;
    case 'coin':
      geometry = new THREE.CylinderGeometry(0.38, 0.38, 0.07, 32);
      geometry.rotateX(Math.PI / 2); // l'axe du cylindre pointe vers +Z
      break;
    case 'disc':
      geometry = new THREE.CylinderGeometry(0.58, 0.58, 0.05, 40);
      geometry.rotateX(Math.PI / 2);
      break;
    default:
      throw new Error(`Icône inconnue : ${name}`);
  }
  geometries[name] = geometry;
  return geometry;
}

// kind : 'points' | 'life' | 'move' | 'skip' ; positive : récompense (true) ou pénalité (false)
export function buildRewardIcon(kind, positive) {
  const group = new THREE.Group();
  const disc = new THREE.Mesh(getGeometry('disc'), getStandard(0xffffff, { roughness: 0.5 }));
  disc.position.z = 0.025;
  group.add(disc);

  const add = (mesh, z = 0.065) => { mesh.position.z = z; group.add(mesh); return mesh; };

  if (kind === 'points') {
    if (positive) {
      add(new THREE.Mesh(getGeometry('star'), getStandard(0xffb300, { roughness: 0.35, metalness: 0.2 })));
    } else {
      add(new THREE.Mesh(getGeometry('coin'), getStandard(0x9e9e9e, { roughness: 0.4, metalness: 0.3 })), 0.085);
      add(makeBox(0.4, 0.1, 0.04, 0x37474f, { radius: 0.01 }), 0.14); // signe moins
    }
  } else if (kind === 'life') {
    add(new THREE.Mesh(getGeometry('heart'), getStandard(positive ? 0xe53935 : 0x7b1e1e, { roughness: 0.4 })));
    if (!positive) { // cœur brisé : fissure en zigzag
      const crack = getStandard(0xffffff, { roughness: 0.5 });
      [[0.04, 0.2, 0.5], [-0.05, 0.0, -0.5], [0.04, -0.2, 0.5]].forEach(([x, y, angle]) => {
        const piece = new THREE.Mesh(makeBox(0.07, 0.24, 0.03, 0xffffff).geometry, crack);
        piece.position.set(x, y, 0.16);
        piece.rotation.z = angle;
        group.add(piece);
      });
    }
  } else if (kind === 'move') {
    const arrow = add(new THREE.Mesh(getGeometry('arrow'), getStandard(positive ? 0x2e9e4f : 0xd32f2f, { roughness: 0.4 })));
    if (!positive) arrow.rotation.y = Math.PI; // flèche vers la gauche (recul)
    if (!positive) arrow.position.z = 0.065;
  } else if (kind === 'skip') {
    add(makeBox(0.2, 0.7, 0.08, 0x37474f, { radius: 0.03 })).position.x = -0.17;
    add(makeBox(0.2, 0.7, 0.08, 0x37474f, { radius: 0.03 })).position.x = 0.17;
  }
  return group;
}
