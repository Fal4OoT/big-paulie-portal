# Déploiement sur le VPS (à côté du portail Police Academy)

Objectif : deux portails sur le même VPS, **sans aucune dépendance entre eux**. Le jour où le portail PA part chez le fondateur, Big Paulie continue de tourner sans rien toucher.

## Principe

```
Internet ──443──► Proxy HTTPS (un seul, possède les ports 80/443)
                     ├── portail.falaoot.fr   ──► stack PA
                     └── bigpaulie.falaoot.fr ──► 127.0.0.1:8081 (gateway de la stack Big Paulie)
```

- La stack Big Paulie (`name: bigpaulie` dans le compose) a son propre réseau, ses propres volumes et sa propre base PostgreSQL.
- Elle n'expose qu'un port HTTP local (`127.0.0.1:8081` par défaut) : elle ne prend ni le 80 ni le 443.
- Un seul programme peut écouter sur 80/443 : c'est le **proxy HTTPS** qui distribue les sous-domaines et gère les certificats.

## Étape 1 — DNS

Chez Cloudflare (ou ton registrar), ajoute un enregistrement **A** `bigpaulie` → IP du VPS.
Si tu utilises le proxy orange de Cloudflare, mets le mode SSL/TLS en **Full (strict)** ; sinon laisse en gris (DNS only) le temps d'obtenir le certificat.

## Étape 2 — Récupérer le projet et le configurer

```bash
cd /opt   # ou le dossier où se trouve déjà le portail PA
git clone git@github.com:<ton-compte>/big-paulie-portal.git
cd big-paulie-portal
cp .env.example .env
nano .env
```

Dans `.env` :
- `PUBLIC_URL=https://bigpaulie.falaoot.fr`
- les identifiants Discord. Sur le portail développeur, ajoute la redirection `https://bigpaulie.falaoot.fr/api/auth/callback`.
- `POSTGRES_PASSWORD` et `INTERNAL_API_KEY` : `openssl rand -hex 32` (une valeur différente pour chacun).

```bash
docker compose up -d --build
curl -s http://127.0.0.1:8081/api/health   # doit répondre {"status":"ok"}
```

## Étape 3 — Brancher le sous-domaine sur le proxy HTTPS

Aujourd'hui, ton proxy HTTPS est le Caddy qui tourne **dans la stack du portail PA**. Deux options :

### Option A (recommandée) : un Caddy « frontal » indépendant des deux portails

C'est la seule configuration où le départ du PA n'a **aucun** impact. Le Caddy est installé directement sur le VPS (hors Docker) et ne fait que distribuer les sous-domaines.

1. Dans le compose du **PA**, remplace l'exposition `80:80` / `443:443` de son Caddy par un port local, par exemple `127.0.0.1:8080:80`, et passe son Caddyfile en HTTP simple (`:80 { … }` au lieu de `portail.falaoot.fr { … }`).
   → Envoie-moi le `docker-compose.yml` et le `Caddyfile` du PA si tu veux que je te prépare la modification exacte.
2. Installe Caddy sur le VPS :
   ```bash
   sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https curl
   curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
   curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
   sudo apt update && sudo apt install -y caddy
   ```
3. `/etc/caddy/Caddyfile` :
   ```
   portail.falaoot.fr {
   	reverse_proxy 127.0.0.1:8080
   }

   bigpaulie.falaoot.fr {
   	reverse_proxy 127.0.0.1:8081
   }
   ```
4. `sudo systemctl reload caddy` (après avoir relancé la stack PA pour libérer 80/443).

Quand le PA part : tu supprimes son bloc dans `/etc/caddy/Caddyfile`, c'est tout.

### Option B (rapide) : ajouter Big Paulie au Caddy du PA

Plus rapide, mais crée une dépendance **temporaire** : si la stack PA est arrêtée, Big Paulie n'est plus joignable. Il faudra passer à l'option A avant le départ du PA.

1. Dans `.env` de Big Paulie : `BP_BIND=172.17.0.1` (adresse de l'hôte vue depuis Docker), puis `docker compose up -d`.
2. Dans le compose du PA, service Caddy : ajoute
   ```yaml
   extra_hosts:
     - "host.docker.internal:host-gateway"
   ```
3. Dans le Caddyfile du PA :
   ```
   bigpaulie.falaoot.fr {
   	reverse_proxy host.docker.internal:8081
   }
   ```
4. Relance le Caddy du PA.

## Mise à jour

```bash
cd big-paulie-portal
git pull
docker compose up -d --build
```

Les migrations de base s'appliquent toutes seules au redémarrage de l'API.

## Sauvegarde / restauration

```bash
# Sauvegarde (clients, ventes, historique, images de permis, configuration)
docker compose exec -T db pg_dump -U bigpaulie -Fc bigpaulie > backup-$(date +%F).dump

# Restauration
docker compose exec -T db pg_restore -U bigpaulie -d bigpaulie --clean --if-exists < backup-AAAA-MM-JJ.dump
```

Conseil : une tâche cron quotidienne avec `pg_dump` et une rotation sur 7 jours.

## Ressources

Le VPS (2 vCores, 4 Go) porte sans souci les deux stacks. Big Paulie au repos : ~350 Mo de RAM (PostgreSQL, API, front, bot, gateway). Le build Docker du front est le moment le plus gourmand : lance les builds des deux portails l'un après l'autre.
