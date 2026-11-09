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
    version: "1.13.1",
    date: "2026-11-09",
    title: "Numéro du client dans la tournée",
    changes: [
      { kind: "amélioration", text: "Tournée : le numéro de téléphone du client s'affiche sur chaque véhicule. Un clic le copie (10 chiffres) pour le rappeler plus vite." },
    ],
  },
  {
    version: "1.13.0",
    date: "2026-11-09",
    title: "Récap hebdomadaire automatique",
    changes: [
      { kind: "nouveau", text: "Configuration → Discord : le récap des ventes peut être envoyé automatiquement chaque semaine dans un salon, au jour et à l'heure choisis (heure de Paris), avec un rôle mentionné et les sections au choix. Bouton « Envoyer un test maintenant »." },
      { kind: "amélioration", text: "Le bouton « Récap Discord » d'Analyse et l'envoi automatique produisent exactement le même message (généré par le serveur)." },
    ],
  },
  {
    version: "1.12.0",
    date: "2026-11-09",
    title: "Récap Discord",
    changes: [
      { kind: "nouveau", text: "Analyse → Récap Discord : message prêt à copier-coller pour l'équipe (semaine dernière, semaine en cours ou période affichée) avec ventes, livraisons, comparaison avec la période précédente, top véhicules, podium des vendeurs et clients. Sections et montants à afficher au choix." },
    ],
  },
  {
    version: "1.11.0",
    date: "2026-11-09",
    title: "Analyse des clients et tri de la liste des clients",
    changes: [
      { kind: "nouveau", text: "Analyse → Clients : nouveaux clients enregistrés (avec la courbe par jour), clients acheteurs (premier achat ou déjà clients), clients ayant acheté plusieurs fois, part des nouveaux clients qui ont acheté, montant moyen par client et meilleurs clients." },
      { kind: "amélioration", text: "Liste des clients : toutes les colonnes se trient d'un clic (sur toute la base), par défaut par client de A à Z. Nouvelle colonne « Client depuis »." },
    ],
  },
  {
    version: "1.10.0",
    date: "2026-11-07",
    title: "Guide du portail et montant minimum de fidélité",
    changes: [
      { kind: "nouveau", text: "Guide d'utilisation dans Formation (catégorie « Guide du portail ») : prise en main, clients, achats, livraison, tournée, avantages clients, partenariat, bot Discord, configuration et questions fréquentes. Les fiches restent modifiables par le Patron." },
      { kind: "nouveau", text: "Fidélité : montant minimum par achat. Seuls les achats dont le prix de vente atteint ce montant font avancer le compteur (ventes passées comprises)." },
      { kind: "correction", text: "Formation : une liste numérotée reprend au bon numéro après une sous-liste." },
    ],
  },
  {
    version: "1.9.2",
    date: "2026-11-05",
    title: "Suppression d'un partenariat",
    changes: [
      { kind: "amélioration", text: "Un partenariat peut être supprimé définitivement (en plus d'être désactivé). Avant de confirmer, le portail indique les customisations qui seront supprimées et les grades qui seront détachés." },
    ],
  },
  {
    version: "1.9.1",
    date: "2026-11-05",
    title: "Correctif",
    changes: [{ kind: "correction", text: "Menu : « Partenaires » n'allume plus aussi « Espace partenaire »." }],
  },
  {
    version: "1.9.0",
    date: "2026-11-05",
    title: "Partenariat customisation et onglet Avantages clients",
    changes: [
      { kind: "nouveau", text: "Partenariats (Configuration → Avantages clients) : réduction pour le client qui se présente chez le partenaire avec son véhicule dans les X heures suivant la livraison, catégories concernées (terrestre par défaut), contrat pour nos employés, salon Discord du partenaire." },
      { kind: "nouveau", text: "Espace partenaire : les employés du partenaire (grade relié à leur rôle Discord) voient les véhicules éligibles avec le temps restant, valident la customisation avec le montant facturé, consultent l'historique, nos employés et le contrat. Ils ne voient rien d'autre du portail." },
      { kind: "nouveau", text: "Page Partenaires : ce que chaque partenaire offre, statistiques des customisations (nombre, montant) et dernières validations, annulables par le Patron." },
      { kind: "amélioration", text: "Au passage en « Livré », la fenêtre rappelle la réduction partenaire à annoncer au client ; la fiche de la vente indique le délai restant ou la customisation validée." },
      { kind: "amélioration", text: "Nouvel onglet « Avantages clients » dans la configuration : coupons, fidélité, parrainage, cadeaux et partenariats au même endroit." },
    ],
  },
  {
    version: "1.8.1",
    date: "2026-11-05",
    title: "Correctif",
    changes: [{ kind: "correction", text: "Correction de la mise en ligne de la v1.8.0 (réglages des cadeaux)." }],
  },
  {
    version: "1.8.0",
    date: "2026-11-05",
    title: "Formation et cadeaux à la livraison",
    changes: [
      { kind: "nouveau", text: "Onglet Formation : fiches classées par catégorie, avec recherche. Les Patrons créent et modifient les fiches (titres, gras, listes, astuces, images collées avec Ctrl+V) avec un aperçu en direct, et peuvent les garder en brouillon." },
      { kind: "nouveau", text: "Cadeaux à la livraison : paliers réglables selon le prix de vente (ex : bouteille de vin blanc ou rouge, bouteille de champagne). Au passage en « Livré », le cadeau à remettre est signalé et, s'il y a un choix, il est demandé." },
      { kind: "nouveau", text: "Le cadeau remis est enregistré sur la vente, visible dans son historique et dans les logs Discord." },
    ],
  },
  {
    version: "1.7.0",
    date: "2026-11-05",
    title: "Parrain à la création du client",
    changes: [
      { kind: "amélioration", text: "Le parrain peut être choisi directement dans le formulaire « Nouveau client ». La fiche et le parrainage sont enregistrés ensemble : si le parrain est refusé, rien n'est créé." },
    ],
  },
  {
    version: "1.6.0",
    date: "2026-11-05",
    title: "Parrainage",
    changes: [
      { kind: "nouveau", text: "Parrainage sur la fiche client : un seul parrain par client, lui-même client enregistré, avant le premier achat du filleul. Aucun parrainage croisé possible." },
      { kind: "nouveau", text: "Le filleul reçoit un coupon utilisable dès son premier achat ; le parrain reçoit le sien quand ce premier achat est enregistré." },
      { kind: "nouveau", text: "Réglages : pourcentage du parrain et du filleul, validité en jours, nombre de filleuls par parrain (5 par défaut, vide = illimité)." },
      { kind: "nouveau", text: "Fiche client : « Parrainé par… » et liste des filleuls, avec l'état de leur premier achat." },
      { kind: "amélioration", text: "Une vente annulée retire aussi le coupon de parrain qu'elle avait généré s'il n'a pas servi." },
    ],
  },
  {
    version: "1.5.0",
    date: "2026-11-05",
    title: "Coupons de promotion et fidélité",
    changes: [
      { kind: "nouveau", text: "Coupons de promotion sur la fiche client : pourcentage (20 % maximum, réglable), raison et date d'expiration facultative. Attribution et annulation selon le grade (Patron et Chef de service par défaut)." },
      { kind: "nouveau", text: "Choix du coupon dans « Nouvel achat » (un seul par achat, non cumulable) : il est marqué utilisé par qui, quand et sur quel achat. Le prix reste celui saisi." },
      { kind: "nouveau", text: "Programme de fidélité réglable : tous les X achats, un coupon de X % est ajouté au client. Les achats passés comptent dans la progression." },
      { kind: "amélioration", text: "Une vente annulée rend son coupon et retire le coupon de fidélité qu'elle avait généré s'il n'a pas servi." },
      { kind: "amélioration", text: "Prénom et nom : la première lettre de chaque partie est mise en majuscule (« jean-pierre » → « Jean-Pierre »), clients existants compris." },
    ],
  },
  {
    version: "1.4.0",
    date: "2026-11-04",
    title: "Catalogue des véhicules et analyse",
    changes: [
      { kind: "nouveau", text: "Catalogue des véhicules importé depuis le panel légal (Configuration → Catalogue) : copier-coller de la réponse du panel, aperçu des changements avant import." },
      { kind: "nouveau", text: "Recherche du véhicule dans « Nouvel achat » : noms uniformes, type pré-sélectionné selon la gamme du panel. Un véhicule absent du catalogue reste possible (hors catalogue)." },
      { kind: "nouveau", text: "Onglet Analyse : véhicules les plus vendus, ventes par gamme, par type et par vendeur, ventes par jour, délai moyen de livraison." },
      { kind: "nouveau", text: "Type « Vélo » (sans permis ni plaque) et réglage de la plaque par type de véhicule." },
      { kind: "amélioration", text: "Les anciennes ventes dont le nom correspond exactement à un véhicule du catalogue y sont rattachées automatiquement." },
    ],
  },
  {
    version: "1.3.0",
    date: "2026-11-04",
    title: "Tableau de tournée unique et retards",
    changes: [
      { kind: "amélioration", text: "Le salon de tournée ne contient plus qu'un seul tableau, mis à jour en direct à chaque vente ou changement de statut : fini le spam." },
      { kind: "amélioration", text: "À chaque tournée, le tableau est republié en bas du salon avec la mention du rôle, pour que tout le monde reçoive la notification." },
      { kind: "amélioration", text: "Une vente immédiate republie le tableau avec la mention du rôle « immédiat » au lieu d'envoyer un message séparé." },
      { kind: "nouveau", text: "Retards : au-delà d'un nombre de tournées réglable, le véhicule est marqué ⏰ et le grade choisi est mentionné à chaque tournée." },
      { kind: "nouveau", text: "Le tableau affiche aussi les véhicules réceptionnés à livrer." },
    ],
  },
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
