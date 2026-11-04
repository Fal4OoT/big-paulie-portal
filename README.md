# Big Paulie · Portail logistique

Portail web + bot Discord de la concession **Big Paulie Budget Cars** (Sandy Shores) : comptes clients, ventes et suivi logistique des véhicules terrestres, maritimes et aériens, de la commande à la livraison.

Dépôt **autonome** : il ne dépend d'aucun autre projet (notamment pas du portail Police Academy), même s'il tourne sur le même VPS.

## Contenu

| Dossier | Rôle |
|---|---|
| `apps/api` | API ASP.NET Core 8 (Dapper + PostgreSQL) : connexion Discord, grades, clients, ventes, tournées, logs |
| `apps/web` | Front Next.js 14 (App Router, TypeScript, Tailwind), DA tirée du logo |
| `apps/bot` | Bot Discord.NET : commandes `/client`, `/vente`, `/tournee` |
| `deploy/Caddyfile.gateway` | Routage interne de la stack (`/api` → API, le reste → front) |
| `docs/DEPLOIEMENT.md` | Mise en production sur le VPS, à côté du portail PA |

## Fonctionnalités

- **Connexion Discord** : l'accès dépend des **grades**, chacun lié à un rôle Discord (resynchronisé toutes les 5 min).
  Grades par défaut : Patron, Chef de service, Confirmé, Employé, plus un accès **Staff** (lecture seule + logs).
- **Matrice de permissions** modifiable par le Patron (clients, ventes, statuts, retour arrière, annulation, tournée, logs, configuration).
- **Fiche client configurable** : prénom, nom, téléphone (saisi `5209250963`, affiché `(520)925-0963`), date de naissance (âge calculé) et un emplacement **image à coller (Ctrl+V)** par permis : voiture, moto, bateau, hélicoptère, avion. Champs ajoutables, renommables, réordonnables.
- **Détection des doublons** (même prénom + nom, renforcée si même date de naissance) avec confirmation explicite.
- **Ventes** : nom du véhicule, type → catégorie (Terrestre / Maritime / Aérien), prix, date et vendeur automatiques, option **immédiat**, champs complémentaires configurables.
  Avertissement (sans blocage) si le client n'a pas le permis correspondant au type.
- **Circuit** : À commander → À chercher → Réceptionné · à livrer → Livré. **Plaque obligatoire** (majuscules, unique) pour les catégories qui en ont (Terrestre par défaut) ; maritime et aérien sans plaque. Annulation / rétablissement.
  Libellés et couleurs des statuts configurables.
- **Historique** de chaque vente : qui a fait quoi, à chaque étape, et quand.
- **Tournées** toutes les 30 min (heure de Paris, xxh00 / xxh30) : le bot publie la liste à commander / à chercher, avec mention de rôle. Une vente immédiate déclenche une alerte tout de suite.
  Page Tournée avec cases à cocher et actions groupées.
- **Logs** : toutes les actions sont enregistrées et publiées dans un salon Discord de logs.
- **Bot** : `/client`, `/vente`, `/tournee` (réponses visibles par toi seul, droits selon tes rôles).

## Lancer en local (Docker Desktop)

1. Crée une application sur le [portail développeur Discord](https://discord.com/developers/applications) (ou réutilise une app dédiée Big Paulie) :
   - **OAuth2 → Redirects** : ajoute `http://localhost:8081/api/auth/callback`
   - **Bot** : génère le token. Aucune *Privileged Gateway Intent* n'est nécessaire.
   - **Invite le bot** sur le serveur Discord du Big Paulie (OAuth2 → URL Generator → scopes `bot` + `applications.commands`, permissions *Send Messages*, *Embed Links*, *Mention Everyone* si tu veux mentionner des rôles non mentionnables).
2. Copie `.env.example` en `.env` et remplis-le. Mets ton ID Discord dans `ADMIN_DISCORD_IDS` pour avoir tous les droits avant d'avoir lié les grades.
   Pour `POSTGRES_PASSWORD` et `INTERNAL_API_KEY`, utilise des valeurs hexadécimales (`openssl rand -hex 32`) : pas de `;` dans le mot de passe.
3. Lance :
   ```bash
   docker compose up -d --build
   ```
4. Ouvre http://localhost:8081, connecte-toi, puis va dans **Configuration** :
   - **Grades & permissions** : relie chaque grade à son rôle Discord.
   - **Discord, tournée & statuts** : choisis le salon de logs, le salon de tournée et les rôles à mentionner.

La base est créée et remplie (grades, champs, catégories, types, statuts) automatiquement au premier démarrage.

Logs en direct : `docker compose logs -f api bot`

## Notes techniques

- Les migrations SQL sont dans `apps/api/src/BigPaulie.Api/Migrations/NNN_nom.sql` et s'appliquent au démarrage de l'API (table `schema_migrations`). Pour faire évoluer le schéma, ajoute un fichier `002_…sql`, ne modifie jamais un script déjà appliqué.
- Les images de permis sont stockées dans PostgreSQL (table `files`) : une sauvegarde de la base suffit.
- Les endpoints `/api/internal/*` (bot) sont protégés par `INTERNAL_API_KEY` et bloqués par la gateway : ils ne sont joignables que depuis le réseau Docker.
- Le cookie de session (`bp_session`) est chiffré avec des clés stockées dans le volume `api-keys` : un redémarrage ne déconnecte personne.
