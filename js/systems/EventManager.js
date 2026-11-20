import * as THREE from 'three';
import { QuizCard } from '../cards/QuizCard.js';
import { ChallengeCard } from '../cards/ChallengeCard.js';
import { BonusCard } from '../cards/BonusCard.js';
import { TrapCard } from '../cards/TrapCard.js';
import { SlidePuzzle3D } from '../cards/SlidePuzzle3D.js';
import { MemoryBoard3D } from '../cards/MemoryBoard3D.js';
import { CARD_SIZE } from '../cards/Card3D.js';
import { makeBox } from '../world/Materials.js';
import {
  CRYSTAL_LENGTH, FINAL_LENGTH, PUZZLE_LEVELS, MEMORY_LEVELS, MEMORY_ERROR_PENALTY,
  makeCrystalSequence, makeSymbolPuzzle, makeSlidePuzzle, makeMemoryDeck, canSlide, slide, isSolved
} from '../data/challenges.js';
import { easeOutCubic, easeInOutQuad, easeOutBack, easeLinear } from './AnimationManager.js';

const DISPLAY_FOCUS = new THREE.Vector3(0, 3, 0); // le centre du plateau
const SCREEN_FRACTION = 0.68;                     // la carte occupe ~68 % de la hauteur de l'écran
const LIFT_HEIGHT = 3.2;                          // hauteur de la levée au-dessus de la pile
const FEEDBACK_SECONDS = 2;

// Ouvre et ferme les événements du plateau (quiz et défis).
// Une seule carte peut être ouverte à la fois (activeEvent).
export class EventManager {
  constructor({ scene, cameraManager, textFactory, animations, input, board, rules, questions }) {
    this.scene = scene;
    this.cameraManager = cameraManager;
    this.textFactory = textFactory;
    this.animations = animations;
    this.board = board;
    this.rules = rules;
    this.questions = questions;

    this.activeEvent = null;
    this.card = null;
    this.pendingAnswer = null; // fonction qui reçoit l'indice de l'objet cliqué

    // Les objets cliquables de la carte (réponses, cristaux, tuiles, cartes mémoire)
    input.addInteraction({
      isActive: () => this.card !== null && this.pendingAnswer !== null,
      getObjects: () => this.card.clickableMeshes,
      onHover: (hit) => { if (this.card) this.card.setHover(hit ? this.answerIndexOf(hit) : null); },
      onClick: (hit) => this.submit(this.answerIndexOf(hit))
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
  // Retourne { correct, points, applied, score }.
  async runQuiz(playerState, level) {
    const question = this.questions.draw(level);
    const card = new QuizCard(this.textFactory);
    this.card = card;
    this.activeEvent = { type: 'quiz', question };
    card.showQuestion(question);
    this.scene.add(card.group);

    const pile = this.board.piles.find((p) => p.key === 'quiz');
    await this.playEntry(card, pile);

    const index = await this.waitAnswer();

    const correct = card.submitAnswer(index);
    const outcome = this.rules.resolveQuiz(playerState, correct);
    card.showFeedback(this.feedbackText(outcome), correct);
    await this.animations.wait(FEEDBACK_SECONDS);

    await this.playExit(card, pile);
    card.dispose();
    this.card = null;
    this.activeEvent = null;
    return outcome;
  }

  // ---------------------------------------------------------------- Défis

  // Choisit le jeu d'une case défi au hasard parmi les 3 : Cristaux/Symboles, Puzzle chronométré, Mémoire
  pickKind() {
    const game = Math.floor(Math.random() * 3);
    if (game === 0) return Math.random() < 0.5 ? 'crystals' : 'symbols';
    return game === 1 ? 'puzzle' : 'memory';
  }

  // Défi (cases défi, ou finale si final = true : toujours 5 cristaux).
  // kind : 'crystals' | 'symbols' | 'puzzle' | 'memory' (tirage au hasard si absent).
  // La caméra est figée tant que la carte est affichée.
  async openChallenge(playerState, { level, final = false, kind = null }) {
    this.cameraManager.setLocked(true);
    try {
      return await this.runChallenge(playerState, { level, final, kind });
    } finally {
      this.cameraManager.setLocked(false);
    }
  }

  async runChallenge(playerState, { level, final, kind }) {
    const chosen = final ? 'crystals' : (kind || this.pickKind());
    const card = new ChallengeCard(this.textFactory);
    this.card = card;

    const game = this.prepareGame(card, chosen, level, final);
    this.activeEvent = { type: 'challenge', kind: chosen, final, step: 0, ...game.data };
    this.scene.add(card.group);

    const pile = this.board.piles.find((p) => p.key === 'defi');
    await this.playEntry(card, pile);

    const result = await game.play(playerState); // { success, extra }

    const outcome = final
      ? this.rules.resolveFinal(playerState, result.success)
      : this.rules.resolveChallenge(playerState, result.success);
    card.showFeedback(this.challengeText(outcome, final, result.extra), result.success);
    await this.animations.wait(FEEDBACK_SECONDS);

    await this.playExit(card, pile);
    card.dispose();
    this.card = null;
    this.activeEvent = null;
    return { kind: chosen, final, ...outcome };
  }

  // Prépare l'affichage du jeu sur la carte. Retourne { data, play } :
  // data = informations du jeu (séquence, grille...), play = la partie elle-même (asynchrone).
  prepareGame(card, kind, level, final) {
    if (kind === 'crystals') {
      const sequence = makeCrystalSequence(final ? FINAL_LENGTH : CRYSTAL_LENGTH[level]);
      card.showCrystals(sequence.length, { final });
      return { data: { sequence }, play: () => this.playCrystals(card, sequence) };
    }

    if (kind === 'symbols') {
      const puzzle = makeSymbolPuzzle(level);
      card.showSymbols(puzzle);
      return {
        data: { puzzle },
        play: async () => {
          const index = await this.waitAnswer();
          return { success: card.submitSymbol(index) };
        }
      };
    }

    if (kind === 'puzzle') {
      const config = PUZZLE_LEVELS[level];
      const slideData = { board: makeSlidePuzzle(config.moves), config }; // board est mis à jour à chaque coup
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
  // Chaque erreur fait perdre des points tout de suite ; trop d'erreurs = défi raté.
  async playMemory(card, component, memoryData, playerState) {
    const { deck, config } = memoryData;
    const matched = new Set();
    let first = null;
    let found = 0;
    let errors = 0;

    const showStatus = () => card.setStatus(
      `Paires : ${found}/${config.pairs} - Erreurs : ${errors}/${config.maxErrors}\nChaque erreur : -${MEMORY_ERROR_PENALTY} points`
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
        this.rules.resolveMemoryError(playerState); // -10 points (jamais sous 0)
        component.markWrong(first, second);
        await this.animations.wait(0.8);
        await Promise.all([component.flip(first, false, this.animations), component.flip(second, false, this.animations)]);
        component.clearWrong(first, second);
      }
      first = null;
      showStatus();
    }

    const success = found === config.pairs;
    const lost = errors * MEMORY_ERROR_PENALTY;
    let extra = null;
    if (!success) extra = "Trop d'erreurs !";
    else if (errors > 0) extra = `Erreurs : ${errors} (-${lost} points)`;
    return { success, extra };
  }

  // Texte du bandeau de résultat d'un défi : 3 lignes au maximum
  challengeText({ success, applied, score, lives }, final, extra = null) {
    const name = final ? 'Finale' : 'Défi';
    const feminine = final ? 'e' : '';
    const lines = [];
    if (success) {
      lines.push(`${name} réussi${feminine} ! +${applied} points`);
      if (extra) lines.push(extra);
      lines.push(`Score : ${score}`);
    } else {
      lines.push(`${name} raté${feminine} ! -1 vie`);
      if (extra) lines.push(extra);
      if (lives === 0) lines.push('Plus aucune vie : éliminé');
      else lines.push(final ? `Vies : ${lives} - tu retentes au prochain tour` : `Vies restantes : ${lives}`);
    }
    return lines.join('\n');
  }

  feedbackText({ correct, applied, score }) {
    const sign = applied > 0 ? `+${applied}` : `${applied}`;
    return correct
      ? `Bonne réponse ! ${sign} points\nScore : ${score}`
      : `Mauvaise réponse ! ${sign} points\nScore : ${score}`;
  }

  // ---------------------------------------------------------------- Bonus (carte jaune) et pièges (carte rouge)

  // Carte jaune : le joueur clique sur le coffre 3D pour l'ouvrir. L'effet est tiré au hasard
  // (points, vie ou déplacement) ; `type` permet de le forcer (tests). La caméra est figée pendant la carte.
  async openBonus(playerState, { type = null } = {}) {
    this.cameraManager.setLocked(true);
    try {
      return await this.runBonus(playerState, type);
    } finally {
      this.cameraManager.setLocked(false);
    }
  }

  async runBonus(playerState, forcedType) {
    const card = new BonusCard(this.textFactory);
    this.card = card;
    this.activeEvent = { type: 'bonus' };
    card.showChest();
    this.scene.add(card.group);

    const pile = this.board.piles.find((p) => p.key === 'bonus');
    await this.playEntry(card, pile);

    await this.waitAnswer(); // clic sur le coffre
    const outcome = this.rules.resolveBonus(playerState, forcedType || undefined);
    const view = this.bonusView(outcome);
    await card.openChest(view.icon, view.label, this.animations);
    card.showFeedback(this.bonusText(outcome), 0x2e9e4f);
    await this.animations.wait(FEEDBACK_SECONDS);

    await this.playExit(card, pile);
    card.dispose();
    this.card = null;
    this.activeEvent = null;
    return outcome;
  }

  // Carte rouge : le panneau de danger tremble, puis la conséquence du piège est révélée.
  async openTrap(playerState, { type = null } = {}) {
    this.cameraManager.setLocked(true);
    try {
      return await this.runTrap(playerState, type);
    } finally {
      this.cameraManager.setLocked(false);
    }
  }

  async runTrap(playerState, forcedType) {
    const card = new TrapCard(this.textFactory);
    this.card = card;
    this.activeEvent = { type: 'trap' };
    card.showSign();
    this.scene.add(card.group);

    const pile = this.board.piles.find((p) => p.key === 'piege');
    await this.playEntry(card, pile);

    await card.alert(this.animations);
    const outcome = this.rules.resolveTrap(playerState, forcedType || undefined);
    const view = this.trapView(outcome);
    await card.reveal(view.icon, false, view.label, this.animations);
    card.showFeedback(this.trapText(outcome), 0x2b2b3a);
    await this.animations.wait(FEEDBACK_SECONDS);

    await this.playExit(card, pile);
    card.dispose();
    this.card = null;
    this.activeEvent = null;
    return outcome;
  }

  // Icône et libellé de ce que contient le coffre
  bonusView({ type, fallback }) {
    if (type === 'points') return { icon: 'points', label: '+75 points' };
    if (type === 'life') return fallback ? { icon: 'points', label: '+50 points' } : { icon: 'life', label: '+1 vie' };
    return { icon: 'move', label: '+2 cases' };
  }

  bonusText({ type, fallback, score, lives }) {
    if (type === 'points') return `Bonus ! +75 points\nScore : ${score}`;
    if (type === 'life') {
      return fallback
        ? `Bonus ! Vies au maximum\n+50 points à la place\nScore : ${score}`
        : `Bonus ! +1 vie\nVies : ${lives}`;
    }
    return 'Bonus ! Tu avances de 2 cases';
  }

  trapView({ type }) {
    if (type === 'life') return { icon: 'life', label: '-1 vie' };
    if (type === 'points') return { icon: 'points', label: '-50 points' };
    if (type === 'move') return { icon: 'move', label: 'Recule de 2 cases' };
    return { icon: 'skip', label: 'Tour passé' };
  }

  trapText({ type, score, lives, eliminated }) {
    if (type === 'life') return `Piège ! -1 vie\n${eliminated ? 'Plus aucune vie : éliminé' : `Vies restantes : ${lives}`}`;
    if (type === 'points') return `Piège ! -50 points\nScore : ${score}`;
    if (type === 'move') return 'Piège ! Tu recules de 2 cases';
    return 'Piège ! Tu passeras ton prochain tour';
  }

  // Message 3D court devant la caméra (ex. « Joueur 1 passe son tour »)
  async showNotice(text, seconds = 1.5) {
    const camera = this.cameraManager.camera;
    const label = this.textFactory.create(text, { size: 0.5, color: 0xffffff, depth: 0.05 });
    const width = this.textFactory.measure(text, label.userData.size) + 1.0;
    const pill = makeBox(width, 1.1, 0.12, 0x2b2b3a, { radius: 0.2, roughness: 0.5 });
    pill.position.z = 0.06;
    label.position.z = 0.12;
    const group = new THREE.Group();
    group.add(pill, label);

    const position = camera.position.clone().lerp(DISPLAY_FOCUS, 0.5);
    const distance = camera.position.distanceTo(position);
    const visibleHeight = 2 * distance * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    const scale = Math.min((visibleHeight * camera.aspect * 0.6) / width, (visibleHeight * 0.14) / 1.1);
    const helper = new THREE.Object3D();
    helper.position.copy(position);
    helper.lookAt(camera.position);
    group.position.copy(position);
    group.quaternion.copy(helper.quaternion);
    group.scale.setScalar(0.001);
    this.scene.add(group);

    await this.animations.animate(0.3, (eased, t) => group.scale.setScalar(Math.max(0.001, scale * easeOutBack(t))), easeOutCubic);
    await this.animations.wait(seconds);
    await this.animations.animate(0.25, (eased) => group.scale.setScalar(Math.max(0.001, scale * (1 - eased))), easeInOutQuad);
    this.scene.remove(group);
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
    }, easeOutCubic);

    // 2) Vol vers la caméra : la carte se redresse et grandit
    const target = this.computeDisplay();
    await this.animations.animate(0.8, (eased, t) => {
      card.group.position.lerpVectors(lifted, target.position, eased);
      card.group.quaternion.slerpQuaternions(start.quaternion, target.quaternion, eased);
      card.group.scale.setScalar(THREE.MathUtils.lerp(1, target.scale, easeOutBack(t)));
    }, easeInOutQuad);

    // 3) Retournement : la carte pivote de 180° et révèle le contenu
    await this.playFlip(card, target.position, target.scale, 0, 1);
  }

  // Retournement de la carte devant la caméra (de `from` à `to` : 0 = recto, 1 = verso).
  // Pendant le demi-tour, la carte s'avance un peu vers la caméra et grossit légèrement.
  playFlip(card, basePosition, baseScale, from, to) {
    const toCamera = this.cameraManager.camera.position.clone().sub(basePosition).normalize();
    return this.animations.animate(0.9, (eased, t) => {
      const bump = Math.sin(Math.PI * t);
      card.setFlip(THREE.MathUtils.lerp(from, to, eased));
      card.group.position.copy(basePosition).addScaledVector(toCamera, bump * 1.2);
      card.group.scale.setScalar(baseScale * (1 + 0.1 * bump));
    }, easeInOutQuad);
  }

  // Fermeture en sens inverse : la carte se retourne sur le "?", revient au-dessus de la pile puis s'y repose
  async playExit(card, pile) {
    await this.playFlip(card, card.group.position.clone(), card.group.scale.x, 1, 0);

    const from = {
      position: card.group.position.clone(),
      quaternion: card.group.quaternion.clone(),
      scale: card.group.scale.x
    };
    const up = new THREE.Vector3(0, LIFT_HEIGHT, 0);

    // Retour au-dessus de la pile (on suit la carte du dessus, qui flotte)
    await this.animations.animate(0.7, (eased) => {
      const top = this.topPose(pile);
      card.group.position.lerpVectors(from.position, top.position.add(up), eased);
      card.group.quaternion.slerpQuaternions(from.quaternion, top.quaternion, eased);
      card.group.scale.setScalar(THREE.MathUtils.lerp(from.scale, 1, eased));
    }, easeInOutQuad);

    // Descente : la carte se repose sur la pile
    await this.animations.animate(0.4, (eased) => {
      const top = this.topPose(pile);
      card.group.position.lerpVectors(top.position.clone().add(up), top.position, eased);
    }, easeInOutQuad);

    pile.topCard.show();
  }
}
