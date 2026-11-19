import * as THREE from 'three';
import { QuizCard } from '../cards/QuizCard.js';
import { ChallengeCard } from '../cards/ChallengeCard.js';
import { PuzzleCard } from '../cards/PuzzleCard.js';
import { MemoryCard } from '../cards/MemoryCard.js';
import {
  CRYSTAL_LENGTH, FINAL_LENGTH, makeCrystalSequence, makeSymbolPuzzle,
  makeSlidePuzzle, makeMemoryDeck, MemoryGame, pickChallengeKind
} from '../data/challenges.js';
import { MEMORY_ERROR_POINTS } from './RuleEngine.js';
import { CARD_SIZE } from '../cards/Card3D.js';
import { easeOutCubic, easeInOutQuad, easeOutBack, easeLinear } from './AnimationManager.js';

const DISPLAY_FOCUS = new THREE.Vector3(0, 3, 0); // le centre du plateau
const SCREEN_FRACTION = 0.68;                     // la carte occupe ~68 % de la hauteur de l'écran
const LIFT_HEIGHT = 3.2;                          // hauteur de la levée au-dessus de la pile
const FEEDBACK_SECONDS = 2;

// Ouvre et ferme les événements du plateau (pour l'instant : la carte de quiz).
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
    this.pendingAnswer = null; // fonction qui reçoit l'indice de la réponse cliquée

    // Les réponses de la carte sont cliquables tant qu'aucune n'a été validée
    input.addInteraction({
      isActive: () => this.card !== null && this.pendingAnswer !== null,
      getObjects: () => this.card.clickableMeshes,
      onHover: (hit) => { if (this.card) this.card.setHover(hit ? this.answerIndexOf(hit) : null); },
      onClick: (hit) => this.submit(this.answerIndexOf(hit))
    });
  }

  // Remonte de l'objet touché (texte ou bouton) jusqu'au groupe de la réponse
  answerIndexOf(object) {
    let current = object;
    while (current && current.userData.answerIndex === undefined) current = current.parent;
    return current ? current.userData.answerIndex : null;
  }

  // Attend le prochain clic sur un objet de la carte : retourne l'indice de la réponse cliquée
  waitAnswer() {
    return new Promise((resolve) => { this.pendingAnswer = resolve; });
  }

  // Un seul clic est pris en compte : après le premier, plus aucune réponse n'est attendue
  submit(index) {
    if (index === null || !this.pendingAnswer) return;
    const resolve = this.pendingAnswer;
    this.pendingAnswer = null;
    resolve(index);
  }

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


  // Défi (cases défi, ou finale si final = true). Le type est tiré au hasard entre 3 jeux :
  // classique (Cristaux ou Symboles), Puzzle chronométré, Mémoire (la finale est toujours une épreuve de 5 cristaux).
  // `kind` permet de forcer un type : 'crystals', 'symbols', 'puzzle' ou 'memory'.
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
    const chosen = final ? 'crystals' : (kind || pickChallengeKind());
    let card;
    let sequence = null;
    let puzzle = null;
    let slide = null;
    let deck = null;
    if (chosen === 'crystals') {
      card = new ChallengeCard(this.textFactory);
      sequence = makeCrystalSequence(final ? FINAL_LENGTH : CRYSTAL_LENGTH[level]);
      card.showCrystals(sequence.length, { final });
    } else if (chosen === 'symbols') {
      card = new ChallengeCard(this.textFactory);
      puzzle = makeSymbolPuzzle(level);
      card.showSymbols(puzzle);
    } else if (chosen === 'puzzle') {
      card = new PuzzleCard(this.textFactory, this.animations);
      slide = makeSlidePuzzle(level);
      card.showPuzzle(slide);
    } else {
      card = new MemoryCard(this.textFactory, this.animations);
      deck = makeMemoryDeck(level);
      card.showMemory(deck);
    }
    this.card = card;
    this.activeEvent = { type: 'challenge', kind: chosen, final, sequence, puzzle, slide, deck, step: 0 };
    this.scene.add(card.group);

    const pile = this.board.piles.find((p) => p.key === 'defi');
    await this.playEntry(card, pile);

    let success;
    let extra = {}; // informations en plus pour l'affichage du résultat (erreurs du jeu de mémoire...)
    if (chosen === 'crystals') {
      success = await this.playCrystals(card, sequence);
    } else if (chosen === 'symbols') {
      const index = await this.waitAnswer();
      success = card.submitSymbol(index);
    } else if (chosen === 'puzzle') {
      success = await this.playPuzzle(card, slide);
    } else {
      extra = await this.playMemory(card, deck, playerState);
      success = true; // le jeu de mémoire se termine toujours par la réussite : seules les erreurs coûtent des points
    }

    const outcome = final
      ? this.rules.resolveFinal(playerState, success)
      : this.rules.resolveChallenge(playerState, success);
    card.showFeedback(this.challengeText({ ...outcome, ...extra, kind: chosen }, final), success);
    await this.animations.wait(FEEDBACK_SECONDS);

    await this.playExit(card, pile);
    card.dispose();
    this.card = null;
    this.activeEvent = null;
    return { kind: chosen, final, ...outcome, ...extra };
  }

  // Cristaux : les cristaux s'allument un par un, puis le joueur clique dans le même ordre.
  // Une erreur arrête l'épreuve tout de suite. Retourne true si toute la séquence est réussie.
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
      if (index !== sequence[step]) return false;
      card.setProgress(step + 1, sequence.length);
    }
    return true;
  }

  // Puzzle : le temps s'écoule (barre + secondes) ; le joueur doit remettre les tuiles dans l'ordre avant la fin.
  // Le chrono utilise l'AnimationManager : il avance avec le reste du jeu (et ne continue pas si le jeu est en pause).
  // Retourne true si le puzzle est résolu à temps, false si le temps est écoulé.
  async playPuzzle(card, slide) {
    const run = { over: false };

    const timeUp = this.animations.animate(slide.time, (eased, t) => {
      if (!run.over) card.setTime(slide.time * (1 - t), slide.time);
    }, easeLinear).then(() => false);

    const solved = this.waitPuzzleSolved(card, run);

    const success = await Promise.race([timeUp, solved]); // le premier des deux qui se termine
    run.over = true;
    this.pendingAnswer = null; // plus aucun clic attendu
    card.lock();
    if (success) card.markSolved();
    return success;
  }

  // Enchaîne les clics sur les tuiles jusqu'à ce que le puzzle soit résolu (ou que le temps soit écoulé)
  async waitPuzzleSolved(card, run) {
    while (!run.over) {
      const id = await this.waitAnswer();
      const result = await card.slideTile(id);
      if (result.solved) return true;
    }
    return false;
  }

  // Mémoire : le joueur retourne deux cartes à la fois. Une erreur retire des points TOUT DE SUITE
  // (le score ne passe jamais sous 0). L'épreuve se termine quand toutes les paires sont trouvées.
  // Retourne { errors, penalty } (penalty = points réellement perdus).
  async playMemory(card, deck, playerState) {
    const game = new MemoryGame(deck);
    let penalty = 0;
    card.setStatus(`Trouve les paires !\nChaque erreur : -${MEMORY_ERROR_POINTS} points`);

    while (!game.done) {
      this.activeEvent.step = game.pairsFound;
      const index = await this.waitAnswer();
      const result = game.flip(index);
      if (result.type === 'ignore') continue;

      await card.flipTile(index, true);
      if (result.type === 'first') continue;

      if (result.type === 'match') {
        card.markMatched(result.a, result.b);
        card.setProgress(game.pairsFound, deck.length / 2);
        continue;
      }

      // Erreur : points perdus, on laisse voir les deux cartes puis on les recache
      const mistake = this.rules.resolveMemoryError(playerState);
      penalty -= mistake.applied;
      card.setStatus(`Erreur ! -${MEMORY_ERROR_POINTS} points\nScore : ${mistake.score}`);
      await this.animations.wait(0.8);
      await Promise.all([card.flipTile(result.a, false), card.flipTile(result.b, false)]);
    }
    card.setStatus('Toutes les paires\nsont trouvées !');
    return { errors: game.errors, penalty };
  }

  challengeText({ success, applied, score, lives, kind, errors, penalty }, final) {
    const name = final ? 'Finale' : 'Défi';
    if (success) {
      const lines = [`${name} réussi${final ? 'e' : ''} ! +${applied} points`];
      if (kind === 'memory') lines.push(`Erreurs : ${errors} (-${penalty} points)`);
      lines.push(`Score : ${score}`);
      return lines.join('\n');
    }
    if (kind === 'puzzle') {
      return lives === 0
        ? 'Temps écoulé ! -1 vie\nPlus aucune vie : éliminé'
        : `Temps écoulé ! -1 vie\nVies restantes : ${lives}`;
    }
    if (lives === 0) return `${name} raté${final ? 'e' : ''} ! -1 vie\nPlus aucune vie : éliminé`;
    return final
      ? `Finale ratée ! -1 vie\nVies : ${lives} - tu retentes au prochain tour`
      : `Défi raté ! -1 vie\nVies restantes : ${lives}`;
  }

  feedbackText({ correct, applied, score }) {
    const sign = applied > 0 ? `+${applied}` : `${applied}`;
    return correct
      ? `Bonne réponse ! ${sign} points\nScore : ${score}`
      : `Mauvaise réponse ! ${sign} points\nScore : ${score}`;
  }

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
  // en se redressant (face "?" visible), 3) elle se RETOURNE pour montrer la question au verso.
  async playEntry(card, pile) {
    const start = this.topPose(pile);
    card.group.position.copy(start.position);
    card.group.quaternion.copy(start.quaternion);
    card.group.scale.setScalar(1);
    pile.topCard.hide(); // la carte de la pile est remplacée par la carte de quiz, identique

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

    // 3) Retournement : la carte pivote de 180° et révèle la question
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
