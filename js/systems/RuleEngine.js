// Règles du jeu (sans aucun objet 3D, donc testables seules).
// Gérés pour l'instant : quiz, défis et finale. Bonus, pièges et portails viendront ensuite.

import { MEMORY_ERROR_PENALTY } from '../data/challenges.js';

export const QUIZ_CORRECT_POINTS = 100;
export const QUIZ_WRONG_POINTS = -25;
export const CHALLENGE_POINTS = 150;
export const FINAL_POINTS = 250;
export const BONUS_POINTS = 75;
export const BONUS_LIFE_FALLBACK_POINTS = 50; // bonus de vie à 5 vies : points à la place
export const TRAP_POINTS = -50;
export const MOVE_CELLS = 2;
export const LAST_BONUS_INDEX = 28; // un bonus de déplacement ne dépasse jamais la case 29 (indice 28)

// Effets possibles, tirés avec la même probabilité
export const BONUS_TYPES = ['points', 'life', 'move'];
export const TRAP_TYPES = ['life', 'points', 'move', 'skip'];

export class RuleEngine {
  // Quel événement déclenche la case d'arrivée ? (null = aucun événement géré pour l'instant)
  resolveLanding(tileType) {
    switch (tileType) {
      case 'quiz': return 'quiz';
      case 'defi': return 'challenge';
      case 'finale': return 'final';
      case 'bonus': return 'bonus';
      case 'piege': return 'trap';
      default: return null;
    }
  }

  // Quiz : +100 si bonne réponse, -25 sinon (le score ne passe jamais sous 0)
  resolveQuiz(playerState, correct) {
    const before = playerState.score;
    playerState.addScore(correct ? QUIZ_CORRECT_POINTS : QUIZ_WRONG_POINTS);
    return {
      correct,
      points: correct ? QUIZ_CORRECT_POINTS : QUIZ_WRONG_POINTS,
      applied: playerState.score - before, // variation réellement appliquée
      score: playerState.score
    };
  }

  // Défi : réussite +150 points, échec -1 vie (à 0 vie, le joueur est éliminé)
  resolveChallenge(playerState, success) {
    const before = playerState.score;
    if (success) playerState.addScore(CHALLENGE_POINTS);
    else playerState.loseLife(1);
    return this.buildOutcome(playerState, success, success ? CHALLENGE_POINTS : 0, before);
  }

  randomBonusType() {
    return BONUS_TYPES[Math.floor(Math.random() * BONUS_TYPES.length)];
  }

  randomTrapType() {
    return TRAP_TYPES[Math.floor(Math.random() * TRAP_TYPES.length)];
  }

  // Bonus (coffre) : +75 points, ou +1 vie (50 points à la place si déjà 5 vies), ou avancer de 2 cases.
  // Le déplacement n'est pas appliqué ici (il concerne le pion 3D) : il est renvoyé dans `move`.
  resolveBonus(playerState, type = this.randomBonusType()) {
    const before = playerState.score;
    const result = { category: 'bonus', type, fallback: false, move: 0 };
    if (type === 'points') {
      playerState.addScore(BONUS_POINTS);
    } else if (type === 'life') {
      if (!playerState.gainLife()) {
        playerState.addScore(BONUS_LIFE_FALLBACK_POINTS);
        result.fallback = true;
      }
    } else {
      result.move = MOVE_CELLS;
    }
    return this.finishEvent(playerState, result, before);
  }

  // Piège : -1 vie, ou -50 points, ou reculer de 2 cases, ou passer son prochain tour
  resolveTrap(playerState, type = this.randomTrapType()) {
    const before = playerState.score;
    const result = { category: 'trap', type, fallback: false, move: 0 };
    if (type === 'life') playerState.loseLife(1);
    else if (type === 'points') playerState.addScore(TRAP_POINTS);
    else if (type === 'move') result.move = -MOVE_CELLS;
    else playerState.skipTurn = true;
    return this.finishEvent(playerState, result, before);
  }

  finishEvent(playerState, result, scoreBefore) {
    return {
      ...result,
      applied: playerState.score - scoreBefore,
      score: playerState.score,
      lives: playerState.lives,
      eliminated: playerState.status === 'eliminated'
    };
  }

  // Case d'arrivée après un bonus de déplacement : 2 cases plus loin, au plus la case 29
  bonusDestination(position) {
    return Math.max(position, Math.min(position + MOVE_CELLS, LAST_BONUS_INDEX));
  }

  // Case d'arrivée après un recul : 2 cases en arrière, jamais avant le dernier checkpoint activé
  trapDestination(position, checkpoint) {
    return Math.max(position - MOVE_CELLS, Math.min(checkpoint, position));
  }

  // Jeu de mémoire : chaque erreur fait perdre des points tout de suite (le score ne passe jamais sous 0)
  resolveMemoryError(playerState) {
    const before = playerState.score;
    playerState.addScore(-MEMORY_ERROR_PENALTY);
    return { applied: playerState.score - before, score: playerState.score };
  }

  // Finale : réussite +250 points (le jeu enregistre alors l'arrivée) ;
  // échec -1 vie et nouvelle tentative au prochain tour, sans lancer le dé.
  resolveFinal(playerState, success) {
    const before = playerState.score;
    if (success) {
      playerState.addScore(FINAL_POINTS);
      playerState.finalPending = false;
    } else {
      playerState.loseLife(1);
      playerState.finalPending = playerState.canPlay;
    }
    return this.buildOutcome(playerState, success, success ? FINAL_POINTS : 0, before);
  }

  buildOutcome(playerState, success, points, scoreBefore) {
    return {
      success,
      points,
      applied: playerState.score - scoreBefore,
      score: playerState.score,
      lives: playerState.lives,
      lifeLost: !success,
      eliminated: playerState.status === 'eliminated'
    };
  }
}
