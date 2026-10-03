#!/usr/bin/env bash
set -euo pipefail
source "$(dirname -- "${BASH_SOURCE[0]}")/runtime.sh"
# This command intentionally enables development-only test identities on loopback.
exec npm run dev:community
