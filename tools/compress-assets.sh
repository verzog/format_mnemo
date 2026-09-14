#!/usr/bin/env bash
#
# Batch-compress .glb asset-pack models for format_mnemo (dev-only helper).
#
# Runs each model through glTF-Transform's `optimize`, producing a much smaller
# .glb that the plugin still loads: Draco-compressed geometry (the bundled
# DRACOLoader decodes it) and WebP textures (a standard browser image format
# that GLTFLoader reads with no transcoder). It deliberately does NOT use KTX2 /
# Basis textures: those need a transcoder that some browsers/GPUs reject, which
# is a common reason a heavy Sketchfab export renders as a blank card in the
# asset viewer. WebP sidesteps that while still cutting transmission size hard.
#
# Usage:
#   tools/compress-assets.sh [INPUT_DIR] [OUTPUT_DIR]
#     INPUT_DIR   directory of source .glb files   (default: current directory)
#     OUTPUT_DIR  where to write compressed .glb    (default: ./compressed)
#
# Tunables (environment variables):
#   TEXTURE_SIZE      max texture dimension in px           (default: 2048)
#   TEXTURE_COMPRESS  texture format: webp|avif|auto        (default: webp)
#   COMPRESS          geometry: draco|meshopt|quantize      (default: draco)
#   SIMPLIFY          mesh simplification: true|false       (default: false)
#   FORCE             re-compress even if the output exists  (default: 0)
#
# Requires Node.js. glTF-Transform is fetched on demand with `npx` (no install),
# or is used directly if `gltf-transform` is already on PATH.
#
# Examples:
#   tools/compress-assets.sh ~/Downloads/pack ./compressed
#   TEXTURE_SIZE=1024 SIMPLIFY=true tools/compress-assets.sh ./raw ./out

set -euo pipefail

INPUT_DIR="${1:-.}"
OUTPUT_DIR="${2:-./compressed}"
TEXTURE_SIZE="${TEXTURE_SIZE:-2048}"
TEXTURE_COMPRESS="${TEXTURE_COMPRESS:-webp}"
COMPRESS="${COMPRESS:-draco}"
SIMPLIFY="${SIMPLIFY:-false}"
FORCE="${FORCE:-0}"

if [ ! -d "$INPUT_DIR" ]; then
    echo "error: input directory not found: $INPUT_DIR" >&2
    exit 1
fi

# Resolve how to invoke glTF-Transform: a global binary if present, else npx.
if command -v gltf-transform >/dev/null 2>&1; then
    GLTF=(gltf-transform)
elif command -v npx >/dev/null 2>&1; then
    GLTF=(npx --yes @gltf-transform/cli@latest)
else
    echo "error: need either 'gltf-transform' on PATH or 'npx' (Node.js)." >&2
    exit 1
fi

mkdir -p "$OUTPUT_DIR"

# Human-readable byte size (portable: no GNU-only numfmt dependency).
human() {
    awk -v b="$1" 'BEGIN {
        split("B KB MB GB", u, " ");
        i = 1;
        while (b >= 1024 && i < 4) { b /= 1024; i++ }
        printf (i == 1 ? "%d %s" : "%.1f %s"), b, u[i];
    }'
}

filesize() {
    # stat differs between GNU (-c%s) and BSD/macOS (-f%z); try both.
    stat -c%s "$1" 2>/dev/null || stat -f%z "$1" 2>/dev/null || echo 0
}

shopt -s nullglob nocaseglob
models=("$INPUT_DIR"/*.glb)
shopt -u nocaseglob
if [ ${#models[@]} -eq 0 ]; then
    echo "No .glb files found in: $INPUT_DIR"
    exit 0
fi

total_in=0
total_out=0
failed=0

for src in "${models[@]}"; do
    name="$(basename "$src")"
    dst="$OUTPUT_DIR/$name"

    if [ "$FORCE" != "1" ] && [ -e "$dst" ]; then
        echo "skip  $name (output exists; set FORCE=1 to redo)"
        continue
    fi

    echo "-> $name"
    if "${GLTF[@]}" optimize "$src" "$dst" \
        --compress "$COMPRESS" \
        --texture-compress "$TEXTURE_COMPRESS" \
        --texture-size "$TEXTURE_SIZE" \
        --simplify "$SIMPLIFY" >/dev/null 2>"$OUTPUT_DIR/.compress-err"; then
        in_bytes="$(filesize "$src")"
        out_bytes="$(filesize "$dst")"
        total_in=$((total_in + in_bytes))
        total_out=$((total_out + out_bytes))
        pct="n/a"
        if [ "$in_bytes" -gt 0 ]; then
            pct="$(awk -v a="$in_bytes" -v b="$out_bytes" 'BEGIN { printf "%.0f", (1 - b / a) * 100 }')%"
        fi
        echo "   $(human "$in_bytes") -> $(human "$out_bytes")  (saved $pct)"
    else
        failed=$((failed + 1))
        echo "   FAILED — see error below:" >&2
        sed 's/^/   /' "$OUTPUT_DIR/.compress-err" >&2 || true
    fi
done
rm -f "$OUTPUT_DIR/.compress-err"

echo
echo "Done. Compressed into: $OUTPUT_DIR"
if [ "$total_in" -gt 0 ]; then
    echo "Total: $(human "$total_in") -> $(human "$total_out")"
fi
if [ "$failed" -gt 0 ]; then
    echo "$failed file(s) failed to compress." >&2
    exit 1
fi
