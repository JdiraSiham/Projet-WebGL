// Données et générateurs des défis (sans aucun objet 3D, donc testables seuls).

export const CRYSTAL_COUNT = 4;                 // nombre de cristaux sur la carte
export const CRYSTAL_LENGTH = { 1: 2, 2: 3, 3: 4 }; // longueur de la séquence selon la zone
export const FINAL_LENGTH = 5;                  // la finale demande 5 cristaux

// Formes utilisées par les suites de symboles
export const SHAPES = ['cercle', 'carre', 'triangle', 'etoile', 'losange'];

// Formes du jeu de mémoire (une de plus que les suites de symboles, pour avoir jusqu'à 6 paires)
export const MEMORY_SHAPES = [...SHAPES, 'croix'];

// Puzzle coulissant : temps limité (en secondes) et nombre de coups de mélange selon la zone
export const PUZZLE_LEVELS = {
  1: { time: 70, moves: 10 },
  2: { time: 60, moves: 14 },
  3: { time: 50, moves: 18 }
};
export const PUZZLE_SIZE = 3; // grille 3 x 3 : tuiles 1 à 8 et une case vide (0)

// Jeu de mémoire : paires à retrouver, colonnes de la grille et erreurs autorisées selon la zone.
// Chaque erreur fait perdre MEMORY_ERROR_PENALTY points ; trop d'erreurs = défi raté.
export const MEMORY_LEVELS = {
  1: { pairs: 3, cols: 3, maxErrors: 8 },
  2: { pairs: 4, cols: 4, maxErrors: 7 },
  3: { pairs: 6, cols: 4, maxErrors: 6 }
};
export const MEMORY_ERROR_PENALTY = 10;

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

// ---------- Puzzle coulissant (grille 3 x 3 : tableau de 9 valeurs, 0 = case vide) ----------

const SOLVED_BOARD = [1, 2, 3, 4, 5, 6, 7, 8, 0];

export function isSolved(board) {
  return board.every((value, i) => value === SOLVED_BOARD[i]);
}

// Positions voisines (haut, bas, gauche, droite) d'une position de la grille
function neighbours(pos) {
  const col = pos % PUZZLE_SIZE;
  const row = Math.floor(pos / PUZZLE_SIZE);
  const list = [];
  if (row > 0) list.push(pos - PUZZLE_SIZE);
  if (row < PUZZLE_SIZE - 1) list.push(pos + PUZZLE_SIZE);
  if (col > 0) list.push(pos - 1);
  if (col < PUZZLE_SIZE - 1) list.push(pos + 1);
  return list;
}

// Une tuile peut glisser si elle est juste à côté de la case vide
export function canSlide(board, pos) {
  return board[pos] !== 0 && neighbours(pos).includes(board.indexOf(0));
}

// Retourne le nouveau plateau après avoir glissé la tuile située à la position pos
export function slide(board, pos) {
  const next = [...board];
  const empty = next.indexOf(0);
  [next[pos], next[empty]] = [next[empty], next[pos]];
  return next;
}

// Mélange en partant du puzzle résolu et en jouant des coups réels : le résultat est toujours résoluble.
// On évite de défaire le coup précédent, et on ne renvoie jamais un puzzle déjà résolu.
export function makeSlidePuzzle(moves, rng = Math.random) {
  let board = [...SOLVED_BOARD];
  let previousEmpty = -1;
  for (let i = 0; i < moves || isSolved(board); i++) {
    const empty = board.indexOf(0);
    const options = neighbours(empty).filter((pos) => pos !== previousEmpty);
    const pos = pick(options, rng);
    previousEmpty = empty;
    board = slide(board, pos);
  }
  return board;
}

// ---------- Jeu de mémoire ----------

// Deck mélangé : chaque forme tirée apparaît exactement deux fois
export function makeMemoryDeck(pairs, rng = Math.random) {
  const shapes = shuffle(MEMORY_SHAPES, rng).slice(0, pairs);
  return shuffle([...shapes, ...shapes], rng);
}
