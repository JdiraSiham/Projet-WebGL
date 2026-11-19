// Règles du jeu (sans aucun objet 3D, donc testables seules).
// Gérés pour l'instant : quiz, défis et finale. Bonus, pièges et portails viendront ensuite.

export const QUIZ_CORRECT_POINTS = 100;
export const QUIZ_WRONG_POINTS = -25;
export const CHALLENGE_POINTS = 150;
export const FINAL_POINTS = 250;

export class RuleEngine {
  // Quel événement déclenche la case d'arrivée ? (null = aucun événement géré pour l'instant)
  resolveLanding(tileType) {
    switch (tileType) {
      case 'quiz': return 'quiz';
      case 'defi': return 'challenge';
      case 'finale': return 'final';
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
