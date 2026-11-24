import { MenuPanel3D, COLORS } from './MenuPanel3D.js';
import { makeBox } from '../world/Materials.js';

// Règles du jeu : plaque de titre, grande feuille de parchemin avec le texte, bouton RETOUR (indice 0).
export class RulesPanel3D extends MenuPanel3D {
  constructor(textFactory, { text }) {
    super(textFactory);
    this.height = 10.4;
    this.content.position.y = -0.65;
    this.escapeIndex = 0;

    this.buildPlaque({ title: 'RÈGLES', y: 4.1, height: 2.2, titleSize: 1.0 });

    // Feuille de parchemin avec le texte des règles
    const sheetW = 12.6;
    const sheetH = 5.6;
    const sheetY = 0.2;
    const edge = makeBox(sheetW, sheetH, 0.3, COLORS.parchmentEdge, { radius: 0.35, roughness: 0.6 });
    edge.position.set(0, sheetY, 0.1);
    const face = makeBox(sheetW - 0.4, sheetH - 0.4, 0.34, COLORS.parchment, { radius: 0.28, roughness: 0.55 });
    face.position.set(0, sheetY, 0.12);
    this.content.add(edge, face);

    const body = this.textFactory.create(text, {
      size: 0.3, maxWidth: sheetW - 1.2, maxLines: 14, color: COLORS.brownShadow, depth: 0.04, anchor: 'top'
    });
    body.position.set(0, sheetY + sheetH / 2 - 0.45, 0.32);
    this.content.add(body);

    this.addSmallButton(0, 0, -3.7, 'RETOUR', 'back');
    this.finish();
  }
}
