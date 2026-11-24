// Règles du jeu (sans aucun objet 3D, donc testables seules).
//
// Règle d'or : le premier joueur qui arrive sur la dernière case gagne (ni score, ni vies).
// Quiz ou défi réussi  -> carte BONUS (jaune)  : avancer, rejouer, dé x2 ou rien.
// Quiz ou défi raté    -> carte DANGER (rouge) : reculer, passer un tour, dé /2, retour au checkpoint ou rien.
// Les cases bonus et piège du plateau tirent directement la carte correspondante.

import { PORTALS } from '../data/boardConfig.js';

export const STEP_BONUS = 3;      // bonus « avancer » : nombre de cases
export const STEP_PENALTY = 3;    // piège « reculer » : nombre de cases
export const LAST_BONUS_INDEX = 28; // un bonus de déplacement ne fait jamais arriver sur la case 30 (indice 29)

// Effets possibles, tirés avec la même probabilité parmi ceux qui ont un sens à cet instant
export const BONUS_TYPES = ['forward', 'extra', 'double', 'none'];
export const TRAP_TYPES = ['back', 'skip', 'slow', 'checkpoint', 'none'];

export class RuleEngine {
  // Quel événement déclenche la case d'arrivée ? (null = rien : départ, case normale, checkpoint, finale)
  resolveLanding(tileType) {
    switch (tileType) {
      case 'quiz': return 'quiz';
      case 'defi': return 'challenge';
      case 'bonus': return 'bonus';
      case 'piege': return 'trap';
      case 'portail': return 'portal';
      default: return null;
    }
  }

  pick(list) {
    return list[Math.floor(Math.random() * list.length)];
  }

  // Bonus : renvoie { category, type, move, extraTurn }
  //  - forward : avance de 3 cases (move > 0, appliqué par le jeu)
  //  - extra   : le joueur rejoue tout de suite (extraTurn)
  //  - double  : son prochain lancer compte double
  //  - none    : pas de chance, aucun bonus
  // solo : « rejouer » n'a aucun sens quand on joue seul, il n'est jamais tiré.
  resolveBonus(playerState, { solo = false, type = null } = {}) {
    const forwardDestination = this.bonusDestination(playerState.position);
    const available = BONUS_TYPES.filter((t) => {
      if (t === 'extra') return !solo;
      if (t === 'forward') return forwardDestination !== playerState.position;
      return true;
    });
    const chosen = type || this.pick(available);

    const result = { category: 'bonus', type: chosen, move: 0, extraTurn: false };
    if (chosen === 'forward') result.move = forwardDestination - playerState.position;
    else if (chosen === 'extra') result.extraTurn = true;
    else if (chosen === 'double') playerState.rollModifier = 'double';
    return result;
  }

  // Piège : renvoie { category, type, move, toCheckpoint, toStart }
  //  - back       : recule de 3 cases, jamais avant le dernier checkpoint (move < 0)
  //  - skip       : passe son prochain tour (duo seulement)
  //  - slow       : son prochain lancer est réduit de moitié
  //  - checkpoint : retour au dernier checkpoint activé (au départ si on n'a pas dépassé la case 10)
  //  - none       : de la chance, aucun danger
  resolveTrap(playerState, { solo = false, type = null } = {}) {
    const backDestination = this.trapDestination(playerState.position, playerState.checkpoint);
    const available = TRAP_TYPES.filter((t) => {
      if (t === 'skip') return !solo;
      if (t === 'back') return backDestination !== playerState.position;
      if (t === 'checkpoint') return playerState.checkpoint < playerState.position;
      return true;
    });
    const chosen = type || this.pick(available);

    const result = { category: 'trap', type: chosen, move: 0, toCheckpoint: false, toStart: false };
    if (chosen === 'back') {
      result.move = backDestination - playerState.position;
    } else if (chosen === 'skip') {
      playerState.skipTurn = true;
    } else if (chosen === 'slow') {
      playerState.rollModifier = 'half';
    } else if (chosen === 'checkpoint') {
      result.toCheckpoint = true;
      result.toStart = playerState.checkpoint === 0;
    }
    return result;
  }

  // Applique l'effet d'une carte « dé » sur une valeur lancée : double ou moitié (arrondie au-dessus, au moins 1)
  applyRollModifier(value, modifier) {
    if (modifier === 'double') return value * 2;
    if (modifier === 'half') return Math.max(1, Math.ceil(value / 2));
    return value;
  }

  // Case d'arrivée d'un portail (case 17 -> 19, case 26 -> 29). La téléportation ne déclenche aucun événement.
  portalDestination(index) {
    return PORTALS[index];
  }

  // Checkpoint : il s'active quand le joueur passe sur la case ou s'y arrête (individuel, jamais en arrière).
  // Retourne true si un nouveau checkpoint vient d'être activé.
  activateCheckpoint(playerState, tileType, index) {
    if (tileType !== 'checkpoint' || index <= playerState.checkpoint) return false;
    playerState.checkpoint = index;
    return true;
  }

  // Case d'arrivée après un bonus de déplacement : 3 cases plus loin, au plus la case 29
  bonusDestination(position) {
    return Math.max(position, Math.min(position + STEP_BONUS, LAST_BONUS_INDEX));
  }

  // Case d'arrivée après un recul : 3 cases en arrière, jamais avant le dernier checkpoint activé
  trapDestination(position, checkpoint) {
    return Math.max(position - STEP_PENALTY, Math.min(checkpoint, position));
  }
}
