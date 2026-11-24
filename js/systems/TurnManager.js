import { PHASE } from '../core/GameState.js';

// Gère à qui c'est le tour et la phase en cours, à partir du GameState (aucun objet 3D ici).
// Solo : le même joueur rejoue à chaque tour. Duo : les joueurs alternent.
export class TurnManager {
  constructor(state) {
    this.state = state;
  }

  get currentPlayer() {
    return this.state.activePlayer;
  }

  get isFinished() {
    return this.state.phase === PHASE.FINISHED;
  }

  // Un seul lancer par tour : on ne peut lancer que si la phase est READY
  canRoll() {
    return this.state.phase === PHASE.READY;
  }

  startRolling() {
    this.state.phase = PHASE.ROLLING;
  }

  startMoving() {
    this.state.phase = PHASE.MOVING;
  }

  // Une carte d'événement est ouverte : le dé est bloqué jusqu'à sa résolution
  startEvent() {
    this.state.phase = PHASE.EVENT;
  }

  // Le même joueur rejoue (carte bonus « rejouer »)
  repeatTurn() {
    this.state.phase = PHASE.READY;
  }

  // Passe au joueur suivant (en solo : le même joueur).
  // Un tour sauté consomme une seule pénalité; les callbacks encadrent son éventuelle présentation.
  // Dès qu'un joueur a gagné (ou que le joueur solo a perdu), la partie est terminée.
  async nextTurn(onSkip = null, onSkipped = null) {
    if (this.state.winnerId !== null || this.state.defeat) {
      this.state.phase = PHASE.FINISHED;
      return;
    }

    const players = this.state.players;
    const count = players.length;
    let index = this.state.activePlayerIndex;
    for (let guard = 0; guard < count * 3; guard++) {
      index = (index + 1) % count;
      const player = players[index];
      if (!player.canPlay) continue;
      if (player.skipTurn) {
        const pending = onSkip ? await onSkip(player) : null;
        player.skipTurn = false;
        if (onSkipped) await onSkipped(pending);
        continue;
      }
      this.state.activePlayerIndex = index;
      this.state.phase = PHASE.READY;
      return;
    }
    this.state.phase = PHASE.READY;
  }
}
