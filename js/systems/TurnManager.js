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

  // Passe au joueur suivant qui peut encore jouer (en solo : le même joueur).
  // Si plus personne ne peut jouer, la partie est terminée.
  nextTurn() {
    const players = this.state.players;
    const count = players.length;
    for (let i = 1; i <= count; i++) {
      const index = (this.state.activePlayerIndex + i) % count;
      if (players[index].canPlay) {
        this.state.activePlayerIndex = index;
        this.state.phase = PHASE.READY;
        return;
      }
    }
    this.state.phase = PHASE.FINISHED;
  }
}
