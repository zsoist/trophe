#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${BASE_URL:-https://trophe.app}"

fail() {
  echo "canary: FAIL - $*" >&2
  exit 1
}

header_value() {
  awk -v name="$1" 'BEGIN { IGNORECASE=1 } $0 ~ "^" name ":" { sub("^[^:]+:[[:space:]]*", ""); sub("\r$", ""); print; exit }'
}

root_headers="$(curl -sSI "$BASE_URL/")"
root_status="$(printf '%s\n' "$root_headers" | awk 'NR==1 { print $2 }')"
[[ "$root_status" =~ ^(200|30[178])$ ]] || fail "$BASE_URL/ unhealthy: HTTP $root_status"

login_headers="$(curl -sSI "$BASE_URL/login")"
login_status="$(printf '%s\n' "$login_headers" | awk 'NR==1 { print $2 }')"
[[ "$login_status" =~ ^(200|30[178])$ ]] || fail "$BASE_URL/login unhealthy: HTTP $login_status"

dashboard_headers="$(curl -sSI "$BASE_URL/dashboard")"
dashboard_status="$(printf '%s\n' "$dashboard_headers" | awk 'NR==1 { print $2 }')"
dashboard_location="$(printf '%s\n' "$dashboard_headers" | header_value location)"
[[ "$dashboard_status" =~ ^30[12378]$ ]] || fail "$BASE_URL/dashboard did not redirect anonymous user: HTTP $dashboard_status"
[[ "$dashboard_location" == *"/login"* ]] || fail "$BASE_URL/dashboard redirected to unexpected location: ${dashboard_location:-<empty>}"

meal_status="$(
  curl -sS -o /dev/null -w '%{http_code}' \
    -X POST "$BASE_URL/api/ai/meal-suggest" \
    -H 'content-type: application/json' \
    -d '{"remaining_calories":600,"remaining_protein_g":40,"remaining_carbs_g":50,"remaining_fat_g":20}'
)"
[[ "$meal_status" == "401" ]] || fail "anonymous meal-suggest returned HTTP $meal_status, expected 401"

csp="$(printf '%s\n' "$root_headers" | header_value content-security-policy)"
[[ -n "$csp" ]] || fail "missing Content-Security-Policy"
[[ "$csp" != *"unsafe-eval"* ]] || fail "CSP contains unsafe-eval"

hsts="$(printf '%s\n' "$root_headers" | header_value strict-transport-security)"
[[ -n "$hsts" ]] || fail "missing Strict-Transport-Security"

server="$(printf '%s\n' "$root_headers" | header_value server)"
server_lc="$(printf '%s' "$server" | tr '[:upper:]' '[:lower:]')"
[[ "$server_lc" == *"vercel"* ]] || fail "server header is not Vercel: ${server:-<empty>}"

echo "canary: PASS - $BASE_URL read-only production checks green"
