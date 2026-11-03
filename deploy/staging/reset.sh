#!/bin/bash
# Wipe every tenant, user, order and media file and start staging from an empty database.
# Takes a backup first (backup.sh) unless SKIP_BACKUP=1. Keeps the Caddy volumes (TLS
# certificates) so Let's Encrypt is not asked again. On the VPS:
#   ./reset.sh                        # asks to type RESET
#   ./reset.sh ops@domain.id "Ops"    # also creates the first operator (password asked)
# Afterwards every POS device must be activated again (clear the site data in its browser).
set -euo pipefail

cd "$(dirname "$0")"
project=$(docker compose config | sed -n 's/^name: //p')

read -r -p "Delete ALL data of '$project' (database + media)? Type RESET: " answer
[ "$answer" = RESET ] || { echo "aborted"; exit 1; }

if [ "${SKIP_BACKUP:-0}" != 1 ]; then
  ./backup.sh
fi

docker compose down
docker volume rm "${project}_postgres" "${project}_media"
# initdb/01-roles.sh recreates the roles on the empty volume, then `migrate` runs before `api`.
docker compose up -d --build

if [ $# -ge 2 ]; then
  docker compose exec -it api python -m poslite.platform_admin create-admin "$1" "$2"
fi
echo "$(date -u +%FT%TZ) reset ok: $project starts empty"
