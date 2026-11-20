import * as THREE from 'three';
import { getPhong, getStandard } from '../world/Materials.js';
import { easeInOutQuad } from '../systems/AnimationManager.js';

const HOP_DURATION = 0.32; // durée d'un saut d'une case à la suivante
const HOP_HEIGHT = 0.7;
const SHARE_OFFSET = 0.55; // décalage latéral de chaque pion quand deux pions partagent une case

// Pion 3D d'un joueur. Les données (case, score, vies...) sont dans son PlayerState :
// ce fichier ne s'occupe que de l'affichage et des animations.
export class Player {
  constructor(state) {
    this.state = state;
    this.active = false;
    this.moving = false;

    // Place du pion quand il partage sa case : le joueur 1 à gauche, le joueur 2 à droite
    this.slotOffset = state.id === 1 ? -SHARE_OFFSET : SHARE_OFFSET;
    this.targetOffsetX = 0;                // 0 = centre de la case (pion seul)
    this.anchor = new THREE.Vector3();     // centre du dessus de la case occupée

    this.mesh = new THREE.Group();
    this.pawn = this.buildPawn();
    this.marker = this.buildMarker();
    this.mesh.add(this.pawn, this.marker);
  }

  // Raccourcis vers l'état du joueur
  get id() { return this.state.id; }
  get name() { return this.state.name; }
  get color() { return this.state.color; }
  get finished() { return this.state.finished; }
  get position() { return this.state.position; }
  set position(index) { this.state.position = index; }

  // Pion classique : corps de révolution (LatheGeometry) au profil lissé + tête sphérique
  buildPawn() {
    const mat = getPhong(this.color, 70);
    const pawn = new THREE.Group();

    const profile = new THREE.SplineCurve([
      new THREE.Vector2(0.0, 0.0),
      new THREE.Vector2(0.46, 0.0),
      new THREE.Vector2(0.46, 0.08),
      new THREE.Vector2(0.34, 0.2),
      new THREE.Vector2(0.2, 0.5),
      new THREE.Vector2(0.15, 0.85),
      new THREE.Vector2(0.23, 0.98),
      new THREE.Vector2(0.2, 1.06),
      new THREE.Vector2(0.0, 1.06)
    ]).getPoints(48).map((p) => new THREE.Vector2(Math.max(0, p.x), p.y));

    const body = new THREE.Mesh(new THREE.LatheGeometry(profile, 32), mat);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.3, 28, 28), mat);
    head.position.y = 1.3;

    pawn.add(body, head);
    pawn.scale.setScalar(1.2);
    return pawn;
  }

  // Anneau doré au pied du pion : indique à qui c'est le tour
  buildMarker() {
    const marker = new THREE.Mesh(
      new THREE.TorusGeometry(0.7, 0.05, 8, 40),
      getStandard(0xffd54a, { roughness: 0.4 })
    );
    marker.rotation.x = Math.PI / 2;
    marker.position.y = 0.06;
    marker.visible = false;
    return marker;
  }

  setActive(active) {
    this.active = active;
    this.marker.visible = active;
  }

  // Place le pion sur une case (au centre, ou décalé si `targetOffsetX` est déjà défini)
  placeOnTile(board, index) {
    this.position = index;
    this.anchor.copy(board.getPosition(index));
    this.mesh.position.set(this.anchor.x + this.targetOffsetX, this.anchor.y, this.anchor.z);
  }

  // Décalage voulu sur la case : 0 si le pion est seul, sa place (gauche/droite) s'il partage la case
  setTargetOffset(offsetX, snap = false) {
    this.targetOffsetX = offsetX;
    if (snap) this.mesh.position.x = this.anchor.x + offsetX;
  }

  // Un saut vers une position du monde (arc de parabole)
  hopTo(destination, animations) {
    const start = this.mesh.position.clone();
    return animations.animate(HOP_DURATION, (eased, t) => {
      this.mesh.position.lerpVectors(start, destination, eased);
      this.mesh.position.y += Math.sin(Math.PI * t) * HOP_HEIGHT;
    }, easeInOutQuad);
  }

  // Se déplace case par case jusqu'à l'indice cible : en avant (sens du parcours) ou en arrière (recul d'un piège).
  // onStep() est appelée à chaque saut : le jeu y recalcule les places des pions sur les cases.
  async moveTo(board, targetIndex, animations, onStep = () => {}) {
    this.moving = true;
    const direction = Math.sign(targetIndex - this.position);
    while (this.position !== targetIndex) {
      this.position += direction;
      this.anchor.copy(board.getPosition(this.position));
      onStep(); // fixe targetOffsetX : seul au centre, ou à sa place si l'autre pion est là
      const destination = new THREE.Vector3(this.anchor.x + this.targetOffsetX, this.anchor.y, this.anchor.z);
      await this.hopTo(destination, animations);
    }
    this.moving = false;
  }

  update(time, deltaTime) {
    // Au repos, le pion glisse doucement vers sa place (centre ou côté) quand l'autre arrive ou part
    if (!this.moving) {
      const targetX = this.anchor.x + this.targetOffsetX;
      this.mesh.position.x += (targetX - this.mesh.position.x) * (1 - Math.exp(-10 * deltaTime));
    }
    this.pawn.position.y = Math.sin(time * 2.5 + this.id) * 0.03;
    if (this.active) this.marker.scale.setScalar(1 + Math.sin(time * 4) * 0.06);
  }
}
