curl -s -X POST http://localhost:3000/api/airsearcher/curl \
  -H 'Content-Type: application/json' \
  --data "$(jq -Rs '{curl: .}' < my-curl.txt)"
