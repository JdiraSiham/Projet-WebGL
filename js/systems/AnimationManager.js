// Gestionnaire central des animations : toutes les animations (dé, pions...) passent par ici,
// et avancent dans le même update(deltaTime) que le reste du jeu.

export const easeLinear = (t) => t;
export const easeInOutQuad = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
export const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);

export class AnimationManager {
  constructor() {
    this.tasks = [];
  }

  // Lance une animation de `duration` secondes.
  // onUpdate(valeurAdoucie, progressionBrute) est appelée à chaque image.
  // Retourne une Promise résolue à la fin : on peut donc écrire `await animations.animate(...)`.
  animate(duration, onUpdate, easing = easeInOutQuad) {
    return new Promise((resolve) => {
      this.tasks.push({ duration, elapsed: 0, onUpdate, easing, resolve });
    });
  }

  wait(seconds) {
    return this.animate(seconds, () => {}, easeLinear);
  }

  update(deltaTime) {
    for (const task of [...this.tasks]) {
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
