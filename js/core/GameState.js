// État du jeu : données pures et sérialisables, SANS aucun objet Three.js.
// Les règles peuvent ainsi être testées sans scène 3D, et l'état peut être sauvegardé tel quel (étape 12).

import { TILE_COUNT } from '../data/boardConfig.js';

export const MODE = { SOLO: 'solo', DUO: 'duo' };

// Phases d'une partie : MENU -> READY -> ROLLING -> MOVING -> EVENT -> READY ... -> FINISHED
export const PHASE = {
  MENU: 'MENU',
  READY: 'READY',
  ROLLING: 'ROLLING',
  MOVING: 'MOVING',
  EVENT: 'EVENT',
  FINISHED: 'FINISHED'
};

export const INITIAL_LIVES = 3;
export const MAX_LIVES = 5;
export const SAVE_VERSION = 1;

// Joueurs disponibles : en solo on utilise le premier, en duo les deux
export const PLAYER_PRESETS = [
  { id: 1, name: 'Joueur 1', color: 0x1e63e9 }, // pion bleu
  { id: 2, name: 'Joueur 2', color: 0xe53935 }  // pion rouge
];

// État individuel d'un joueur (aucun lien avec le pion 3D)
export class PlayerState {
  // status : 'active' | 'finished' | 'eliminated' | 'abandoned'
  constructor({
    id, name, color,
    position = 0, score = 0, lives = INITIAL_LIVES, checkpoint = 0,
    skipTurn = false, status = 'active', rank = null
  }) {
    this.id = id;
    this.name = name;
    this.color = color;
    this.position = Math.min(Math.max(position, 0), TILE_COUNT - 1); // indice de case : 0 = case 1, 29 = case 30
    this.score = Math.max(0, score);
    this.lives = Math.min(Math.max(lives, 0), MAX_LIVES);
    this.checkpoint = checkpoint;
    this.skipTurn = skipTurn; // pénalité "passer un tour" (étape des pièges)
    this.status = status;
    this.rank = rank;         // rang d'arrivée (1 = premier à avoir fini)
  }

  get finished() {
    return this.status === 'finished';
  }

  // Un joueur peut jouer tant qu'il n'est ni arrivé, ni éliminé, ni parti
  get canPlay() {
    return this.status === 'active';
  }

  addScore(points) {
    this.score = Math.max(0, this.score + points); // le score ne passe jamais sous 0
  }

  loseLife(count = 1) {
    this.lives = Math.max(0, this.lives - count);
    if (this.lives === 0) this.status = 'eliminated';
  }

  // Retourne true si la vie a été ajoutée (false si déjà au maximum)
  gainLife(count = 1) {
    if (this.lives >= MAX_LIVES) return false;
    this.lives = Math.min(MAX_LIVES, this.lives + count);
    return true;
  }

  finish(rank) {
    this.status = 'finished';
    this.rank = rank;
  }

  serialize() {
    return {
      id: this.id, name: this.name, color: this.color,
      position: this.position, score: this.score, lives: this.lives, checkpoint: this.checkpoint,
      skipTurn: this.skipTurn, status: this.status, rank: this.rank
    };
  }

  static restore(data) {
    return new PlayerState(data);
  }
}

// État global de la partie
export class GameState {
  constructor() {
    this.mode = null;                 // MODE.SOLO ou MODE.DUO (null tant qu'on est au menu)
    this.phase = PHASE.MENU;
    this.players = [];                // PlayerState
    this.activePlayerIndex = 0;
    this.finishOrder = [];            // ids des joueurs dans l'ordre d'arrivée
  }

  // Nouvelle partie : 1 joueur en solo, 2 en duo, tous sur la case de départ
  static createNew(mode) {
    if (!Object.values(MODE).includes(mode)) throw new Error(`Mode inconnu : ${mode}`);
    const state = new GameState();
    state.mode = mode;
    const count = mode === MODE.SOLO ? 1 : 2;
    state.players = PLAYER_PRESETS.slice(0, count).map((preset) => new PlayerState(preset));
    state.phase = PHASE.READY;
    return state;
  }

  get activePlayer() {
    return this.players[this.activePlayerIndex];
  }

  get activePlayerId() {
    return this.activePlayer ? this.activePlayer.id : null;
  }

  // Un joueur atteint la case 30 : on mémorise son rang d'arrivée
  recordArrival(player) {
    this.finishOrder.push(player.id);
    player.finish(this.finishOrder.length);
  }

  getPlayer(id) {
    return this.players.find((p) => p.id === id);
  }

  serialize() {
    return {
      version: SAVE_VERSION,
      mode: this.mode,
      phase: this.phase,
      activePlayerId: this.activePlayerId,
      finishOrder: [...this.finishOrder],
      players: this.players.map((p) => p.serialize())
    };
  }

  static restore(data) {
    const modes = Object.values(MODE);
    const expected = data && data.mode === MODE.SOLO ? 1 : 2;
    if (!data || data.version !== SAVE_VERSION || !modes.includes(data.mode)
      || !Array.isArray(data.players) || data.players.length !== expected) {
      throw new Error('Sauvegarde invalide');
    }
    const state = new GameState();
    state.mode = data.mode;
    state.players = data.players.map((p) => PlayerState.restore(p));
    state.finishOrder = Array.isArray(data.finishOrder) ? [...data.finishOrder] : [];
    const index = state.players.findIndex((p) => p.id === data.activePlayerId);
    state.activePlayerIndex = index >= 0 ? index : 0;
    // On ne reprend qu'un état stable : un lancer ou un déplacement interrompu redevient READY
    state.phase = data.phase === PHASE.FINISHED ? PHASE.FINISHED : PHASE.READY;
    return state;
  }
}
