#!/usr/bin/env bash
# Roda "prisma migrate deploy" usando a conexão direta (DIRECT_URL), com
# algumas tentativas: bancos como o Neon podem hibernar quando ficam sem uso
# e demorar mais que o timeout padrão do Prisma (10s) para acordar e liberar
# o advisory lock da migration, causando falha (P1002) mesmo sem nenhum
# problema real de configuração.
set -euo pipefail

export DATABASE_URL="${DIRECT_URL:-$DATABASE_URL}"

max_attempts=4
attempt=1

until npx prisma migrate deploy; do
  if [ "$attempt" -ge "$max_attempts" ]; then
    echo "prisma migrate deploy falhou após $max_attempts tentativas" >&2
    exit 1
  fi
  echo "prisma migrate deploy falhou (tentativa $attempt/$max_attempts), tentando de novo em 15s..." >&2
  attempt=$((attempt + 1))
  sleep 15
done
