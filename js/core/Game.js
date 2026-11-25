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
import { Menu3D } from '../ui/Menu3D.js';
import { QUESTIONS } from '../data/questions.js';

const FONT_URL = 'assets/fonts/font.typeface.json';

export class Game {
  constructor(container) {
    this.container = container;
    this.sceneManager = new SceneManager(container);
    this.cameraManager = new CameraManager(this.sceneManager.renderer.domElement, this.getAspect());
    this.clock = new THREE.Clock();
    this.simulationTime = 0;

    this.board = new Board();
    this.environment = new Environment();
    this.dice = new Dice(1.6);
    this.animations = new AnimationManager();
    this.rules = new RuleEngine();
    this.questions = new QuestionBank(QUESTIONS);

    // Au démarrage, aucune partie n'est active ; le menu s'ouvre après le chargement dans init().
    this.state = new GameState();
    this.turnManager = new TurnManager(this.state);
    this.players = []; // pions 3D (un par PlayerState)
    this.paused = false;
    this.phaseBeforePause = null;

    this.buildScene();

    // Souris : le dé au centre est cliquable quand on peut lancer
    this.input = new InputManager(this.sceneManager.renderer.domElement, this.cameraManager.camera);
    this.input.addInteraction({
      isActive: () => this.turnManager.canRoll() && !(this.events && this.events.panel),
      getObjects: () => [this.dice.group],
      onHover: (hit) => this.dice.setHover(Boolean(hit)),
      onClick: () => this.playTurn()
    });

    this.input.addKeyHandler('Escape', () => this.togglePause());

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
      questions: this.questions,
      isGamePaused: () => this.paused
    });

    this.menu = new Menu3D(this.events);
    this.events.initializeMenuCardsAtHome(this.menu.card, this.menu.rulesCard);
    this.events.onMenuCardClick = () => {
      if (this.state.phase === PHASE.MENU) return this.openMainMenu();
      return this.togglePause();
    };
    this.events.onRulesCardClick = () => this.menu.showRulesFromHome();
    this.openMainMenu().catch((error) => console.error(error));
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
    if (this.events) this.events.clearPendingCards();
    if (this.events && this.menu && this.events.menuCard !== this.menu.card) {
      this.events.initializeMenuCardsAtHome(this.menu.card, this.menu.rulesCard);
    }
    for (const player of this.players) scene.remove(player.mesh);

    this.state = GameState.createNew(mode);
    this.turnManager = new TurnManager(this.state);
    this.players = this.state.players.map((playerState) => new Player(playerState));
    this.questions.reset();
    this.board.clearCheckpointMarkers();

    for (const player of this.players) {
      player.placeOnTile(this.board, 0);
      scene.add(player.mesh);
      this.sceneManager.enableShadows(player.mesh);
    }

    this.dice.reset();
    this.refreshOffsets(true);
    this.refreshActivePlayer();
    this.paused = false;
    this.animations.paused = false;
  }

  // Menu de départ : SOLO, 2 JOUEURS ou RÈGLES (puis retour au menu)
  async openMainMenu() {
    const choice = await this.menu.showMain();
    if (choice === null) return;
    this.startNewGame(choice === 'duo' ? MODE.DUO : MODE.SOLO);
  }

  // Pause (Échap) : plus aucune progression ; Échap de nouveau (ou le bouton) reprend la partie
  get canPause() {
    return [PHASE.READY, PHASE.ROLLING, PHASE.MOVING, PHASE.EVENT].includes(this.state.phase) && !(this.events && this.events.panel);
  }

  async togglePause() {
    if (!this.events) return;
    if (this.events.pairActive) {
      this.events.submitChoice(100);
      return;
    }
    if (this.events.panel && this.events.panel.escapeIndex !== null) {
      this.events.submitChoice(this.events.panel.escapeIndex);
      return;
    }
    if (this.paused) {
      return;
    }
    if (!this.canPause) return;

    this.paused = true;
    this.phaseBeforePause = this.state.phase;
    this.state.phase = PHASE.PAUSED; // le dé et les cartes sont bloqués
    this.animations.paused = true;   // les animations de jeu sont gelées

    let choice;
    try {
      choice = await this.menu.showPause();
    } catch (error) {
      this.state.phase = this.phaseBeforePause;
      this.paused = false;
      this.animations.paused = false;
      throw error;
    }

    this.paused = false;
    this.animations.paused = false;
    if (choice === 'resume') {
      this.state.phase = this.phaseBeforePause;
    } else {
      // SOLO ou 2 JOUEURS choisi depuis la pause : on abandonne la partie en cours et on en lance une nouvelle
      this.abortGame();
      this.startNewGame(choice === 'duo' ? MODE.DUO : MODE.SOLO);
    }
  }

  // Abandon de la partie en cours (retour au menu principal) : tout est remis à zéro
  abortGame() {
    this.events.abort();
    this.animations.clear();
    this.animations.paused = false;
    this.dice.cancelRoll();
    this.dice.reset();
    for (const player of this.players) this.sceneManager.scene.remove(player.mesh);
    this.players = [];
    this.board.clearCheckpointMarkers();
    this.state = new GameState();
    this.turnManager = new TurnManager(this.state);
    this.paused = false;
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

  // Un tour : lancer le dé, avancer, résoudre l'événement de la case, passer au tour suivant.
  // Sur la dernière case, un défi difficile : le réussir fait gagner la partie, le rater déclenche une carte danger.
  async playTurn() {
    const turn = this.turnManager;
    if (!turn.canRoll()) return; // un seul lancer à la fois : les clics pendant l'animation sont ignorés

    const startState = this.state;
    const player = this.activePlayer;
    let extraTurn = false;
    const lastIndex = this.board.tiles.length - 1; // dernière case (30) : on ne la dépasse jamais
    try {
      if (player.position === lastIndex) {
        // Déjà sur la case finale (défi raté, puis rien ne l'a fait reculer) : il retente sans lancer le dé
        turn.startEvent();
        await this.playFinal(player);
      } else {
        turn.startRolling();
        let value = this.rollValue();
        await this.dice.roll(value, this.animations);

        // La carte différée est révélée avant la consommation de son effet sur ce lancer.
        if (player.state.rollModifier) {
          turn.startEvent();
          const modifierType = player.state.rollModifier;
          const pending = await this.events.revealPendingCard(
            player.state, modifierType === 'double' ? 'double' : 'slow'
          );
          const modifier = player.state.takeRollModifier();
          const modified = this.rules.applyRollModifier(value, modifier);
          await this.events.completePendingCard(pending);
          value = modified;
        }

        turn.startMoving();
        await this.moveWithCheckpoints(player, Math.min(player.position + value, lastIndex));

        if (player.position === lastIndex) {
          turn.startEvent();
          await this.playFinal(player); // arrivée sur la case 30 : défi difficile
        } else {
          extraTurn = await this.resolveLanding(player);
        }
      }
    } finally {
      if (this.state === startState) { // sinon une nouvelle partie vient d'être lancée
        if (extraTurn && this.state.winnerId === null && !this.state.defeat) turn.repeatTurn(); // bonus « rejouer »
        else {
          await turn.nextTurn(
            (playerState) => this.events.revealPendingCard(playerState, 'skip'),
            (pending) => this.events.completePendingCard(pending)
          );
        }
        this.refreshActivePlayer();
      }
    }

    if (this.state !== startState) return;
    if (turn.isFinished) await this.endGame();
  }

  // Case finale : un défi difficile. Réussi -> arrivée enregistrée, la partie est gagnée.
  // Raté -> carte danger (le joueur retentera le défi à son prochain tour s'il est encore sur la case 30).
  // Solo : 3 défis finaux ratés = défaite, sans carte danger. Le jeu du défi est tiré au hasard à chaque fois.
  async playFinal(player) {
    const result = await this.events.openChallenge(player.state, { level: 3 });
    if (result.success) {
      this.state.recordArrival(player.state);
      return;
    }
    this.state.recordFinalFailure(player.state);
    if (this.state.defeat) return; // défaite : la partie s'arrête
    await this.playTrap(player);
  }

  // Déplacement normal : le pion saute case par case ; un checkpoint rencontré (ou atteint) s'active
  async moveWithCheckpoints(player, destination) {
    const onStep = () => {
      this.refreshOffsets();
      const index = player.position;
      if (this.rules.activateCheckpoint(player.state, this.board.getTile(index).type, index)) {
        this.board.markCheckpoint(index, player.id, player.color); // anneau de la couleur du joueur
      }
    };
    await player.moveTo(this.board, destination, this.animations, onStep);
  }

  // Événement de la case d'arrivée : quiz, défi, bonus, piège ou portail (le niveau = la zone de la case).
  // Retourne true si le joueur doit rejouer tout de suite (carte bonus « rejouer »).
  async resolveLanding(player) {
    const tile = this.board.getTile(player.position);
    const event = this.rules.resolveLanding(tile.type);
    let result = null;

    if (event === 'quiz') {
      this.turnManager.startEvent();
      result = await this.events.openQuiz(player.state, tile.zone);
    } else if (event === 'challenge') {
      this.turnManager.startEvent();
      result = await this.events.openChallenge(player.state, { level: tile.zone });
    } else if (event === 'bonus') {
      return this.playBonus(player);
    } else if (event === 'trap') {
      return this.playTrap(player);
    } else if (event === 'portal') {
      this.turnManager.startEvent();
      const destination = this.rules.portalDestination(player.position);
      await this.teleport(player, destination); // aucun événement sur la case d'arrivée
      return false;
    }

    // Quiz ou défi : réussi -> carte bonus, raté -> carte danger
    if (result) return result.success ? this.playBonus(player) : this.playTrap(player);
    return false;
  }

  // Carte jaune (bonus). Retourne true si le joueur rejoue.
  async playBonus(player) {
    this.turnManager.startEvent();
    const outcome = await this.events.openBonus(player.state, { solo: this.state.mode === MODE.SOLO });
    if (outcome.move !== 0) await this.applyMove(player, player.position + outcome.move);
    return outcome.extraTurn;
  }

  // Carte rouge (danger). Retourne toujours false (un danger ne fait jamais rejouer).
  async playTrap(player) {
    this.turnManager.startEvent();
    const outcome = await this.events.openTrap(player.state, { solo: this.state.mode === MODE.SOLO });
    if (outcome.move !== 0) await this.applyMove(player, player.position + outcome.move);
    if (outcome.toCheckpoint && player.position !== player.state.checkpoint) {
      await this.teleport(player, player.state.checkpoint);
    }
    return false;
  }

  // Déplacement spécial (bonus ou piège) : le pion bouge, mais la case d'arrivée ne déclenche aucun nouvel événement
  async applyMove(player, destination) {
    if (destination === player.position) return;
    this.turnManager.startMoving();
    await this.moveWithCheckpoints(player, destination);
  }

  // Téléportation 3D : anneaux lumineux, le pion tourne et rétrécit, puis réapparaît à l'arrivée
  async teleport(player, destination) {
    this.turnManager.startMoving();
    const departure = this.board.playPortalEffect(player.position, this.animations);
    await player.vanish(this.animations);
    player.relocate(this.board, destination, () => this.refreshOffsets());
    const arrival = this.board.playPortalEffect(destination, this.animations);
    await player.appear(this.animations);
    await Promise.all([departure, arrival]);
  }

  // Fin de partie : on laisse voir la dernière animation, puis l'écran 3D propose de rejouer ou de revenir au menu
  async endGame() {
    await this.animations.wait(1.2);
    const winner = this.state.winner;
    const title = winner ? `${winner.name || `Joueur ${winner.id}`} a gagné !` : 'Défaite !';
    const choice = await this.menu.showEnd(title);
    this.startNewGame(choice === 'duo' ? MODE.DUO : MODE.SOLO);
  }

  async start() {
    this.clock.start();
    requestAnimationFrame(this.loop);
  }

  loop() {
    requestAnimationFrame(this.loop);
    const realDelta = Math.min(this.clock.getDelta(), 0.1);
    const deltaTime = this.paused ? 0 : realDelta;
    this.simulationTime += deltaTime;
    this.update(realDelta, deltaTime, this.simulationTime);
    this.sceneManager.render(this.cameraManager.camera);
  }

  // Un seul update() principal : toute l'animation passe par ici
  update(realDelta, deltaTime, time) {
    // L'AnimationManager laisse avancer les animations d'interface, mais conserve les
    // tâches de jeu à leur temps écoulé lorsqu'il est en pause.
    this.animations.update(realDelta);
    const panel = this.events && this.events.panel;
    if (panel && panel.update) panel.update(this.clock.elapsedTime); // éléments animés des menus
    this.board.update(deltaTime, time);
    this.dice.update(deltaTime, time);
    for (const player of this.players) player.update(time, deltaTime);
    this.cameraManager.update();
    if (this.events) this.events.update();
  }

  onResize() {
    this.sceneManager.resize(this.container.clientWidth, this.container.clientHeight);
    this.cameraManager.onResize(this.getAspect());
  }
}
