// Tire les questions selon le niveau (la zone), sans répétition tant qu'il reste des questions inédites.
export class QuestionBank {
  constructor(questions) {
    this.questions = questions;
    this.used = new Set();
  }

  // Nouvelle partie : toutes les questions redeviennent disponibles
  reset() {
    this.used.clear();
  }

  // Retourne une question du niveau demandé, avec les propositions mélangées
  draw(level) {
    const pool = this.questions.filter((q) => q.level === level);
    let available = pool.filter((q) => !this.used.has(q.id));
    if (available.length === 0) {
      // Toutes les questions du niveau ont été posées : on repart de zéro pour ce niveau
      pool.forEach((q) => this.used.delete(q.id));
      available = pool;
    }
    const question = available[Math.floor(Math.random() * available.length)];
    this.used.add(question.id);
    return QuestionBank.shuffle(question);
  }

  // Mélange les 4 propositions et recalcule l'indice de la bonne réponse
  static shuffle(question) {
    const order = question.choices.map((choice, index) => ({ choice, correct: index === question.correctIndex }));
    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [order[i], order[j]] = [order[j], order[i]];
    }
    return {
      id: question.id,
      level: question.level,
      text: question.text,
      choices: order.map((o) => o.choice),
      correctIndex: order.findIndex((o) => o.correct)
    };
  }
}
