-- DartsLeague SQLite schema
-- WAL mode is set in connection.js, not here

PRAGMA foreign_keys = ON;

-- players ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS players (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  name          TEXT NOT NULL UNIQUE,
  nickname      TEXT,
  color         TEXT NOT NULL DEFAULT '#e63946',
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  archived_at   TEXT
);

-- matches ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS matches (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  mode            TEXT NOT NULL CHECK (mode IN ('x01')),
  starting_score  INTEGER NOT NULL CHECK (starting_score IN (301, 501, 701)),
  double_out      INTEGER NOT NULL DEFAULT 1,
  legs_to_win     INTEGER NOT NULL DEFAULT 1,
  public_code     TEXT UNIQUE,
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  started_at      TEXT,
  active_elapsed_ms INTEGER NOT NULL DEFAULT 0,
  controller_opened_at TEXT,
  ended_at        TEXT,
  winner_id       INTEGER REFERENCES players(id),
  status          TEXT NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending','live','finished','aborted'))
);

CREATE TABLE IF NOT EXISTS match_players (
  match_id   INTEGER NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  player_id  INTEGER NOT NULL REFERENCES players(id),
  position   INTEGER NOT NULL,
  legs_won   INTEGER NOT NULL DEFAULT 0,
  general_avg_start REAL NOT NULL DEFAULT 0,
  PRIMARY KEY (match_id, player_id)
);

-- legs ------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS legs (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  match_id      INTEGER NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  leg_number    INTEGER NOT NULL,
  starting_id   INTEGER NOT NULL REFERENCES players(id),
  winner_id     INTEGER REFERENCES players(id),
  started_at    TEXT NOT NULL DEFAULT (datetime('now')),
  ended_at      TEXT,
  UNIQUE (match_id, leg_number)
);

-- darts (event store) ---------------------------------------------------
CREATE TABLE IF NOT EXISTS darts (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  leg_id       INTEGER NOT NULL REFERENCES legs(id) ON DELETE CASCADE,
  player_id    INTEGER NOT NULL REFERENCES players(id),
  turn_number  INTEGER NOT NULL,
  dart_in_turn INTEGER NOT NULL CHECK (dart_in_turn BETWEEN 1 AND 3),
  segment      INTEGER NOT NULL CHECK (segment IN (0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,25)),
  multiplier   INTEGER NOT NULL CHECK (multiplier IN (1,2,3)),
  score_value  INTEGER NOT NULL,
  busted       INTEGER NOT NULL DEFAULT 0,
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_darts_leg ON darts(leg_id, turn_number, dart_in_turn);
CREATE INDEX IF NOT EXISTS idx_darts_player ON darts(player_id);

-- award events emitted during finished matches ---------------------------
CREATE TABLE IF NOT EXISTS awards (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  match_id     INTEGER NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  leg_id       INTEGER NOT NULL REFERENCES legs(id) ON DELETE CASCADE,
  dart_id      INTEGER NOT NULL REFERENCES darts(id) ON DELETE CASCADE,
  player_id    INTEGER NOT NULL REFERENCES players(id),
  kind         TEXT NOT NULL,
  value        INTEGER,
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (dart_id, kind)
);

CREATE INDEX IF NOT EXISTS idx_awards_player_kind ON awards(player_id, kind);
CREATE INDEX IF NOT EXISTS idx_awards_match ON awards(match_id);

-- derived view: 3-dart average per player per match ---------------------
CREATE VIEW IF NOT EXISTS v_player_match_avg AS
SELECT
  l.match_id,
  d.player_id,
  ROUND((SUM(turn_total) * 3.0) / NULLIF(SUM(darts_thrown), 0), 2) AS avg_3dart
FROM (
  SELECT leg_id, player_id, turn_number, SUM(score_value) AS turn_total, COUNT(*) AS darts_thrown
  FROM darts
  WHERE busted = 0
  GROUP BY leg_id, player_id, turn_number
) t
JOIN darts d ON d.leg_id = t.leg_id AND d.player_id = t.player_id AND d.turn_number = t.turn_number
JOIN legs l ON l.id = d.leg_id
GROUP BY l.match_id, d.player_id;

-- derived view: checkout % per player per match -------------------------
CREATE VIEW IF NOT EXISTS v_checkout_pct AS
SELECT
  l.match_id,
  mp.player_id,
  COUNT(CASE WHEN l.winner_id = mp.player_id THEN 1 END) AS legs_won,
  COUNT(DISTINCT l.id) AS legs_played,
  ROUND(
    100.0 * COUNT(CASE WHEN l.winner_id = mp.player_id THEN 1 END) /
    MAX(COUNT(DISTINCT l.id), 1)
  , 1) AS checkout_pct
FROM legs l
JOIN match_players mp ON mp.match_id = l.match_id
GROUP BY l.match_id, mp.player_id;
