#!/usr/bin/env bash
# init.sh — Load sample web logs into all 5 Kibana instances.
# Run this once after `docker compose up -d` and all services are healthy.
#
# Usage:  cd races/kibana-discover-evolution/docker && bash init.sh

set -euo pipefail

AUTH="elastic:changeme"
KBN_HEADER="kbn-xsrf: true"

KIBANAS=(
  "http://localhost:5621|Kibana 2022 (8.4.3)"
  "http://localhost:5622|Kibana 2023 (8.8.2)"
  "http://localhost:5623|Kibana 2024 (8.15.3)"
  "http://localhost:5624|Kibana 2025 (8.17.3)"
  "http://localhost:5625|Kibana 2026 (latest)"
)

wait_kibana() {
  local url="$1" label="$2"
  printf "⏳ Waiting for %s..." "$label"
  until curl -sf -u "$AUTH" "${url}/api/status" | grep -q '"level":"available"' 2>/dev/null; do
    printf "."
    sleep 5
  done
  echo " ✅"
}

load_logs() {
  local url="$1" label="$2"
  echo "📦 Loading web logs sample data into $label..."
  result=$(curl -sf -u "$AUTH" -H "$KBN_HEADER" -H "Content-Type: application/json" \
    -X POST "${url}/api/sample_data/logs" 2>&1) || true
  echo "   → $result"
}

for entry in "${KIBANAS[@]}"; do
  url="${entry%%|*}"
  label="${entry##*|}"
  wait_kibana "$url" "$label"
  load_logs "$url" "$label"
  echo ""
done

echo "✅ All Kibana instances have sample web logs loaded."
echo ""
echo "🏁 Now run the race:"
echo "   node race.js races/kibana-discover-evolution"
