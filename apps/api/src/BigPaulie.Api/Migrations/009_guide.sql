-- Guide d'utilisation du portail : fiches de formation publiées, modifiables par le Patron.
INSERT INTO training_sheets (title, category, sort_order, published, content) VALUES

('Bienvenue : prise en main du portail', 'Guide du portail', 1, true, $md$
# Bienvenue sur le portail Big Paulie
Le portail sert à suivre **chaque client et chaque véhicule vendu**, de la vente à la livraison. Tout ce que tu fais y est enregistré (qui, quand) et recopié dans le salon de logs Discord.

## Se connecter
1. Ouvre le portail et clique sur **Se connecter avec Discord**.
2. Ton accès dépend de ton **grade** sur le serveur Discord. Si un menu te manque, c'est que ton grade ne le permet pas : demande au Patron.

## Le menu
- **Tableau de bord** : ce qui attend la concession en ce moment (à commander, à chercher, à livrer).
- **Tournée** : la liste de ce qu'il faut commander et aller chercher à la prochaine tournée.
- **Ventes** : toutes les ventes, avec filtres et recherche.
- **Clients** : les fiches clients. C'est depuis la fiche d'un client qu'on enregistre un achat.
- **Analyse** : les véhicules les plus vendus, les ventes par jour, par vendeur…
- **Partenaires** : nos partenariats (garage de customisation) et ce qu'ils offrent.
- **Formation** : les fiches comme celle-ci.
- **Logs** et **Configuration** : selon ton grade.
- **Nouveautés** (en bas du menu) : ce qui a changé à chaque mise à jour. Un point orange signale une nouvelle version.

> 💡 **Astuce :** les listes se mettent à jour toutes seules toutes les 30 secondes à 1 minute. Pas besoin de recharger la page.
$md$),

('Clients : créer et gérer une fiche', 'Guide du portail', 2, true, $md$
# Créer et gérer une fiche client

## Créer un client
1. **Clients → Nouveau client**.
2. Remplis **prénom, nom, téléphone, date de naissance**. La première lettre du prénom et du nom est mise en majuscule toute seule.
3. **Téléphone** : tape les 10 chiffres sans espace (`5209250963`). Il sera affiché `(520)925-0963`.
4. **Permis** : clique dans la zone du permis concerné, puis **Ctrl+V** pour coller la capture d'écran (ou « choisir un fichier »).
5. **Parrain (facultatif)** : si le client vient de la part d'un client existant, choisis-le ici (voir la fiche « Avantages clients »).
6. **Créer le client**.

> ⚠️ **Doublon :** si un client au même nom existe déjà, le portail l'affiche. Vérifie que ce n'est pas la même personne. Si c'est bien quelqu'un d'autre, clique sur **C'est une autre personne, enregistrer**.

## La fiche client
- **Modifier** : corrige les informations ou ajoute un permis.
- **Nouvel achat** : enregistre une vente pour ce client.
- **Parrainage** : son parrain et ses filleuls.
- **Coupons** : ses coupons disponibles, et sa progression de fidélité.
- **Achats** : l'historique de tout ce qu'il a acheté.

> 💡 **Astuce :** la recherche des clients fonctionne avec le nom, le prénom ou le téléphone.
$md$),

('Ventes : enregistrer un achat', 'Guide du portail', 3, true, $md$
# Enregistrer un achat
Un achat s'enregistre **depuis la fiche du client** : ouvre le client, puis **Nouvel achat**.

## Étape par étape
1. **Véhicule** : tape quelques lettres du nom et choisis dans la liste (flèches ↑ ↓ puis Entrée). Les accents et la ponctuation sont ignorés : `brioso ra` trouve « Brioso R/A ».
2. Le **type** (voiture, moto, bateau…) se remplit tout seul selon la gamme du véhicule. Vérifie-le.
3. **Prix de vente** : saisis le prix réellement payé, **remise ou coupon déjà déduit**.
4. Coche si besoin :
   - **Véhicule en stock** : il est déjà à la concession, la vente passe directement en « Réceptionné · à livrer ».
   - **Immédiat** : le client le veut tout de suite, l'équipe est prévenue sur Discord pour aller le chercher sans attendre la tournée.
5. **Coupon** : si le client a des coupons disponibles, ils sont proposés. Un seul par achat, ils ne se cumulent pas. Le prix n'est pas recalculé.
6. **Enregistrer la vente**.

> ⚠️ **Permis manquant :** si le client n'a pas le permis correspondant au type de véhicule, un avertissement s'affiche. La vente reste possible mais sera signalée.

> 💡 **Véhicule introuvable ?** Clique sur « Véhicule absent du catalogue ? » pour taper le nom à la main. Préviens le Patron pour qu'il mette le catalogue à jour : un véhicule hors catalogue est compté à part dans l'analyse.
$md$),

('Ventes : suivre et livrer un véhicule', 'Guide du portail', 4, true, $md$
# Suivre une vente jusqu'à la livraison

## Le circuit
1. **À commander** : le véhicule doit être commandé.
2. **À chercher** : il est commandé, quelqu'un doit aller le récupérer.
3. **Réceptionné · à livrer** : il est à la concession, on contacte le client pour lui remettre.
4. **Livré** : le client a son véhicule.

Sur la fiche d'une vente, le bouton vert fait passer à l'étape suivante. Chaque étape garde **qui l'a faite et quand**.

## La livraison
Au passage en **Livré**, une fenêtre s'ouvre si nécessaire :
- **Plaque** : obligatoire pour les véhicules terrestres, en majuscules. Une plaque ne peut servir qu'une fois.
- **🎁 Cadeau** : si le prix de vente donne droit à un cadeau (bouteille de vin, champagne…), il est indiqué. Pour le vin, choisis **blanc ou rouge**. Remets-le au client.
- **🔧 Partenariat** : rappel de la réduction chez notre partenaire, **à annoncer au client**.

## Revenir en arrière, annuler
- **Revenir à l'étape précédente** : en cas d'erreur de clic (selon ton grade).
- **Annuler la vente** : avec un motif. Le coupon utilisé est rendu au client, et un coupon de fidélité ou de parrainage généré par cette vente est retiré s'il n'a pas servi.
- **Rétablir la vente** : remet une vente annulée en « À commander ».

> 💡 **Astuce :** dans **Ventes**, tu peux chercher une référence (`BP-0012`), une plaque, un véhicule ou un client.
$md$),

('Tournée : commander et récupérer les véhicules', 'Guide du portail', 5, true, $md$
# La tournée
Toutes les **30 minutes** (à xxh00 et xxh30), on commande et on va chercher tous les véhicules en attente.

## Sur Discord
- Le salon de tournée contient **un seul tableau**, mis à jour en direct à chaque changement.
- À chaque tournée, il est **republié avec une mention** : c'est ta notification.
- **⏰ Retard** : un véhicule qui attend depuis trop de tournées est marqué, et un responsable est mentionné.
- **⚡ Immédiat** : une vente immédiate republie le tableau tout de suite.

## Sur le portail (menu Tournée)
1. La colonne **À commander** : coche les véhicules commandés, puis **Commandé → À chercher**.
2. La colonne **À chercher** : au retour, coche les véhicules récupérés, puis **Récupéré → Réceptionné**.
3. La colonne **Réceptionné** : ouvre la vente pour la livrer au client.

> 💡 **Astuce :** **Tout cocher** sélectionne toute une colonne. Le bouton **Notifier sur Discord** republie le tableau avec la mention, en dehors des tournées.
$md$),

('Avantages clients : coupons, fidélité, parrainage, cadeaux', 'Guide du portail', 6, true, $md$
# Les avantages clients

## Coupons de promotion
- Un **pourcentage de réduction**, attribué sur la fiche client (bouton **Attribuer un coupon**) par les grades autorisés, avec une **raison** et une date d'expiration facultative.
- Il s'utilise dans **Nouvel achat**. Un seul coupon par achat, **non cumulable**. Saisis le prix déjà remisé.
- La fiche du client garde l'historique : **utilisé par qui, quand, sur quel achat**.

## Fidélité
- Tous les **X achats** (ceux qui atteignent le montant minimum s'il y en a un), le client reçoit **automatiquement** un coupon.
- La progression est affichée sur la fiche client : « 3 / 10 vers le prochain coupon ».

## Parrainage
- Un client peut avoir **un seul parrain**, qui doit avoir une fiche client.
- Le parrainage s'enregistre **avant le premier achat** du filleul : à la création de sa fiche, ou avec **Enregistrer un parrain**.
- **Le filleul** reçoit son coupon tout de suite, utilisable sur son premier achat.
- **Le parrain** reçoit le sien quand le filleul a fait son premier achat.
- Pas de parrainage croisé, et un nombre maximum de filleuls par parrain.

## Cadeaux à la livraison
Selon le prix de vente, un cadeau est remis à la livraison (voir « Ventes : suivre et livrer un véhicule »). Le portail l'indique tout seul.

> 💡 **Au comptoir :** pense à demander au client s'il vient de la part de quelqu'un. C'est le seul moment pour enregistrer un parrainage.
$md$),

('Partenariat customisation', 'Guide du portail', 7, true, $md$
# Le partenariat customisation
Un client qui se présente chez notre partenaire **avec le véhicule acheté chez nous**, dans les heures qui suivent la livraison, obtient une réduction sur sa customisation.

## Ce que tu fais, toi
- À la livraison, la fenêtre te rappelle l'offre : **annonce-la au client** (réduction et délai).
- La fiche de la vente indique ensuite le temps restant, puis la customisation quand le partenaire l'a validée.

## Ce que fait le partenaire
- Ses employés se connectent au portail avec leur Discord et ne voient que **leur espace** : les véhicules éligibles (véhicule, plaque, client), la liste de nos employés et le contrat.
- Quand la customisation est faite, ils la **valident** avec le montant facturé.

## Pour nous, employés
Le partenaire nous offre aussi des avantages : consulte la page **Partenaires** pour savoir lesquels.
$md$),

('Discord : commandes du bot et salons', 'Guide du portail', 8, true, $md$
# Le bot Discord
Tape `/` dans Discord pour voir les commandes. Les réponses ne sont visibles **que par toi**.

- `/client` + un nom ou un téléphone : retrouve un client et ouvre sa fiche.
- `/vente` + une référence (`BP-0012`), une plaque, un véhicule ou un client : où en est la vente.
- `/tournee` : ce qu'il reste à commander, à chercher et à livrer.

## Les salons
- **Logs** : chaque action du portail, avec son auteur.
- **Tournée** : le tableau de tournée unique, republié à chaque tournée.

> 💡 **Astuce :** si les commandes n'apparaissent pas, fais **Ctrl+R** dans Discord.
$md$),

('Patron : configurer le portail', 'Guide du portail', 9, true, $md$
# Configurer le portail
Menu **Configuration** (permission « Configuration du portail »). Tout s'applique immédiatement.

## Les onglets
- **Grades & permissions** : relie chaque grade à son rôle Discord et coche ce qu'il peut faire. Un grade peut aussi être relié à un **partenaire** (accès limité à son espace).
- **Fiche client / Fiche vente** : ajoute, renomme ou réordonne les champs (texte, date, liste, image à coller…).
- **Véhicules** : catégories, types, permis requis et plaque à la livraison.
- **Catalogue** : importe la liste des véhicules depuis le panel légal (copier-coller de la réponse du panel, avec un aperçu avant import) et règle les gammes.
- **Discord, tournée & statuts** : salons, rôles mentionnés, retards, noms et couleurs des statuts.
- **Avantages clients** : coupons, fidélité, parrainage, cadeaux et partenariats.
- **Membres** : qui s'est connecté et avec quels grades.

## Mettre à jour le catalogue
1. Ouvre le panel légal, **F12 → Network → Fetch/XHR**, puis **F5**.
2. Clic droit sur `data?company=soc-bigpaulie…` → **Copy → Copy response**.
3. **Configuration → Catalogue** : colle, **Vérifier**, puis **Importer**.

## Les fiches de formation
Dans **Formation**, **Nouvelle fiche** : titres, gras, listes, astuces et images collées avec Ctrl+V. Une fiche peut rester en **brouillon** tant qu'elle n'est pas prête. Ce guide se modifie de la même façon.
$md$),

('Questions fréquentes', 'Guide du portail', 10, true, $md$
# Questions fréquentes

### Je ne vois pas un menu ou un bouton
Ton grade ne le permet pas. Les droits se règlent dans Configuration → Grades & permissions. Après un changement de rôle sur Discord, il faut jusqu'à 5 minutes pour que le portail le prenne en compte.

### L'image du permis ne se colle pas
Clique d'abord **dans la zone** du permis (elle devient dorée), puis **Ctrl+V**. Sinon, utilise « choisir un fichier ».

### « La plaque est déjà attribuée »
Une plaque ne peut servir qu'à une seule vente. Vérifie la saisie, ou cherche la plaque dans **Ventes**.

### J'ai annulé une vente par erreur
Ouvre la vente, puis **Rétablir la vente**. Elle repart en « À commander ».

### Le client a déjà un coupon mais il n'apparaît pas à l'achat
Il est peut-être **expiré**, **déjà utilisé** ou **annulé** : regarde l'historique des coupons sur sa fiche.

### Le parrainage est refusé
Le filleul a déjà un achat, le parrain a atteint son maximum de filleuls, ou le parrainage serait croisé. Le message indique la raison.

### Une information est fausse dans ce guide
Préviens le Patron : il peut modifier la fiche dans Formation.
$md$);
