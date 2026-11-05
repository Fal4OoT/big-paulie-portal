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
