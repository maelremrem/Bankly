#!/bin/bash

# Bankly Update Script
# Usage: sudo bash update.sh [branch]

set -e

LOG=/var/log/bankly-update.log
LOCK=/var/run/bankly-update.lock
BRANCH=${1:-main}
INSTALL_DIR=/opt/bankly

echo "Starting update: branch=$BRANCH at $(date)" >> "$LOG"

# Prevent concurrent runs
if [ -f "$LOCK" ]; then
  echo "Update already running (lock present)" >> "$LOG"
  exit 1
fi

touch "$LOCK"
chown root:root "$LOCK" || true

{
  echo "=== Update started at $(date) branch=$BRANCH ==="
  if [ ! -d "$INSTALL_DIR" ]; then
    echo "Install directory $INSTALL_DIR not found";
    exit 2
  fi

  cd "$INSTALL_DIR"
  echo "Fetching latest from origin..."
  git fetch --all --prune

  if git rev-parse --verify "$BRANCH" >/dev/null 2>&1; then
    git checkout "$BRANCH"
  else
    git checkout -b "$BRANCH" "origin/$BRANCH" || true
  fi

  git pull origin "$BRANCH" || true

  echo "Updating backend dependencies..."
  cd "$INSTALL_DIR/backend"
  npm install --production --no-audit --no-fund

  # optional db migrations could go here

  echo "Restarting services..."
  systemctl restart bankly-server || echo "Failed to restart bankly-server"
  systemctl restart bankly-rfid || echo "Failed to restart bankly-rfid (if enabled)"
  systemctl restart bankly-kiosk || echo "Failed to restart bankly-kiosk (if enabled)"

  echo "=== Update completed at $(date) ==="
} >> "$LOG" 2>&1

rm -f "$LOCK"

exit 0
