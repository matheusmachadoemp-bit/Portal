#!/usr/bin/env bash
# Roda "prisma migrate deploy" usando a conexão direta (DIRECT_URL), com
# algumas tentativas: bancos como o Neon podem hibernar quando ficam sem uso
# e demorar mais que o timeout padrão do Prisma (10s) para acordar e liberar
# o advisory lock da migration, causando falha (P1002) mesmo sem nenhum
# problema real de configuração. Este repositório também tem 3 projetos
# Vercel publicando o mesmo commit ao mesmo tempo, então é comum vários
# builds disputarem o mesmo advisory lock — por isso a espera entre
# tentativas é aleatória (jitter), evitando que builds que começaram juntos
# fiquem sempre tentando no mesmo instante e colidindo de novo a cada vez.
set -euo pipefail

export DATABASE_URL="${DIRECT_URL:-$DATABASE_URL}"

max_attempts=6
attempt=1

until npx prisma migrate deploy; do
  if [ "$attempt" -ge "$max_attempts" ]; then
    echo "prisma migrate deploy falhou após $max_attempts tentativas" >&2
    exit 1
  fi
  wait_seconds=$((10 + RANDOM % 21))
  echo "prisma migrate deploy falhou (tentativa $attempt/$max_attempts), tentando de novo em ${wait_seconds}s..." >&2
  attempt=$((attempt + 1))
  sleep "$wait_seconds"
done
