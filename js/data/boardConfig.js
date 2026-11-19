// Configuration du plateau : toutes les constantes de disposition au même endroit.

// Anneau de cases : 9 colonnes x 8 rangées = exactement 30 cases (2 x (9 + 8) - 4).
export const RING_HALF_X = 4;   // colonnes de -4 à +4 (9 colonnes)
export const RING_HALF_Z = 3.5; // rangées de -3.5 à +3.5 (8 rangées)

export const TILE_SIZE = 2.4;    // côté d'une case (identique pour toutes)
export const TILE_PITCH = 2.46;  // distance entre deux centres : écart régulier de 0.06
export const TILE_HEIGHT = 0.75; // épaisseur d'une case (côtés bien visibles)

export const BASE_TOP_Y = 1.6;                         // surface du support
export const TILE_TOP_Y = BASE_TOP_Y + TILE_HEIGHT;    // dessus des cases
export const PLATFORM_TOP_Y = BASE_TOP_Y + 0.6;        // dessus de la plateforme centrale

// Support carré : la bordure de bois est un peu plus large à l'avant et à l'arrière
// pour compenser les 8 rangées. Mettre false pour un support rectangulaire plus ajusté.
export const SQUARE_BASE = true;
const BORDER = 0.86; // bordure colorée (0.46) + bois visible (0.4)
const halfX = RING_HALF_X * TILE_PITCH + TILE_SIZE / 2 + BORDER;
const halfZ = RING_HALF_Z * TILE_PITCH + TILE_SIZE / 2 + BORDER;
export const BOARD_HALF_X = SQUARE_BASE ? Math.max(halfX, halfZ) : halfX;
export const BOARD_HALF_Z = SQUARE_BASE ? Math.max(halfX, halfZ) : halfZ;

// Types des 30 cases. L'indice i correspond à la case n° i + 1 (1 = départ, 30 = finale).
export const TILE_TYPES = [
  'depart', 'quiz', 'normale', 'bonus', 'quiz', 'normale', 'defi', 'piege', 'quiz', 'checkpoint',   // 1 à 10
  'normale', 'quiz', 'piege', 'defi', 'bonus', 'quiz', 'portail', 'piege', 'defi', 'checkpoint',   // 11 à 20
  'quiz', 'piege', 'defi', 'bonus', 'quiz', 'portail', 'piege', 'defi', 'quiz', 'finale'           // 21 à 30
];
export const TILE_COUNT = TILE_TYPES.length; // 30

// Zone d'une case à partir de son indice (0 à 29) : n° 1-10, 11-20, 21-30
export function getZone(index) {
  const number = index + 1;
  if (number <= 10) return 1;
  if (number <= 20) return 2;
  return 3;
}

// Couleur de chaque zone (côtés des cases et bordure extérieure)
export const ZONE_COLORS = {
  1: 0x7fae5a, // cases 1 à 10 : vert
  2: 0xf2b36b, // cases 11 à 20 : orange clair
  3: 0xd9534f  // cases 21 à 30 : rouge
};

export const TILE_COLORS = {
  depart: 0xf8f4e6,
  normale: 0xe9dcbc,
  quiz: 0x2f7de1,
  defi: 0x8a4fd8,
  bonus: 0xf5c518,
  piege: 0xe03a3a,
  portail: 0x19c3d1,
  checkpoint: 0x3fbf5f,
  finale: 0xffa000
};

// Les 4 piles de cartes, placées symétriquement au CENTRE du plateau.
export const CARD_PILES = [
  { key: 'quiz',  color: 0x2f7de1, symbol: 'quiz',  x: -3, z: -3, yaw:  0.18 },
  { key: 'defi',  color: 0x8a4fd8, symbol: 'defi',  x:  3, z: -3, yaw: -0.18 },
  { key: 'bonus', color: 0xf5c518, symbol: 'bonus', x: -3, z:  3, yaw: -0.18 },
  { key: 'piege', color: 0xe03a3a, symbol: 'piege', x:  3, z:  3, yaw:  0.18 }
];

// Parcours dans l'ordre : départ en bas à droite, bas de droite à gauche, côté gauche vers le haut,
// haut de gauche à droite, côté droit vers le bas. La dernière case (finale) est voisine du départ.
// Axe z : +z = bas de l'écran.
export function buildRingCells() {
  const hx = RING_HALF_X;
  const hz = RING_HALF_Z;
  const cells = [];
  for (let x = hx; x >= -hx; x--) cells.push({ gx: x, gz: hz });              // bas : 9 cases
  for (let z = hz - 1; z >= -hz + 1; z--) cells.push({ gx: -hx, gz: z });     // gauche : 6 cases
  for (let x = -hx; x <= hx; x++) cells.push({ gx: x, gz: -hz });             // haut : 9 cases
  for (let z = -hz + 1; z <= hz - 1; z++) cells.push({ gx: hx, gz: z });      // droite : 6 cases
  return cells; // 30 cases
}
