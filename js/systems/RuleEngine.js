// Règles du jeu (sans aucun objet 3D, donc testables seules).
// Pour l'instant : quiz uniquement. Défis, bonus, pièges, portails viendront aux étapes suivantes.

export const QUIZ_CORRECT_POINTS = 100;
export const QUIZ_WRONG_POINTS = -25;

export class RuleEngine {
  // Quel événement déclenche la case d'arrivée ? (null = aucun événement géré pour l'instant)
  resolveLanding(tileType) {
    return tileType === 'quiz' ? 'quiz' : null;
  }

  // Applique le résultat d'un quiz : +100 si bonne réponse, -25 sinon (le score ne passe jamais sous 0)
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
}
