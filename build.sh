#!/usr/bin/env bash
# Production build: run once per deploy (Linux server, Render, Railway, a VPS...).
set -euo pipefail
cd "$(dirname "$0")"

pip install -r backend/requirements.txt
(cd frontend && npm ci && npm run build)
(cd backend && python manage.py collectstatic --noinput && python manage.py migrate --noinput)
