// Gestionnaire central des animations : toutes les animations (dé, pions...) passent par ici,
// et avancent dans le même update(deltaTime) que le reste du jeu.

export const easeLinear = (t) => t;
export const easeInOutQuad = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
export const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);
// Dépasse légèrement la valeur finale puis revient : effet de "rebond" à l'apparition
export const easeOutBack = (t) => {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
};

export class AnimationManager {
  constructor() {
    this.tasks = [];
    this.paused = false; // en pause, seules les animations d'interface (ui: true) continuent
  }

  // Lance une animation de `duration` secondes.
  // onUpdate(valeurAdoucie, progressionBrute) est appelée à chaque image.
  // Retourne une Promise résolue à la fin : on peut donc écrire `await animations.animate(...)`.
  // ui : true pour les animations des menus, qui doivent continuer pendant la pause
  animate(duration, onUpdate, easing = easeInOutQuad, { ui = false } = {}) {
    return new Promise((resolve) => {
      this.tasks.push({ duration, elapsed: 0, onUpdate, easing, resolve, ui });
    });
  }

  wait(seconds, options) {
    return this.animate(seconds, () => {}, easeLinear, options);
  }

  // Abandonne toutes les animations en cours sans les terminer (retour au menu principal)
  clear() {
    this.tasks = [];
  }

  update(deltaTime) {
    for (const task of [...this.tasks]) {
      if (this.paused && !task.ui) continue;
      task.elapsed += deltaTime;
      const t = Math.min(task.elapsed / task.duration, 1);
      task.onUpdate(task.easing(t), t);
      if (t >= 1) {
        this.tasks.splice(this.tasks.indexOf(task), 1);
        task.resolve();
      }
    }
  }

  get isBusy() {
    return this.tasks.length > 0;
  }
}
