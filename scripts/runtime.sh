#!/usr/bin/env bash
# Shared runtime selection; source this file from the workspace scripts.
set -euo pipefail

workout_node_is_ready() {
  command -v node >/dev/null 2>&1 && node -e 'process.exit(Number(process.versions.node.split(".")[0]) >= 24 ? 0 : 1)' >/dev/null 2>&1
}

if ! workout_node_is_ready; then
  if [[ -x /opt/homebrew/opt/node/bin/node ]]; then
    export PATH="/opt/homebrew/opt/node/bin:$PATH"
  fi
fi

if ! workout_node_is_ready; then
  echo 'Node.js 24 이상이 필요합니다. nvm use 또는 Node 설치 후 다시 실행하세요.' >&2
  exit 1
fi
command -v npm >/dev/null 2>&1 || { echo 'npm을 찾을 수 없습니다.' >&2; exit 1; }
workout_repo_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$workout_repo_root"
