#!/usr/bin/env bash
# scripts/build-binary.sh — REX single-binary distribution (OL5)
# Builds standalone rex binaries for macOS arm64 / x64 / Linux
#
# Strategy:
#   Primary: Bun compile (fast, small) — works if native addons are pre-bundled
#   Fallback: Node.js SEA (Node 20+ Single Executable Application)
#
# Native addon caveat:
#   better-sqlite3 and sqlite-vec compile to .node files.
#   They CANNOT be embedded into a single binary.
#   The binary must be distributed alongside a `lib/` directory containing
#   the .node files, or the user must have them installed globally.
#
# Usage:
#   ./scripts/build-binary.sh [--target=darwin-arm64|darwin-x64|linux-x64] [--method=bun|sea|auto]
#
# Output:
#   dist/bin/rex-darwin-arm64
#   dist/bin/rex-darwin-x64
#   dist/bin/rex-linux-x64
#   dist/bin/rex-darwin-arm64.tar.gz (with lib/ dir)

set -euo pipefail

# ─── Config ────────────────────────────────────────────────────────────────────

TARGET="${1:-}"
METHOD="${2:-auto}"

for arg in "$@"; do
  case "$arg" in
    --target=*) TARGET="${arg#--target=}" ;;
    --method=*) METHOD="${arg#--method=}" ;;
    --help|-h)
      echo "Usage: $0 [--target=darwin-arm64|darwin-x64|linux-x64|all] [--method=bun|sea|auto]"
      exit 0
      ;;
  esac
done

: "${TARGET:=auto}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
CLI_DIR="$REPO_ROOT/packages/cli"
OUT_DIR="$REPO_ROOT/dist/bin"

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
DIM='\033[2m'
BOLD='\033[1m'
RED='\033[0;31m'
NC='\033[0m'

log()  { echo -e "${BOLD}$*${NC}"; }
ok()   { echo -e "${GREEN}✓${NC} $*"; }
warn() { echo -e "${YELLOW}!${NC} $*"; }
err()  { echo -e "${RED}✗${NC} $*"; }
dim()  { echo -e "${DIM}$*${NC}"; }

# ─── Pre-flight ─────────────────────────────────────────────────────────────────

log "REX Binary Builder (OL5)"
echo ""

cd "$CLI_DIR"

# Detect current platform
PLATFORM="$(uname -s)"
ARCH="$(uname -m)"
case "$PLATFORM-$ARCH" in
  Darwin-arm64)  CURRENT_TARGET="darwin-arm64" ;;
  Darwin-x86_64) CURRENT_TARGET="darwin-x64" ;;
  Linux-x86_64)  CURRENT_TARGET="linux-x64" ;;
  Linux-aarch64) CURRENT_TARGET="linux-arm64" ;;
  *) CURRENT_TARGET="unknown" ;;
esac

if [[ "$TARGET" == "auto" ]]; then
  TARGET="$CURRENT_TARGET"
  dim "Auto-detected target: $TARGET"
fi

mkdir -p "$OUT_DIR"

# Ensure CLI is built first
if [[ ! -f "$CLI_DIR/dist/index.js" ]]; then
  log "Building CLI first..."
  pnpm build
fi

# ─── Bun method ─────────────────────────────────────────────────────────────────

build_bun() {
  local target="$1"
  local outfile="$OUT_DIR/rex-$target"

  if ! command -v bun &>/dev/null; then
    warn "Bun not found. Install from https://bun.sh"
    return 1
  fi

  local bun_target
  case "$target" in
    darwin-arm64) bun_target="bun-darwin-arm64" ;;
    darwin-x64)   bun_target="bun-darwin-x64" ;;
    linux-x64)    bun_target="bun-linux-x64" ;;
    linux-arm64)  bun_target="bun-linux-arm64" ;;
    *)
      warn "Unsupported bun target: $target"
      return 1
      ;;
  esac

  dim "Building with Bun compile → $outfile"

  # Bun compile works on the TypeScript source directly
  bun build src/index.ts \
    --compile \
    --target="$bun_target" \
    --outfile="$outfile" \
    --minify \
    2>&1 | sed 's/^/  /'

  if [[ -f "$outfile" ]]; then
    chmod +x "$outfile"
    local size
    size="$(du -sh "$outfile" | cut -f1)"
    ok "Bun binary: $outfile ($size)"
    return 0
  fi
  return 1
}

# ─── Node.js SEA method ──────────────────────────────────────────────────────────

build_sea() {
  local target="$1"
  local outfile="$OUT_DIR/rex-$target"

  # Node.js SEA (Single Executable Application) — Node 20+
  local node_version
  node_version="$(node --version | sed 's/v//' | cut -d. -f1)"
  if [[ "$node_version" -lt 20 ]]; then
    warn "Node.js 20+ required for SEA. Current: $(node --version)"
    return 1
  fi

  dim "Building with Node.js SEA → $outfile"

  # Create SEA config
  local sea_config="$CLI_DIR/dist/.sea-config.json"
  local sea_blob="$CLI_DIR/dist/.sea-prep.blob"
  local sea_entrypoint="$CLI_DIR/dist/index.js"

  cat > "$sea_config" <<EOF
{
  "main": "dist/index.js",
  "output": "dist/.sea-prep.blob",
  "disableExperimentalSEAWarning": true,
  "useSnapshot": false,
  "useCodeCache": true
}
EOF

  # Generate blob
  node --experimental-sea-config "$sea_config" 2>&1 | sed 's/^/  /'

  if [[ ! -f "$sea_blob" ]]; then
    err "SEA blob generation failed"
    return 1
  fi

  # Copy node binary and inject blob
  cp "$(which node)" "$outfile"

  # Remove signature (macOS only)
  if [[ "$PLATFORM" == "Darwin" ]]; then
    codesign --remove-signature "$outfile" 2>/dev/null || true
  fi

  # Inject blob using postject
  if ! npx postject "$outfile" NODE_SEA_BLOB "$sea_blob" \
    --sentinel-fuse NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2 \
    ${PLATFORM:+--macho-segment-name NODE_SEA 2>/dev/null}; then
    err "Postject injection failed. Install: npm install -g postject"
    return 1
  fi

  # Re-sign on macOS
  if [[ "$PLATFORM" == "Darwin" ]]; then
    codesign --sign - "$outfile" 2>/dev/null || true
  fi

  chmod +x "$outfile"
  local size
  size="$(du -sh "$outfile" | cut -f1)"
  ok "SEA binary: $outfile ($size)"

  # Cleanup temp files
  rm -f "$sea_config" "$sea_blob"
  return 0
}

# ─── Bundle native addons ────────────────────────────────────────────────────────

bundle_native_addons() {
  local target="$1"
  local lib_dir="$OUT_DIR/lib-$target"

  mkdir -p "$lib_dir"

  dim "Bundling native addons → $lib_dir/"

  # Find and copy better-sqlite3 and sqlite-vec .node files
  local found=0

  # better-sqlite3
  local sqlite_addon
  sqlite_addon="$(find "$CLI_DIR/node_modules/better-sqlite3" -name "*.node" 2>/dev/null | head -1 || true)"
  if [[ -n "$sqlite_addon" ]]; then
    cp "$sqlite_addon" "$lib_dir/better_sqlite3.node"
    ok "Bundled better-sqlite3 addon"
    found=$((found + 1))
  fi

  # sqlite-vec
  local vec_addon
  vec_addon="$(find "$CLI_DIR/node_modules/sqlite-vec" -name "*.node" 2>/dev/null | head -1 || true)"
  if [[ -n "$vec_addon" ]]; then
    cp "$vec_addon" "$lib_dir/sqlite_vec.node"
    ok "Bundled sqlite-vec addon"
    found=$((found + 1))
  fi

  if [[ $found -eq 0 ]]; then
    warn "No native addons found — binary may fail if better-sqlite3/sqlite-vec not installed"
  fi

  return 0
}

# ─── Create distributable archive ───────────────────────────────────────────────

create_archive() {
  local target="$1"
  local binary="$OUT_DIR/rex-$target"
  local lib_dir="$OUT_DIR/lib-$target"
  local archive="$OUT_DIR/rex-$target.tar.gz"

  if [[ ! -f "$binary" ]]; then
    return 1
  fi

  local tmp_dir
  tmp_dir="$(mktemp -d)"
  local pkg_dir="$tmp_dir/rex-$target"
  mkdir -p "$pkg_dir/lib"

  cp "$binary" "$pkg_dir/rex"

  if [[ -d "$lib_dir" ]]; then
    cp -r "$lib_dir/." "$pkg_dir/lib/"
  fi

  # Create launcher wrapper script
  cat > "$pkg_dir/rex-run.sh" <<'EOF'
#!/usr/bin/env bash
# REX launcher — sets up library path for native addons
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
export REX_NATIVE_LIB_DIR="$DIR/lib"
exec "$DIR/rex" "$@"
EOF
  chmod +x "$pkg_dir/rex-run.sh"

  # Create README
  cat > "$pkg_dir/README.md" <<EOF
# REX $(cat "$CLI_DIR/package.json" | grep '"version"' | head -1 | sed 's/.*": "\(.*\)".*/\1/') — $target

## Quick start

1. Extract archive
2. Run: \`./rex-run.sh\` (wraps native addon path setup)
   Or: \`./rex\` (if better-sqlite3/sqlite-vec are installed system-wide)

## Native addons

The \`lib/\` directory contains pre-compiled native addons:
- \`better_sqlite3.node\` — SQLite bindings
- \`sqlite_vec.node\` — vector search extension

These are compiled for \`$target\`. Do NOT mix addon files between platforms.

## Manual install

\`\`\`bash
sudo cp rex /usr/local/bin/rex
sudo cp -r lib /usr/local/lib/rex-addons
\`\`\`
EOF

  tar -czf "$archive" -C "$tmp_dir" "rex-$target"
  rm -rf "$tmp_dir"

  local size
  size="$(du -sh "$archive" | cut -f1)"
  ok "Archive: $archive ($size)"
}

# ─── Main ────────────────────────────────────────────────────────────────────────

TARGETS=()
if [[ "$TARGET" == "all" ]]; then
  TARGETS=("darwin-arm64" "darwin-x64" "linux-x64")
else
  TARGETS=("$TARGET")
fi

for t in "${TARGETS[@]}"; do
  echo ""
  log "Target: $t"

  # Choose method
  BUILD_OK=false

  if [[ "$METHOD" == "bun" || "$METHOD" == "auto" ]]; then
    if build_bun "$t"; then
      BUILD_OK=true
    else
      warn "Bun build failed, trying Node.js SEA..."
    fi
  fi

  if ! $BUILD_OK && [[ "$METHOD" == "sea" || "$METHOD" == "auto" ]]; then
    # SEA only works for same-platform compilation
    if [[ "$t" == "$CURRENT_TARGET" || "$t" == "auto" ]]; then
      if build_sea "$t"; then
        BUILD_OK=true
      fi
    else
      warn "Node.js SEA requires building for the current platform ($CURRENT_TARGET), skipping $t"
    fi
  fi

  if ! $BUILD_OK; then
    err "Failed to build binary for $t"
    continue
  fi

  bundle_native_addons "$t"
  create_archive "$t"
done

echo ""
log "Done. Binaries in $OUT_DIR/"
echo ""
dim "NOTE: Native addons (better-sqlite3, sqlite-vec) cannot be fully embedded."
dim "Distribute the archive (tar.gz) which includes the lib/ directory."
dim "Users can also install from npm: npm install -g rex-claude"
echo ""
