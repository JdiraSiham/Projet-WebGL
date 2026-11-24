import * as THREE from 'three';
import { getStandard } from '../world/Materials.js';

export const CARD_VISUALS = {
  wood: 0x563a2b,
  woodLight: 0x76513a,
  woodShadow: 0x3e291f,
  cream: 0xfff3dc,
  parchmentTop: 0xf8edd6,
  parchmentBottom: 0xe9d7b4,
  gold: 0xd5ad62,
  goldLight: 0xf0d48e,
  text: 0x4b3324,
  button: 0xf1e4c8,
  buttonHover: 0xfff2d6,
  return: 0xcf7037,
  returnHover: 0xe5894e
};

const slabGeometries = new Map();

function roundedRect(width, height, radius) {
  const x = -width / 2;
  const y = -height / 2;
  const r = Math.min(radius, width / 2, height / 2);
  const shape = new THREE.Shape();
  shape.moveTo(x + r, y);
  shape.lineTo(x + width - r, y);
  shape.quadraticCurveTo(x + width, y, x + width, y + r);
  shape.lineTo(x + width, y + height - r);
  shape.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
  shape.lineTo(x + r, y + height);
  shape.quadraticCurveTo(x, y + height, x, y + height - r);
  shape.lineTo(x, y + r);
  shape.quadraticCurveTo(x, y, x + r, y);
  return shape;
}

function roundedSlabGeometry(width, height, depth, radius) {
  const key = `${width}|${height}|${depth}|${radius}`;
  if (slabGeometries.has(key)) return slabGeometries.get(key);
  const bevel = Math.min(0.005, depth * 0.2);
  const geometry = new THREE.ExtrudeGeometry(roundedRect(width, height, radius), {
    depth: depth - 2 * bevel,
    bevelEnabled: bevel > 0,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 1,
    curveSegments: 8
  });
  geometry.translate(0, 0, -depth / 2 + bevel);
  slabGeometries.set(key, geometry);
  return geometry;
}

export function makeRoundedSlab(width, height, depth, color, {
  radius = 0.1,
  ...materialOptions
} = {}) {
  return new THREE.Mesh(
    roundedSlabGeometry(width, height, depth, radius),
    getStandard(color, materialOptions)
  );
}

export function makeGradientPanel(width, height, depth, topColor, bottomColor, radius = 0.1) {
  const geometry = roundedSlabGeometry(width, height, depth, radius).clone();
  const positions = geometry.getAttribute('position');
  const top = new THREE.Color(topColor);
  const bottom = new THREE.Color(bottomColor);
  const colors = new Float32Array(positions.count * 3);

  for (let i = 0; i < positions.count; i++) {
    const amount = THREE.MathUtils.clamp((positions.getY(i) + height / 2) / height, 0, 1);
    const color = bottom.clone().lerp(top, amount);
    colors[i * 3] = color.r;
    colors[i * 3 + 1] = color.g;
    colors[i * 3 + 2] = color.b;
  }

  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const material = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.72,
    metalness: 0.015
  });
  const panel = new THREE.Mesh(geometry, material);
  panel.receiveShadow = true;
  return panel;
}

export function addCardInset(content, {
  width = 2.12,
  height = 3.12,
  topColor = CARD_VISUALS.woodLight,
  bottomColor = CARD_VISUALS.wood,
  borderColor = CARD_VISUALS.gold,
  depth = 0.02
} = {}) {
  const border = makeRoundedSlab(width, height, depth, borderColor, {
    radius: 0.15,
    roughness: 0.55,
    metalness: 0.12
  });
  border.position.z = 0.008;
  const panel = makeGradientPanel(
    width - 0.07,
    height - 0.07,
    depth,
    topColor,
    bottomColor,
    0.13
  );
  panel.position.z = 0.023;
  content.add(border, panel);
  return { border, panel };
}
