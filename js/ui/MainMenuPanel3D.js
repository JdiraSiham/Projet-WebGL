import { MenuPanel3D, COLORS, BIG, SMALL } from './MenuPanel3D.js';

// Indices des boutons : SOLO et 2 JOUEURS, puis les boutons secondaires dans l'ordre où ils sont donnés
export const MENU_CHOICE = { SOLO: 0, DUO: 1, FIRST_SECONDARY: 2 };

// Menu « modes » : plaque de titre, SOLO et 2 JOUEURS, et au plus deux boutons secondaires.
//  - menu de départ : secondary = [RÈGLES]
//  - pause          : secondary = [CONTINUER, RÈGLES]
//  - fin de partie  : aucun bouton secondaire, un sous-titre donne le résultat
// secondary : [{ label, icon }] avec icon = 'play' | 'book' | 'back'
// escapeSecondary : position (dans secondary) du bouton déclenché par Échap, ou null
export class MainMenuPanel3D extends MenuPanel3D {
  constructor(textFactory, { title = 'QUESTVERSE 3D', subtitle = null, secondary = [], escapeSecondary = null } = {}) {
    super(textFactory);
    const hasSecondary = secondary.length > 0;
    this.height = hasSecondary ? 9.2 : 7.0;
    this.content.position.y = hasSecondary ? -0.5 : -1.3;
    if (escapeSecondary !== null) this.escapeIndex = MENU_CHOICE.FIRST_SECONDARY + escapeSecondary;

    this.buildPlaque({ title, subtitle });
    this.addBigButton(MENU_CHOICE.SOLO, -BIG.x, 'SOLO', [COLORS.playerBlue]);
    this.addBigButton(MENU_CHOICE.DUO, BIG.x, '2 JOUEURS', [COLORS.playerBlue, COLORS.playerRed]);

    // Un seul bouton secondaire : centré ; deux : côte à côte
    secondary.forEach((spec, i) => {
      const x = secondary.length === 1 ? 0 : (i === 0 ? -SMALL.x : SMALL.x);
      this.addSmallButton(MENU_CHOICE.FIRST_SECONDARY + i, x, SMALL.y, spec.label, spec.icon);
    });
    this.finish();
  }
}
