#!/bin/bash
# Disable screen blanking
xset s off
xset s noblank
xset -dpms

# Force correct display on HDMI-1
xrandr --output HDMI-1 --mode 1920x1080 --rate 60

# Window manager (needed for full screen)
openbox &

# Hide cursor
unclutter -idle 0.1 -root &

# Wait for DartsLeague server
until curl -sf http://localhost/health > /dev/null 2>&1; do
  sleep 1
done

# Wipe old Chromium state (prevents translate popup and crash dialogs)
rm -rf /home/kenny/.config/chromium/Default/Translate\ Ranker\ Model
rm -f /home/kenny/.config/chromium/Default/Preferences 2>/dev/null

# Launch Chromium in kiosk mode
exec chromium \
  --kiosk \
  --noerrdialogs \
  --disable-infobars \
  --no-first-run \
  --disable-session-crashed-bubble \
  --disable-translate \
  --disable-features=Translate,TranslateUI \
  --lang=ro \
  --accept-lang=ro-RO,ro \
  --force-device-scale-factor=1 \
  --window-size=1920,1080 \
  --window-position=0,0 \
  http://localhost/tv
