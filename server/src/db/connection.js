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

  return _db;
}

export function closeDb() {
  if (_db) {
    _db.close();
    _db = null;
  }
}
