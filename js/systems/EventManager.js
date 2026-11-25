import * as THREE from 'three';
import { QuizCard } from '../cards/QuizCard.js';
import { ChallengeCard } from '../cards/ChallengeCard.js';
import { BonusCard } from '../cards/BonusCard.js';
import { TrapCard } from '../cards/TrapCard.js';
import { SlidePuzzle3D } from '../cards/SlidePuzzle3D.js';
import { MemoryBoard3D } from '../cards/MemoryBoard3D.js';
import { CARD_SIZE } from '../cards/Card3D.js';
import { makeBox } from '../world/Materials.js';
import { BOARD_HALF_X } from '../data/boardConfig.js';
import { GROUND_Y } from '../world/Environment.js';
import {
  CRYSTAL_LENGTH, PUZZLE_LEVELS, MEMORY_LEVELS,
  makeCrystalSequence, makeSlidePuzzle, makeMemoryDeck, canSlide, slide, isSolved
} from '../data/challenges.js';
import { easeOutCubic, easeInOutQuad, easeOutBack, easeLinear } from './AnimationManager.js';

const DISPLAY_FOCUS = new THREE.Vector3(0, 3, 0); // le centre du plateau
const SCREEN_FRACTION = 0.68;                     // la carte occupe ~68 % de la hauteur de l'écran
const LIFT_HEIGHT = 3.2;                          // hauteur de la levée au-dessus de la pile
const FEEDBACK_SECONDS = 2;
const HOME_CARD_MAX_SCALE = 1.15;
const HOME_CARD_GAP = 0.55;
const PAUSE_CARD_GAP = 0.32;

// Ouvre et ferme les événements du plateau (quiz, défis, cartes bonus et danger).
// Une seule carte de jeu est active ; la carte Pause peut s'afficher à côté.
export class EventManager {
  constructor({ scene, cameraManager, textFactory, animations, input, board, rules, questions, isGamePaused }) {
    this.lastChallengeKind = null; // dernier jeu de défi tiré
    this.scene = scene;
    this.cameraManager = cameraManager;
    this.textFactory = textFactory;
    this.animations = animations;
    this.board = board;
    this.input = input;
    this.rules = rules;
    this.questions = questions;
    this.isGamePaused = isGamePaused;

    this.activeEvent = null;
    this.card = null;
    this.panel = null;         // panneau de choix ouvert (hors carte)
    this.pendingAnswer = null; // fonction qui reçoit l'indice de l'objet cliqué sur la carte
    this.pendingChoice = null; // fonction qui reçoit l'indice du bouton cliqué sur un panneau
    this.menuCard = null;
    this.menuAtHome = false;
    this.rulesCard = null;
    this.rulesCardAtHome = false;
    this.pairActive = false;
    this.onMenuCardClick = null;
    this.onRulesCardClick = null;
    this.pendingCards = new Map();
    this.presentingPendingCards = new Set();
    this.cardHomeMetrics = new WeakMap();
    this.pauseOverlay = null;
    this.rulesOverlay = null;
    this.eventCardOffset = null;

    // Objets cliquables de la carte ouverte (réponses, cristaux, tuiles, cartes mémoire...)
    input.addInteraction({
      isActive: () => this.card !== null && this.pendingAnswer !== null &&
        this.panel === null && !this.isGamePaused(),
      getObjects: () => this.card.clickableMeshes,
      onHover: (hit) => { if (this.card) this.card.setHover(hit && this.panel === null ? this.answerIndexOf(hit) : null); },
      onClick: (hit) => this.submit(this.answerIndexOf(hit))
    });

    // Boutons d'un panneau (menus, pause, élimination) : prioritaires sur la carte
    input.addInteraction({
      isActive: () => this.panel !== null && (
        this.pendingChoice !== null || this.panel === this.menuCard || this.panel === this.rulesCard
      ),
      getObjects: () => this.panel.clickableMeshes,
      onHover: (hit) => {
        if (this.panel) {
          const index = hit ? this.answerIndexOf(hit) : null;
          this.panel.setHover(index, this.animations);
        }
      },
      onClick: (hit) => this.submitChoice(this.answerIndexOf(hit))
    });

    // Carte de menu au repos : elle peut être cliquée comme une carte posée à côté du plateau.
    input.addInteraction({
      isActive: () => this.menuCard !== null && this.menuAtHome && this.panel === null,
      getObjects: () => [this.menuCard.body, this.menuCard.face],
      onHover: (hit) => {
        if (hit) this.menuCard.group.scale.setScalar(this.computeMenuHomePose().scale * 1.04);
        else if (this.menuAtHome) this.menuCard.group.scale.setScalar(this.computeMenuHomePose().scale);
      },
      onClick: () => {
        if (this.onMenuCardClick) this.onMenuCardClick();
      }
    });
    input.addInteraction({
      isActive: () => this.rulesCard !== null && this.rulesCardAtHome && this.panel === null,
      getObjects: () => [this.rulesCard.body, this.rulesCard.face],
      onClick: () => {
        if (this.onRulesCardClick) this.onRulesCardClick();
      }
    });

    // Les cartes menu et règles sont toutes les deux interactives lorsqu'elles sont côte à côte.
    input.addInteraction({
      isActive: () => this.pairActive && this.menuCard !== null && this.rulesCard !== null,
      getObjects: () => [
        ...this.menuCard.clickableMeshes,
        ...this.rulesCard.clickableMeshes
      ],
      onHover: (hit) => {
        if (!this.pairActive || !this.menuCard || !this.rulesCard) return;
        if (!hit) {
          this.menuCard.setHover(null, this.animations);
          this.rulesCard.setHover(null, this.animations);
          return;
        }
        const menuIndex = this.answerIndexOf(hit);
        let current = hit;
        let belongsToMenu = false;
        while (current) {
          if (this.menuCard.clickableMeshes.includes(current)) {
            belongsToMenu = true;
            break;
          }
          current = current.parent;
        }
        if (belongsToMenu) {
          this.menuCard.setHover(menuIndex, this.animations);
        } else {
          this.rulesCard.setHover(menuIndex, this.animations);
        }
      },
      onClick: (hit) => {
        if (!this.menuCard || !this.rulesCard) return;
        let belongsRules = false;
        let current = hit;
        while (current) {
          if (current === this.rulesCard.returnButton) {
            belongsRules = true;
            break;
          }
          current = current.parent;
        }
        if (belongsRules) {
          this.submitChoice(100);
          return;
        }
        const index = this.answerIndexOf(hit);
        if (index !== null) this.submitChoice(index);
      }
    });
  }

  // Remonte de l'objet touché (texte, bouton, tuile...) jusqu'au groupe qui porte son indice
  answerIndexOf(object) {
    let current = object;
    while (current && current.userData.answerIndex === undefined) current = current.parent;
    return current ? current.userData.answerIndex : null;
  }

  // Attend le prochain clic sur un objet de la carte : retourne l'indice de l'objet cliqué
  waitAnswer() {
    return new Promise((resolve) => { this.pendingAnswer = resolve; });
  }

  // Un seul clic est pris en compte : après le premier, plus aucun clic n'est attendu
  submit(index) {
    if (index === null || !this.pendingAnswer) return;
    const resolve = this.pendingAnswer;
    this.pendingAnswer = null;
    resolve(index);
  }

  // ---------------------------------------------------------------- Quiz

  // Joue un quiz complet. La caméra est figée tant que la carte est affichée,
  // et libérée dès que la carte est revenue dans la pile.
  async openQuiz(playerState, level) {
    this.cameraManager.setLocked(true);
    try {
      return await this.runQuiz(playerState, level);
    } finally {
      this.cameraManager.setLocked(false);
    }
  }

  // La carte se lève de la pile, attente du clic, résultat, retour dans la pile.
  // Retourne { success } : true si la réponse est bonne (la carte bonus ou danger suit, côté jeu).
  async runQuiz(playerState, level) { // playerState : gardé pour l'uniformité des événements
    const question = this.questions.draw(level);
    const card = new QuizCard(this.textFactory);
    this.card = card;
    this.activeEvent = { type: 'quiz', question };
    card.showQuestion(question);
    this.addEventCard(card);

    const pile = this.board.piles.find((p) => p.key === 'quiz');
    await this.playEntry(card, pile);

    const index = await this.waitAnswer();

    const correct = card.submitAnswer(index);
    card.showFeedback(correct ? 'Bonne réponse !' : 'Mauvaise réponse !', correct);
    await this.animations.wait(FEEDBACK_SECONDS);

    await this.playExit(card, pile);
    this.disposeEventCard(card);
    this.card = null;
    this.activeEvent = null;
    return { success: correct };
  }

  // ---------------------------------------------------------------- Défis

  // Choisit le jeu d'une case défi au hasard parmi les 3 : Cristaux, Puzzle chronométré, Mémoire
  // Le jeu change toujours d'un défi à l'autre : on n'en tire jamais deux fois le même d'affilée.
  pickKind() {
    const kinds = ['crystals', 'puzzle', 'memory'].filter((k) => k !== this.lastChallengeKind);
    this.lastChallengeKind = kinds[Math.floor(Math.random() * kinds.length)];
    return this.lastChallengeKind;
  }

  // Défi (cases défi). kind : 'crystals' | 'puzzle' | 'memory' (tirage au hasard si absent).
  // La caméra est figée tant que la carte est affichée. Retourne { kind, success }.
  async openChallenge(playerState, { level, kind = null }) {
    this.cameraManager.setLocked(true);
    try {
      return await this.runChallenge(playerState, { level, kind });
    } finally {
      this.cameraManager.setLocked(false);
    }
  }

  async runChallenge(playerState, { level, kind }) {
    const chosen = kind || this.pickKind();
    const card = new ChallengeCard(this.textFactory);
    this.card = card;

    const game = this.prepareGame(card, chosen, level);
    this.activeEvent = { type: 'challenge', kind: chosen, step: 0, ...game.data };
    this.addEventCard(card);

    const pile = this.board.piles.find((p) => p.key === 'defi');
    await this.playEntry(card, pile);

    const result = await game.play(playerState); // { success, extra }

    card.showFeedback(this.challengeText(result.success, result.extra), result.success);
    await this.animations.wait(FEEDBACK_SECONDS);

    await this.playExit(card, pile);
    this.disposeEventCard(card);
    this.card = null;
    this.activeEvent = null;
    return { kind: chosen, success: result.success };
  }

  // Prépare l'affichage du jeu sur la carte. Retourne { data, play } :
  // data = informations du jeu (séquence, grille...), play = la partie elle-même (asynchrone).
  prepareGame(card, kind, level) {
    if (kind === 'crystals') {
      const sequence = makeCrystalSequence(CRYSTAL_LENGTH[level]);
      card.showCrystals(sequence.length);
      return { data: { sequence }, play: () => this.playCrystals(card, sequence) };
    }

    if (kind === 'puzzle') {
      const config = PUZZLE_LEVELS[level];
      const slideData = { board: makeSlidePuzzle(config.moves, config.size), config }; // board est mis à jour à chaque coup
      const component = new SlidePuzzle3D(this.textFactory, slideData.board);
      component.setTime(config.time, config.time);
      card.mountGame(component, 'puzzle', 'DÉFI : PUZZLE');
      return { data: { slide: slideData }, play: () => this.playPuzzle(component, slideData) };
    }

    const config = MEMORY_LEVELS[level];
    const memoryData = { deck: makeMemoryDeck(config.pairs), config };
    const component = new MemoryBoard3D(this.textFactory, memoryData.deck, config.cols);
    card.mountGame(component, 'memory', 'DÉFI : MÉMOIRE');
    return { data: { memory: memoryData }, play: (playerState) => this.playMemory(card, component, memoryData, playerState) };
  }

  // Cristaux : les cristaux s'allument un par un, puis le joueur clique dans le même ordre.
  // Une erreur arrête l'épreuve tout de suite.
  async playCrystals(card, sequence) {
    card.setStatus('Regarde bien la séquence');
    await this.animations.wait(0.7);
    for (const index of sequence) {
      card.setLit(index, true);
      await this.animations.wait(0.6);
      card.setLit(index, false);
      await this.animations.wait(0.25);
    }

    card.setStatus('Reproduis la séquence !');
    for (let step = 0; step < sequence.length; step++) {
      this.activeEvent.step = step;
      const index = await this.waitAnswer();
      card.setLit(index, true); // petit éclair sur le cristal cliqué
      await this.animations.wait(0.2);
      card.setLit(index, false);
      if (index !== sequence[step]) return { success: false };
      card.setProgress(step + 1, sequence.length);
    }
    return { success: true };
  }

  // Puzzle chronométré : on fait glisser les tuiles voisines de la case vide pour les remettre dans l'ordre
  // avant la fin du temps. Temps écoulé = défi raté.
  async playPuzzle(component, slideData) {
    const total = slideData.config.time;
    let finished = false;
    let timedOut = false;

    // Compte à rebours : il réveille l'attente d'un clic quand le temps est écoulé
    this.animations.animate(total, (eased, t) => {
      if (finished) return;
      component.setTime(total * (1 - t), total);
      if (t >= 1) {
        timedOut = true;
        this.submit(-1);
      }
    }, easeLinear);

    while (!timedOut) {
      const id = await this.waitAnswer();
      if (timedOut || id === -1) break;

      const pos = slideData.board.indexOf(id + 1);
      if (!canSlide(slideData.board, pos)) continue; // tuile qui ne touche pas la case vide : rien ne se passe

      const emptyPos = slideData.board.indexOf(0);
      slideData.board = slide(slideData.board, pos);
      await component.slide(id, emptyPos, this.animations);
      component.updateColors(slideData.board);

      if (isSolved(slideData.board)) {
        finished = true;
        return { success: true };
      }
    }
    finished = true;
    return { success: false, extra: 'Temps écoulé !' };
  }

  // Mémoire : on retourne deux cartes à la fois pour retrouver les paires.
  // Trop d'erreurs = défi raté.
  async playMemory(card, component, memoryData, playerState) {
    const { deck, config } = memoryData;
    const matched = new Set();
    let first = null;
    let found = 0;
    let errors = 0;

    const showStatus = () => card.setStatus(
      `Paires : ${found}/${config.pairs} - Erreurs : ${errors}/${config.maxErrors}`
    );
    showStatus();

    while (found < config.pairs && errors < config.maxErrors) {
      const index = await this.waitAnswer();
      if (matched.has(index) || index === first) continue; // carte déjà trouvée ou déjà retournée

      await component.flip(index, true, this.animations);
      if (first === null) {
        first = index;
        continue;
      }

      const second = index;
      if (deck[first] === deck[second]) {
        matched.add(first);
        matched.add(second);
        found++;
        component.markMatched(first, second);
      } else {
        errors++;
        component.markWrong(first, second);
        await this.animations.wait(0.8);
        await Promise.all([component.flip(first, false, this.animations), component.flip(second, false, this.animations)]);
        component.clearWrong(first, second);
      }
      first = null;
      showStatus();
    }

    const success = found === config.pairs;
    return { success, extra: success ? null : "Trop d'erreurs !" };
  }

  // Texte du bandeau de résultat d'un défi
  challengeText(success, extra = null) {
    if (success) return 'Défi réussi !';
    return extra ? `Défi raté !\n${extra}` : 'Défi raté !';
  }

  // ---------------------------------------------------------------- Bonus (carte jaune) et pièges (carte rouge)

  // Carte jaune : le joueur clique sur le coffre 3D pour l'ouvrir. L'effet est tiré au hasard
  // (avancer, rejouer, dé x2 ou rien) ; `type` permet de le forcer (tests). La caméra est figée pendant la carte.
  async openBonus(playerState, { type = null, solo = false } = {}) {
    this.cameraManager.setLocked(true);
    try {
      return await this.runBonus(playerState, { type, solo });
    } finally {
      this.cameraManager.setLocked(false);
    }
  }

  async runBonus(playerState, { type, solo }) {
    const card = new BonusCard(this.textFactory);
    this.card = card;
    this.activeEvent = { type: 'bonus' };
    card.showChest();
    this.addEventCard(card);

    const pile = this.board.piles.find((p) => p.key === 'bonus');
    await this.playEntry(card, pile);

    await this.waitAnswer(); // clic sur le coffre
    const outcome = this.rules.resolveBonus(playerState, { solo, type });
    const view = this.bonusView(outcome);
    await card.openChest(view.icon, view.label, this.animations, view.positive);
    card.showFeedback(view.text, view.positive ? 0x2e9e4f : 0x8a8f98);
    await this.animations.wait(FEEDBACK_SECONDS);

    if (outcome.type === 'double') {
      await this.parkPendingCard(card, pile, playerState, 'double');
      this.clearEventCardOffset(card);
      this.card = null;
      this.activeEvent = null;
      return outcome;
    }

    await this.playExit(card, pile);
    this.disposeEventCard(card);
    this.card = null;
    this.activeEvent = null;
    return outcome;
  }

  // Carte rouge : le panneau de danger tremble, puis la conséquence du piège est révélée.
  async openTrap(playerState, { type = null, solo = false } = {}) {
    this.cameraManager.setLocked(true);
    try {
      return await this.runTrap(playerState, { type, solo });
    } finally {
      this.cameraManager.setLocked(false);
    }
  }

  async runTrap(playerState, { type, solo }) {
    const card = new TrapCard(this.textFactory);
    this.card = card;
    this.activeEvent = { type: 'trap' };
    card.showSign();
    this.addEventCard(card);

    const pile = this.board.piles.find((p) => p.key === 'piege');
    await this.playEntry(card, pile);

    await card.alert(this.animations);
    const outcome = this.rules.resolveTrap(playerState, { solo, type });
    const view = this.trapView(outcome);
    await card.reveal(view.icon, view.positive, view.label, this.animations);
    card.showFeedback(view.text, view.positive ? 0x2e9e4f : 0x8f2a2a);
    await this.animations.wait(FEEDBACK_SECONDS);

    if (outcome.type === 'skip' || outcome.type === 'slow') {
      await this.parkPendingCard(card, pile, playerState, outcome.type);
      this.clearEventCardOffset(card);
      this.card = null;
      this.activeEvent = null;
      return outcome;
    }

    await this.playExit(card, pile);
    this.disposeEventCard(card);
    this.card = null;
    this.activeEvent = null;
    return outcome;
  }

  // Icône, libellé et message de ce que contient le coffre
  bonusView({ type, move }) {
    if (type === 'forward') return { icon: 'move', positive: true, label: `+${move} cases`, text: `Bonus ! Tu avances de ${move} cases` };
    if (type === 'extra') return { icon: 'extra', positive: true, label: 'Rejoue !', text: 'Bonus ! Tu rejoues un tour' };
    if (type === 'double') return { icon: 'double', positive: true, label: 'Prochain dé ×2', text: 'Bonus ! Ton prochain lancer compte double' };
    return { icon: 'cross', positive: false, label: 'Pas de chance', text: 'Pas de chance... aucun bonus' };
  }

  // Icône, libellé et message de la conséquence du piège (positive = true quand on a de la chance)
  trapView({ type, move, toStart }) {
    if (type === 'back') return { icon: 'move', positive: false, label: `Recule de ${-move} cases`, text: `Danger ! Tu recules de ${-move} cases` };
    if (type === 'skip') return { icon: 'skip', positive: false, label: 'Tour passé', text: 'Danger ! Tu passeras ton prochain tour' };
    if (type === 'slow') return { icon: 'slow', positive: false, label: 'Prochain dé ÷2', text: 'Danger ! Ton prochain lancer est réduit de moitié' };
    if (type === 'checkpoint') {
      return toStart
        ? { icon: 'flag', positive: false, label: 'Retour au départ', text: 'Danger ! Tu retournes au départ' }
        : { icon: 'flag', positive: false, label: 'Retour au checkpoint', text: 'Danger ! Tu retournes au dernier checkpoint' };
    }
    return { icon: 'check', positive: true, label: 'De la chance !', text: 'De la chance ! Aucun danger' };
  }

  addPlayerMarker(card, playerState) {
    const marker = new THREE.Group();
    const badge = makeBox(0.42, 0.26, 0.04, playerState.color, { radius: 0.08, roughness: 0.5 });
    const label = this.textFactory.create(`J${playerState.id}`, {
      size: 0.09, maxWidth: 0.34, maxLines: 1, color: 0xffffff, depth: 0.015
    });
    label.position.z = 0.03;
    marker.position.set(0.72, -1.32, 0.05);
    marker.add(badge, label);
    card.content.add(marker);
  }

  async parkPendingCard(card, pile, playerState, effect) {
    const start = {
      position: card.group.position.clone(),
      quaternion: card.group.quaternion.clone(),
      scale: card.group.scale.x
    };
    const facePose = this.computeFacingPose(start.position);
    await this.playFlip(card, start.position, start.scale, 1, 0);
    this.addPlayerMarker(card, playerState);
    card.clickableMeshes = [];

    const queue = this.pendingCards.get(playerState.id) || [];
    const record = { card, pile, playerState, effect, animating: true };
    queue.push(record);
    this.pendingCards.set(playerState.id, queue);

    const target = this.computePendingPose(playerState.id, queue.length - 1);
    await this.animateCardPose(card, {
      position: card.group.position.clone(),
      quaternion: facePose.quaternion,
      scale: card.group.scale.x
    }, target, 0.65);

    record.animating = false;
    pile.topCard.show();
  }

  async revealPendingCard(playerState, expectedEffect) {
    const queue = this.pendingCards.get(playerState.id);
    if (!queue || queue.length === 0) return null;
    const index = queue.findIndex((record) => record.effect === expectedEffect);
    if (index < 0) return null;

    const [record] = queue.splice(index, 1);
    if (queue.length === 0) this.pendingCards.delete(playerState.id);
    record.animating = true;
    this.presentingPendingCards.add(record);

    const target = this.computeDisplay();
    const from = {
      position: record.card.group.position.clone(),
      quaternion: record.card.group.quaternion.clone(),
      scale: record.card.group.scale.x
    };
    await this.animateCardPose(record.card, from, target, 0.75);
    await this.playFlip(record.card, target.position, target.scale, 0, 1);
    await this.animations.wait(0.8);
    return record;
  }

  async completePendingCard(record) {
    if (!record) return;
    const card = record.card;
    await this.playExit(card, record.pile);
    card.dispose();
    this.presentingPendingCards.delete(record);
  }

  clearPendingCards() {
    for (const queue of this.pendingCards.values()) {
      for (const record of queue) record.card.dispose();
    }
    for (const record of this.presentingPendingCards) record.card.dispose();
    this.pendingCards.clear();
    this.presentingPendingCards.clear();
  }

  animateCardPose(card, from, to, duration, ui = false) {
    const startPosition = from.position.clone();
    const startQuaternion = from.quaternion.clone();
    const startScale = from.scale;
    return this.animations.animate(duration, (eased) => {
      card.group.position.lerpVectors(startPosition, to.position, eased);
      card.group.quaternion.slerpQuaternions(startQuaternion, to.quaternion, eased);
      card.group.scale.setScalar(THREE.MathUtils.lerp(startScale, to.scale, eased));
    }, easeInOutQuad, { ui });
  }

  // Place un groupe 3D face à la caméra, au centre de l'écran, à une taille adaptée à la fenêtre.
  // width et height : dimensions du groupe ; retourne l'échelle à lui donner.
  placeFacingCamera(group, width, height, maxWidthFraction, maxHeightFraction) {
    const camera = this.cameraManager.camera;
    const position = camera.position.clone().lerp(DISPLAY_FOCUS, 0.5);
    const distance = camera.position.distanceTo(position);
    const visibleHeight = 2 * distance * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    const scale = Math.min(
      (visibleHeight * camera.aspect * maxWidthFraction) / width,
      (visibleHeight * maxHeightFraction) / height
    );
    const helper = new THREE.Object3D();
    helper.position.copy(position);
    helper.lookAt(camera.position);
    group.position.copy(position);
    group.quaternion.copy(helper.quaternion);
    return scale;
  }

  waitChoice() {
    return new Promise((resolve) => { this.pendingChoice = resolve; });
  }

  submitChoice(index) {
    if (index === null || !this.pendingChoice) return;
    const resolve = this.pendingChoice;
    this.pendingChoice = null;
    resolve(index);
  }

  // Panneau 3D avec des boutons (voir MenuPanel3D) : retourne l'indice du bouton cliqué. La caméra est figée pendant le choix.
  // fraction : part de la largeur et de la hauteur de l'écran occupée.
  // Le panneau peut demander un ciel de fond (skyColor) ; ses animations continuent même en pause (ui: true).
  async askChoice({ panel, fraction = [0.9, 0.92] }) {
    this.cameraManager.setLocked(true);
    const previousBackground = this.scene.background;
    try {
      if (panel.skyColor !== undefined) this.scene.background = new THREE.Color(panel.skyColor);
      const scale = this.placeFacingCamera(panel.group, panel.width, panel.height, fraction[0], fraction[1]);
      panel.group.scale.setScalar(0.001);
      this.panel = panel;
      this.scene.add(panel.group);
      await this.animations.animate(0.35, (eased, t) => panel.group.scale.setScalar(Math.max(0.001, scale * easeOutBack(t))), easeOutCubic, { ui: true });

      const index = await this.waitChoice();
      if (panel.playPress) await panel.playPress(index, this.animations); // petit enfoncement du bouton cliqué

      await this.animations.animate(0.25, (eased) => panel.group.scale.setScalar(Math.max(0.001, scale * (1 - eased))), easeInOutQuad, { ui: true });
      this.scene.remove(panel.group);
      this.panel = null;
      return index;
    } finally {
      this.scene.background = previousBackground;
      this.cameraManager.setLocked(false);
    }
  }

  // Retour au menu principal : on ferme tout ce qui est ouvert, sans rien résoudre
  abort() {
    this.clearEventCardOffset();
    if (this.card) {
      this.card.dispose();
      this.card = null;
    }
    this.clearPendingCards();
    if (this.panel) {
      this.scene.remove(this.panel.group);
      this.panel = null;
    }
    if (this.menuCard) this.scene.remove(this.menuCard.group);
    this.menuCard = null;
    this.menuAtHome = false;
    if (this.rulesCard) this.scene.remove(this.rulesCard.group);
    this.rulesCard = null;
    this.rulesCardAtHome = false;
    this.activeEvent = null;
    this.pauseOverlay = null;
    this.rulesOverlay = null;
    this.pendingAnswer = null;
    this.pendingChoice = null;
    for (const pile of this.board.piles) pile.topCard.show();
    this.cameraManager.reset();
  }

  // ---------------------------------------------------------------- Animations de carte

  // Position et orientation actuelles de la carte du dessus de la pile (elle flotte doucement)
  topPose(pile) {
    return {
      position: pile.topCard.group.getWorldPosition(new THREE.Vector3()),
      quaternion: pile.topCard.flat.getWorldQuaternion(new THREE.Quaternion())
    };
  }

  // Position, taille et orientation de la carte : face à la caméra, à mi-chemin entre elle et le plateau,
  // avec une taille qui dépend de la fenêtre pour que le texte reste lisible.
  computeDisplay() {
    const camera = this.cameraManager.camera;
    const position = camera.position.clone().lerp(DISPLAY_FOCUS, 0.5);
    const distance = camera.position.distanceTo(position);
    const visibleHeight = 2 * distance * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    const visibleWidth = visibleHeight * camera.aspect;
    const scale = Math.min(
      (visibleHeight * SCREEN_FRACTION) / CARD_SIZE.height,
      (visibleWidth * 0.8) / CARD_SIZE.width
    );

    const helper = new THREE.Object3D();
    helper.position.copy(position);
    helper.lookAt(camera.position);
    return { position, scale, quaternion: helper.quaternion.clone() };
  }

  computeFacingPose(position) {
    const helper = new THREE.Object3D();
    helper.position.copy(position);
    helper.lookAt(this.cameraManager.camera.position);
    return { position: position.clone(), scale: 1, quaternion: helper.quaternion.clone() };
  }

  computeScreenPose(x, y, scale) {
    const camera = this.cameraManager.camera;
    const focus = camera.position.clone().lerp(DISPLAY_FOCUS, 0.5);
    const distance = camera.position.distanceTo(focus);
    const visibleHeight = 2 * distance * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    const visibleWidth = visibleHeight * camera.aspect;
    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(camera.quaternion);
    const position = camera.position.clone()
      .addScaledVector(forward, distance)
      .addScaledVector(right, x * visibleWidth)
      .addScaledVector(up, y * visibleHeight);
    const helper = new THREE.Object3D();
    helper.position.copy(position);
    helper.lookAt(camera.position);
    return { position, scale, quaternion: helper.quaternion.clone() };
  }

  computePendingPose(playerId, index) {
    const camera = this.cameraManager.camera;
    const focus = camera.position.clone().lerp(DISPLAY_FOCUS, 0.5);
    const distance = camera.position.distanceTo(focus);
    const visibleHeight = 2 * distance * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    const visibleWidth = visibleHeight * camera.aspect;
    const scale = Math.min(0.42, (visibleHeight * 0.11) / CARD_SIZE.height, (visibleWidth * 0.09) / CARD_SIZE.width);
    const cardHeight = CARD_SIZE.height * scale;
    const side = playerId === 1 ? -1 : 1;
    const x = side * (0.5 - (CARD_SIZE.width * scale / 2 + 0.45) / visibleWidth);
    const y = 0.5 - (cardHeight / 2 + 0.45 + index * (cardHeight + 0.2)) / visibleHeight;
    return this.computeScreenPose(x, y, scale);
  }

  // Les cartes reposent sur le sol, juste à l'extérieur des bords gauche et droit du plateau.
  computeMenuHomePose() {
    return this.computeCardHomePose(this.menuCard, -1);
  }

  computeRulesHomePose() {
    return this.computeCardHomePose(this.rulesCard, 1);
  }

  computeCardHomePose(card, side) {
    const board = this.board.group;
    board.updateWorldMatrix(true, false);
    const boardQuaternion = board.getWorldQuaternion(new THREE.Quaternion());
    const boardScale = board.getWorldScale(new THREE.Vector3());
    const boardRight = new THREE.Vector3(1, 0, 0).applyQuaternion(boardQuaternion);
    boardRight.y = 0;
    boardRight.normalize();
    const center = board.localToWorld(new THREE.Vector3(0, 0, 0));
    const metrics = this.getCardHomeMetrics(card);
    const cardQuaternion = new THREE.Quaternion().setFromUnitVectors(
      new THREE.Vector3(1, 0, 0),
      boardRight
    );
    const positionAtScale = (scale) => center.clone().addScaledVector(
      boardRight,
      side * (BOARD_HALF_X * boardScale.x + metrics.halfWidth * scale + HOME_CARD_GAP)
    );
    const camera = this.cameraManager.camera;
    const fitScale = (position) => {
      const distance = camera.position.distanceTo(position);
      const visibleHeight = 2 * distance * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
      const visibleWidth = visibleHeight * camera.aspect;
      return Math.min(
        HOME_CARD_MAX_SCALE,
        (visibleHeight * 0.22) / metrics.height,
        (visibleWidth * 0.18) / metrics.width
      );
    };
    let scale = fitScale(positionAtScale(HOME_CARD_MAX_SCALE));
    let position = positionAtScale(scale);
    scale = fitScale(position);
    position = positionAtScale(scale);
    position.y = GROUND_Y + metrics.bottomOffset * scale;
    return { position, scale, quaternion: cardQuaternion };
  }

  getCardHomeMetrics(card) {
    if (this.cardHomeMetrics.has(card)) return this.cardHomeMetrics.get(card);
    const bounds = new THREE.Box3();
    const flatBounds = new THREE.Box3();
    const flatRotation = new THREE.Matrix4().makeRotationX(-Math.PI / 2);
    for (const mesh of [card.body, card.face, card.backFace]) {
      if (!mesh) continue;
      if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
      mesh.updateMatrix();
      const meshBounds = mesh.geometry.boundingBox.clone().applyMatrix4(mesh.matrix);
      bounds.union(meshBounds);
      flatBounds.union(meshBounds.clone().applyMatrix4(flatRotation));
    }
    const metrics = {
      width: bounds.max.x - bounds.min.x,
      height: bounds.max.y - bounds.min.y,
      halfWidth: Math.max(Math.abs(bounds.min.x), Math.abs(bounds.max.x)),
      bottomOffset: -flatBounds.min.y
    };
    this.cardHomeMetrics.set(card, metrics);
    return metrics;
  }

  update() {
    if (this.panel === this.menuCard || this.panel === this.rulesCard || this.pairActive) {
      this.input.refreshHover();
    }

    if (this.menuCard && this.menuAtHome) {
      const pose = this.computeMenuHomePose();
      this.menuCard.group.position.copy(pose.position);
      this.menuCard.group.quaternion.copy(pose.quaternion);
      this.menuCard.group.scale.setScalar(pose.scale);
      this.menuCard.flat.rotation.x = -Math.PI / 2;
      this.menuCard.flat.rotation.y = 0;
      this.menuCard.content.visible = false;
      if (this.menuCard.backContent) this.menuCard.backContent.visible = false;
      if (this.menuCard.restLogo) this.menuCard.restLogo.visible = true;
    }
    if (this.rulesCard && this.rulesCardAtHome) {
      const pose = this.computeRulesHomePose();
      this.rulesCard.group.position.copy(pose.position);
      this.rulesCard.group.quaternion.copy(pose.quaternion);
      this.rulesCard.group.scale.setScalar(pose.scale);
      this.rulesCard.flat.rotation.x = -Math.PI / 2;
      this.rulesCard.flat.rotation.y = 0;
      this.rulesCard.content.visible = false;
      if (this.rulesCard.backContent) this.rulesCard.backContent.visible = false;
      if (this.rulesCard.restLogo) this.rulesCard.restLogo.visible = true;
    }

    for (const [playerId, queue] of this.pendingCards) {
      queue.forEach((record, index) => {
        if (record.animating) return;
        const pose = this.computePendingPose(playerId, index);
        record.card.group.position.copy(pose.position);
        record.card.group.quaternion.copy(pose.quaternion);
        record.card.group.scale.setScalar(pose.scale);
      });
    }
  }

  initializeMenuCardsAtHome(menuCard, rulesCard) {
    this.menuCard = menuCard;
    this.rulesCard = rulesCard;
    for (const [card, pose] of [
      [menuCard, this.computeMenuHomePose()],
      [rulesCard, this.computeRulesHomePose()]
    ]) {
      card.group.position.copy(pose.position);
      card.group.quaternion.copy(pose.quaternion);
      card.group.scale.setScalar(pose.scale);
      card.flat.rotation.x = -Math.PI / 2;
      card.flat.rotation.y = 0;
      card.setFlip(0);
      card.content.visible = false;
      if (card.backContent) card.backContent.visible = false;
      card.restLogo.visible = true;
      card.group.visible = true;
      card.group.traverse((object) => {
        if (!object.isMesh) return;
        object.castShadow = true;
        object.receiveShadow = true;
      });
      if (card.group.parent !== this.scene) this.scene.add(card.group);
    }
    this.menuAtHome = true;
    this.rulesCardAtHome = true;
    this.pairActive = false;
    this.panel = null;
    this.pendingChoice = null;
    this.cameraManager.setLocked(false);
  }

  clearMenuHover() {
    this.menuCard?.setHover(null, this.animations);
    this.rulesCard?.setHover(null, this.animations);
  }

  getEventCardOffsetGroup(card) {
    if (this.eventCardOffset && this.eventCardOffset.card === card) {
      return this.eventCardOffset.group;
    }
    const group = new THREE.Group();
    this.scene.add(group);
    group.add(card.group);
    this.eventCardOffset = { card, group };
    return group;
  }

  addEventCard(card) {
    this.getEventCardOffsetGroup(card);
  }

  disposeEventCard(card) {
    this.clearEventCardOffset(card);
    card.dispose();
  }

  animateEventCardOffset(card, target, duration) {
    const group = this.getEventCardOffsetGroup(card);
    const start = group.position.clone();
    return this.animations.animate(duration, (eased) => {
      group.position.lerpVectors(start, target, eased);
    }, easeInOutQuad, { ui: true });
  }

  clearEventCardOffset(card = null) {
    if (!this.eventCardOffset || (card && this.eventCardOffset.card !== card)) return;
    const { card: eventCard, group } = this.eventCardOffset;
    group.remove(eventCard.group);
    this.scene.add(eventCard.group);
    this.scene.remove(group);
    this.eventCardOffset = null;
  }

  async openMenuCard(card, rulesCard = null, alongsideCard = null) {
    this.cameraManager.setLocked(true);
    this.menuCard = card;
    this.pauseOverlay = alongsideCard
      ? {
          card: alongsideCard,
          originalPose: {
            position: alongsideCard.group.position.clone(),
            quaternion: alongsideCard.group.quaternion.clone(),
            scale: alongsideCard.group.scale.x
          }
        }
      : null;
    if (rulesCard) {
      this.rulesCard = rulesCard;
      const rulesHome = this.computeRulesHomePose();
      rulesCard.group.position.copy(rulesHome.position);
      rulesCard.group.quaternion.copy(rulesHome.quaternion);
      rulesCard.group.scale.setScalar(rulesHome.scale);
      rulesCard.flat.rotation.x = -Math.PI / 2;
      rulesCard.flat.rotation.y = 0;
      rulesCard.content.visible = false;
      rulesCard.backContent.visible = false;
      if (rulesCard.restLogo) rulesCard.restLogo.visible = true;
      rulesCard.setFlip(0);
      if (rulesCard.group.parent !== this.scene) this.scene.add(rulesCard.group);
      this.rulesCardAtHome = true;
    }
    this.panel = card;
    const target = this.pauseOverlay
      ? this.computePauseOverlayPose()
      : this.computeDisplay();
    const home = this.computeMenuHomePose();
    card.group.position.copy(home.position);
    card.group.quaternion.copy(home.quaternion);
    card.group.scale.setScalar(home.scale);
    card.flat.rotation.x = -Math.PI / 2;
    card.flat.rotation.y = 0;
    card.setFlip(0);
    card.restLogo.visible = true;
    card.content.visible = false;
    if (card.backContent) card.backContent.visible = false;
    this.scene.add(card.group);
    this.menuAtHome = false;
    const animations = [this.animateCardFromRest(card, home, target)];
    if (this.pauseOverlay) {
      const underlying = this.pauseOverlay.card;
      animations.push(this.animateEventCardOffset(
        underlying,
        this.pauseOverlay.shiftedPose.position.clone()
          .sub(this.pauseOverlay.originalPose.position),
        0.5
      ));
    }
    await Promise.all(animations);
    await this.flipMenuCard(card, 0, 1);
  }

  computePauseOverlayPose() {
    const originalPose = this.pauseOverlay.originalPose;
    const position = originalPose.position;
    const scale = originalPose.scale;
    const camera = this.cameraManager.camera;
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
    const centerOffset = (CARD_SIZE.width * scale + PAUSE_CARD_GAP) / 2;
    const shiftedPose = {
      position: position.clone().addScaledVector(right, centerOffset),
      quaternion: originalPose.quaternion.clone(),
      scale
    };
    const overlayPosition = position.clone().addScaledVector(right, -centerOffset);
    this.pauseOverlay.shiftedPose = shiftedPose;
    const pose = {
      position: overlayPosition,
      quaternion: originalPose.quaternion.clone(),
      scale
    };

    return pose;
  }

  offsetScreenPose(pose, distance) {
    const right = new THREE.Vector3(1, 0, 0)
      .applyQuaternion(this.cameraManager.camera.quaternion);
    return {
      position: pose.position.clone().addScaledVector(right, distance),
      quaternion: pose.quaternion.clone(),
      scale: pose.scale
    };
  }

  async flipMenuCard(card, from, to) {
    card.content.visible = true;
    if (card.backContent) card.backContent.visible = true;
    await this.playFlip(card, card.group.position.clone(), card.group.scale.x, from, to, true);
    card.content.visible = to === 0;
    if (card.backContent) card.backContent.visible = to === 1;
  }

  animateCardToRest(card, home, duration = 0.9) {
    const from = {
      position: card.group.position.clone(),
      quaternion: card.group.quaternion.clone(),
      scale: card.group.scale.x
    };
    const fromTilt = card.flat.rotation.x;
    const fromFlip = card.flat.rotation.y / Math.PI;
    this.board.group.updateWorldMatrix(true, true);
    const boardBounds = new THREE.Box3().setFromObject(this.board.group);
    const boardCenter = this.board.group.localToWorld(new THREE.Vector3());
    const boardQuaternion = this.board.group.getWorldQuaternion(new THREE.Quaternion());
    const boardRight = new THREE.Vector3(1, 0, 0).applyQuaternion(boardQuaternion);
    boardRight.y = 0;
    boardRight.normalize();

    let boardHalfExtent = 0;
    for (const x of [boardBounds.min.x, boardBounds.max.x]) {
      for (const y of [boardBounds.min.y, boardBounds.max.y]) {
        for (const z of [boardBounds.min.z, boardBounds.max.z]) {
          boardHalfExtent = Math.max(
            boardHalfExtent,
            Math.abs(new THREE.Vector3(x, y, z).sub(boardCenter).dot(boardRight))
          );
        }
      }
    }

    const metrics = this.getCardHomeMetrics(card);
    const maxScale = Math.max(from.scale, home.scale);
    const cardClearance = Math.hypot(metrics.width, metrics.height) * maxScale / 2;
    const side = home.position.clone().sub(boardCenter).dot(boardRight) < 0 ? -1 : 1;
    const clearanceY = Math.max(boardBounds.max.y + cardClearance + 0.35, home.position.y);
    const outside = boardCenter.clone().addScaledVector(
      boardRight,
      side * (boardHalfExtent + cardClearance + HOME_CARD_GAP + 0.25)
    );
    const control1 = outside.clone();
    control1.y = Math.max(from.position.y, clearanceY);
    const control2 = outside.clone();
    control2.y = from.position.y < clearanceY
      ? clearanceY
      : home.position.y + Math.min(cardClearance * 0.65, clearanceY - home.position.y);
    const cubicBezier = (start, first, second, end, t) => {
      const inverse = 1 - t;
      return start.clone().multiplyScalar(inverse * inverse * inverse)
        .addScaledVector(first, 3 * inverse * inverse * t)
        .addScaledVector(second, 3 * inverse * t * t)
        .addScaledVector(end, t * t * t);
    };

    card.restLogo.visible = false;
    card.content.visible = true;
    if (card.backContent) card.backContent.visible = true;
    return this.animations.animate(duration, (eased, t) => {
      card.group.position.copy(cubicBezier(from.position, control1, control2, home.position, eased));
      card.group.quaternion.slerpQuaternions(from.quaternion, home.quaternion, eased);
      card.group.scale.setScalar(THREE.MathUtils.lerp(from.scale, home.scale, eased));
      card.flat.rotation.x = THREE.MathUtils.lerp(fromTilt, -Math.PI / 2, eased);
      card.setFlip(THREE.MathUtils.lerp(fromFlip, 0, eased));
      if (t > 0.82) {
        card.content.visible = false;
        if (card.backContent) card.backContent.visible = false;
        card.restLogo.visible = true;
      }
    }, easeInOutQuad, { ui: true }).then(() => {
      card.group.position.copy(home.position);
      card.group.quaternion.copy(home.quaternion);
      card.group.scale.setScalar(home.scale);
      card.flat.rotation.x = -Math.PI / 2;
      card.flat.rotation.y = 0;
      card.setFlip(0);
      card.content.visible = false;
      if (card.backContent) card.backContent.visible = false;
      card.restLogo.visible = true;
    });
  }

  animateCardFromRest(card, home, target, duration = 0.9) {
    card.restLogo.visible = false;
    card.content.visible = true;
    if (card.backContent) card.backContent.visible = false;
    card.flat.rotation.x = -Math.PI / 2;
    card.flat.rotation.y = 0;
    card.setFlip(0);
    return this.animations.animate(duration, (eased) => {
      card.group.position.lerpVectors(home.position, target.position, eased);
      card.group.quaternion.slerpQuaternions(home.quaternion, target.quaternion, eased);
      card.group.scale.setScalar(THREE.MathUtils.lerp(home.scale, target.scale, eased));
      card.flat.rotation.x = THREE.MathUtils.lerp(-Math.PI / 2, 0, eased);
      card.restLogo.visible = false;
      card.content.visible = true;
    }, easeInOutQuad, { ui: true }).then(() => {
      card.flat.rotation.x = 0;
      card.restLogo.visible = false;
      card.content.visible = true;
    });
  }

  async closeMenuCard(card, rulesCard = null, { parallelOverlayReturn = false } = {}) {
    this.clearMenuHover();
    this.pairActive = false;
    const pauseOverlay = this.pauseOverlay;
    const returnTogether = parallelOverlayReturn && pauseOverlay;
    const multiCardReturnDuration = 1.6;
    const animations = [
      returnTogether
        ? this.animateCardToRest(card, this.computeMenuHomePose(), multiCardReturnDuration)
        : (async () => {
            await this.flipMenuCard(card, 1, 0);
            await this.animateCardToRest(card, this.computeMenuHomePose());
          })()
    ];
    if (rulesCard && !this.rulesCardAtHome) {
      animations.push(returnTogether
        ? this.animateCardToRest(rulesCard, this.computeRulesHomePose(), multiCardReturnDuration)
        : (async () => {
            await this.flipMenuCard(rulesCard, 1, 0);
            await this.animateCardToRest(rulesCard, this.computeRulesHomePose());
          })());
    }
    if (returnTogether) {
      const underlying = pauseOverlay.card;
      const event = this.activeEvent;
      const pileKey = event && ({
        quiz: 'quiz',
        challenge: 'defi',
        bonus: 'bonus',
        trap: 'piege'
      })[event.type];
      const pile = pileKey && this.board.piles.find((candidate) => candidate.key === pileKey);
      if (!pile) throw new Error(`Impossible de retrouver la pile de l'événement ${event?.type ?? 'actif'}`);
      animations.push(this.playExit(underlying, pile, { ui: true, duration: multiCardReturnDuration }));
      animations.push(this.animateEventCardOffset(underlying, new THREE.Vector3(), multiCardReturnDuration));
    }
    await Promise.all(animations);
    if (pauseOverlay && !returnTogether) {
      const underlying = pauseOverlay.card;
      await this.animateEventCardOffset(underlying, new THREE.Vector3(), 0.5);
    }
    if (pauseOverlay) this.clearEventCardOffset();
    this.menuAtHome = true;
    this.rulesCardAtHome = Boolean(rulesCard);
    this.pairActive = false;
    this.panel = null;
    this.pendingChoice = null;
    this.pauseOverlay = null;
    this.cameraManager.setLocked(false);
  }

  async closeMenuCardAtHome(card) {
    const from = {
      position: card.group.position.clone(),
      quaternion: card.group.quaternion.clone(),
      scale: card.group.scale.x
    };
    const home = this.computeMenuHomePose();
    const lifted = home.position.clone().add(new THREE.Vector3(0, 2.2, 0));
    card.flat.rotation.x = 0;
    card.flat.rotation.y = 0;
    await this.playFlip(card, from.position, from.scale, 0, 1, true);
    await this.animateCardPose(card, {
      position: card.group.position.clone(),
      quaternion: card.group.quaternion.clone(),
      scale: card.group.scale.x
    }, {
      position: lifted,
      quaternion: home.quaternion,
      scale: from.scale
    }, 0.65, true);
    await this.animateCardPose(card, {
      position: lifted,
      quaternion: home.quaternion,
      scale: from.scale
    }, home, 0.55, true);
    card.flat.rotation.x = -Math.PI / 2;
    card.flat.rotation.y = 0;
    card.setFlip(0);
    card.content.visible = false;
    if (card.restLogo) card.restLogo.visible = true;
    this.menuAtHome = true;
    if (this.rulesCard) this.rulesCardAtHome = true;
    this.pairActive = false;
    this.panel = null;
    this.pendingChoice = null;
    this.cameraManager.setLocked(false);
  }

  async closeRulesCardAtHome(rulesCard) {
    await this.playFlip(rulesCard, rulesCard.group.position.clone(), rulesCard.group.scale.x, 1, 0, true);
    const home = this.computeRulesHomePose();
    const lifted = home.position.clone().add(new THREE.Vector3(0, 2.2, 0));
    await this.animateCardPose(rulesCard, {
      position: rulesCard.group.position.clone(),
      quaternion: rulesCard.group.quaternion.clone(),
      scale: rulesCard.group.scale.x
    }, {
      position: lifted,
      quaternion: home.quaternion,
      scale: rulesCard.group.scale.x
    }, 0.65, true);
    await this.animateCardPose(rulesCard, {
      position: lifted,
      quaternion: home.quaternion,
      scale: rulesCard.group.scale.x
    }, home, 0.55, true);
    rulesCard.flat.rotation.x = -Math.PI / 2;
    rulesCard.flat.rotation.y = 0;
    rulesCard.setFlip(0);
    rulesCard.content.visible = false;
    if (rulesCard.restLogo) rulesCard.restLogo.visible = true;
    this.rulesCardAtHome = true;
  }

  async openRulesOnly(menuCard, rulesCard) {
    this.cameraManager.setLocked(true);
    this.clearMenuHover();
    this.pendingChoice = null;
    const home = this.computeRulesHomePose();
    const eventCard = this.card && this.activeEvent ? this.card : null;
    let target = this.computeDisplay();
    this.rulesOverlay = null;
    if (eventCard) {
      const originalPose = {
        position: eventCard.group.position.clone(),
        quaternion: eventCard.group.quaternion.clone(),
        scale: eventCard.group.scale.x
      };
      const centerOffset = (CARD_SIZE.width * originalPose.scale + PAUSE_CARD_GAP) / 2;
      const gamePose = this.offsetScreenPose(originalPose, -centerOffset);
      target = this.offsetScreenPose(originalPose, centerOffset);
      this.rulesOverlay = { type: 'event', card: eventCard, originalPose, gamePose };
    }
    rulesCard.group.position.copy(home.position);
    rulesCard.group.quaternion.copy(home.quaternion);
    rulesCard.group.scale.setScalar(home.scale);
    rulesCard.flat.rotation.x = -Math.PI / 2;
    rulesCard.flat.rotation.y = 0;
    rulesCard.setFlip(0);
    rulesCard.content.visible = false;
    rulesCard.backContent.visible = false;
    rulesCard.restLogo.visible = true;
    if (rulesCard.group.parent !== this.scene) this.scene.add(rulesCard.group);
    this.rulesCardAtHome = false;
    this.panel = rulesCard;
    const animations = [this.animateCardFromRest(rulesCard, home, target)];
    if (this.rulesOverlay) {
      animations.push(this.animateEventCardOffset(
        this.rulesOverlay.card,
        this.rulesOverlay.gamePose.position
          .clone()
          .sub(this.rulesOverlay.originalPose.position),
        0.5
      ));
    }
    await Promise.all(animations);
    await this.flipMenuCard(rulesCard, 0, 1);
  }

  async closeRulesOnly(rulesCard) {
    this.clearMenuHover();
    await this.flipMenuCard(rulesCard, 1, 0);
    await this.animateCardToRest(rulesCard, this.computeRulesHomePose());
    if (this.rulesOverlay && this.rulesOverlay.type === 'event') {
      await this.animateEventCardOffset(this.rulesOverlay.card, new THREE.Vector3(), 0.5);
    }
    this.rulesCardAtHome = true;
    this.panel = null;
    this.pendingChoice = null;
    this.rulesOverlay = null;
    if (this.eventCardOffset) this.clearEventCardOffset();
    this.cameraManager.setLocked(false);
  }

  pairPose(side) {
    const base = this.computeDisplay();
    const camera = this.cameraManager.camera;
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
    const distance = camera.position.distanceTo(base.position);
    const visibleHeight = 2 * distance * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    const visibleWidth = visibleHeight * camera.aspect;
    const scale = Math.min(
      base.scale * 0.9,
      Math.max(0.01, (visibleWidth * 0.88 - 0.45) / (CARD_SIZE.width * 2))
    );
    const offset = CARD_SIZE.width * scale / 2 + 0.225;
    const position = base.position.clone().addScaledVector(right, side * offset);
    return {
      position,
      quaternion: base.quaternion.clone(),
      scale
    };
  }

  async openRulesPair(menuCard, rulesCard) {
    this.clearMenuHover();
    this.rulesCard = rulesCard;
    this.pairActive = false;
    this.menuAtHome = false;
    this.rulesCardAtHome = false;
    this.panel = null;
    this.pendingChoice = null;
    const rulesHome = this.computeRulesHomePose();
    rulesCard.group.position.copy(rulesHome.position);
    rulesCard.group.quaternion.copy(rulesHome.quaternion);
    rulesCard.group.scale.setScalar(rulesHome.scale);
    rulesCard.flat.rotation.x = -Math.PI / 2;
    rulesCard.flat.rotation.y = 0;
    rulesCard.content.visible = false;
    rulesCard.backContent.visible = false;
    rulesCard.restLogo.visible = true;
    rulesCard.setFlip(0);
    if (rulesCard.group.parent !== this.scene) this.scene.add(rulesCard.group);

    if (this.pauseOverlay) {
      const eventCard = this.pauseOverlay.card;
      const menuFrom = {
        position: menuCard.group.position.clone(),
        quaternion: menuCard.group.quaternion.clone(),
        scale: menuCard.group.scale.x
      };
      const originalPose = this.pauseOverlay.originalPose;
      const camera = this.cameraManager.camera;
      const distance = camera.position.distanceTo(originalPose.position);
      const visibleHeight = 2 * distance * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
      const visibleWidth = visibleHeight * camera.aspect;
      const eventWidth = this.getCardHomeMetrics(eventCard).width * originalPose.scale;
      const sideWidth = Math.max(
        this.getCardHomeMetrics(menuCard).width,
        this.getCardHomeMetrics(rulesCard).width
      );
      const availableSideWidth = Math.max(
        0.01 * sideWidth,
        (visibleWidth - eventWidth - 2 * PAUSE_CARD_GAP - visibleWidth * 0.1) / 2
      );
      const sideScale = Math.min(
        menuFrom.scale,
        this.computeDisplay().scale,
        availableSideWidth / sideWidth
      );
      const centerOffset = eventWidth / 2 + PAUSE_CARD_GAP + sideWidth * sideScale / 2;
      const trioShift = Math.min(PAUSE_CARD_GAP * 2, visibleWidth * 0.035);
      const eventPose = this.offsetScreenPose(originalPose, trioShift);
      const menuLeft = this.offsetScreenPose(originalPose, -centerOffset + trioShift);
      menuLeft.scale = sideScale;
      const rulesRight = this.offsetScreenPose(originalPose, centerOffset + trioShift);
      rulesRight.scale = sideScale;
      this.rulesOverlay = {
        type: 'pause',
        eventCard,
        eventOffsetFrom: this.getEventCardOffsetGroup(eventCard).position.clone(),
        eventOffset: eventPose.position.clone().sub(originalPose.position),
        menuFrom,
        menuCard,
        menuPose: menuLeft
      };

      menuCard.flat.rotation.x = 0;
      menuCard.setFlip(1);
      menuCard.content.visible = false;
      menuCard.backContent.visible = true;
      menuCard.restLogo.visible = false;
      await Promise.all([
        this.animateCardPose(menuCard, menuFrom, menuLeft, 0.9, true),
        this.animateEventCardOffset(eventCard, this.rulesOverlay.eventOffset, 0.9),
        this.animateCardFromRest(rulesCard, rulesHome, rulesRight, 0.9)
      ]);
      await this.flipMenuCard(rulesCard, 0, 1);
      this.pairActive = true;
      return;
    }

    const boardRight = new THREE.Vector3(1, 0, 0)
      .applyQuaternion(this.board.group.getWorldQuaternion(new THREE.Quaternion()));
    const cameraRight = new THREE.Vector3(1, 0, 0)
      .applyQuaternion(this.cameraManager.camera.quaternion);
    const screenAlignment = boardRight.dot(cameraRight) < 0 ? -1 : 1;
    const menuLeft = this.pairPose(-screenAlignment);
    const rulesRight = this.pairPose(screenAlignment);
    const menuFrom = {
      position: menuCard.group.position.clone(),
      quaternion: menuCard.group.quaternion.clone(),
      scale: menuCard.group.scale.x
    };
    menuCard.flat.rotation.x = 0;
    menuCard.setFlip(1);
    menuCard.content.visible = false;
    menuCard.backContent.visible = true;
    menuCard.restLogo.visible = false;
    await Promise.all([
      this.animateCardPose(menuCard, menuFrom, menuLeft, 0.9, true),
      this.animateCardFromRest(rulesCard, rulesHome, rulesRight, 0.9)
    ]);
    await this.flipMenuCard(rulesCard, 0, 1);
    this.pairActive = true;
  }

  async closeRulesPair(menuCard, rulesCard) {
    this.clearMenuHover();
    this.pairActive = false;
    const rulesHome = this.computeRulesHomePose();
    if (this.rulesOverlay && this.rulesOverlay.type === 'pause') {
      const { eventCard, eventOffsetFrom, menuFrom, menuPose } = this.rulesOverlay;
      await this.animateCardToRest(rulesCard, rulesHome, 0.9);
      await Promise.all([
        this.animateCardPose(menuCard, menuPose, menuFrom, 0.5, true),
        this.animateEventCardOffset(eventCard, eventOffsetFrom, 0.5)
      ]);
      this.menuAtHome = false;
      this.rulesCardAtHome = true;
      this.panel = menuCard;
      this.pendingChoice = null;
      this.rulesOverlay = null;
      return;
    }

    const menuFrom = {
      position: menuCard.group.position.clone(),
      quaternion: menuCard.group.quaternion.clone(),
      scale: menuCard.group.scale.x
    };
    const menuDisplay = this.computeDisplay();
    await Promise.all([
      this.animateCardToRest(rulesCard, rulesHome, 0.9),
      this.animateCardPose(menuCard, menuFrom, menuDisplay, 0.9, true)
    ]);
    this.menuAtHome = false;
    this.rulesCardAtHome = true;
    this.panel = menuCard;
    this.pendingChoice = null;
  }

  // Apparition en 3 temps : 1) la carte du dessus SE LÈVE de la pile, 2) elle vole vers la caméra
  // en se redressant (face "?" visible), 3) elle se RETOURNE pour montrer le contenu au verso.
  async playEntry(card, pile) {
    const start = this.topPose(pile);
    card.group.position.copy(start.position);
    card.group.quaternion.copy(start.quaternion);
    card.group.scale.setScalar(1);
    pile.topCard.hide(); // la carte de la pile est remplacée par la carte de l'événement, identique

    // 1) Levée verticale, avec une petite oscillation
    const lifted = start.position.clone().add(new THREE.Vector3(0, LIFT_HEIGHT, 0));
    const wobble = new THREE.Quaternion();
    await this.animations.animate(0.6, (eased, t) => {
      card.group.position.lerpVectors(start.position, lifted, eased);
      wobble.setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.sin(Math.PI * t) * 0.2);
      card.group.quaternion.copy(wobble).multiply(start.quaternion);
    }, easeOutCubic, { ui: true });

    // 2) Vol vers la caméra : la carte se redresse et grandit
    const target = this.computeDisplay();
    await this.animations.animate(0.8, (eased, t) => {
      card.group.position.lerpVectors(lifted, target.position, eased);
      card.group.quaternion.slerpQuaternions(start.quaternion, target.quaternion, eased);
      card.group.scale.setScalar(THREE.MathUtils.lerp(1, target.scale, easeOutBack(t)));
    }, easeInOutQuad, { ui: true });

    // 3) Retournement : la carte pivote de 180° et révèle le contenu
    await this.playFlip(card, target.position, target.scale, 0, 1, true);
  }

  // Retournement de la carte devant la caméra (de `from` à `to` : 0 = recto, 1 = verso).
  // Pendant le demi-tour, la carte s'avance un peu vers la caméra et grossit légèrement.
  playFlip(card, basePosition, baseScale, from, to, ui = false, duration = 0.9) {
    const toCamera = this.cameraManager.camera.position.clone().sub(basePosition).normalize();
    return this.animations.animate(duration, (eased, t) => {
      const bump = Math.sin(Math.PI * t);
      card.setFlip(THREE.MathUtils.lerp(from, to, eased));
      card.group.position.copy(basePosition).addScaledVector(toCamera, bump * 1.2);
      card.group.scale.setScalar(baseScale * (1 + 0.1 * bump));
    }, easeInOutQuad, { ui });
  }

  // Fermeture en sens inverse : la carte se retourne sur le "?", revient au-dessus de la pile puis s'y repose
  async playExit(card, pile, { ui = false, duration = null } = {}) {
    const flipDuration = duration === null ? 0.9 : duration * 0.45;
    const flightDuration = duration === null ? 0.7 : duration * 0.35;
    const landingDuration = duration === null ? 0.4 : duration * 0.2;
    await this.playFlip(card, card.group.position.clone(), card.group.scale.x, 1, 0, ui, flipDuration);

    const from = {
      position: card.group.position.clone(),
      quaternion: card.group.quaternion.clone(),
      scale: card.group.scale.x
    };
    const up = new THREE.Vector3(0, LIFT_HEIGHT, 0);

    // Retour au-dessus de la pile (on suit la carte du dessus, qui flotte)
    await this.animations.animate(flightDuration, (eased) => {
      const top = this.topPose(pile);
      card.group.position.lerpVectors(from.position, top.position.add(up), eased);
      card.group.quaternion.slerpQuaternions(from.quaternion, top.quaternion, eased);
      card.group.scale.setScalar(THREE.MathUtils.lerp(from.scale, 1, eased));
    }, easeInOutQuad, { ui });

    // Descente : la carte se repose sur la pile
    await this.animations.animate(landingDuration, (eased) => {
      const top = this.topPose(pile);
      card.group.position.lerpVectors(top.position.clone().add(up), top.position, eased);
    }, easeInOutQuad, { ui });

    pile.topCard.show();
  }
}
