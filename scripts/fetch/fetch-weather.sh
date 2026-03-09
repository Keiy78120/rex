#!/bin/bash
# Usage: ./fetch-weather.sh "Paris"
CITY="${1:-Paris}"
curl -s "wttr.in/$CITY?format=j1" | jq '{
  temp_c: .current_condition[0].temp_C,
  feels_like: .current_condition[0].FeelsLikeC,
  desc: .current_condition[0].weatherDesc[0].value,
  humidity: .current_condition[0].humidity,
  city: .nearest_area[0].areaName[0].value
}' 2>/dev/null
