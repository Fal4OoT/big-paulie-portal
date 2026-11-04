#!/usr/bin/env bash
# =============================================================================
#  Big Paulie Portal — mise à jour sur le VPS
#
#  Usage (depuis n'importe quel dossier) :
#     ~/big-paulie-portal/deploy/update.sh                 mise à jour normale
#     ~/big-paulie-portal/deploy/update.sh --forcer        reconstruit même sans nouveauté
#     ~/big-paulie-portal/deploy/update.sh --sans-sauvegarde
#
#  Étapes : vérifications → sauvegarde de la base → git pull → reconstruction
#           Docker → contrôle de santé → nettoyage des anciennes images.
# =============================================================================
set -Eeuo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

BACKUP_DIR="${BACKUP_DIR:-$HOME/backups/bigpaulie}"
BRANCH="main"
FORCE=false
SKIP_BACKUP=false

# ---------- Affichage ----------
if [[ -t 1 ]]; then R=$'\e[31m'; G=$'\e[32m'; Y=$'\e[33m'; B=$'\e[1m'; N=$'\e[0m'; else R=""; G=""; Y=""; B=""; N=""; fi
step() { printf '\n%s==>%s %s%s%s\n' "$R" "$N" "$B" "$*" "$N"; }
ok()   { printf '  %s✔%s %s\n' "$G" "$N" "$*"; }
warn() { printf '  %s!%s %s\n' "$Y" "$N" "$*"; }
die()  { printf '\n  %s✘ %s%s\n\n' "$R" "$*" "$N" >&2; exit 1; }

usage() {
  sed -n '3,11p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
}

for arg in "$@"; do
  case "$arg" in
    --forcer) FORCE=true ;;
    --sans-sauvegarde) SKIP_BACKUP=true ;;
    -h|--help|--aide) usage; exit 0 ;;
    *) die "Option inconnue : $arg (voir --aide)" ;;
  esac
done

OLD_COMMIT=""
BACKUP_FILE=""

on_error() {
  local line=$1
  printf '\n  %s✘ La mise à jour s'"'"'est arrêtée (ligne %s).%s\n' "$R" "$line" "$N" >&2
  if [[ -n "$OLD_COMMIT" && "$(git rev-parse HEAD)" != "$OLD_COMMIT" ]]; then
    cat >&2 <<EOF

  Pour revenir à la version précédente :
     cd $ROOT
     git reset --hard $OLD_COMMIT
     docker compose up -d --build
EOF
    if [[ -n "$BACKUP_FILE" ]]; then
      cat >&2 <<EOF

  Si la base a été modifiée par la nouvelle version, restaure la sauvegarde :
     docker compose exec -T db pg_restore -U bigpaulie -d bigpaulie --clean --if-exists < $BACKUP_FILE
EOF
    fi
  fi
  printf '\n  Envoie ce message à Claude si tu as besoin d'"'"'aide.\n\n' >&2
}
trap 'on_error $LINENO' ERR

# Lit une valeur du .env (sans exécuter le fichier).
env_value() {
  local v
  v="$({ grep -E "^$1=" .env 2>/dev/null || true; } | tail -n1 | cut -d= -f2- | tr -d '\r' | sed -e 's/^"//' -e 's/"$//')"
  printf '%s' "${v:-$2}"
}

printf '%s\n' "${B}Big Paulie · mise à jour du portail${N}  ($(date '+%d/%m/%Y %H:%M'))"

# ---------- 1. Vérifications ----------
step "Vérifications"
command -v git >/dev/null || die "git n'est pas installé."
command -v docker >/dev/null || die "docker n'est pas installé."
docker compose version >/dev/null 2>&1 || die "docker compose est indisponible."
[[ -f .env ]] || die "Fichier .env introuvable dans $ROOT."
ok "Outils et .env présents"

current_branch="$(git rev-parse --abbrev-ref HEAD)"
[[ "$current_branch" == "$BRANCH" ]] || die "Le dépôt est sur la branche « $current_branch ». Fais : git switch $BRANCH"
if ! git diff --quiet || ! git diff --cached --quiet; then
  git status --short
  die "Des fichiers suivis ont été modifiés directement sur le VPS. Annule-les (git restore .) ou demande de l'aide."
fi
ok "Branche $BRANCH, aucune modification locale"

# ---------- 2. Nouveautés ----------
step "Recherche des nouveautés sur GitHub"
git fetch --quiet origin "$BRANCH"
OLD_COMMIT="$(git rev-parse HEAD)"
NEW_COMMIT="$(git rev-parse "origin/$BRANCH")"

if [[ "$OLD_COMMIT" == "$NEW_COMMIT" ]]; then
  ok "Déjà à jour ($(git log -1 --format='%h · %s'))"
  if ! $FORCE; then
    printf '\n  Rien à faire. Utilise --forcer pour reconstruire quand même.\n\n'
    exit 0
  fi
  warn "--forcer : reconstruction sans nouveauté"
else
  git merge-base --is-ancestor "$OLD_COMMIT" "$NEW_COMMIT" \
    || die "L'historique local et celui de GitHub ont divergé. Ne force rien, demande de l'aide."
  echo "  Modifications à appliquer :"
  git log --format='    • %h %s' "$OLD_COMMIT..$NEW_COMMIT"
fi

# ---------- 3. Sauvegarde ----------
step "Sauvegarde de la base"
if $SKIP_BACKUP; then
  warn "Sauvegarde ignorée (--sans-sauvegarde)"
elif [[ -z "$(docker compose ps -q db 2>/dev/null)" ]]; then
  warn "La base n'est pas démarrée : pas de sauvegarde (première installation ?)"
else
  mkdir -p "$BACKUP_DIR"
  BACKUP_FILE="$BACKUP_DIR/bp-avant-maj-$(date +%F_%H%M%S).dump"
  docker compose exec -T db pg_dump -U bigpaulie -Fc bigpaulie > "$BACKUP_FILE"
  [[ -s "$BACKUP_FILE" ]] || die "La sauvegarde est vide : mise à jour annulée."
  ok "Sauvegarde : $BACKUP_FILE ($(du -h "$BACKUP_FILE" | cut -f1))"
  # Les sauvegardes d'avant mise à jour sont gardées 30 jours.
  find "$BACKUP_DIR" -name 'bp-avant-maj-*.dump' -mtime +30 -delete 2>/dev/null || true
fi

# ---------- 4. Code ----------
if [[ "$OLD_COMMIT" != "$NEW_COMMIT" ]]; then
  step "Récupération du code"
  git pull --ff-only --quiet origin "$BRANCH"
  ok "Code à jour : $(git log -1 --format='%h · %s')"
fi

# ---------- 5. Reconstruction ----------
step "Reconstruction et redémarrage (quelques minutes)"
docker compose up -d --build --remove-orphans
ok "Conteneurs relancés"

# ---------- 6. Contrôle de santé ----------
step "Contrôle de santé"
BIND="$(env_value BP_BIND 127.0.0.1)"
PORT="$(env_value BP_HTTP_PORT 8081)"
URL="http://$BIND:$PORT/api/health"
healthy=false
for _ in $(seq 1 60); do
  if curl -fsS --max-time 3 "$URL" >/dev/null 2>&1; then healthy=true; break; fi
  sleep 2
done

if ! $healthy; then
  docker compose ps
  echo
  docker compose logs --tail 40 api
  false # déclenche le message d'erreur et les instructions de retour arrière
fi
ok "Le portail répond ($URL)"

migrations="$(docker compose logs --since 10m api 2>/dev/null | grep -o 'Migration appliquée : [^ ]*' || true)"
if [[ -n "$migrations" ]]; then
  while IFS= read -r m; do ok "$m"; done <<< "$migrations"
fi

running="$(docker compose ps --status running --services | sort | tr '\n' ' ')"
for svc in api bot db gateway web; do
  [[ " $running " == *" $svc "* ]] || warn "Le service « $svc » n'est pas démarré : docker compose logs $svc"
done

# ---------- 7. Nettoyage ----------
step "Nettoyage"
docker image prune -f >/dev/null
ok "Anciennes images Docker supprimées"

trap - ERR
printf '\n%s✔ Mise à jour terminée%s · version %s\n\n' "$G" "$N" "$(git log -1 --format='%h (%cd)' --date=format:'%d/%m/%Y %H:%M')"
