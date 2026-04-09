import Database from 'better-sqlite3';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCHEMA_PATH = join(__dirname, 'schema.sql');

let _db = null;

export function getDb() {
  if (!_db) throw new Error('Database not initialised — call openDb() first');
  return _db;
}

export function openDb(dbPath = process.env.DB_PATH || './dartsleague.db') {
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
  try { _db.exec('ALTER TABLE matches ADD COLUMN public_code TEXT'); } catch {}
  try { _db.exec('ALTER TABLE matches ADD COLUMN active_elapsed_ms INTEGER NOT NULL DEFAULT 0'); } catch {}
  try { _db.exec('ALTER TABLE matches ADD COLUMN controller_opened_at TEXT'); } catch {}
  try { _db.exec('ALTER TABLE match_players ADD COLUMN general_avg_start REAL NOT NULL DEFAULT 0'); } catch {}
  try { _db.exec('CREATE UNIQUE INDEX idx_matches_public_code ON matches(public_code)'); } catch {}
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
  `);

  return _db;
}

export function closeDb() {
  if (_db) {
    _db.close();
    _db = null;
  }
}
