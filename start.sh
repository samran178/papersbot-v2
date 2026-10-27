#!/usr/bin/env bash
# Production server. Django serves the API and the built React app on one port.
set -euo pipefail
cd "$(dirname "$0")/backend"
exec gunicorn config.wsgi:application --bind "0.0.0.0:${PORT:-8000}" --workers "${WEB_CONCURRENCY:-3}" --timeout 120
