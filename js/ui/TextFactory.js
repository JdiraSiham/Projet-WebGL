import * as THREE from 'three';
import { FontLoader } from 'three/addons/loaders/FontLoader.js';
import { TextGeometry } from 'three/addons/geometries/TextGeometry.js';
import { getStandard } from '../world/Materials.js';

const CAP_HEIGHT = 0.72;  // hauteur des majuscules, en fraction de la taille du texte (police Optimer)
const LINE_HEIGHT = 1.35; // interligne

// Fabrique de textes 3D : charge la police vectorielle (JSON) puis crée des TextGeometry
// avec retour à la ligne automatique, centrage et réduction de la taille si le texte est trop long.
export class TextFactory {
  constructor(font) {
    this.font = font;
    this.geometries = new Map(); // une géométrie par (texte, taille, épaisseur) : réutilisée
  }

  // Charge le fichier de police avec FontLoader
  static load(url) {
    return new Promise((resolve, reject) => {
      new FontLoader().load(
        url,
        (font) => resolve(new TextFactory(font)),
        undefined,
        () => reject(new Error(`Police introuvable : ${url} (lance le projet avec Live Server)`))
      );
    });
  }

  // Largeur d'un texte : somme des largeurs des lettres, comme le calcule TextGeometry
  measure(text, size) {
    const { glyphs, resolution } = this.font.data;
    const scale = size / resolution;
    let width = 0;
    for (const char of text) {
      const glyph = glyphs[char] || glyphs['?'];
      if (glyph) width += glyph.ha * scale;
    }
    return width;
  }

  // Coupe le texte en lignes qui tiennent dans maxWidth (les \n sont respectés)
  wrap(text, size, maxWidth) {
    const lines = [];
    for (const paragraph of text.split('\n')) {
      let line = '';
      for (const word of paragraph.split(' ')) {
        const candidate = line ? `${line} ${word}` : word;
        if (line && this.measure(candidate, size) > maxWidth) {
          lines.push(line);
          line = word;
        } else {
          line = candidate;
        }
      }
      lines.push(line);
    }
    return lines;
  }

  lineGeometry(text, size, depth) {
    const key = `${text}|${size.toFixed(3)}|${depth}`;
    if (!this.geometries.has(key)) {
      this.geometries.set(key, new TextGeometry(text, {
        font: this.font,
        size,
        height: depth,       // épaisseur d'extrusion
        curveSegments: 4,    // peu de segments : style low-poly et léger
        bevelEnabled: false
      }));
    }
    return this.geometries.get(key);
  }

  // Crée un texte 3D centré horizontalement, dans le plan XY, face vers +Z.
  // anchor 'top' : le haut du texte est à y = 0 ; 'middle' : le milieu du bloc est à y = 0.
  create(text, { size = 0.2, depth = 0.02, color = 0xffffff, maxWidth = Infinity, maxLines = Infinity, minSize = 0.04, anchor = 'middle' } = {}) {
    // On réduit la taille tant que le texte est trop large ou a trop de lignes
    let s = size;
    for (let i = 0; i < 16; i++) {
      const lines = this.wrap(text, s, maxWidth);
      const widest = Math.max(...lines.map((line) => this.measure(line, s)));
      if ((lines.length <= maxLines && widest <= maxWidth + 1e-6) || s <= minSize) break;
      s = Math.max(minSize, s * 0.92);
    }

    const lines = this.wrap(text, s, maxWidth);
    const material = getStandard(color, { roughness: 0.5 });
    const capHeight = s * CAP_HEIGHT;
    const lineHeight = s * LINE_HEIGHT;
    const totalHeight = capHeight + (lines.length - 1) * lineHeight;
    const firstBaseline = anchor === 'top' ? -capHeight : totalHeight / 2 - capHeight;

    const group = new THREE.Group();
    lines.forEach((line, i) => {
      if (line === '') return;
      const mesh = new THREE.Mesh(this.lineGeometry(line, s, depth), material);
      mesh.position.set(-this.measure(line, s) / 2, firstBaseline - i * lineHeight, 0);
      group.add(mesh);
    });
    group.userData.size = s;
    group.userData.lines = lines.length;
    group.userData.height = totalHeight;
    return group;
  }

  // Change la couleur d'un texte créé avec create()
  setColor(group, color) {
    const material = getStandard(color, { roughness: 0.5 });
    for (const mesh of group.children) mesh.material = material;
  }
}
