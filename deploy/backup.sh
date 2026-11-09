#!/usr/bin/env bash
# =============================================================================
#  Big Paulie Portal — sauvegardes automatiques de la base
#
#  Usage :
#     bash ~/big-paulie-portal/deploy/backup.sh --installer      active la sauvegarde toutes les 30 min (cron)
#     bash ~/big-paulie-portal/deploy/backup.sh --desinstaller   désactive la sauvegarde automatique
#     bash ~/big-paulie-portal/deploy/backup.sh                  fait une sauvegarde maintenant
#     bash ~/big-paulie-portal/deploy/backup.sh --liste          liste les sauvegardes et la place utilisée
#     bash ~/big-paulie-portal/deploy/backup.sh --restaurer FICHIER   remet la base dans l'état de ce fichier
#
#  Les sauvegardes sont dans ~/backups/bigpaulie/auto et gardées 14 jours.
#  Si rien n'a changé dans la base depuis la précédente, aucune nouvelle copie n'est faite.
# =============================================================================
set -Eeuo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SELF="$ROOT/deploy/backup.sh"
cd "$ROOT"

BACKUP_ROOT="${BACKUP_DIR:-$HOME/backups/bigpaulie}"
AUTO_DIR="$BACKUP_ROOT/auto"
LOG="$BACKUP_ROOT/backup.log"
RETENTION_DAYS="${RETENTION_DAYS:-14}"
MIN_FREE_MB="${MIN_FREE_MB:-2048}"
CRON_MARK="# big-paulie-backup"
CRON_LINE="*/30 * * * * /bin/bash $SELF >/dev/null 2>&1 $CRON_MARK"

if [[ -t 1 ]]; then R=$'\e[31m'; G=$'\e[32m'; Y=$'\e[33m'; B=$'\e[1m'; N=$'\e[0m'; else R=""; G=""; Y=""; B=""; N=""; fi
ok()   { printf '  %s✔%s %s\n' "$G" "$N" "$*"; }
warn() { printf '  %s!%s %s\n' "$Y" "$N" "$*"; }
die()  { printf '\n  %s✘ %s%s\n\n' "$R" "$*" "$N" >&2; log "ERREUR : $*"; exit 1; }
log()  { mkdir -p "$BACKUP_ROOT"; printf '%s  %s\n' "$(date '+%F %T')" "$*" >> "$LOG"; }

db_running() { [[ -n "$(docker compose ps -q --status running db 2>/dev/null)" ]]; }
psql_q() { docker compose exec -T db psql -U bigpaulie -d bigpaulie -At -c "$1"; }

# ---------- Sauvegarde ----------
backup_now() {
  mkdir -p "$AUTO_DIR"
  # Une seule sauvegarde à la fois (si la précédente est encore en cours, on passe).
  exec 9>"$BACKUP_ROOT/.lock"
  if ! flock -n 9; then log "Sauvegarde précédente encore en cours : ignorée."; return 0; fi

  db_running || die "La base n'est pas démarrée (docker compose ps)."

  local free_mb
  free_mb="$(df -Pm "$AUTO_DIR" | awk 'NR==2 {print $4}')"
  if (( free_mb < MIN_FREE_MB )); then
    warn "Moins de $MIN_FREE_MB Mo libres sur le disque ($free_mb Mo) : sauvegarde annulée."
    log "Espace disque insuffisant ($free_mb Mo libres) : sauvegarde annulée."
    purge
    return 1
  fi

  # Empreinte des écritures : si aucune ligne n'a été ajoutée, modifiée ou supprimée, inutile de recopier.
  local fp last=""
  fp="$(psql_q "SELECT coalesce(sum(n_tup_ins + n_tup_upd + n_tup_del), 0) || '-' || count(*) FROM pg_stat_user_tables" 2>/dev/null || echo "inconnu")"
  [[ -f "$AUTO_DIR/.empreinte" ]] && last="$(cat "$AUTO_DIR/.empreinte")"
  if [[ "$fp" != "inconnu" && "$fp" == "$last" && -n "$(ls -A "$AUTO_DIR"/*.dump 2>/dev/null)" ]]; then
    log "Aucun changement depuis la dernière sauvegarde."
    purge
    [[ -t 1 ]] && ok "Aucun changement depuis la dernière sauvegarde : rien à faire."
    return 0
  fi

  local file="$AUTO_DIR/bp-$(date +%F_%H%M).dump"
  local tmp="$file.partiel"
  if ! docker compose exec -T db pg_dump -U bigpaulie -Fc bigpaulie > "$tmp" || [[ ! -s "$tmp" ]]; then
    rm -f "$tmp"
    die "pg_dump a échoué."
  fi
  mv "$tmp" "$file"
  printf '%s' "$fp" > "$AUTO_DIR/.empreinte"
  log "Sauvegarde : $(basename "$file") ($(du -h "$file" | cut -f1))"
  [[ -t 1 ]] && ok "Sauvegarde : $file ($(du -h "$file" | cut -f1))"
  purge
}

purge() {
  find "$AUTO_DIR" -name 'bp-*.dump' -mtime +"$((RETENTION_DAYS - 1))" -delete 2>/dev/null || true
  find "$AUTO_DIR" -name '*.partiel' -mmin +60 -delete 2>/dev/null || true
  # Journal limité aux 2000 dernières lignes.
  if [[ -f "$LOG" ]] && (( $(wc -l < "$LOG") > 2000 )); then
    tail -n 1000 "$LOG" > "$LOG.tmp" && mv "$LOG.tmp" "$LOG"
  fi
}

# ---------- Commandes ----------
install_cron() {
  command -v crontab >/dev/null || die "cron n'est pas installé : sudo apt install cron"
  { crontab -l 2>/dev/null | grep -v "$CRON_MARK" || true; echo "$CRON_LINE"; } | crontab -
  ok "Sauvegarde automatique activée : toutes les 30 minutes (xxh00 et xxh30), gardée $RETENTION_DAYS jours."
  echo "  Première sauvegarde maintenant :"
  backup_now
  echo
  echo "  Dossier : $AUTO_DIR"
  echo "  Journal : $LOG"
}

uninstall_cron() {
  { crontab -l 2>/dev/null | grep -v "$CRON_MARK" || true; } | crontab -
  ok "Sauvegarde automatique désactivée (les fichiers existants sont conservés dans $AUTO_DIR)."
}

list_backups() {
  if crontab -l 2>/dev/null | grep -q "$CRON_MARK"; then ok "Sauvegarde automatique : activée"; else warn "Sauvegarde automatique : désactivée (--installer)"; fi
  local files
  files="$(ls -1t "$AUTO_DIR"/bp-*.dump 2>/dev/null || true)"
  if [[ -z "$files" ]]; then warn "Aucune sauvegarde automatique pour le moment."; return; fi
  echo
  echo "  ${B}10 plus récentes${N}"
  head -n 10 <<< "$files" | while read -r f; do printf '    %s  %s\n' "$(du -h "$f" | cut -f1)" "$f"; done
  echo
  printf '  %s sauvegarde(s), %s au total · disque : %s libres\n' \
    "$(wc -l <<< "$files" | tr -d ' ')" "$(du -ch $files | tail -n1 | cut -f1)" "$(df -Ph "$AUTO_DIR" | awk 'NR==2 {print $4}')"
  [[ -f "$LOG" ]] && { echo; echo "  ${B}Dernières lignes du journal${N}"; tail -n 5 "$LOG" | sed 's/^/    /'; }
}

restore() {
  local file="${1:-}"
  [[ -n "$file" && -s "$file" ]] || die "Indique un fichier de sauvegarde existant (voir --liste)."
  db_running || die "La base n'est pas démarrée."
  echo
  echo "  ${B}${R}Attention${N} : la base actuelle va être remplacée par :"
  echo "     $file"
  echo "  Tout ce qui a été saisi après cette sauvegarde sera perdu."
  echo "  (Une sauvegarde de l'état actuel est faite juste avant, par sécurité.)"
  echo
  read -r -p "  Tape RESTAURER pour confirmer : " answer
  [[ "$answer" == "RESTAURER" ]] || die "Restauration annulée."

  mkdir -p "$BACKUP_ROOT"
  local safety="$BACKUP_ROOT/bp-avant-restauration-$(date +%F_%H%M%S).dump"
  docker compose exec -T db pg_dump -U bigpaulie -Fc bigpaulie > "$safety"
  ok "État actuel sauvegardé : $safety"

  docker compose stop api bot >/dev/null
  if docker compose exec -T db pg_restore -U bigpaulie -d bigpaulie --clean --if-exists --no-owner < "$file"; then
    ok "Base restaurée"
  else
    warn "pg_restore a signalé des avertissements : vérifie le portail."
  fi
  rm -f "$AUTO_DIR/.empreinte"
  docker compose start api bot >/dev/null
  ok "Portail redémarré"
  log "Restauration depuis $(basename "$file") (état précédent : $(basename "$safety"))"
}

case "${1:-}" in
  --installer) install_cron ;;
  --desinstaller) uninstall_cron ;;
  --liste) list_backups ;;
  --restaurer) restore "${2:-}" ;;
  -h|--help|--aide) sed -n '3,14p' "$SELF" | sed 's/^# \{0,1\}//' ;;
  "") backup_now ;;
  *) die "Option inconnue : $1 (voir --aide)" ;;
esac
