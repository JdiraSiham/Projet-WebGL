import * as THREE from 'three';
import { SceneManager } from './SceneManager.js';
import { CameraManager } from './CameraManager.js';
import { GameState, MODE, PHASE } from './GameState.js';
import { Board } from '../world/Board.js';
import { Environment } from '../world/Environment.js';
import { Player } from '../entities/Player.js';
import { Dice } from '../entities/Dice.js';
import { AnimationManager } from '../systems/AnimationManager.js';
import { TurnManager } from '../systems/TurnManager.js';
import { InputManager } from '../systems/InputManager.js';
import { RuleEngine } from '../systems/RuleEngine.js';
import { QuestionBank } from '../systems/QuestionBank.js';
import { EventManager } from '../systems/EventManager.js';
import { TextFactory } from '../ui/TextFactory.js';
import { ModeMenu } from '../ui/ModeMenu.js';
import { QUESTIONS } from '../data/questions.js';

const FONT_URL = 'assets/fonts/font.typeface.json';

export class Game {
  constructor(container) {
    this.container = container;
    this.sceneManager = new SceneManager(container);
    this.cameraManager = new CameraManager(this.sceneManager.renderer.domElement, this.getAspect());
    this.clock = new THREE.Clock();

    this.board = new Board();
    this.environment = new Environment();
    this.dice = new Dice(1.6);
    this.animations = new AnimationManager();
    this.rules = new RuleEngine();
    this.questions = new QuestionBank(QUESTIONS);

    // Au démarrage : aucune partie, le menu de choix du mode est affiché
    this.state = new GameState();
    this.turnManager = new TurnManager(this.state);
    this.players = []; // pions 3D (un par PlayerState)

    this.buildScene();

    // Souris : le dé au centre est cliquable quand on peut lancer
    this.input = new InputManager(this.sceneManager.renderer.domElement, this.cameraManager.camera);
    this.input.addInteraction({
      isActive: () => this.turnManager.canRoll(),
      getObjects: () => [this.dice.group],
      onHover: (hit) => this.dice.setHover(Boolean(hit)),
      onClick: () => this.playTurn()
    });

    this.menu = new ModeMenu(document.body, { onSelect: (mode) => this.startNewGame(mode) });

    this.loop = this.loop.bind(this);
    window.addEventListener('resize', () => this.onResize());
  }

  // Chargement asynchrone : police 3D, numéros des cases, gestionnaire d'événements (cartes)
  async init() {
    this.textFactory = await TextFactory.load(FONT_URL);
    this.board.addNumbers(this.textFactory);
    this.sceneManager.enableShadows(this.board.group);

    this.events = new EventManager({
      scene: this.sceneManager.scene,
      cameraManager: this.cameraManager,
      textFactory: this.textFactory,
      animations: this.animations,
      input: this.input,
      board: this.board,
      rules: this.rules,
      questions: this.questions
    });
  }

  getAspect() {
    return this.container.clientWidth / this.container.clientHeight;
  }

  buildScene() {
    const scene = this.sceneManager.scene;
    scene.add(this.environment.group, this.board.group, this.dice.group);
    this.dice.setRestPosition(this.board.getDiceRestPosition(this.dice.size));
    this.sceneManager.enableShadows(scene);
  }

  // Pion 3D du joueur dont c'est le tour
  get activePlayer() {
    return this.players[this.state.activePlayerIndex];
  }

  // Nouvelle partie : crée l'état (1 ou 2 joueurs) puis un pion 3D par joueur
  startNewGame(mode) {
    const scene = this.sceneManager.scene;
    for (const player of this.players) scene.remove(player.mesh);

    this.state = GameState.createNew(mode);
    this.turnManager = new TurnManager(this.state);
    this.players = this.state.players.map((playerState) => new Player(playerState));
    this.questions.reset();

    for (const player of this.players) {
      player.placeOnTile(this.board, 0); // tout le monde démarre sur la case 1
      scene.add(player.mesh);
      this.sceneManager.enableShadows(player.mesh);
    }

    this.dice.reset();
    this.refreshOffsets(true);
    this.refreshActivePlayer();
    this.menu.hide();
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
    const playing = this.state.phase !== PHASE.MENU && this.state.phase !== PHASE.FINISHED;
    for (const player of this.players) player.setActive(playing && player === this.activePlayer);
  }

  // Tirage d'un dé à six faces : entier de 1 à 6
  rollValue() {
    return Math.floor(Math.random() * 6) + 1;
  }

  // Un tour : lancer le dé, avancer, résoudre l'événement de la case, passer au tour suivant
  async playTurn() {
    const turn = this.turnManager;
    if (!turn.canRoll()) return; // un seul lancer à la fois : les clics pendant l'animation sont ignorés

    turn.startRolling();
    try {
      const value = this.rollValue();
      await this.dice.roll(value, this.animations);

      turn.startMoving();
      const player = this.activePlayer;
      const lastIndex = this.board.tiles.length - 1; // case 30 : on ne la dépasse jamais
      await player.moveTo(this.board, Math.min(player.position + value, lastIndex), this.animations, () => this.refreshOffsets());

      if (player.position === lastIndex) this.state.recordArrival(player.state);
      else await this.resolveLanding(player);
    } finally {
      turn.nextTurn();
      this.refreshActivePlayer();
    }

    if (turn.isFinished) await this.endGame();
  }

  // Événement de la case d'arrivée : pour l'instant, seul le quiz ouvre une carte
  async resolveLanding(player) {
    const tile = this.board.getTile(player.position);
    const event = this.rules.resolveLanding(tile.type);
    if (event === 'quiz') {
      this.turnManager.startEvent();
      await this.events.openQuiz(player.state, tile.zone); // le niveau du quiz = la zone de la case
    }
  }

  // Fin de partie : on laisse voir la dernière animation puis on affiche le résultat et le menu
  async endGame() {
    await this.animations.wait(1.2);
    this.menu.show({ title: 'Partie terminée', message: this.buildResultText() });
  }

  buildResultText() {
    if (this.state.mode === MODE.SOLO) return 'Bravo, tu as atteint la case 30 !\nChoisis un mode pour rejouer.';
    const ranks = ['1er', '2e'];
    const lines = this.state.finishOrder.map((id, i) => `${ranks[i]} : ${this.state.getPlayer(id).name}`);
    return `${lines.join('\n')}\nChoisis un mode pour rejouer.`;
  }

  start() {
    this.clock.start();
    this.menu.show();
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
