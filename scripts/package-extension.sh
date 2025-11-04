#!/usr/bin/env bash
set -euo pipefail
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUTPUT="${1:-neuro-friendly-extension.zip}"
cd "$ROOT_DIR"
rm -f "$OUTPUT"
zip -r "$OUTPUT" extension -x '*.DS_Store'
echo "Created $OUTPUT"
