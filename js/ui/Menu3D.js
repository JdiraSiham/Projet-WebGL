import { MenuCard3D } from './MenuCard3D.js';
import { RulesCard3D } from './RulesCard3D.js';
// Les menus de départ et de pause partagent une carte persistante.
export class Menu3D {
  constructor(events) {
    this.events = events;
    this.card = new MenuCard3D(events.textFactory);
    this.rulesCard = new RulesCard3D(events.textFactory);
  }

  async chooseOnCard(mode, title = null) {
    this.card.configure(mode, true, title);
    await this.events.openMenuCard(
      this.card,
      this.rulesCard,
      mode === 'pause' ? this.events.card : null
    );

    menuLoop: for (;;) {
      let index = await this.events.waitChoice();
      await this.card.playPress(index, this.events.animations);
      const rulesIndex = mode === 'pause' ? 3 : 2;
      if (index === rulesIndex) {
        await this.events.openRulesPair(this.card, this.rulesCard);
        for (;;) {
          const pairChoice = await this.events.waitChoice();
          if (pairChoice === 100) {
            await this.rulesCard.playPress(0, this.events.animations);
            await this.events.closeRulesPair(this.card, this.rulesCard);
            continue menuLoop;
          }
          if (pairChoice === rulesIndex) {
            await this.card.playPress(pairChoice, this.events.animations);
            continue;
          }
          await this.card.playPress(pairChoice, this.events.animations);
          index = pairChoice;
          break;
        }
      }

      await this.events.closeMenuCard(this.card, this.rulesCard, {
        parallelOverlayReturn: mode === 'pause' && index !== 0
      });
      if (mode === 'main') return index === 1 ? 'duo' : 'solo';
      if (index === 0) return 'resume';
      return index === 2 ? 'duo' : 'solo';
    }
  }

  // Menu de départ : la carte quitte la scène après le choix du mode.
  async showMain() {
    return this.chooseOnCard('main');
  }

  // Fin de partie : même carte et mêmes choix que le menu principal, avec le résultat en titre.
  async showEnd(title) {
    return this.chooseOnCard('main', title);
  }

  // Pause : CONTINUER, SOLO, 2 JOUEURS et RÈGLES. Retourne 'resume', 'solo' ou 'duo'.
  async showPause() {
    return this.chooseOnCard('pause');
  }

  async showRulesFromHome() {
    if (this.rulesHomeOpen) return;
    this.rulesHomeOpen = true;
    try {
      await this.events.openRulesOnly(this.card, this.rulesCard);
      await this.events.waitChoice();
      await this.rulesCard.playPress(0, this.events.animations);
      await this.events.closeRulesOnly(this.rulesCard);
    } finally {
      this.rulesHomeOpen = false;
    }
  }
}
