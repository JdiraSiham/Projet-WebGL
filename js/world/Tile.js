import * as THREE from 'three';
import { makeBox } from './Materials.js';
import { buildSymbol } from './Symbols.js';
import {
  TILE_SIZE, TILE_PITCH, TILE_HEIGHT, TILE_TOP_Y, BASE_TOP_Y, TILE_COLORS, ZONE_COLORS
} from '../data/boardConfig.js';

// Quelques nuances de pierre : les cases neutres ne sont pas toutes strictement identiques
const STONE_SHADES = [0xe9dcbc, 0xe2d4b0, 0xefe3c8, 0xdccea8];

const SLAB_HEIGHT = 0.2; // épaisseur de la dalle colorée du dessus

export class Tile {
  constructor({ index, type, zone, gx, gz }) {
    this.index = index;
    this.number = index + 1; // numéro de case de 1 à 30 (1 = départ, 30 = finale)
    this.type = type;
    this.zone = zone;
    this.active = false;
    this.mesh = new THREE.Group();
    this.mesh.position.set(gx * TILE_PITCH, 0, gz * TILE_PITCH);
    this.build();
  }

  // Une case = un vrai bloc : corps vertical (couleur de zone) + dalle colorée presque pleine largeur
  build() {
    const bodyHeight = TILE_HEIGHT - SLAB_HEIGHT;
    const body = makeBox(TILE_SIZE, bodyHeight, TILE_SIZE, ZONE_COLORS[this.zone], { roughness: 0.8, radius: 0.1 });
    body.position.y = BASE_TOP_Y + bodyHeight / 2;

    const neutral = this.type === 'normale' || this.type === 'passage';
    const topColor = neutral ? STONE_SHADES[(this.index * 7) % STONE_SHADES.length] : TILE_COLORS[this.type];
    const slab = makeBox(TILE_SIZE - 0.1, SLAB_HEIGHT, TILE_SIZE - 0.1, topColor, { roughness: 0.55, radius: 0.07 });
    slab.position.y = TILE_TOP_Y - SLAB_HEIGHT / 2;
    this.mesh.add(body, slab);

    if (!neutral) {
      const symbol = buildSymbol(this.type);
      symbol.rotation.x = -Math.PI / 2; // symbole couché à plat, incrusté dans la dalle
      symbol.scale.setScalar(1.1);
      symbol.position.y = TILE_TOP_Y;
      this.mesh.add(symbol);
    }
  }

  getTopPosition() {
    return new THREE.Vector3(this.mesh.position.x, TILE_TOP_Y, this.mesh.position.z);
  }

  setActive(active) {
    this.active = active;
    this.mesh.position.y = active ? 0.15 : 0;
  }
}
