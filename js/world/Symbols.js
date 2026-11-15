import * as THREE from 'three';
import { getStandard } from './Materials.js';

// Symboles "imprimés" : formes quasi plates, incrustées dans la surface de la case ou de la carte.
// Chaque symbole est dessiné dans le plan XY, face vers +Z, centré sur l'origine.
// z = 0 correspond à la surface ; le symbole dépasse d'à peine 1 cm (effet gravé / imprimé).

const DEPTH = 0.015;
const SINK = -0.004;
const templates = new Map();

function flat(shape, material, lift = 0) {
  const geometry = new THREE.ExtrudeGeometry(shape, { depth: DEPTH, bevelEnabled: false, curveSegments: 20 });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.z = SINK + lift;
  return mesh;
}

function polygon(points) {
  const s = new THREE.Shape();
  points.forEach(([x, y], i) => (i === 0 ? s.moveTo(x, y) : s.lineTo(x, y)));
  s.closePath();
  return s;
}

function rect(x, y, w, h) {
  return polygon([[x, y], [x + w, y], [x + w, y + h], [x, y + h]]);
}

function disc(cx, cy, r) {
  const s = new THREE.Shape();
  s.absarc(cx, cy, r, 0, Math.PI * 2, false);
  return s;
}

// Portion d'anneau (bande) entre deux angles
function arcBand(cx, cy, r, w, a0, a1) {
  const s = new THREE.Shape();
  s.absarc(cx, cy, r + w / 2, a0, a1, false);
  s.absarc(cx, cy, r - w / 2, a1, a0, true);
  s.closePath();
  return s;
}

// Anneau complet (cercle percé)
function ring(r, w) {
  const s = new THREE.Shape();
  s.absarc(0, 0, r + w / 2, 0, Math.PI * 2, false);
  const hole = new THREE.Path();
  hole.absarc(0, 0, r - w / 2, 0, Math.PI * 2, true);
  s.holes.push(hole);
  return s;
}

function starShape(outer, inner, points = 5) {
  const pts = [];
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 === 0 ? outer : inner;
    const a = Math.PI / 2 + (i * Math.PI) / points;
    pts.push([Math.cos(a) * r, Math.sin(a) * r]);
  }
  return polygon(pts);
}

// Contour d'une pièce de puzzle : carré avec 2 ergots (haut, droite) et 2 creux (bas, gauche).
// On parcourt les 4 côtés dans le sens horaire ; chaque côté est le côté "haut" tourné de k quarts de tour.
function puzzleShape(s = 0.34, r = 0.13, pattern = [1, 1, -1, -1]) {
  const shape = new THREE.Shape();
  const off = r * 0.7;
  const w = Math.sqrt(r * r - off * off); // demi-largeur de l'ergot à la base
  const rotate = (x, y, k) => {
    let px = x;
    let py = y;
    for (let i = 0; i < k; i++) [px, py] = [py, -px]; // quart de tour horaire
    return [px, py];
  };

  for (let k = 0; k < 4; k++) {
    const sign = pattern[k];
    const [sx, sy] = rotate(-s, s, k);
    if (k === 0) shape.moveTo(sx, sy);
    else shape.lineTo(sx, sy);

    const [ax, ay] = rotate(-w, s, k);
    shape.lineTo(ax, ay);

    const [cx, cy] = rotate(0, s + sign * off, k);
    const turn = (-k * Math.PI) / 2;
    if (sign > 0) {
      // ergot : arc qui passe à l'extérieur
      shape.absarc(cx, cy, r, Math.atan2(-off, -w) + turn, Math.atan2(-off, w) + turn, true);
    } else {
      // creux : arc qui passe à l'intérieur
      shape.absarc(cx, cy, r, Math.atan2(off, -w) + turn, Math.atan2(off, w) + turn, false);
    }
  }
  shape.closePath();
  return shape;
}

// Pièce de puzzle blanche en léger relief, comme les autres symboles (elle se détache du fond violet)
function createPuzzle() {
  const geometry = new THREE.ExtrudeGeometry(puzzleShape(), {
    depth: 0.05,
    bevelEnabled: true,
    bevelThickness: 0.018,
    bevelSize: 0.018,
    bevelSegments: 2,
    curveSegments: 16
  });
  geometry.computeBoundingBox();
  const center = new THREE.Vector3();
  geometry.boundingBox.getCenter(center);
  geometry.translate(-center.x, -center.y, 0); // centre la pièce sur l'origine

  const piece = new THREE.Mesh(geometry, getStandard(0xffffff, { roughness: 0.5 }));
  piece.position.z = 0.014;

  const g = new THREE.Group();
  g.add(piece);
  return g;
}

function createSymbol(kind) {
  const white = getStandard(0xffffff, { roughness: 0.5 });
  const g = new THREE.Group();

  switch (kind) {
    case 'quiz': {
      g.add(flat(arcBand(0, 0.2, 0.26, 0.17, -Math.PI / 2, Math.PI), white));
      g.add(flat(rect(-0.085, -0.26, 0.17, 0.22), white));
      g.add(flat(disc(0, -0.45, 0.1), white));
      break;
    }
    case 'defi': {
      g.add(createPuzzle());
      break;
    }
    case 'bonus': {
      g.add(flat(starShape(0.58, 0.25), white));
      break;
    }
    case 'piege': {
      g.add(flat(polygon([[0, 0.56], [-0.6, -0.42], [0.6, -0.42]]), white));
      const mark = getStandard(0xb71c1c, { roughness: 0.5 });
      g.add(flat(rect(-0.05, -0.08, 0.1, 0.38), mark, 0.011));
      g.add(flat(disc(0, -0.25, 0.065), mark, 0.011));
      break;
    }
    case 'portail': {
      g.add(flat(ring(0.4, 0.14), white));
      g.add(flat(ring(0.17, 0.1), white));
      break;
    }
    case 'checkpoint': {
      // Drapeau blanc : mât + tissu triangulaire
      g.add(flat(rect(-0.32, -0.5, 0.07, 1.1), white));
      g.add(flat(polygon([[-0.25, 0.58], [0.4, 0.36], [-0.25, 0.14]]), white));
      break;
    }
    case 'depart': {
      // Même drapeau qu'avant, mais entièrement en rouge (mât + tissu) pour bien ressortir sur la case claire
      const dark = getStandard(0xd32f2f, { roughness: 0.5 });
      g.add(flat(rect(-0.32, -0.5, 0.07, 1.1), dark));
      g.add(flat(polygon([[-0.25, 0.58], [0.4, 0.36], [-0.25, 0.14]]), dark));
      break;
    }
    case 'finale': {
      g.add(flat(starShape(0.55, 0.24), white));
      g.add(flat(ring(0.76, 0.08), white));
      break;
    }
    default:
      break;
  }
  return g;
}

// clone() partage géométries et matériaux avec le modèle : très économique.
export function buildSymbol(kind) {
  if (!templates.has(kind)) templates.set(kind, createSymbol(kind));
  return templates.get(kind).clone();
}