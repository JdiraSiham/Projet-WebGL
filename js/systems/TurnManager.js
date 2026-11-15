// Gère à qui c'est le tour et la phase en cours.
// Phases : READY (le dé peut être lancé) -> ROLLING (dé en l'air) -> MOVING (pion en mouvement) -> READY...

export const PHASE = {
  READY: 'READY',
  ROLLING: 'ROLLING',
  MOVING: 'MOVING',
  FINISHED: 'FINISHED'
};

export class TurnManager {
  constructor(players) {
    this.players = players;
    this.currentPlayerIndex = 0;
    this.phase = PHASE.READY;
  }

  get currentPlayer() {
    return this.players[this.currentPlayerIndex];
  }

  get isFinished() {
    return this.phase === PHASE.FINISHED;
  }

  // Un seul lancer par tour : on ne peut lancer que si la phase est READY
  canRoll() {
    return this.phase === PHASE.READY;
  }

  startRolling() {
    this.phase = PHASE.ROLLING;
  }

  startMoving() {
    this.phase = PHASE.MOVING;
  }

  // Passe au joueur suivant qui n'a pas terminé ; si tout le monde a fini, la partie s'arrête
  nextTurn() {
    const count = this.players.length;
    for (let i = 1; i <= count; i++) {
      const index = (this.currentPlayerIndex + i) % count;
      if (!this.players[index].finished) {
        this.currentPlayerIndex = index;
        this.phase = PHASE.READY;
        return;
      }
    }
    this.phase = PHASE.FINISHED;
  }
}
