// Données et générateurs des défis (sans aucun objet 3D, donc testables seuls).

export const CRYSTAL_COUNT = 4;                 // nombre de cristaux sur la carte
export const CRYSTAL_LENGTH = { 1: 2, 2: 3, 3: 4 }; // longueur de la séquence selon la zone
export const FINAL_LENGTH = 5;                  // la finale demande 5 cristaux

// Formes utilisées par les suites de symboles
export const SHAPES = ['cercle', 'carre', 'triangle', 'etoile', 'losange'];

// Suites par niveau : chaque lettre est une forme ; la DERNIÈRE lettre est la réponse à trouver.
export const SYMBOL_PATTERNS = {
  1: ['ABABAB', 'AABAAB'],
  2: ['ABCABC', 'ABBABB'],
  3: ['ABCDABCD', 'AABBAABB']
};

function pick(list, rng) {
  return list[Math.floor(rng() * list.length)];
}

function shuffle(list, rng) {
  const copy = [...list];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

// Séquence de cristaux à mémoriser : jamais deux fois le même d'affilée (pour bien voir chaque éclair)
export function makeCrystalSequence(length, rng = Math.random) {
  const sequence = [];
  for (let i = 0; i < length; i++) {
    let next;
    do {
      next = Math.floor(rng() * CRYSTAL_COUNT);
    } while (i > 0 && next === sequence[i - 1]);
    sequence.push(next);
  }
  return sequence;
}

// Suite de symboles à compléter : { sequence, answer, choices, correctIndex }
export function makeSymbolPuzzle(level, rng = Math.random) {
  const pattern = pick(SYMBOL_PATTERNS[level], rng);
  const letters = [...new Set(pattern)];
  const shapes = shuffle(SHAPES, rng);
  const shapeOf = {};
  letters.forEach((letter, i) => { shapeOf[letter] = shapes[i]; });

  const full = [...pattern].map((letter) => shapeOf[letter]);
  const answer = full[full.length - 1];
  const sequence = full.slice(0, -1);

  // 4 propositions : la bonne forme + 3 autres formes, dans un ordre aléatoire
  const others = shuffle(SHAPES.filter((shape) => shape !== answer), rng).slice(0, 3);
  const choices = shuffle([answer, ...others], rng);
  return { sequence, answer, choices, correctIndex: choices.indexOf(answer) };
}
