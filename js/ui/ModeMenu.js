import { MODE } from '../core/GameState.js';

// Menu de choix du mode (Solo / 2 joueurs), affiché au démarrage et à la fin d'une partie.
// Version provisoire en HTML : il sera remplacé par le Menu3D (menus 3D) à l'étape 11.
export class ModeMenu {
  constructor(parent, { onSelect }) {
    this.root = document.createElement('div');
    this.root.className = 'mode-menu';
    this.root.hidden = true;

    const panel = document.createElement('div');
    panel.className = 'mode-panel';

    this.title = document.createElement('h1');
    this.message = document.createElement('p');

    const buttons = document.createElement('div');
    buttons.className = 'mode-buttons';
    buttons.append(
      this.createButton('Solo', MODE.SOLO, onSelect),
      this.createButton('2 joueurs', MODE.DUO, onSelect)
    );

    panel.append(this.title, this.message, buttons);
    this.root.append(panel);
    parent.append(this.root);
  }

  createButton(label, mode, onSelect) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = label;
    button.addEventListener('click', () => onSelect(mode));
    return button;
  }

  show({ title = 'QuestVerse 3D', message = 'Choisis un mode de jeu' } = {}) {
    this.title.textContent = title;
    this.message.textContent = message;
    this.root.hidden = false;
  }

  hide() {
    this.root.hidden = true;
  }
}
