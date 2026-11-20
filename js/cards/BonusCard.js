import * as THREE from 'three';
import { InfoCard } from './InfoCard.js';
import { makeBox, getStandard } from '../world/Materials.js';
import { buildRewardIcon } from './RewardIcons.js';
import { shapeMesh } from './Shapes3D.js';
import { easeOutBack, easeOutCubic } from '../systems/AnimationManager.js';

const YELLOW = 0xf5c518;
const BROWN = 0x4a3320;
const CHEST = { width: 1.2, height: 0.55, depth: 0.6, y: -0.5, tilt: 0.5 };
const ICON_Y = 0.42;

// Carte jaune : au verso, un coffre 3D à ouvrir d'un clic. Le contenu (points, vie ou déplacement)
// sort du coffre sous forme d'icône.
export class BonusCard extends InfoCard {
  constructor(textFactory) {
    super(textFactory, { color: YELLOW, symbol: 'bonus', textColor: BROWN });
    this.chest = null;
    this.lidPivot = null;
    this.glow = null;
    this.opened = false;
    this.icon = null;
  }

  // Coffre : corps en bois, couvercle articulé à l'arrière, ferrures et serrure dorées
  showChest() {
    this.setTitle('BONUS');
    this.setStatus('Ouvre le coffre !');

    const { width, height, depth } = CHEST;
    const chest = new THREE.Group();
    chest.userData.answerIndex = 0;
    chest.position.y = CHEST.y;
    chest.rotation.x = CHEST.tilt; // incliné vers le joueur pour voir le dessus

    const body = makeBox(width, height, depth, 0x8d5524, { radius: 0.04, roughness: 0.7 });
    body.position.y = height / 2;
    const bandLeft = makeBox(0.1, height + 0.02, depth + 0.02, 0xffc107, { radius: 0.01, roughness: 0.4 });
    bandLeft.position.set(-width * 0.32, height / 2, 0);
    const bandRight = bandLeft.clone();
    bandRight.position.x = width * 0.32;

    // Intérieur lumineux, caché tant que le coffre est fermé
    this.glow = new THREE.Mesh(
      new THREE.PlaneGeometry(width * 0.86, depth * 0.8),
      new THREE.MeshBasicMaterial({ color: 0xffe27a })
    );
    this.glow.rotation.x = -Math.PI / 2;
    this.glow.position.y = height + 0.005;
    this.glow.visible = false;

    // Couvercle : pivote autour de son arête arrière
    this.lidPivot = new THREE.Group();
    this.lidPivot.position.set(0, height, -depth / 2);
    const lid = makeBox(width + 0.04, 0.2, depth + 0.04, 0x9a602a, { radius: 0.05, roughness: 0.7 });
    lid.position.set(0, 0.1, depth / 2);
    const lidBandLeft = makeBox(0.1, 0.22, depth + 0.06, 0xffc107, { radius: 0.01, roughness: 0.4 });
    lidBandLeft.position.set(-width * 0.32, 0.1, depth / 2);
    const lidBandRight = lidBandLeft.clone();
    lidBandRight.position.x = width * 0.32;
    const lock = makeBox(0.16, 0.2, 0.05, 0xffd54f, { radius: 0.02, roughness: 0.3 });
    lock.position.set(0, 0.0, depth + 0.04);
    this.lidPivot.add(lid, lidBandLeft, lidBandRight, lock);

    chest.add(body, bandLeft, bandRight, this.glow, this.lidPivot);
    this.chest = chest;
    this.backContent.add(chest);
    this.clickableMeshes = [chest];
  }

  // Survol : le coffre grossit un peu et le couvercle bouge légèrement
  setHover(index) {
    if (this.opened || !this.chest) return;
    const hovered = index !== null;
    this.chest.scale.setScalar(hovered ? 1.06 : 1);
    this.lidPivot.rotation.x = hovered ? -0.12 : 0;
  }

  // Ouverture : couvercle, lumière, étincelles, puis l'icône de la récompense sort du coffre.
  // iconKind : 'points' | 'life' | 'move' ; label : texte sous l'icône.
  async openChest(iconKind, label, animations) {
    this.opened = true;
    this.chest.scale.setScalar(1);
    this.clearStatus();

    await animations.animate(0.6, (eased) => {
      this.lidPivot.rotation.x = -1.9 * eased;
      this.glow.visible = true;
    }, easeOutBack);

    // Icône qui jaillit du coffre + étincelles
    this.icon = buildRewardIcon(iconKind, true);
    this.backContent.add(this.icon);
    const startY = CHEST.y + 0.3;
    const sparks = this.makeSparkles();

    await animations.animate(0.9, (eased, t) => {
      this.icon.position.set(0, THREE.MathUtils.lerp(startY, ICON_Y, eased), 0.1);
      this.icon.scale.setScalar(Math.max(easeOutBack(t), 0.001));
      for (const spark of sparks) {
        const k = easeOutCubic(t);
        spark.mesh.position.set(spark.dx * k, startY + spark.dy * k, 0.2);
        spark.mesh.scale.setScalar(Math.max(0.0001, spark.size * (1 - t)));
      }
    }, easeOutCubic);

    for (const spark of sparks) this.backContent.remove(spark.mesh);
    this.setLabel(label);
  }

  makeSparkles() {
    const sparks = [];
    for (let i = 0; i < 10; i++) {
      const angle = (i / 10) * Math.PI * 2;
      const mesh = shapeMesh('etoile', 0.001);
      this.backContent.add(mesh);
      sparks.push({ mesh, dx: Math.cos(angle) * 0.9, dy: 0.3 + Math.sin(angle) * 0.6, size: 0.16 });
    }
    return sparks;
  }
}
