#!/usr/bin/env bash

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

echo "[1/3] Building AI Code Orchestrator..."
pnpm build && pnpm vsix

shopt -s nullglob
vsix_files=("$REPO_ROOT"/bin/*.vsix)
shopt -u nullglob

if ((${#vsix_files[@]} == 0)); then
	echo "Error: no VSIX package was produced in $REPO_ROOT/bin" >&2
	exit 1
fi

VSIX_PATH="${vsix_files[0]}"
for candidate in "${vsix_files[@]:1}"; do
	if [[ "$candidate" -nt "$VSIX_PATH" ]]; then
		VSIX_PATH="$candidate"
	fi
done

echo "[2/3] Found VSIX: $VSIX_PATH"

if ! command -v code >/dev/null 2>&1; then
	echo "Error: the 'code' command is not available." >&2
	echo "Install the extension manually from: $VSIX_PATH" >&2
	exit 1
fi

echo "[3/3] Installing extension in VS Code..."
code --install-extension "$VSIX_PATH" --force

echo "Successfully installed: $VSIX_PATH"
echo "Run 'Developer: Reload Window' in VS Code to load the updated extension."
