#!/usr/bin/env bash
# Download the raw inputs for the analysis scripts into DIR (default ./history).
#   bash scripts/analysis/fetch_history.sh history 2012 2025
set -euo pipefail
DIR=${1:-history}; FROM=${2:-2012}; TO=${3:-$(date +%Y)}
mkdir -p "$DIR"
for y in $(seq "$FROM" "$TO"); do curl -fsS "https://api.sleeper.app/v1/stats/nfl/regular/$y" -o "$DIR/stats_$y.json"; done
curl -fsS https://api.sleeper.app/v1/players/nfl -o "$DIR/sleeper_players_full.json"
echo "Then: python3 scripts/analysis/build_player_seasons.py $DIR && python3 scripts/analysis/age_curves.py $DIR/player_seasons.json data/age-curves.json"
