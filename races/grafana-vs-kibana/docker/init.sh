#!/usr/bin/env bash
# init.sh — Load sample data into both Kibana instances.
# Run this once after `docker compose up -d` and all services are healthy.
#
# Usage:  cd races/grafana-vs-kibana/docker && bash init.sh

set -euo pipefail

KIBANA_2024="http://localhost:5601"
KIBANA_2026="http://localhost:5602"
AUTH="elastic:changeme"
KBN_HEADER="kbn-xsrf: true"

wait_kibana() {
  local url="$1" label="$2"
  printf "⏳ Waiting for %s to be ready..." "$label"
  until curl -sf -u "$AUTH" "${url}/api/status" | grep -q '"level":"available"' 2>/dev/null; do
    printf "."
    sleep 5
  done
  echo " ✅"
}

load_sample_data() {
  local url="$1" label="$2"
  echo "📦 Loading eCommerce sample data into $label..."
  result=$(curl -sf -u "$AUTH" -H "$KBN_HEADER" -H "Content-Type: application/json" \
    -X POST "${url}/api/sample_data/ecommerce" 2>&1) || true
  echo "   $result"
  echo ""
}

wait_kibana "$KIBANA_2024" "Kibana 2024 (port 5601)"
load_sample_data "$KIBANA_2024" "Kibana 2024"

wait_kibana "$KIBANA_2026" "Kibana 2026 (port 5602)"
load_sample_data "$KIBANA_2026" "Kibana 2026"

echo "✅ Done! Both Kibana instances have eCommerce sample data."
echo ""
echo "🏁 Now run the race:"
echo "   node race.js races/grafana-vs-kibana"
