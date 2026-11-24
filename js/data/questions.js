// Questions du quiz : niveau 1 = zone 1 (cases 1-10), niveau 2 = zone 2 (11-20), niveau 3 = zone 3 (21-30).
// Chaque question a 4 propositions ; correctIndex = indice de la bonne réponse (0 à 3).
// Les propositions sont mélangées à l'affichage. Police utilisée : évite À, È, Ç majuscules (absents).
export const QUESTIONS = [
  // Niveau 1
  { id: 1, level: 1, text: "Quelle est la capitale du Maroc ?", choices: ["Casablanca", "Rabat", "Marrakech", "Fès"], correctIndex: 1 },
  { id: 2, level: 1, text: "Combien y a-t-il de faces sur un dé classique ?", choices: ["4", "6", "8", "12"], correctIndex: 1 },
  { id: 3, level: 1, text: "Quelle planète est surnommée la planète rouge ?", choices: ["Vénus", "Jupiter", "Mars", "Mercure"], correctIndex: 2 },
  { id: 4, level: 1, text: "Quel est le résultat de 7 x 8 ?", choices: ["54", "56", "58", "64"], correctIndex: 1 },

  // Niveau 2
  { id: 5, level: 2, text: "Quel langage fonctionne nativement dans un navigateur web ?", choices: ["Java", "C++", "JavaScript", "Python"], correctIndex: 2 },
  { id: 6, level: 2, text: "Quel est le plus grand océan du monde ?", choices: ["Atlantique", "Pacifique", "Indien", "Arctique"], correctIndex: 1 },
  { id: 7, level: 2, text: "Quelle bibliothèque est utilisée pour la 3D dans ce jeu ?", choices: ["React", "Three.js", "jQuery", "Angular"], correctIndex: 1 },
  { id: 8, level: 2, text: "Qui a peint la Joconde ?", choices: ["Van Gogh", "Picasso", "Léonard de Vinci", "Michel-Ange"], correctIndex: 2 },

  // Niveau 3
  { id: 9, level: 3, text: "Quel est le symbole chimique de l'or ?", choices: ["Ag", "Au", "Fe", "Or"], correctIndex: 1 },
  { id: 10, level: 3, text: "En quelle année l'homme a-t-il marché sur la Lune ?", choices: ["1965", "1969", "1972", "1975"], correctIndex: 1 },
  { id: 11, level: 3, text: "Combien de bits contient un octet ?", choices: ["4", "8", "16", "32"], correctIndex: 1 },
  { id: 12, level: 3, text: "Quel est le plus long fleuve d'Afrique ?", choices: ["Le Congo", "Le Niger", "Le Nil", "Le Zambèze"], correctIndex: 2 }
];
