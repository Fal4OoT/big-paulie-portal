// Notes de version affichées dans le portail (page « Nouveautés »).
// À chaque version : ajouter l'entrée EN HAUT, mettre à jour CHANGELOG.md à la racine,
// la version de package.json, puis créer le tag git correspondant (vX.Y.Z).
//
// Numérotation (X.Y.Z) :
//   X : refonte ou changement qui casse les habitudes
//   Y : nouvelle fonctionnalité
//   Z : correction

export type ChangeKind = "nouveau" | "amélioration" | "correction";

export interface Release {
  version: string;
  date: string; // AAAA-MM-JJ
  title: string;
  changes: { kind: ChangeKind; text: string }[];
}

export const CHANGELOG: Release[] = [
  {
    version: "1.2.0",
    date: "2026-11-04",
    title: "Véhicules en stock et notes de version",
    changes: [
      { kind: "nouveau", text: "Option « Véhicule en stock » lors d'un achat : la vente passe directement en « Réceptionné · à livrer », sans passer par la tournée." },
      { kind: "nouveau", text: "Badge « En stock » dans les listes de ventes et provenance indiquée sur la fiche de la vente." },
      { kind: "nouveau", text: "Page « Nouveautés » avec l'historique des versions, et numéro de version affiché dans le menu." },
    ],
  },
  {
    version: "1.1.0",
    date: "2026-11-04",
    title: "Téléphones, plaques et mises à jour",
    changes: [
      { kind: "amélioration", text: "Téléphone saisi en 10 chiffres (5209250963) et affiché (520)925-0963 partout, bot compris." },
      { kind: "amélioration", text: "Plaque demandée à la livraison uniquement pour les catégories qui en ont (Terrestre). Maritime et aérien : sans plaque." },
      { kind: "nouveau", text: "Réglage « Plaque à la livraison » par catégorie dans Configuration → Véhicules." },
      { kind: "nouveau", text: "Script de mise à jour du serveur en une commande, avec sauvegarde automatique de la base." },
    ],
  },
  {
    version: "1.0.0",
    date: "2026-11-03",
    title: "Ouverture du portail",
    changes: [
      { kind: "nouveau", text: "Connexion Discord et accès selon les grades (Patron, Chef de service, Confirmé, Employé, Staff), avec matrice de permissions." },
      { kind: "nouveau", text: "Fiches clients configurables avec images de permis à coller, et détection des doublons." },
      { kind: "nouveau", text: "Ventes avec circuit À commander → À chercher → Réceptionné · à livrer → Livré, historique de chaque étape." },
      { kind: "nouveau", text: "Tournées toutes les 30 minutes avec annonce Discord, alerte pour les ventes immédiates, logs dans un salon dédié." },
      { kind: "nouveau", text: "Bot Discord : /client, /vente, /tournee." },
    ],
  },
];

export const CURRENT_VERSION = CHANGELOG[0].version;

/** Clé du navigateur mémorisant la dernière version consultée (point « nouveau » du menu). */
export const SEEN_VERSION_KEY = "bp.seenVersion";
