const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'alytics.db');

let db;

function getDb() {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
  }
  return db;
}

function init() {
  const database = getDb();

  database.exec(`
    CREATE TABLE IF NOT EXISTS sites (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      domain TEXT NOT NULL,
      api_key TEXT NOT NULL UNIQUE,
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS pageviews (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      site_id TEXT NOT NULL,
      session_id TEXT NOT NULL,
      visitor_id TEXT NOT NULL,
      path TEXT NOT NULL DEFAULT '/',
      url TEXT NOT NULL DEFAULT '',
      referrer TEXT DEFAULT '',
      title TEXT DEFAULT '',
      browser TEXT DEFAULT 'Unknown',
      os TEXT DEFAULT 'Unknown',
      device TEXT DEFAULT 'Desktop',
      duration INTEGER DEFAULT 0,
      timestamp INTEGER NOT NULL,
      FOREIGN KEY (site_id) REFERENCES sites(id)
    );

    CREATE TABLE IF NOT EXISTS events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      site_id TEXT NOT NULL,
      session_id TEXT NOT NULL,
      visitor_id TEXT NOT NULL,
      name TEXT NOT NULL,
      props TEXT DEFAULT '{}',
      timestamp INTEGER NOT NULL,
      FOREIGN KEY (site_id) REFERENCES sites(id)
    );

    CREATE INDEX IF NOT EXISTS idx_pv_site_time   ON pageviews(site_id, timestamp);
    CREATE INDEX IF NOT EXISTS idx_pv_visitor      ON pageviews(site_id, visitor_id);
    CREATE INDEX IF NOT EXISTS idx_pv_session      ON pageviews(site_id, session_id);
    CREATE INDEX IF NOT EXISTS idx_pv_path         ON pageviews(site_id, path);
    CREATE INDEX IF NOT EXISTS idx_events_site     ON events(site_id, timestamp);
  `);

  console.log('✓ Database ready');
  return database;
}

module.exports = { getDb, init };
