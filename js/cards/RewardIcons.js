import * as THREE from 'three';
import { makeBox, getStandard } from '../world/Materials.js';

// Icônes 3D des cartes bonus et danger, posées sur un disque blanc pour rester lisibles
// sur les cartes jaune et rouge. Dessinées dans le plan XY, face vers +Z.
//
// Icônes : move (flèche), extra (dé), double (deux étoiles), skip (pause), slow (signe ÷),
//          flag (checkpoint), cross (pas de chance), check (de la chance).

const geometries = {};

function extrusion(shape, depth = 0.06) {
  return new THREE.ExtrudeGeometry(shape, {
    depth, bevelEnabled: true, bevelThickness: 0.015, bevelSize: 0.015, bevelSegments: 1, curveSegments: 16
  });
}

function centered(geometry) {
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
    case 'flag':
      geometry = extrusion(polygon([[0, 0.25], [0.4, 0.05], [0, -0.15]]));
      break;
    case 'disc':
      geometry = new THREE.CylinderGeometry(0.58, 0.58, 0.05, 40);
      geometry.rotateX(Math.PI / 2);
      break;
    case 'dot':
      geometry = new THREE.SphereGeometry(0.07, 14, 14);
      geometry.scale(1, 1, 0.5);
      break;
    default:
      throw new Error(`Icône inconnue : ${name}`);
  }
  geometries[name] = geometry;
  return geometry;
}

// kind : 'move' | 'extra' | 'double' | 'skip' | 'slow' | 'flag' | 'cross' | 'check'
// positive : bonne nouvelle (vert) ou mauvaise (rouge / gris)
export function buildRewardIcon(kind, positive) {
  const group = new THREE.Group();
  const disc = new THREE.Mesh(getGeometry('disc'), getStandard(0xffffff, { roughness: 0.5 }));
  disc.position.z = 0.025;
  group.add(disc);

  const add = (mesh, z = 0.065) => { mesh.position.z = z; group.add(mesh); return mesh; };
  const bar = (w, h, color, angle = 0, x = 0, y = 0, z = 0.1) => {
    const mesh = add(makeBox(w, h, 0.07, color, { radius: 0.02, roughness: 0.4 }), z);
    mesh.rotation.z = angle;
    mesh.position.x = x;
    mesh.position.y = y;
    return mesh;
  };
  const dot = (color, x, y, z = 0.12) => {
    const mesh = add(new THREE.Mesh(getGeometry('dot'), getStandard(color, { roughness: 0.4 })), z);
    mesh.position.x = x;
    mesh.position.y = y;
    return mesh;
  };

  const green = 0x2e9e4f;
  const red = 0xd32f2f;

  if (kind === 'move') {
    const arrow = add(new THREE.Mesh(getGeometry('arrow'), getStandard(positive ? green : red, { roughness: 0.4 })));
    if (!positive) arrow.rotation.y = Math.PI; // flèche vers la gauche (recul)
  } else if (kind === 'extra') { // dé à 5 points : on rejoue
    add(makeBox(0.78, 0.78, 0.08, green, { radius: 0.1, roughness: 0.4 }), 0.08);
    [[-0.2, 0.2], [0.2, 0.2], [0, 0], [-0.2, -0.2], [0.2, -0.2]].forEach(([x, y]) => dot(0xffffff, x, y, 0.13));
  } else if (kind === 'double') { // deux étoiles : le prochain lancer compte double
    [-0.24, 0.24].forEach((x) => {
      const star = add(new THREE.Mesh(getGeometry('star'), getStandard(0xffb300, { roughness: 0.35, metalness: 0.2 })), 0.07);
      star.position.x = x;
      star.scale.setScalar(0.62);
    });
  } else if (kind === 'skip') {
    bar(0.2, 0.7, 0x37474f, 0, -0.17, 0, 0.09);
    bar(0.2, 0.7, 0x37474f, 0, 0.17, 0, 0.09);
  } else if (kind === 'slow') { // signe ÷ : le prochain lancer est réduit de moitié
    bar(0.6, 0.12, red, 0, 0, 0, 0.1);
    dot(red, 0, 0.24);
    dot(red, 0, -0.24);
    group.children.filter((c) => c.geometry === geometries.dot).forEach((c) => c.scale.setScalar(1.6));
  } else if (kind === 'flag') { // drapeau de checkpoint
    bar(0.07, 0.8, 0x6d4c41, 0, -0.18, -0.02, 0.09);
    const cloth = add(new THREE.Mesh(getGeometry('flag'), getStandard(red, { roughness: 0.4 })), 0.07);
    cloth.position.set(-0.15, 0.1, 0.07);
    cloth.scale.setScalar(1.15);
  } else if (kind === 'cross') { // pas de chance
    bar(0.62, 0.13, 0x78909c, Math.PI / 4);
    bar(0.62, 0.13, 0x78909c, -Math.PI / 4);
  } else if (kind === 'check') { // de la chance
    bar(0.22, 0.13, green, -Math.PI / 4, -0.2, -0.08);
    bar(0.5, 0.13, green, Math.PI / 4, 0.1, 0.0);
  }
  return group;
}
