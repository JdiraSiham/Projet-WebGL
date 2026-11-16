import * as THREE from 'three';
import { getStandard } from '../world/Materials.js';
import { buildSymbol } from '../world/Symbols.js';

export const CARD_STEP = 0.2; // épaisseur utile d'une carte (pour empiler)

const BODY = { w: 2.6, h: 3.6, r: 0.3, depth: 0.12, bevel: 0.02 };
const FACE = { w: 2.2, h: 3.2, r: 0.22, depth: 0.03, bevel: 0.01 };

// Dimensions utiles pour placer du contenu sur une carte (repère local : x vers la droite, y vers le haut)
export const CARD_SIZE = { width: BODY.w, height: BODY.h, faceWidth: FACE.w, faceHeight: FACE.h };

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
  // standing = false : carte couchée à plat (pile de cartes) ; true : carte debout (affichage d'un événement)
  constructor({ color, symbol = null, standing = false }) {
    this.group = new THREE.Group();

    // La carte est modélisée debout (plan XY, face vers +Z), puis couchée à plat si besoin.
    this.flat = new THREE.Group();
    this.flat.rotation.x = standing ? 0 : -Math.PI / 2;
    this.group.add(this.flat);

    const geo = getGeometries();
    this.body = new THREE.Mesh(geo.body, getStandard(0xfff6e0, { roughness: 0.6 }));
    this.face = new THREE.Mesh(geo.face, getStandard(color, { roughness: 0.45 }));
    this.face.position.z = BODY.depth + BODY.bevel - 0.01;
    this.flat.add(this.body, this.face);

    // Hauteur du dessus de la face colorée : c'est là que se posent symboles et textes
    this.surfaceZ = BODY.depth + BODY.bevel - 0.01 + FACE.depth + FACE.bevel;

    this.symbolMesh = null;
    if (symbol) {
      const s = buildSymbol(symbol);
      s.scale.setScalar(1.6);
      s.position.z = this.surfaceZ;
      this.flat.add(s);
      this.symbolMesh = s;
    }

    // Groupe pour le contenu ajouté sur le recto de la carte (textes, boutons)
    this.content = new THREE.Group();
    this.content.position.z = this.surfaceZ;
    this.flat.add(this.content);

    // Verso (cartes debout seulement) : même face colorée, retournée, avec son propre groupe de contenu.
    // Quand la carte pivote de 180°, c'est le contenu du verso qui fait face à la caméra.
    this.backContent = null;
    if (standing) {
      this.backFace = new THREE.Mesh(geo.face, getStandard(color, { roughness: 0.45 }));
      this.backFace.rotation.y = Math.PI;
      this.backFace.position.z = -BODY.bevel + 0.01;
      this.flat.add(this.backFace);

      this.backSurfaceZ = this.backFace.position.z - (FACE.depth + FACE.bevel);
      this.backContent = new THREE.Group();
      this.backContent.rotation.y = Math.PI; // le texte se lit depuis l'arrière de la carte
      this.backContent.position.z = this.backSurfaceZ;
      this.flat.add(this.backContent);
    }

    // Meshes cliquables (utilisés par le Raycaster)
    this.clickableMeshes = [this.body, this.face];
  }

  show() { this.group.visible = true; }
  hide() { this.group.visible = false; }

  // Géométries et matériaux sont partagés : on retire seulement la carte de la scène.
  dispose() {
    if (this.group.parent) this.group.parent.remove(this.group);
  }
}