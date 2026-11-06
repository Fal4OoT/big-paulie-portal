# Notes de version — Big Paulie Portal

Numérotation `X.Y.Z` : **X** refonte, **Y** nouvelle fonctionnalité, **Z** correction.
Chaque version correspond à un tag git `vX.Y.Z`. Les mêmes notes sont visibles dans le portail (menu **Nouveautés**, fichier `apps/web/lib/changelog.ts`).

## v1.10.0 — 07/11/2026 · Guide du portail et montant minimum de fidélité

- **Nouveau** : guide d'utilisation dans Formation (catégorie « Guide du portail », 10 fiches) : prise en main, clients, achats, livraison, tournée, avantages clients, partenariat, bot Discord, configuration et questions fréquentes. Modifiables par le Patron comme toute fiche.
- **Nouveau** : fidélité : montant minimum par achat (Configuration → Avantages clients). Seuls les achats dont le prix de vente saisi atteint ce montant comptent, ventes passées comprises. La fiche client affiche les achats qui comptent.
- **Correction** : formation : une liste numérotée reprend au bon numéro après une sous-liste.

## v1.9.2 — 05/11/2026 · Suppression d'un partenariat

- **Amélioration** : un partenariat peut être supprimé définitivement (Configuration → Avantages clients → Partenariats), en plus d'être désactivé. Ses customisations validées sont supprimées avec lui et les grades reliés sont détachés (pas supprimés). Le détail est affiché avant de confirmer.

## v1.9.1 — 05/11/2026 · Correctif

- **Correction** : menu : « Partenaires » n'allume plus aussi « Espace partenaire ».

## v1.9.0 — 05/11/2026 · Partenariat customisation et onglet Avantages clients

- **Nouveau** : partenariats (Configuration → Avantages clients) : réduction pour le client qui se présente chez le partenaire avec son véhicule dans les X heures suivant la livraison, catégories concernées (terrestre par défaut), précisions client, contrat pour nos employés, salon Discord du partenaire (annonce des véhicules éligibles et des validations).
- **Nouveau** : espace partenaire. Les employés du partenaire (grade relié à leur rôle Discord et au partenaire, permissions « Espace partenaire » et « Valider une customisation ») voient les véhicules éligibles avec le temps restant (véhicule, plaque, client, sans téléphone ni prix), valident la customisation avec le montant facturé et une note, consultent l'historique, la liste de nos employés et le contrat. Ils ne voient rien d'autre du portail.
- **Nouveau** : page Partenaires (permission « Voir les partenariats ») : ce que chaque partenaire offre, statistiques (nombre et montant des customisations sur 30 jours et au total), dernières validations, annulables par le Patron (« Annuler une customisation validée »).
- **Amélioration** : au passage en « Livré », la fenêtre rappelle la réduction partenaire à annoncer au client ; la fiche de la vente indique le délai restant ou la customisation validée.
- **Amélioration** : nouvel onglet « Avantages clients » dans la configuration (coupons, fidélité, parrainage, cadeaux, partenariats).

## v1.8.1 — 05/11/2026 · Correctif

- **Correction** : la v1.8.0 ne se construisait pas (import manquant dans les réglages des cadeaux).

## v1.8.0 — 05/11/2026 · Formation et cadeaux à la livraison

- **Nouveau** : onglet Formation : fiches classées par catégorie, avec recherche. Permissions « Voir les formations » (tous les grades) et « Créer / modifier les formations » (Patron par défaut). Éditeur avec aperçu en direct : titres, gras, listes, étapes numérotées, astuces, images collées avec Ctrl+V. Brouillons possibles.
- **Nouveau** : cadeaux à la livraison (Configuration → Discord, tournée & statuts → Cadeaux à la livraison) : paliers selon le prix de vente, un seul cadeau (le palier au minimum le plus élevé l'emporte), choix facultatif (ex : Blanc / Rouge). Au passage en « Livré », le cadeau à remettre est signalé.
- **Nouveau** : le cadeau remis est enregistré sur la vente, visible dans son historique et dans les logs Discord.

## v1.7.0 — 05/11/2026 · Parrain à la création du client

- **Amélioration** : le parrain peut être choisi directement dans le formulaire « Nouveau client ». La fiche et le parrainage sont enregistrés ensemble : si le parrain est refusé (maximum de filleuls atteint…), rien n'est créé.

## v1.6.0 — 05/11/2026 · Parrainage

- **Nouveau** : parrainage sur la fiche client. Un seul parrain par client, lui-même client enregistré, à enregistrer avant le premier achat du filleul. Aucun parrainage croisé, même en chaîne. Permission « Enregistrer un parrainage » (tous les grades de la concession par défaut).
- **Nouveau** : le filleul reçoit un coupon utilisable dès son premier achat ; le parrain reçoit le sien quand ce premier achat est enregistré.
- **Nouveau** : réglages (Coupons & fidélité) : pourcentage du parrain et du filleul, validité en jours, nombre de filleuls par parrain (5 par défaut, vide = illimité).
- **Nouveau** : fiche client : « Parrainé par… » et liste des filleuls avec l'état de leur premier achat. Le parrain peut être changé ou retiré tant que les coupons n'ont pas servi.
- **Amélioration** : une vente annulée retire aussi le coupon de parrain qu'elle avait généré s'il n'a pas servi.

## v1.5.0 — 05/11/2026 · Coupons de promotion et fidélité

- **Nouveau** : coupons de promotion sur la fiche client : pourcentage (20 % maximum, réglable), raison et date d'expiration facultative. Attribution et annulation selon le grade (permissions « Attribuer / Annuler un coupon », Patron et Chef de service par défaut).
- **Nouveau** : choix du coupon dans « Nouvel achat » (un seul par achat, non cumulable). Le coupon est marqué utilisé par qui, quand et sur quel achat ; le prix reste celui saisi.
- **Nouveau** : programme de fidélité réglable (Configuration → Discord, tournée & statuts → Coupons & fidélité) : tous les X achats, un coupon de X % est ajouté au client. Toute vente non annulée compte, achats passés compris (sans génération rétroactive).
- **Amélioration** : une vente annulée rend son coupon et retire le coupon de fidélité qu'elle avait généré s'il n'a pas servi ; il est rétabli si la vente l'est.
- **Amélioration** : prénom et nom : la première lettre de chaque partie est mise en majuscule (« jean-pierre de la fuente » → « Jean-Pierre De La Fuente »), clients existants compris.

## v1.4.0 — 04/11/2026 · Catalogue des véhicules et analyse

- **Nouveau** : catalogue des véhicules importé depuis le panel légal (Configuration → Catalogue) par copier-coller de la réponse du panel, avec aperçu des changements avant import. Seuls les noms et catégories des véhicules sont lus.
- **Nouveau** : recherche du véhicule dans « Nouvel achat » : noms uniformes, type pré-sélectionné selon la gamme du panel. Un véhicule absent du catalogue reste possible (hors catalogue).
- **Nouveau** : onglet Analyse : véhicules les plus vendus, ventes par gamme, par type et par vendeur, ventes par jour, délai moyen de livraison. Permission « Voir l'analyse des ventes » (Patron et Chef de service par défaut).
- **Nouveau** : type « Vélo » (sans permis ni plaque) et réglage de la plaque par type de véhicule.
- **Amélioration** : les anciennes ventes dont le nom correspond exactement à un véhicule du catalogue y sont rattachées automatiquement.

## v1.3.0 — 04/11/2026 · Tableau de tournée unique et retards

- **Amélioration** : le salon de tournée ne contient plus qu'un seul tableau, mis à jour en direct à chaque vente ou changement de statut. Fini le spam.
- **Amélioration** : à chaque tournée, le tableau est republié en bas du salon avec la mention du rôle, pour que tout le monde reçoive la notification.
- **Amélioration** : une vente immédiate republie le tableau avec la mention du rôle « immédiat » au lieu d'envoyer un message séparé.
- **Nouveau** : retards. Au-delà d'un nombre de tournées réglable, le véhicule est marqué ⏰ et le grade choisi est mentionné à chaque tournée.
- **Nouveau** : le tableau affiche aussi les véhicules réceptionnés à livrer.

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
