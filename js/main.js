import { Game } from './core/Game.js';

const container = document.getElementById('game-container');
const game = new Game(container);

// La police 3D est chargée avant le démarrage (elle est nécessaire aux numéros et aux cartes)
try {
  await game.init();
  game.start().catch((error) => console.error(error)); // le menu principal 3D attend le choix du joueur
} catch (error) {
  console.error(error);
  const message = document.createElement('div');
  message.className = 'load-error';
  message.textContent = error.message;
  document.body.append(message);
}
