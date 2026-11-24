// Données et générateurs des défis (sans aucun objet 3D, donc testables seuls).

export const CRYSTAL_COUNT = 4;                 // nombre de cristaux sur la carte
// Niveaux : 1 = facile (cases 1-10), 2 = moyen (cases 11-20), 3 = difficile (cases 21-30 et finale)
export const CRYSTAL_LENGTH = { 1: 4, 2: 6, 3: 8 }; // nombre de clics de la séquence

// Formes du jeu de mémoire (jusqu'à 6 paires)
export const MEMORY_SHAPES = ['cercle', 'carre', 'triangle', 'etoile', 'losange', 'croix'];

// Puzzle coulissant : taille de la grille (3 = 9 cases, 4 = 16 cases), temps limité (secondes) et coups de mélange
export const PUZZLE_LEVELS = {
  1: { size: 3, time: 70, moves: 12 }, // facile : 9 cases, 70 s
  2: { size: 3, time: 50, moves: 18 }, // moyen : 9 cases, 50 s
  3: { size: 4, time: 60, moves: 24 }  // difficile : 16 cases, 60 s
};

// Jeu de mémoire : nombre de cartes = 2 x paires ; colonnes de la grille ; erreurs autorisées.
// Trop d'erreurs = défi raté.
export const MEMORY_LEVELS = {
  1: { pairs: 4, cols: 4, maxErrors: 5 }, // facile : 8 cartes, 5 erreurs
  2: { pairs: 5, cols: 5, maxErrors: 5 }, // moyen : 10 cartes, 5 erreurs
  3: { pairs: 6, cols: 4, maxErrors: 4 }  // difficile : 12 cartes, 4 erreurs
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

// ---------- Puzzle coulissant (grille size x size : tableau de size*size valeurs, 0 = case vide) ----------

function sizeOf(board) {
  return Math.round(Math.sqrt(board.length));
}

function solvedBoard(size) {
  return [...Array.from({ length: size * size - 1 }, (_, i) => i + 1), 0];
}

export function isSolved(board) {
  const solved = solvedBoard(sizeOf(board));
  return board.every((value, i) => value === solved[i]);
}

// Positions voisines (haut, bas, gauche, droite) d'une position de la grille
function neighbours(pos, size) {
  const col = pos % size;
  const row = Math.floor(pos / size);
  const list = [];
  if (row > 0) list.push(pos - size);
  if (row < size - 1) list.push(pos + size);
  if (col > 0) list.push(pos - 1);
  if (col < size - 1) list.push(pos + 1);
  return list;
}

// Une tuile peut glisser si elle est juste à côté de la case vide
export function canSlide(board, pos) {
  return board[pos] !== 0 && neighbours(pos, sizeOf(board)).includes(board.indexOf(0));
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
export function makeSlidePuzzle(moves, size = 3, rng = Math.random) {
  let board = solvedBoard(size);
  let previousEmpty = -1;
  for (let i = 0; i < moves || isSolved(board); i++) {
    const empty = board.indexOf(0);
    const options = neighbours(empty, size).filter((pos) => pos !== previousEmpty);
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
