// État du jeu : données pures et sérialisables, SANS aucun objet Three.js.
// Les règles peuvent ainsi être testées sans scène 3D, et l'état peut être sauvegardé tel quel.
// Règle de victoire : le premier joueur qui arrive sur la dernière case gagne (plus de score, plus de vies).

import { TILE_COUNT } from '../data/boardConfig.js';

export const MODE = { SOLO: 'solo', DUO: 'duo' };

// Phases d'une partie : MENU -> READY -> ROLLING -> MOVING -> EVENT -> READY ... -> FINISHED
export const PHASE = {
  MENU: 'MENU',
  READY: 'READY',
  ROLLING: 'ROLLING',
  MOVING: 'MOVING',
  EVENT: 'EVENT',
  PAUSED: 'PAUSED',
  FINISHED: 'FINISHED'
};

export const SAVE_VERSION = 3;

// En solo : nombre d'échecs au défi de la case 30 qui font perdre la partie
export const MAX_FINAL_FAILURES = 3;

// Joueurs disponibles : en solo on utilise le premier, en duo les deux
export const PLAYER_PRESETS = [
  { id: 1, name: 'Joueur 1', color: 0x1e63e9 }, // pion bleu
  { id: 2, name: 'Joueur 2', color: 0xe53935 }  // pion rouge
];

// État individuel d'un joueur (aucun lien avec le pion 3D)
export class PlayerState {
  // status : 'active' | 'finished'
  // rollModifier : null | 'double' | 'half' (effet d'une carte, valable pour le prochain lancer seulement)
  constructor({
    id, name, color,
    position = 0, checkpoint = 0,
    skipTurn = false, rollModifier = null, status = 'active', finalFailures = 0
  }) {
    this.id = id;
    this.name = name;
    this.color = color;
    this.position = Math.min(Math.max(position, 0), TILE_COUNT - 1); // indice de case : 0 = case 1, 29 = case 30
    this.checkpoint = checkpoint; // dernier checkpoint activé (0 = le départ)
    this.skipTurn = skipTurn;     // pénalité « passer un tour »
    this.rollModifier = rollModifier;
    this.status = status;
    this.finalFailures = finalFailures; // défis ratés sur la case 30
  }

  get finished() {
    return this.status === 'finished';
  }

  // Un joueur peut jouer tant qu'il n'est pas arrivé
  get canPlay() {
    return this.status === 'active';
  }

  // Lit (et consomme) l'effet du prochain lancer : null, 'double' ou 'half'
  takeRollModifier() {
    const modifier = this.rollModifier;
    this.rollModifier = null;
    return modifier;
  }

  serialize() {
    return {
      id: this.id, name: this.name, color: this.color,
      position: this.position, checkpoint: this.checkpoint,
      skipTurn: this.skipTurn, rollModifier: this.rollModifier, status: this.status,
      finalFailures: this.finalFailures
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
    this.winnerId = null;             // id du premier joueur arrivé
    this.defeat = false;              // solo : défaite après 3 défis finaux ratés
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

  get winner() {
    return this.winnerId === null ? null : this.getPlayer(this.winnerId);
  }

  // Un joueur atteint la dernière case : c'est le gagnant (le premier arrivé, une seule fois)
  recordArrival(player) {
    player.status = 'finished';
    if (this.winnerId === null) this.winnerId = player.id;
  }

  // Défi de la case 30 raté. Retourne le nombre d'essais restants en solo (0 = défaite), null en duo (illimité).
  recordFinalFailure(player) {
    player.finalFailures += 1;
    if (this.mode !== MODE.SOLO) return null;
    const left = Math.max(0, MAX_FINAL_FAILURES - player.finalFailures);
    if (left === 0) this.defeat = true;
    return left;
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
      winnerId: this.winnerId,
      defeat: this.defeat,
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
    state.winnerId = data.winnerId ?? null;
    state.defeat = data.defeat === true;
    const index = state.players.findIndex((p) => p.id === data.activePlayerId);
    state.activePlayerIndex = index >= 0 ? index : 0;
    // On ne reprend qu'un état stable : un lancer ou un déplacement interrompu redevient READY
    state.phase = data.phase === PHASE.FINISHED ? PHASE.FINISHED : PHASE.READY;
    return state;
  }
}
