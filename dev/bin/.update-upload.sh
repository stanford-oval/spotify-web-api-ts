#!/usr/bin/env bash

# Common / useful `set` commands
set -Ee # Exit on error
set -o pipefail # Check status of piped commands
set -u # Error on undefined vars
# set -v # Print everything
# set -x # Print commands (with expanded vars)

REPO_ROOT="$(git rev-parse --show-toplevel)"
OVAL_ROOT="${GITHUB_HOME}/stanford-oval"

cd "${REPO_ROOT}"
npm run build

cd "${OVAL_ROOT}/thingpedia-common-devices/main/com.spotify"
npm update @stanford-oval/spotify-web-api

cd "${OVAL_ROOT}/thingpedia-common-devices"
rm ./build/main/com.spotify.zip
./scripts/upload-all.sh main/com.spotify
kubectl -n almond-dev delete pod shared-backend-0
