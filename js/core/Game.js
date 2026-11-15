import * as THREE from 'three';
import { SceneManager } from './SceneManager.js';
import { CameraManager } from './CameraManager.js';
import { Board } from '../world/Board.js';
import { Environment } from '../world/Environment.js';
import { Player } from '../entities/Player.js';
import { Dice } from '../entities/Dice.js';
import { AnimationManager } from '../systems/AnimationManager.js';
import { TurnManager } from '../systems/TurnManager.js';
import { InputManager } from '../systems/InputManager.js';

export class Game {
  constructor(container) {
    this.container = container;
    this.sceneManager = new SceneManager(container);
    this.cameraManager = new CameraManager(this.sceneManager.renderer.domElement, this.getAspect());
    this.clock = new THREE.Clock();

    this.board = new Board();
    this.environment = new Environment();
    this.dice = new Dice(1.6);
    this.players = [
      new Player({ id: 1, name: 'Joueur 1', color: 0x1e63e9 }),
      new Player({ id: 2, name: 'Joueur 2', color: 0xe53935 })
    ];

    this.animations = new AnimationManager();
    this.turnManager = new TurnManager(this.players);

    this.buildScene();

    // Le clic sur le dé au centre du plateau déclenche le tour
    this.input = new InputManager(
      this.sceneManager.renderer.domElement,
      this.cameraManager.camera,
      this.dice,
      { canRoll: () => this.turnManager.canRoll(), onDiceClick: () => this.playTurn() }
    );

    this.loop = this.loop.bind(this);
    window.addEventListener('resize', () => this.onResize());
  }

  getAspect() {
    return this.container.clientWidth / this.container.clientHeight;
  }

  buildScene() {
    const scene = this.sceneManager.scene;
    scene.add(this.environment.group, this.board.group, this.dice.group);

    this.dice.setRestPosition(this.board.getDiceRestPosition(this.dice.size));

    for (const player of this.players) {
      player.placeOnTile(this.board, 0); // les deux pions démarrent sur la case départ
      scene.add(player.mesh);
    }
    this.refreshOffsets(true);
    this.refreshActivePlayer();

    this.sceneManager.enableShadows(scene);
  }

  // Place des pions sur leur case : au centre quand le pion est seul,
  // chacun d'un côté quand les deux pions sont sur la même case
  refreshOffsets(snap = false) {
    for (const player of this.players) {
      const shared = this.players.some((other) => other !== player && other.position === player.position);
      player.setTargetOffset(shared ? player.slotOffset : 0, snap);
    }
  }

  // Seul le joueur dont c'est le tour a l'anneau doré
  refreshActivePlayer() {
    const current = this.turnManager.currentPlayer;
    const playing = !this.turnManager.isFinished;
    for (const player of this.players) player.setActive(playing && player === current);
  }

  // Tirage d'un dé à six faces : entier de 1 à 6
  rollValue() {
    return Math.floor(Math.random() * 6) + 1;
  }

  // Un tour : lancer le dé, avancer du nombre de pas obtenu, passer au joueur suivant
  async playTurn() {
    const turn = this.turnManager;
    if (!turn.canRoll()) return; // un seul lancer à la fois : les clics pendant l'animation sont ignorés

    turn.startRolling();
    try {
      const value = this.rollValue();
      await this.dice.roll(value, this.animations);

      turn.startMoving();
      const player = turn.currentPlayer;
      const lastIndex = this.board.tiles.length - 1; // case 30 : on ne la dépasse jamais
      await player.moveTo(this.board, Math.min(player.position + value, lastIndex), this.animations, () => this.refreshOffsets());
      if (player.position === lastIndex) player.finished = true;
    } finally {
      turn.nextTurn();
      this.refreshActivePlayer();
    }
  }

  start() {
    this.clock.start();
    requestAnimationFrame(this.loop);
  }

  loop() {
    requestAnimationFrame(this.loop);
    const deltaTime = Math.min(this.clock.getDelta(), 0.1);
    this.update(deltaTime, this.clock.elapsedTime);
    this.sceneManager.render(this.cameraManager.camera);
  }

  // Un seul update() principal : toute l'animation passe par ici
  update(deltaTime, time) {
    this.animations.update(deltaTime);
    this.board.update(deltaTime, time);
    this.dice.update(deltaTime, time);
    for (const player of this.players) player.update(time, deltaTime);
    this.cameraManager.update();
  }

  onResize() {
    this.sceneManager.resize(this.container.clientWidth, this.container.clientHeight);
    this.cameraManager.onResize(this.getAspect());
  }
}