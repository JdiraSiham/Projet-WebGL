import { MODE } from '../core/GameState.js';
import { MainMenuPanel3D, MENU_CHOICE } from './MainMenuPanel3D.js';

// Écran de fin de partie : même style que le menu. Le titre donne le résultat, SOLO et 2 JOUEURS relancent une partie.
export class EndScreen3D {
  constructor(events) {
    this.events = events;
  }

  // { title, subtitle } du résultat (défaite en solo, sinon victoire du premier arrivé)
  static result(state) {
    if (state.defeat) return { title: 'DÉFAITE', subtitle: 'Tu as raté trois fois le défi de la case 30' };
    if (state.mode === MODE.SOLO) return { title: 'VICTOIRE !', subtitle: 'Tu as réussi le défi de la case 30 !' };
    const name = state.winner ? state.winner.name : 'Partie';
    return { title: `${name.toUpperCase()} GAGNE !`, subtitle: 'Premier à réussir le défi de la case 30' };
  }

  // Retourne 'solo' ou 'duo'
  async show(state) {
    const { title, subtitle } = EndScreen3D.result(state);
    const panel = new MainMenuPanel3D(this.events.textFactory, { title, subtitle });
    const index = await this.events.askChoice({ panel, fraction: [0.9, 0.85] });
    return index === MENU_CHOICE.DUO ? 'duo' : 'solo';
  }
}
