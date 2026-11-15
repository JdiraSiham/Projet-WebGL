import * as THREE from 'three';
import { getStandard } from '../world/Materials.js';
import { buildSymbol } from '../world/Symbols.js';

export const CARD_STEP = 0.2;  // épaisseur utile d'une carte (pour empiler)

const BODY = { w: 2.6, h: 3.6, r: 0.3, depth: 0.12, bevel: 0.02 };
const FACE = { w: 2.2, h: 3.2, r: 0.22, depth: 0.03, bevel: 0.01 };

let sharedGeometries = null;

// Rectangle aux coins arrondis, dessiné avec des courbes quadratiques
function roundedRect(w, h, r) {
  const x = -w / 2;
  const y = -h / 2;
  const s = new THREE.Shape();
  s.moveTo(x + r, y);
  s.lineTo(x + w - r, y);
  s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + h - r);
  s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  s.lineTo(x + r, y + h);
  s.quadraticCurveTo(x, y + h, x, y + h - r);
  s.lineTo(x, y + r);
  s.quadraticCurveTo(x, y, x + r, y);
  return s;
}

function extrudeOptions(depth, bevel) {
  return { depth, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 1, curveSegments: 8 };
}

function getGeometries() {
  if (!sharedGeometries) {
    sharedGeometries = {
      body: new THREE.ExtrudeGeometry(roundedRect(BODY.w, BODY.h, BODY.r), extrudeOptions(BODY.depth, BODY.bevel)),
      face: new THREE.ExtrudeGeometry(roundedRect(FACE.w, FACE.h, FACE.r), extrudeOptions(FACE.depth, FACE.bevel))
    };
  }
  return sharedGeometries;
}

export class Card3D {
  constructor({ color, symbol = null }) {
    this.group = new THREE.Group();

    // La carte est modélisée debout (plan XY) puis couchée à plat.
    this.flat = new THREE.Group();
    this.flat.rotation.x = -Math.PI / 2;
    this.group.add(this.flat);

    const geo = getGeometries();
    this.body = new THREE.Mesh(geo.body, getStandard(0xfff6e0, { roughness: 0.6 }));
    this.face = new THREE.Mesh(geo.face, getStandard(color, { roughness: 0.45 }));
    this.face.position.z = BODY.depth + BODY.bevel - 0.01;
    this.flat.add(this.body, this.face);

    if (symbol) {
      const s = buildSymbol(symbol);
      s.scale.setScalar(1.6);
      s.position.z = BODY.depth + BODY.bevel - 0.01 + FACE.depth + FACE.bevel;
      this.flat.add(s);
    }

    // Meshes cliquables (utilisés plus tard par le Raycaster)
    this.clickableMeshes = [this.body, this.face];
  }

  show() { this.group.visible = true; }
  hide() { this.group.visible = false; }

  // Géométries et matériaux sont partagés : on retire seulement la carte de la scène.
  dispose() {
    if (this.group.parent) this.group.parent.remove(this.group);
  }
}
