#!/bin/sh
set -eu
cd "$(dirname "$0")"

EMAIL="${1:?사용법: ./init-cert.sh <인증서 만료 알림을 받을 이메일>}"

docker compose stop nginx 2>/dev/null || true
docker compose run --rm -p 80:80 --entrypoint certbot certbot certonly \
  --standalone \
  -d passkuai.com -d www.passkuai.com \
  --email "$EMAIL" --agree-tos --no-eff-email
