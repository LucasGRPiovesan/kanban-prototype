#!/bin/sh
set -e

# Entry point of the API image. Two roles, chosen by the command:
#
#   migrate  — apply migrations, then run the idempotent seed, then exit. Docker Compose
#              runs this as a one-shot service that the API waits on, so the two never
#              interleave in the logs or race each other for the database.
#   <other>  — start the given command (the API server). With RUN_MIGRATIONS=true the
#              migrate step runs first, in the same container — convenient for a plain
#              `docker run` without Compose.

export PRISMA_HIDE_UPDATE_MESSAGE=1

migrate() {
  # Compose already gates this on the MySQL healthcheck, but a healthcheck only proves the
  # server answered once. Retrying turns the short window where MySQL accepts connections
  # but is still bootstrapping into a delay rather than a failure.
  attempts=30
  delay=3
  i=1
  echo "[migrate] Aplicando migrations..."
  while [ "$i" -le "$attempts" ]; do
    if node node_modules/tsx/dist/cli.mjs scripts/prisma.ts migrate deploy; then
      echo "[migrate] Migrations aplicadas."
      break
    fi
    if [ "$i" -eq "$attempts" ]; then
      echo "[migrate] Falha ao aplicar migrations apos $attempts tentativas." >&2
      exit 1
    fi
    echo "[migrate] Banco indisponivel (tentativa $i/$attempts). Nova tentativa em ${delay}s..."
    sleep "$delay"
    i=$((i + 1))
  done

  # The seed is idempotent and corrective (system roles' permission matrix). A failure is
  # reported but does not block the API — the same behaviour as before.
  echo "[seed] Executando seed (idempotente)..."
  if node node_modules/tsx/dist/cli.mjs prisma/seed.ts; then
    echo "[seed] Seed concluida."
  else
    echo "[seed] Aviso: seed nao concluida; a API sera iniciada mesmo assim." >&2
  fi
}

if [ "$1" = "migrate" ]; then
  migrate
  exit 0
fi

if [ "${RUN_MIGRATIONS:-false}" = "true" ]; then
  migrate
fi

echo "[api] Iniciando API..."
exec "$@"
