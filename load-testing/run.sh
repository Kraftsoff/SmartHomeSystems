#!/usr/bin/env bash
#
# Managed load-test launcher with safety guards.
#
# This wrapper refuses to run unless you have:
#   1) set TARGET_URL to a staging host (not the production Pages site), and
#   2) explicitly confirmed authorisation via I_HAVE_AUTHORISATION=yes
#
# Usage:
#   TARGET_URL="https://staging.mmsmart.ru" I_HAVE_AUTHORISATION=yes ./run.sh
#   TARGET_URL="..." I_HAVE_AUTHORISATION=yes ENGINE=k6 ./run.sh
#
set -euo pipefail

ENGINE="${ENGINE:-artillery}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Conservative defaults; override with env vars (see staging-load-test.yml).
export WARMUP_SEC="${WARMUP_SEC:-30}"
export RAMP_SEC="${RAMP_SEC:-120}"
export SUSTAIN_SEC="${SUSTAIN_SEC:-180}"
export COOLDOWN_SEC="${COOLDOWN_SEC:-30}"
export WARMUP_RATE="${WARMUP_RATE:-1}"
export RAMP_RATE="${RAMP_RATE:-10}"
export PEAK_RATE="${PEAK_RATE:-30}"

fail() { echo "ERROR: $*" >&2; exit 1; }

# --- Safety guards ---------------------------------------------------------
[ -n "${TARGET_URL:-}" ] || fail "TARGET_URL is not set. Point it at a staging URL you own."

if printf '%s' "$TARGET_URL" | grep -qiE 'mimi-site\.pages\.mmsmart\.ru'; then
  fail "TARGET_URL points at the PRODUCTION site. Use a staging environment instead."
fi

if [ "${I_HAVE_AUTHORISATION:-no}" != "yes" ]; then
  fail "Set I_HAVE_AUTHORISATION=yes to confirm you are authorised to load-test ${TARGET_URL}."
fi

echo "Load target : ${TARGET_URL}"
echo "Engine      : ${ENGINE}"
echo "Peak rate   : ${PEAK_RATE} (artillery arrivals/s) — start lower and increase deliberately."
echo

# --- Run -------------------------------------------------------------------
case "$ENGINE" in
  artillery)
    cd "${SCRIPT_DIR}/artillery"
    [ -d node_modules ] || npm install
    ts="$(date +%Y%m%d-%H%M%S)"
    npx artillery run --output "report-${ts}.json" staging-load-test.yml
    npx artillery report "report-${ts}.json" || true
    echo "Wrote report-${ts}.json (+ .html) in load-testing/artillery/"
    ;;
  k6)
    command -v k6 >/dev/null 2>&1 || fail "k6 is not installed. See https://grafana.com/docs/k6/latest/set-up/install-k6/"
    cd "${SCRIPT_DIR}/k6"
    k6 run staging-load-test.js
    ;;
  *)
    fail "Unknown ENGINE '${ENGINE}'. Use 'artillery' or 'k6'."
    ;;
esac
