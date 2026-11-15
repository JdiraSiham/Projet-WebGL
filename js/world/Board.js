import * as THREE from 'three';
import { Tile } from './Tile.js';
import { CardPile } from '../cards/CardPile.js';
import { makeBox, getStandard } from './Materials.js';
import {
  RING_HALF_X, RING_HALF_Z, TILE_PITCH, TILE_SIZE, BOARD_HALF_X, BOARD_HALF_Z,
  BASE_TOP_Y, PLATFORM_TOP_Y, TILE_TYPES, ZONE_COLORS, CARD_PILES, getZone, buildRingCells
} from '../data/boardConfig.js';

const PLANK_SHADES = [0xa9602f, 0x9d5629, 0xb36a37, 0xa45c2d, 0xaf6633];
const PLANK_COUNT = 11;

export class Board {
  constructor() {
    this.group = new THREE.Group();
    this.tiles = [];
    this.piles = [];
    this.build();
  }

  build() {
    this.buildBase();
    this.buildTiles();
    this.buildCenter();
  }

  // Support épais : dalle basse sombre + planches de bois de teintes variées + blocs d'angle en pierre
  buildBase() {
    const sizeX = BOARD_HALF_X * 2;
    const sizeZ = BOARD_HALF_Z * 2;
    const lower = makeBox(sizeX - 0.8, 1.0, sizeZ - 0.8, 0x7a4320, { roughness: 0.9, radius: 0.08 });
    lower.position.y = 0.5;
    this.group.add(lower);

    const plankWidth = sizeX / PLANK_COUNT;
    for (let i = 0; i < PLANK_COUNT; i++) {
      const plank = makeBox(plankWidth - 0.03, 0.6, sizeZ, PLANK_SHADES[(i * 3) % PLANK_SHADES.length], { roughness: 0.85, radius: 0.04 });
      plank.position.set(-BOARD_HALF_X + plankWidth / 2 + i * plankWidth, 1.0 + 0.3, 0);
      this.group.add(plank);
    }

    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        const x = sx * (BOARD_HALF_X - 0.5);
        const z = sz * (BOARD_HALF_Z - 0.5);
        const block = makeBox(1.0, 0.8, 1.0, 0xe8d8b0, { roughness: 0.7, radius: 0.1 });
        block.position.set(x, BASE_TOP_Y + 0.4, z);
        const cap = makeBox(0.55, 0.35, 0.55, 0xf2e6c4, { roughness: 0.7, radius: 0.08 });
        cap.position.set(x, BASE_TOP_Y + 0.8 + 0.175, z);
        this.group.add(block, cap);
      }
    }
  }

  // Les 30 cases, dans l'ordre du parcours (indice 0 = case n°1 = départ ; indice 29 = case n°30 = finale)
  buildTiles() {
    const cells = buildRingCells();
    cells.forEach((cell, i) => {
      const tile = new Tile({
        index: i,
        type: TILE_TYPES[i],
        zone: getZone(i),
        gx: cell.gx,
        gz: cell.gz
      });
      this.tiles.push(tile);
      this.group.add(tile.mesh);
      this.addRimPiece(cell, getZone(i));
    });
  }

  // Bordure extérieure colorée selon la zone, collée au bord des cases (pas aux coins)
  addRimPiece({ gx, gz }, zone) {
    const offset = TILE_SIZE / 2 + 0.06 + 0.2;
    const onSide = Math.abs(gx) === RING_HALF_X;
    const onEnd = Math.abs(gz) === RING_HALF_Z;
    let rim = null;
    if (onSide && !onEnd) {
      rim = makeBox(0.4, 0.5, TILE_SIZE, ZONE_COLORS[zone], { roughness: 0.8 });
      rim.position.set(gx * TILE_PITCH + Math.sign(gx) * offset, BASE_TOP_Y + 0.25, gz * TILE_PITCH);
    } else if (onEnd && !onSide) {
      rim = makeBox(TILE_SIZE, 0.5, 0.4, ZONE_COLORS[zone], { roughness: 0.8 });
      rim.position.set(gx * TILE_PITCH, BASE_TOP_Y + 0.25, gz * TILE_PITCH + Math.sign(gz) * offset);
    }
    if (rim) this.group.add(rim);
  }

  // Zone centrale : plateforme carrée à deux niveaux, médaillon doré (emplacement du dé), 4 piles de cartes
  buildCenter() {
    const stage1 = makeBox(12, 0.3, 12, 0xe0cfa6, { roughness: 0.8, radius: 0.08 });
    stage1.position.y = BASE_TOP_Y + 0.15;
    const stage2 = makeBox(10.8, 0.3, 10.8, 0xefe2c4, { roughness: 0.8, radius: 0.08 });
    stage2.position.y = BASE_TOP_Y + 0.45;
    this.group.add(stage1, stage2);

    const disc = new THREE.Mesh(
      new THREE.CylinderGeometry(1.4, 1.4, 0.12, 40),
      getStandard(0xe8b43a, { roughness: 0.55 })
    );
    disc.position.y = PLATFORM_TOP_Y + 0.06;
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(1.52, 0.1, 12, 56),
      getStandard(0xf3e6c4, { roughness: 0.6 })
    );
    ring.rotation.x = Math.PI / 2;
    ring.position.y = PLATFORM_TOP_Y + 0.08;
    this.group.add(disc, ring);

    for (const cfg of CARD_PILES) {
      const pile = new CardPile({ key: cfg.key, color: cfg.color, symbol: cfg.symbol });
      pile.group.position.set(cfg.x, PLATFORM_TOP_Y, cfg.z);
      pile.group.rotation.y = cfg.yaw;
      this.piles.push(pile);
      this.group.add(pile.group);
    }
  }

  // Le dé repose au centre exact de la plateforme, sur le médaillon
  getDiceRestPosition(diceSize) {
    return new THREE.Vector3(0, PLATFORM_TOP_Y + 0.12 + diceSize / 2 + 0.03, 0);
  }

  getTile(index) {
    return this.tiles[index];
  }

  getPosition(index) {
    return this.tiles[index].getTopPosition();
  }

  update(deltaTime, time) {
    for (const pile of this.piles) pile.update(time);
  }
}
