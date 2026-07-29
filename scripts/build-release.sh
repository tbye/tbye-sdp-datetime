#!/usr/bin/env bash
# Build a distributable .streamDeckPlugin on Linux (or any OS with Node + @elgato/cli).
#
# Usage:
#   ./scripts/build-release.sh                 # pack using manifest Version
#   ./scripts/build-release.sh 1.1.0           # set Version to 1.1.0 (→ 1.1.0.0) and pack
#   ./scripts/build-release.sh 1.1.0.3         # set full 4-part Version and pack
#   ./scripts/build-release.sh --validate-only # validate only, no package
#   ./scripts/build-release.sh --skip-tests 1.1.0
#
# Prerequisites:
#   - Node.js 20+ (24+ recommended)
#   - npm install -g @elgato/cli@latest
#   - git submodule initialized (script will try to init)

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PLUGIN_DIR="$ROOT/src/com.tbye.datetime.sdPlugin"
DIST_DIR="$ROOT/dist"
MANIFEST="$PLUGIN_DIR/manifest.json"

VALIDATE_ONLY=0
SKIP_TESTS=0
VERSION_ARG=""

usage() {
	sed -n '2,14p' "$0" | sed 's/^# \?//'
	exit "${1:-0}"
}

for arg in "$@"; do
	case "$arg" in
		-h|--help) usage 0 ;;
		--validate-only) VALIDATE_ONLY=1 ;;
		--skip-tests) SKIP_TESTS=1 ;;
		-*)
			echo "Unknown option: $arg" >&2
			usage 1
			;;
		*)
			if [[ -n "$VERSION_ARG" ]]; then
				echo "Unexpected extra argument: $arg" >&2
				usage 1
			fi
			VERSION_ARG="$arg"
			;;
	esac
done

# --- prerequisites ---------------------------------------------------------

if ! command -v streamdeck >/dev/null 2>&1; then
	echo "error: 'streamdeck' CLI not found." >&2
	echo "Install with:  npm install -g @elgato/cli@latest" >&2
	exit 1
fi

if ! command -v node >/dev/null 2>&1; then
	echo "error: node is required" >&2
	exit 1
fi

if [[ ! -f "$MANIFEST" ]]; then
	echo "error: manifest not found at $MANIFEST" >&2
	exit 1
fi

# SDK submodule (libs/) must be present for packaging
if [[ ! -f "$PLUGIN_DIR/libs/js/stream-deck.js" ]]; then
	echo "→ Initializing git submodule (streamdeck-javascript-sdk)..."
	git -C "$ROOT" submodule update --init --recursive
fi

if [[ ! -f "$PLUGIN_DIR/libs/js/stream-deck.js" ]]; then
	echo "error: libs/ still missing after submodule init." >&2
	echo "Run: git submodule update --init --recursive" >&2
	exit 1
fi

# --- version ----------------------------------------------------------------

# Expand 1.2.3 → 1.2.3.0 (Stream Deck prefers 4-part versions)
normalize_version() {
	local v="$1"
	local dots
	dots=$(awk -F. '{print NF-1}' <<<"$v")
	case "$dots" in
		2) echo "${v}.0" ;;   # 1.2.3 → 1.2.3.0
		3) echo "$v" ;;       # 1.2.3.4
		*)
			echo "error: version must look like 1.2.3 or 1.2.3.4 (got: $v)" >&2
			exit 1
			;;
	esac
}

CURRENT_VERSION=$(node -e "console.log(require('$MANIFEST').Version)")
echo "Current manifest Version: $CURRENT_VERSION"

PACK_VERSION_FLAG=()
if [[ -n "$VERSION_ARG" ]]; then
	NORM=$(normalize_version "$VERSION_ARG")
	echo "→ Will pack with Version: $NORM"
	PACK_VERSION_FLAG=(--version "$NORM")
fi

# --- tests ------------------------------------------------------------------

if [[ "$SKIP_TESTS" -eq 0 ]]; then
	echo "→ Running unit tests..."
	(cd "$PLUGIN_DIR" && node test.js)
else
	echo "→ Skipping tests (--skip-tests)"
fi

# --- validate ---------------------------------------------------------------

echo "→ Validating plugin..."
streamdeck validate "$PLUGIN_DIR" --no-update-check

if [[ "$VALIDATE_ONLY" -eq 1 ]]; then
	echo "✔ Validation only — done."
	exit 0
fi

# --- pack -------------------------------------------------------------------

mkdir -p "$DIST_DIR"
echo "→ Packaging to $DIST_DIR ..."
streamdeck pack "$PLUGIN_DIR" \
	--output "$DIST_DIR" \
	--force \
	--no-update-check \
	"${PACK_VERSION_FLAG[@]+"${PACK_VERSION_FLAG[@]}"}"

OUT="$DIST_DIR/com.tbye.datetime.streamDeckPlugin"
if [[ ! -f "$OUT" ]]; then
	echo "error: expected package not found: $OUT" >&2
	exit 1
fi

# Report final version from packed manifest (if we can peek)
SIZE=$(wc -c <"$OUT" | tr -d ' ')
echo ""
echo "✔ Package ready"
echo "  File:    $OUT"
echo "  Size:    $SIZE bytes"
if [[ -n "$VERSION_ARG" ]]; then
	echo "  Version: $NORM  (manifest on disk still $CURRENT_VERSION until you commit a bump)"
	echo ""
	echo "  Tip: bump and commit the manifest when you cut the release:"
	echo "    ./scripts/set-version.sh $NORM"
else
	echo "  Version: $CURRENT_VERSION"
fi
echo ""
echo "Next steps:"
echo "  1. Smoke-test: copy to a Mac/Windows machine with Stream Deck and double-click the package"
echo "  2. GitHub release:  gh release create vX.Y.Z \"$OUT\" --title \"DateTime Composer Plugin - X.Y.Z\" --notes-file -"
echo "  3. Marketplace:     https://maker.elgato.com  → upload the same .streamDeckPlugin"
