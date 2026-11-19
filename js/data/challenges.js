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

// ===== Les 3 jeux de défi =====
// 1) "classique" : Cristaux ou Symboles (code ci-dessus, inchangé)
// 2) "puzzle"    : taquin 3 x 3 à remettre en ordre AVANT la fin du temps
// 3) "memoire"   : retrouver toutes les paires de cartes ; chaque erreur fait perdre des points
// Pour changer les chances de tirage, modifie cette liste (un jeu répété = plus de chances).
export const CHALLENGE_GAMES = ['classique', 'puzzle', 'memoire'];

// Choisit le type de défi : 'crystals', 'symbols', 'puzzle' ou 'memory'
export function pickChallengeKind(rng = Math.random) {
  const game = pick(CHALLENGE_GAMES, rng);
  if (game === 'classique') return rng() < 0.5 ? 'crystals' : 'symbols';
  return game === 'puzzle' ? 'puzzle' : 'memory';
}

// ----- Puzzle coulissant (taquin) avec limite de temps -----

export const SLIDE_SIZE = 3;                      // grille 3 x 3 : tuiles 1 à 8 + une case vide (0)
export const SLIDE_TIME = { 1: 45, 2: 40, 3: 35 };   // secondes disponibles selon la zone
export const SLIDE_SHUFFLE = { 1: 8, 2: 12, 3: 16 }; // coups de mélange selon la zone (plus = plus dur)

// Cases voisines d'une case de la grille (haut, bas, gauche, droite)
export function slideNeighbors(slot) {
  const col = slot % SLIDE_SIZE;
  const row = Math.floor(slot / SLIDE_SIZE);
  const neighbors = [];
  if (row > 0) neighbors.push(slot - SLIDE_SIZE);
  if (row < SLIDE_SIZE - 1) neighbors.push(slot + SLIDE_SIZE);
  if (col > 0) neighbors.push(slot - 1);
  if (col < SLIDE_SIZE - 1) neighbors.push(slot + 1);
  return neighbors;
}

// Ordre gagnant : 1 2 3 / 4 5 6 / 7 8 vide
export function isSlideSolved(tiles) {
  return tiles.every((id, slot) => id === (slot + 1) % (SLIDE_SIZE * SLIDE_SIZE));
}

// Fait glisser la tuile qui est sur la case `slot` vers la case vide.
// Retourne la nouvelle grille, ou null si cette tuile n'est pas à côté de la case vide.
export function trySlide(tiles, slot) {
  const empty = tiles.indexOf(0);
  if (!slideNeighbors(empty).includes(slot)) return null;
  const next = [...tiles];
  next[empty] = tiles[slot];
  next[slot] = 0;
  return next;
}

// Puzzle mélangé : on part de la grille gagnante et on fait des coups au hasard (sans revenir en arrière).
// La grille est donc TOUJOURS solvable. Retourne { tiles, time }.
export function makeSlidePuzzle(level, rng = Math.random) {
  let tiles;
  do {
    tiles = [1, 2, 3, 4, 5, 6, 7, 8, 0];
    let previousEmpty = -1;
    for (let i = 0; i < SLIDE_SHUFFLE[level]; i++) {
      const empty = tiles.indexOf(0);
      const options = slideNeighbors(empty).filter((slot) => slot !== previousEmpty);
      tiles = trySlide(tiles, pick(options, rng));
      previousEmpty = empty;
    }
  } while (isSlideSolved(tiles)); // jamais un puzzle déjà résolu au départ
  return { tiles, time: SLIDE_TIME[level] };
}

// ----- Jeu de mémoire : retrouver les paires -----

export const MEMORY_PAIRS = { 1: 3, 2: 4, 3: 5 }; // nombre de paires selon la zone (6, 8 ou 10 cartes)

// Paquet mélangé : chaque forme apparaît deux fois
export function makeMemoryDeck(level, rng = Math.random) {
  const shapes = shuffle(SHAPES, rng).slice(0, MEMORY_PAIRS[level]);
  return shuffle([...shapes, ...shapes], rng);
}

// Règles du jeu de mémoire (sans 3D) : on retourne deux cartes à la suite.
export class MemoryGame {
  constructor(deck) {
    this.deck = deck;
    this.first = null;        // indice de la première carte retournée du coup en cours
    this.matched = new Set(); // indices des cartes déjà appariées
    this.errors = 0;
  }

  get pairsFound() {
    return this.matched.size / 2;
  }

  get done() {
    return this.matched.size === this.deck.length;
  }

  // Retourne une carte. Résultats :
  //   { type: 'ignore' }              carte déjà trouvée ou déjà retournée : rien ne se passe
  //   { type: 'first' }               première carte du coup
  //   { type: 'match', a, b }         paire trouvée
  //   { type: 'miss', a, b }          erreur : les deux cartes se recachent
  flip(index) {
    if (this.matched.has(index) || index === this.first) return { type: 'ignore' };
    if (this.first === null) {
      this.first = index;
      return { type: 'first' };
    }
    const a = this.first;
    this.first = null;
    if (this.deck[a] === this.deck[index]) {
      this.matched.add(a).add(index);
      return { type: 'match', a, b: index };
    }
    this.errors += 1;
    return { type: 'miss', a, b: index };
  }
}
