# Stitch Prompts — DartsLeague Editia Foisor

Design system used across all screens:
- Background: #10102a / #0d0d1a
- Surface cards: #191933, #1d1d37, #272742
- Text: #e2dfff (primary), #c6c4df (secondary), #6660aa (muted)
- Accent: #ffb3b1(coral/pink primary), #5bd5fc (cyan), #ffd700 (gold), #4caf50 (green), #e63946 (red)
- Fonts: Space Grotesk (700/800/900 for headlines and numbers), Inter (body)
- Border radius: 12–16px cards, 999px pills
- Dark sports-broadcast aesthetic

---

## PHONE — Controller App

### Screen 1: Home

```
Dark mobile app home screen for a darts scoring app called "DartsLeague — Editia Foisor".
Background #10102a. Font: Space Grotesk + Inter.

Top hero section with a centered dartboard emoji (large, 3.5rem), title "DartsLeague" in white
Space Grotesk 800, subtitle "Editia Foisor" in muted purple #9990cc. Below the title,
a small pill badge showing connection status: green dot + "Conectat" text when online.

Below the hero, a section titled "Meciuri Active" with a red "LIVE" badge next to it.
Each active match is shown as a card with:
- A 5px left accent bar with a gradient from player 1 color to player 2 color
- Player chips (small color dot + name) stacked vertically
- Match meta in muted text: "501 · Leg 2"
- Right side: red trash icon button + green "Continuă →" button

Below matches, two full-width action buttons stacked:
- Primary red button "+ Meci Nou"
- Ghost secondary button "Jucători"

Mobile, portrait, ~390px wide. No status bar. Pure dark UI.
```

---

### Screen 2: Players

```
Dark mobile player management screen. Background #1a1a2e.

Sticky header: back arrow left, "Jucători" centered, red "+ Adaugă" button right.

Player list below. Each player row is a dark card (#1e1e38) with rounded corners 10px:
- Left: circular avatar 40px with player color background, showing either a photo or
  large initial letter in white Space Grotesk 800
- Center: player name bold, optional nickname in small muted text below
- Right: pencil emoji edit button + trash emoji delete button

When adding/editing a player, a form card appears at top:
- 100px circular photo upload area (dashed border, camera emoji placeholder, or photo preview)
- Text input "Nume *" dark background
- Text input "Poreclă"
- Color swatch row: 8 circular color swatches (#e63946, #457b9d, #2a9d8f, #e9c46a, #f4a261,
  #9b5de5, #00bbf9, #fee440), selected one has white border ring
- Cancel + Save buttons

Mobile portrait. No status bar. Pure dark.
```

---

### Screen 3: New Match — Step 1 (Player Select)

```
Dark mobile wizard screen. Background #1a1a2e.

Sticky header with back arrow, "Meci Nou" title centered, "1/2" step indicator muted right.

Section title "Selectează Jucători (2/5)" in small uppercase muted text.

Player list: each player is a tappable card (#1e1e38, 10px radius, 2px border).
When selected, border turns coral #e63946.
Each card: circular avatar left (player color + photo or initial), player name, checkmark right.
Selected players show a numbered badge (1, 2, 3...) in coral showing throw order.

Bottom sticky bar: full-width coral "Următor →" button, disabled when no players selected.

Mobile portrait. 3 players shown, 2 selected.
```

---

### Screen 4: New Match — Step 2 (Settings)

```
Dark mobile wizard screen, step 2. Background #1a1a2e.

Header: back arrow, "Meci Nou", "2/2" step hint.

Three setting sections, each with a small uppercase muted label above a pill row:

"Scor Inițial": pill buttons 301 / 501 / 701. Active pill has coral border + slightly lighter bg.
"Format Meci": pill buttons Bo1 / Bo3 / Bo5 / Bo7.
"Finalizare": pill buttons "Dublu Afară" / "Direct Afară".

Below, a summary card showing selected config: "2 players · 501 · Bo3 · Double Out".

Full-width coral button "🎯 Începe Meciul" at bottom. Loading state shows "Se pornește…".

Mobile portrait. Pure dark.
```

---

### Screen 5: Score Entry (Main Game Screen)

```
Dark mobile score entry screen for a darts game. Background #10102a. This is the primary
gameplay screen used throughout a match.

TOP HEADER (sticky):
- Left: player color dot (14px circle) + player name in Space Grotesk 700
- Right: small × abort button in muted color

SCORE PANEL below header:
- Giant remaining score number (e.g. "268") in Space Grotesk 900, 5rem, in the current
  player's color with a soft glow
- Below: 3 dart slots showing darts thrown this turn. Each slot is a small pill:
  filled slots show the score (e.g. "T20 = 60") in white, empty slots are dim outlines.
  If a bust occurs, dart pills turn red with "BUST" label.
- Checkout hint below if available: small green pill showing suggested checkout
  e.g. "T20 · D20" in small text

MODIFIER ROW:
Three equal full-width toggle buttons: "S" (single), "D" (double), "T" (triple).
Active modifier button has coral background. Default is S.

DART GRID:
5 columns × 4 rows of segment buttons (numbers 1–20 in board order).
Each button is a dark card (#1d1d37), rounded 10px, number in Space Grotesk 700.
Pressed state turns coral.

BULL ROW below grid:
3 buttons full-width: "25" (outer bull, green tint), "BULL 50" (inner bull, green border),
"MISS" (dark gray, 0 points).

BOTTOM BAR (fixed):
- Left: undo arrow button
- Center: leg progress dots (filled circles for legs won, empty for remaining)
- Right: exit door icon button (match stays live, not aborted)

When match is won: a full-width green "Vezi Rezultate →" banner appears above the bottom bar.

Mobile portrait, 390px. Player color is #457b9d (blue). Turn shows 2 darts thrown.
```

---

### Screen 6: Match Summary

```
Dark mobile post-match summary screen. Background #10102a.

Top section: large trophy emoji centered, "Meci Terminat" title Space Grotesk 800 white.

Stats section for each player (2 player cards stacked):
Each card: player color left accent bar, player name bold, and 3 stat pills in a row:
- "avg 61.4" in gold
- "3×180" in coral
- "2 manșe" in cyan

Winner card has a subtle golden glow and a 👑 crown icon next to name.

Bottom: two full-width buttons stacked:
- Coral "🎯 Meci Nou"
- Ghost "Acasă"

Mobile portrait.
```

---

## TV — Match Screen (Live Game)

```
Large TV display (16:9, 1920×1080) showing a live darts match. Dark background #0d0d1a.
Sports broadcast aesthetic. Font: Space Grotesk + Inter.

FIXED TOP BAR (full width, #191933, subtle bottom border):
- Left: match info "# 4 · 501 · Manșa 2 · Best of 3" in small muted text
- Right: elapsed time "⏱ 12:34" in muted text

MAIN BODY splits into two panels:

LEFT PANEL (58% width):
  Current player section at top:
  - Large player avatar circle (80px) with photo or initial, player color border glow
  - Player name below in Space Grotesk 800, 2rem, white
  
  Giant remaining score: "183" in Space Grotesk 900, ~8rem, in player's color
  with a strong color glow/shadow effect behind it.
  
  Dart chips row: 3 pills showing current turn darts.
  Each pill: dart label + score. E.g. "T20 = 60" | "T19 = 57" | "· · ·" (empty).
  Scored darts in white, empty slots dimmed. Busted turn shows pills in red.
  
  Checkout hint if remaining ≤ 170: small green pill "T19 · D16" centered.
  
  Dartboard below: 320px circular dartboard SVG image, zoomed in on the last hit segment.
  Centered in left panel bottom half.

RIGHT PANEL (42% width):
  Header: "PUNCTAJ" in small uppercase muted label.
  
  Player score cards stacked (one per player):
  - 4px left border in player color
  - Player name Space Grotesk 700
  - Remaining score large Space Grotesk 900 in player color
  - Leg dots row: filled circles for won legs, empty for remaining legs
  - Active player card has subtle background glow in their color
  - Inactive player is dimmer

TOP RIGHT CORNER (absolute): dart flash popup (appears briefly after each scoring dart):
  Small card with player color border glow showing:
  - Dart label large (e.g. "T20") in player color
  - "= 60" below in white
  - Player name tiny below

Overall: very dramatic, high contrast, feels like a professional darts broadcast overlay.
```

---

## TV — Lobby Screen (Waiting for Match)

```
Large TV display (16:9, 1920×1080) shown while waiting for the next darts match.
Dark background #0d0d1a. Sports broadcast / tournament board aesthetic.
Font: Space Grotesk + Inter.

FIXED TOP BAR (#191933, bottom border):
- Left: 🎯 emoji + "DartsLeague" Space Grotesk 800 white + "Editia Foisor" small muted below
- Center: current time "20:35" Space Grotesk 900, 2.4rem, white
- Right: pulsing pink dot + "Așteptăm meciul următor" pill badge

MAIN BODY splits into two panels:

LEFT PANEL (38% width, #10102a, right border):
  Small label "CLASAMENT" with a coral vertical bar accent left, muted purple text.

  Leaderboard list — 5 player cards stacked:
  Each card (#191933, 14px radius, subtle border):
  - Rank number left: "1" in gold Space Grotesk 900, "2" silver, "3" bronze, others muted
  - Circular avatar 42px: player color bg, photo if available, else initial letter
  - Player name Space Grotesk 700 + "N manșe" small muted below
  - Right: large avg number in gold Space Grotesk 900 + "avg" tiny label below

  #1 rank card has gold border tint and slightly larger avatar (48px) and slightly larger avg.
  All cards separated by small gap.

RIGHT PANEL (62% width, #0d0d1a):
  A rotating "spotlight" section that cycles through different stat views every 8 seconds
  with a smooth fade transition. Small scene type icon + uppercase label at top left.
  Progress dots row at very bottom center indicating current scene.

  Scene examples to show (pick "Records" scene):
  "🏆 RECORDURI" header.
  2×2 grid of large record cards (#191933, rounded, centered):
  - "183" in gold huge font + "Cel mai mare finish" label + player name in their color
  - "7" in coral huge font + "Cele mai multe 180-uri" label + player name
  - "42" in cyan huge font + "Scoruri 100+" label + player name
  - "18" in green huge font + "Triple T15–T20" label + player name

BOTTOM TICKER BAR (#191933, top border, 34px height):
  Left: red pill badge "LIVE"
  Right: infinite scrolling marquee text in muted purple:
  "🎯 Medie: 61.4 (Marius)   ·   💯 180-uri: 7 (Andrei)   ·   🏆 Cel mai mare finish: 167 (Marius)"

Overall: feels like a real darts tournament scoreboard. Dark, dramatic, high contrast.
```
