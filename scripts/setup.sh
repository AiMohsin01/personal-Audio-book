#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."
npm ci --cache "${FOLIO_NPM_CACHE:-/tmp/folio-npm-cache}" --no-audit --no-fund
python3 -m venv .venv
.venv/bin/pip install --cache-dir "${FOLIO_PIP_CACHE:-/tmp/folio-pip-cache}" -r companion/requirements.lock
npm run build
