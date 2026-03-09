#!/bin/bash
# Usage: ./snapshot.sh /path/to/file
# Always call this BEFORE any write/delete
TARGET="${1:?Usage: snapshot.sh <path>}"
SNAP_DIR="$HOME/.rex/snapshots/$(date +%Y-%m-%d)"
mkdir -p "$SNAP_DIR"
SNAP_NAME="$(date +%H%M%S)-$(basename "$TARGET")"
cp -r "$TARGET" "$SNAP_DIR/$SNAP_NAME" 2>/dev/null
echo "{\"snapshot_id\": \"$(date +%Y-%m-%d)/$SNAP_NAME\", \"original\": \"$TARGET\"}"
