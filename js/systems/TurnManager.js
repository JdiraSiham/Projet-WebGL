import { PHASE } from '../core/GameState.js';

// Gère à qui c'est le tour et la phase en cours, à partir du GameState (aucun objet 3D ici).
// Solo : le même joueur rejoue à chaque tour. Duo : les joueurs alternent.
export class TurnManager {
  constructor(state) {
    this.state = state;
    this.skipped = []; // joueurs dont le tour vient d'être passé (pénalité d'un piège)
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
  // Un joueur qui doit « passer un tour » est sauté une fois : sa pénalité est alors consommée.
  // Si plus personne ne peut jouer, la partie est terminée.
  nextTurn() {
    const players = this.state.players;
    const count = players.length;
    this.skipped = [];

    if (!players.some((p) => p.canPlay)) {
      this.state.phase = PHASE.FINISHED;
      return;
    }

    let index = this.state.activePlayerIndex;
    for (let guard = 0; guard < count * 3; guard++) {
      index = (index + 1) % count;
      const player = players[index];
      if (!player.canPlay) continue;
      if (player.skipTurn) {
        player.skipTurn = false;
        this.skipped.push(player);
        continue;
      }
      this.state.activePlayerIndex = index;
      this.state.phase = PHASE.READY;
      return;
    }
  }

  // Retourne (et vide) la liste des joueurs dont le tour vient d'être passé
  takeSkipped() {
    const list = this.skipped;
    this.skipped = [];
    return list;
  }
}
