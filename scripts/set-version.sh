#!/usr/bin/env bash
# Bump Version in manifest.json (and optionally keep README in sync later).
#
# Usage:
#   ./scripts/set-version.sh 1.1.0      # writes 1.1.0.0
#   ./scripts/set-version.sh 1.1.0.2    # writes 1.1.0.2

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MANIFEST="$ROOT/src/com.tbye.datetime.sdPlugin/manifest.json"

if [[ $# -ne 1 ]]; then
	echo "Usage: $0 <version>" >&2
	echo "  e.g. $0 1.1.0   or   $0 1.1.0.0" >&2
	exit 1
fi

V="$1"
dots=$(awk -F. '{print NF-1}' <<<"$V")
case "$dots" in
	2) V="${V}.0" ;;
	3) ;;
	*)
		echo "error: version must be 1.2.3 or 1.2.3.4" >&2
		exit 1
		;;
esac

if [[ ! -f "$MANIFEST" ]]; then
	echo "error: missing $MANIFEST" >&2
	exit 1
fi

node -e "
const fs = require('fs');
const p = process.argv[1];
const v = process.argv[2];
const m = JSON.parse(fs.readFileSync(p, 'utf8'));
const prev = m.Version;
m.Version = v;
fs.writeFileSync(p, JSON.stringify(m, null, '\t') + '\n');
console.log(prev + ' → ' + v);
" "$MANIFEST" "$V"

echo "Updated $MANIFEST"
echo "Remember to commit this before tagging a release."
