#!/bin/bash

# Bankly Kiosk Startup Script

# Wait for server to be ready
sleep 10

# Kill any existing Chromium processes
pkill -f chromium || true

# Start Chromium in kiosk mode
exec chromium-browser \
    --kiosk \
    --disable-restore-session-state \
    --disable-session-crashed-bubble \
    --disable-infobars \
    --noerrdialogs \
    --disable-translate \
    --no-first-run \
    --fast \
    --fast-start \
    --disable-default-apps \
    --disable-sync \
    --disable-background-timer-throttling \
    --disable-renderer-backgrounding \
    --disable-backgrounding-occluded-windows \
    --disable-features=TranslateUI \
    --app=http://localhost:3000