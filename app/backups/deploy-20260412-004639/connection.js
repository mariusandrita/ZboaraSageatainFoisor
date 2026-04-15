import Database from 'better-sqlite3';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCHEMA_PATH = join(__dirname, 'schema.sql');
const DEFAULT_DB_PATH = join(__dirname, '..', '..', '..', 'dartsleague.db');

let _db = null;

export function getDb() {
  if (!_db) throw new Error('Database not initialised — call openDb() first');
  return _db;
}

export function openDb(dbPath = process.env.DB_PATH || DEFAULT_DB_PATH) {
  if (_db) return _db;

  _db = new Database(dbPath);

  // WAL mode for crash safety + concurrent reads
  _db.pragma('journal_mode = WAL');
  _db.pragma('foreign_keys = ON');
  _db.pragma('synchronous = NORMAL');

  // Bootstrap schema on first run
  const schema = readFileSync(SCHEMA_PATH, 'utf8');
  _db.exec(schema);

  // Migrations (idempotent)
  try { _db.exec('ALTER TABLE players ADD COLUMN photo TEXT'); } catch {}
  try { _db.exec('ALTER TABLE players ADD COLUMN is_playable INTEGER NOT NULL DEFAULT 1'); } catch {}
  try { _db.exec('ALTER TABLE players ADD COLUMN stats_visible INTEGER NOT NULL DEFAULT 1'); } catch {}
  try { _db.exec('ALTER TABLE players ADD COLUMN source_type TEXT'); } catch {}
  try { _db.exec('ALTER TABLE players ADD COLUMN source_ref TEXT'); } catch {}
  try { _db.exec('ALTER TABLE matches ADD COLUMN public_code TEXT'); } catch {}
  try { _db.exec('ALTER TABLE matches ADD COLUMN active_elapsed_ms INTEGER NOT NULL DEFAULT 0'); } catch {}
  try { _db.exec('ALTER TABLE matches ADD COLUMN controller_opened_at TEXT'); } catch {}
  try { _db.exec('ALTER TABLE matches ADD COLUMN sets_to_win INTEGER NOT NULL DEFAULT 1'); } catch {}
  try { _db.exec('ALTER TABLE matches ADD COLUMN legs_per_set INTEGER NOT NULL DEFAULT 1'); } catch {}
  try { _db.exec('ALTER TABLE matches ADD COLUMN source_type TEXT'); } catch {}
  try { _db.exec('ALTER TABLE matches ADD COLUMN source_ref TEXT'); } catch {}
  try { _db.exec('ALTER TABLE matches ADD COLUMN source_payload TEXT'); } catch {}
  try { _db.exec('ALTER TABLE match_players ADD COLUMN general_avg_start REAL NOT NULL DEFAULT 0'); } catch {}
  try { _db.exec('ALTER TABLE match_players ADD COLUMN sets_won INTEGER NOT NULL DEFAULT 0'); } catch {}
  try { _db.exec('ALTER TABLE legs ADD COLUMN set_number INTEGER NOT NULL DEFAULT 1'); } catch {}
  try { _db.exec('CREATE UNIQUE INDEX idx_matches_public_code ON matches(public_code)'); } catch {}
  try { _db.exec('CREATE UNIQUE INDEX idx_matches_source_ref ON matches(source_type, source_ref)'); } catch {}
  try { _db.exec('CREATE INDEX idx_players_playable ON players(is_playable, archived_at)'); } catch {}
  try { _db.exec('CREATE INDEX idx_players_stats_visible ON players(stats_visible, archived_at)'); } catch {}
  // Performance indexes for lobby stats aggregation
  try { _db.exec('CREATE INDEX idx_matches_status ON matches(status)'); } catch {}
  try { _db.exec('CREATE INDEX idx_legs_match ON legs(match_id)'); } catch {}
  try { _db.exec('CREATE INDEX idx_legs_winner ON legs(winner_id, match_id)'); } catch {}
  try { _db.exec('CREATE INDEX idx_darts_leg_player ON darts(leg_id, player_id, turn_number, busted, score_value)'); } catch {}
  try { _db.exec('CREATE INDEX idx_match_players_player ON match_players(player_id, match_id)'); } catch {}
  try { _db.exec('CREATE INDEX idx_match_players_match ON match_players(match_id, player_id)'); } catch {}
  _db.exec(`
    CREATE TABLE IF NOT EXISTS awards (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      match_id INTEGER NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
      leg_id INTEGER NOT NULL REFERENCES legs(id) ON DELETE CASCADE,
      dart_id INTEGER NOT NULL REFERENCES darts(id) ON DELETE CASCADE,
      player_id INTEGER NOT NULL REFERENCES players(id),
      kind TEXT NOT NULL,
      value INTEGER,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE (dart_id, kind)
    );
    CREATE INDEX IF NOT EXISTS idx_awards_player_kind ON awards(player_id, kind);
    CREATE INDEX IF NOT EXISTS idx_awards_match ON awards(match_id);
    CREATE TABLE IF NOT EXISTS prodarts_players (
      prodarts_id TEXT PRIMARY KEY,
      name TEXT,
      display_name TEXT,
      password_hash TEXT,
      online INTEGER,
      last_reset_at_ms INTEGER,
      only_for_help INTEGER,
      created_at_ms INTEGER,
      sync_games TEXT,
      sync_tournaments TEXT,
      sync_trainings TEXT,
      raw_json TEXT NOT NULL,
      imported_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS prodarts_x01_games (
      prodarts_id TEXT PRIMARY KEY,
      state INTEGER,
      timestamp_ms INTEGER,
      played_at_ms INTEGER,
      need_to_sync INTEGER,
      deleted INTEGER,
      beginner INTEGER,
      draw_mode INTEGER,
      sets INTEGER,
      legs INTEGER,
      deciding_leg_beginner INTEGER,
      list_rounds TEXT,
      tournament_id TEXT,
      tournament_game_idx INTEGER,
      online INTEGER,
      evaluated INTEGER,
      elo_change_1 INTEGER,
      elo_change_2 INTEGER,
      start_points INTEGER,
      check_in_mode INTEGER,
      check_out_mode INTEGER,
      raw_json TEXT NOT NULL,
      imported_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS prodarts_player_in_playable (
      prodarts_id TEXT PRIMARY KEY,
      player_id TEXT NOT NULL,
      playable_id TEXT NOT NULL,
      order_number INTEGER NOT NULL,
      placement INTEGER,
      deleted INTEGER NOT NULL DEFAULT 0,
      raw_json TEXT NOT NULL,
      imported_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS prodarts_player_mappings (
      prodarts_player_id TEXT PRIMARY KEY REFERENCES prodarts_players(prodarts_id) ON DELETE CASCADE,
      canonical_name TEXT NOT NULL,
      canonical_player_id INTEGER REFERENCES players(id),
      is_playable INTEGER NOT NULL DEFAULT 0,
      stats_visible INTEGER NOT NULL DEFAULT 0,
      merged_into_name TEXT,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS prodarts_match_mappings (
      prodarts_game_id TEXT PRIMARY KEY REFERENCES prodarts_x01_games(prodarts_id) ON DELETE CASCADE,
      dartsleague_match_id INTEGER UNIQUE REFERENCES matches(id) ON DELETE SET NULL,
      import_status TEXT NOT NULL DEFAULT 'pending',
      import_error TEXT,
      imported_at TEXT,
      last_attempted_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  return _db;
}

export function closeDb() {
  if (_db) {
    _db.close();
    _db = null;
  }
}
