#!/bin/bash
# Kiosk startup script - runs Chromium in kiosk mode on /tv

export DISPLAY=:0

# Disable screen blanking
xset s off
xset s noblank
xset -dpms

# Hide cursor after 0.1s of inactivity
unclutter -idle 0.1 -root &

# Wait for the dartsleague server to be ready
echo "Waiting for DartsLeague server..."
until curl -sf http://localhost/health > /dev/null 2>&1; do
  sleep 1
done
echo "Server ready. Launching kiosk..."

# Launch Chromium in kiosk mode
chromium \
  --kiosk \
  --noerrdialogs \
  --disable-infobars \
  --disable-translate \
  --no-first-run \
  --disable-features=TranslateUI \
  --autoplay-policy=no-user-gesture-required \
  http://localhost/tv
