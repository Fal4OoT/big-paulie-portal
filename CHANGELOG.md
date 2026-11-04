# Notes de version — Big Paulie Portal

Numérotation `X.Y.Z` : **X** refonte, **Y** nouvelle fonctionnalité, **Z** correction.
Chaque version correspond à un tag git `vX.Y.Z`. Les mêmes notes sont visibles dans le portail (menu **Nouveautés**, fichier `apps/web/lib/changelog.ts`).

## v1.2.0 — 04/11/2026 · Véhicules en stock et notes de version

- **Nouveau** : option « Véhicule en stock » lors d'un achat. La vente passe directement en « Réceptionné · à livrer », sans passer par la tournée.
- **Nouveau** : badge « En stock » dans les listes de ventes et provenance indiquée sur la fiche de la vente.
- **Nouveau** : page « Nouveautés » avec l'historique des versions, et numéro de version affiché dans le menu.

## v1.1.0 — 04/11/2026 · Téléphones, plaques et mises à jour

- **Amélioration** : téléphone saisi en 10 chiffres (`5209250963`) et affiché `(520)925-0963` partout, bot compris.
- **Amélioration** : plaque demandée à la livraison uniquement pour les catégories qui en ont (Terrestre). Maritime et aérien : sans plaque.
- **Nouveau** : réglage « Plaque à la livraison » par catégorie dans Configuration → Véhicules.
- **Nouveau** : script de mise à jour du serveur en une commande (`deploy/update.sh`), avec sauvegarde automatique de la base.

## v1.0.0 — 03/11/2026 · Ouverture du portail

- Connexion Discord et accès selon les grades (Patron, Chef de service, Confirmé, Employé, Staff), avec matrice de permissions.
- Fiches clients configurables avec images de permis à coller, et détection des doublons.
- Ventes avec circuit À commander → À chercher → Réceptionné · à livrer → Livré, historique de chaque étape.
- Tournées toutes les 30 minutes avec annonce Discord, alerte pour les ventes immédiates, logs dans un salon dédié.
- Bot Discord : `/client`, `/vente`, `/tournee`.
