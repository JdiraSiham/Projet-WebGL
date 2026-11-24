import * as THREE from 'three';
import { makeBox, getStandard } from '../world/Materials.js';
import { buildPawnMesh } from '../entities/Player.js';
import { easeOutCubic } from '../systems/AnimationManager.js';

// Style commun à tous les menus (menu principal, pause, règles, fin de partie), d'après l'image de référence :
// plaque de bois orange avec le titre en relief, grands boutons « parchemin » avec pions, petits boutons en bois.
export const COLORS = {
  plank: 0xd2742a,
  plankLight: 0xe58f3d,
  plankDark: 0x8f4313,
  grain: 0xb85f1e,
  block: 0xe8c48e,
  nail: 0xf3c27a,
  cream: 0xfff0cf,
  parchment: 0xf8e5bb,
  parchmentHover: 0xfff3d2,
  parchmentEdge: 0xe0b574,
  chip: 0xd6a35c,
  brownText: 0x9a4513,
  brownShadow: 0x6b2f0e,
  gold: 0xffc928,
  glow: 0xffc233,
  playerBlue: 0x1e63e9,
  playerRed: 0xe53935
};

export const SKY_COLOR = 0x9db8f2; // ciel bleu derrière tous les menus

const PLAQUE_WIDTH = 10.8;
export const BIG = { width: 6.2, height: 2.5, y: -0.55, x: 3.4 };
export const SMALL = { width: 5.5, height: 1.4, y: -3.15, x: 3.05 };

// Base commune des panneaux de menu. Interface attendue par EventManager.askChoice :
// group, width, height, clickableMeshes, setHover(index), update(time), playPress(index, animations), escapeIndex.
export class MenuPanel3D {
  constructor(textFactory) {
    this.textFactory = textFactory;
    this.width = 14.4;
    this.height = 9.2;
    this.skyColor = SKY_COLOR;
    this.escapeIndex = null;          // bouton « activé » par la touche Échap (null = aucun)
    this.group = new THREE.Group();
    this.content = new THREE.Group(); // contenu recentré dans le panneau
    this.group.add(this.content);
    this.buttons = new Map();         // indice -> { group, face, glow, baseColor, hoverColor, baseZ }
    this.hoveredIndex = null;
    this.floaters = [];               // objets qui flottent doucement : { object, baseY, phase, amplitude }
    this.star = null;
    this.clickableMeshes = [];
  }

  // Appelée une fois le panneau construit
  finish() {
    this.clickableMeshes = [...this.buttons.values()].map((b) => b.group);
  }

  // ---------------------------------------------------------------- Texte

  // Texte avec ombre ; le È majuscule (absent de la police 3D) est dessiné avec un accent grave ajouté à part
  makeLabel(text, options) {
    const accentAt = text.indexOf('È');
    const plain = text.replace('È', 'E');
    const group = this.textFactory.createShadowed(plain, options);
    if (accentAt >= 0) {
      const size = group.userData.size;
      const total = this.textFactory.measure(plain, size);
      const x = -total / 2 + this.textFactory.measure(plain.slice(0, accentAt), size) + this.textFactory.measure('E', size) / 2;
      const depth = options.depth || 0.05;
      const accent = makeBox(size * 0.3, size * 0.075, depth * 0.8, options.color, { radius: 0.01, roughness: 0.5 });
      accent.position.set(x - size * 0.02, size * 0.56, depth / 2);
      accent.rotation.z = -0.75;
      group.add(accent);
    }
    return group;
  }

  // ---------------------------------------------------------------- Plaque de titre

  // Grande plaque de bois : titre en relief, blocs de pierre aux coins, clous ; en dessous une étoile
  // entre deux traits dorés, ou un sous-titre.
  buildPlaque({ title, subtitle = null, y = 2.95, height = 2.9, titleSize = 1.2 }) {
    const width = PLAQUE_WIDTH;
    const plaque = new THREE.Group();
    plaque.position.y = y;

    const frame = makeBox(width, height, 0.5, COLORS.plankDark, { radius: 0.3, roughness: 0.6 });
    const board = makeBox(width - 0.3, height - 0.3, 0.55, COLORS.plank, { radius: 0.27, roughness: 0.6 });
    const inner = makeBox(width - 0.85, height - 0.85, 0.58, COLORS.plankLight, { radius: 0.22, roughness: 0.6 });
    plaque.add(frame, board, inner);

    // Veines du bois
    [[-3.6, 0.3, 2.2], [3.4, 0.15, 2.6], [-2.4, -0.35, 1.8], [3.9, -0.5, 1.5]].forEach(([x, gy, w]) => {
      const line = makeBox(w, 0.05, 0.02, COLORS.grain, { radius: 0.01, roughness: 0.7 });
      line.position.set(x, gy * (height / 2.9) + (height - 2.9) * 0.25, 0.3);
      plaque.add(line);
    });

    for (const side of [-1, 1]) {
      const block = makeBox(1.05, 0.95, 0.8, COLORS.block, { radius: 0.12, roughness: 0.7 });
      block.position.set(side * (width / 2 - 0.55), height / 2 - 0.05, 0.1);
      block.rotation.z = side * -0.12;
      block.rotation.y = side * 0.2;
      plaque.add(block);
      for (const ny of [height * 0.24, -height * 0.24]) {
        const nail = new THREE.Mesh(new THREE.SphereGeometry(0.1, 12, 12), getStandard(COLORS.nail, { roughness: 0.3, metalness: 0.3 }));
        nail.position.set(side * (width / 2 - 0.3), ny, 0.3);
        plaque.add(nail);
      }
    }

    const hasLine = !subtitle && height > 2.5;
    const titleY = hasLine || subtitle ? 0.25 : 0;
    const label = this.makeLabel(title, {
      size: titleSize, maxWidth: width - 2.4, maxLines: 1, color: COLORS.cream, depth: 0.22, shadow: COLORS.brownShadow, offset: 0.09
    });
    label.position.set(0, titleY, 0.42);
    plaque.add(label);

    if (subtitle) {
      const sub = this.textFactory.createShadowed(subtitle, {
        size: 0.42, maxWidth: width - 2.6, maxLines: 1, color: COLORS.cream, depth: 0.06, shadow: COLORS.brownShadow, offset: 0.03
      });
      sub.position.set(0, -0.82, 0.42);
      plaque.add(sub);
    } else if (hasLine) {
      const star = new THREE.Mesh(this.starGeometry(), getStandard(COLORS.gold, { roughness: 0.35, metalness: 0.2 }));
      star.position.set(0, -0.82, 0.42);
      plaque.add(star);
      this.star = star;
      for (const side of [-1, 1]) {
        const bar = makeBox(1.9, 0.1, 0.1, COLORS.gold, { radius: 0.04, roughness: 0.4 });
        bar.position.set(side * 1.6, -0.82, 0.42);
        plaque.add(bar);
      }
    }

    this.content.add(plaque);
    this.floaters.push({ object: plaque, baseY: y, phase: 0.8, amplitude: 0.06 });
  }

  starGeometry() {
    const shape = new THREE.Shape();
    for (let i = 0; i < 10; i++) {
      const r = i % 2 === 0 ? 0.36 : 0.16;
      const a = Math.PI / 2 + (i * Math.PI) / 5;
      if (i === 0) shape.moveTo(Math.cos(a) * r, Math.sin(a) * r);
      else shape.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    shape.closePath();
    return new THREE.ExtrudeGeometry(shape, { depth: 0.1, bevelEnabled: true, bevelThickness: 0.02, bevelSize: 0.02, bevelSegments: 1 });
  }

  // ---------------------------------------------------------------- Boutons

  // Halo lumineux derrière un bouton : visible seulement au survol (jamais cliquable)
  makeGlow(width, height, radius) {
    const glow = makeBox(width, height, 0.1, COLORS.glow, { radius });
    glow.material = new THREE.MeshBasicMaterial({ color: COLORS.glow, transparent: true, opacity: 0.9 });
    glow.visible = false;
    glow.raycast = () => {};
    return glow;
  }

  // Grand bouton parchemin : un ou deux pions à gauche (couleurs du jeu), texte au centre
  addBigButton(index, x, label, pawnColors) {
    const { width, height, y } = BIG;
    const group = new THREE.Group();
    group.userData.answerIndex = index;
    group.position.set(x, y, 0.2);

    const glow = this.makeGlow(width + 0.45, height + 0.45, 0.4);
    glow.position.z = 0.1;
    const edge = makeBox(width, height, 0.34, COLORS.parchmentEdge, { radius: 0.3, roughness: 0.6 });
    edge.position.z = 0.2;
    const face = makeBox(width - 0.34, height - 0.34, 0.38, COLORS.parchment, { radius: 0.22, roughness: 0.55 });
    face.position.z = 0.22;
    group.add(glow, edge, face);

    for (const sx of [-1, 1]) {
      for (const sy of [-1, 1]) {
        const chip = makeBox(0.42, 0.1, 0.04, COLORS.chip, { radius: 0.03, roughness: 0.7 });
        chip.position.set(sx * (width / 2 - 0.4), sy * (height / 2 - 0.4), 0.42);
        chip.rotation.z = sx * sy * (Math.PI / 4);
        group.add(chip);
      }
    }

    const pawnX = pawnColors.length === 1 ? -width / 2 + 1.05 : -width / 2 + 1.0;
    pawnColors.forEach((color, i) => {
      const pawn = buildPawnMesh(color);
      pawn.scale.setScalar(0.82);
      pawn.position.set(pawnX + i * 0.66, -0.7, 0.5);
      group.add(pawn);
      this.floaters.push({ object: pawn, baseY: -0.7, phase: i * 1.3 + index, amplitude: 0.05 });
    });

    const text = this.textFactory.createShadowed(label, {
      size: 0.95, maxWidth: width - 2.5, maxLines: 1, color: COLORS.brownText, depth: 0.12
    });
    text.position.set(pawnColors.length === 1 ? 0.85 : 1.0, 0, 0.45);
    group.add(text);

    this.content.add(group);
    this.buttons.set(index, { group, face, glow, baseColor: COLORS.parchment, hoverColor: COLORS.parchmentHover, baseZ: group.position.z });
  }

  // Petit bouton en bois orangé : icône à gauche, texte crème
  addSmallButton(index, x, y, label, icon) {
    const { width, height } = SMALL;
    const group = new THREE.Group();
    group.userData.answerIndex = index;
    group.position.set(x, y, 0.2);

    const glow = this.makeGlow(width + 0.4, height + 0.4, 0.3);
    glow.position.z = 0.1;
    const edge = makeBox(width, height, 0.3, COLORS.plankDark, { radius: 0.22, roughness: 0.6 });
    edge.position.z = 0.2;
    const face = makeBox(width - 0.26, height - 0.26, 0.34, COLORS.plank, { radius: 0.17, roughness: 0.55 });
    face.position.z = 0.22;
    group.add(glow, edge, face);

    const iconGroup = icon === 'book' ? this.bookIcon() : this.playIcon(icon === 'back');
    iconGroup.position.set(-width / 2 + 0.85, 0, 0.42);
    group.add(iconGroup);

    const text = this.makeLabel(label, {
      size: 0.52, maxWidth: width - 1.9, maxLines: 1, color: COLORS.cream, depth: 0.08, shadow: COLORS.brownShadow, offset: 0.03
    });
    text.position.set(0.55, 0, 0.45);
    group.add(text);

    this.content.add(group);
    this.buttons.set(index, { group, face, glow, baseColor: COLORS.plank, hoverColor: COLORS.plankLight, baseZ: group.position.z });
  }

  // Triangle « lecture » (ou « retour » s'il est retourné)
  playIcon(flipped = false) {
    const shape = new THREE.Shape();
    shape.moveTo(-0.28, 0.38);
    shape.lineTo(0.38, 0);
    shape.lineTo(-0.28, -0.38);
    shape.closePath();
    const mesh = new THREE.Mesh(
      new THREE.ExtrudeGeometry(shape, { depth: 0.08, bevelEnabled: true, bevelThickness: 0.02, bevelSize: 0.02, bevelSegments: 1 }),
      getStandard(COLORS.cream, { roughness: 0.5 })
    );
    const group = new THREE.Group();
    group.add(mesh);
    if (flipped) group.rotation.z = Math.PI;
    return group;
  }

  // Livre ouvert : deux pages légèrement inclinées et un dos brun
  bookIcon() {
    const group = new THREE.Group();
    for (const side of [-1, 1]) {
      const page = makeBox(0.42, 0.56, 0.07, COLORS.cream, { radius: 0.03, roughness: 0.5 });
      page.position.set(side * 0.23, 0, 0);
      page.rotation.z = side * -0.12;
      group.add(page);
    }
    const spine = makeBox(0.06, 0.6, 0.09, COLORS.plankDark, { radius: 0.02, roughness: 0.6 });
    group.add(spine);
    return group;
  }

  // ---------------------------------------------------------------- Interaction

  // Survol : le bouton grossit un peu, s'éclaircit et s'entoure d'un halo doré
  setHover(index) {
    if (index === this.hoveredIndex) return;
    this.hoveredIndex = index;
    for (const [i, button] of this.buttons) {
      const hovered = i === index;
      button.face.material = getStandard(hovered ? button.hoverColor : button.baseColor, { roughness: 0.55 });
      button.glow.visible = hovered;
      button.group.scale.setScalar(hovered ? 1.05 : 1);
    }
  }

  // Enfoncement du bouton cliqué (0,12 s) avant la fermeture du menu
  playPress(index, animations) {
    const button = this.buttons.get(index);
    if (!button) return Promise.resolve();
    return animations.animate(0.12, (eased) => {
      button.group.position.z = button.baseZ - 0.3 * eased;
      button.group.scale.setScalar(1.05 - 0.09 * eased);
    }, easeOutCubic, { ui: true });
  }

  // Appelée à chaque image : éléments flottants, étoile qui tourne doucement, halo qui pulse
  update(time) {
    for (const floater of this.floaters) {
      floater.object.position.y = floater.baseY + Math.sin(time * 1.1 + floater.phase) * floater.amplitude;
    }
    if (this.star) this.star.rotation.y = Math.sin(time * 1.3) * 0.5;
    const pulse = 0.7 + 0.25 * Math.sin(time * 5);
    for (const button of this.buttons.values()) button.glow.material.opacity = pulse;
  }
}
