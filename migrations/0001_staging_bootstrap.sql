CREATE TABLE IF NOT EXISTS staging_bootstrap (
  singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
  environment TEXT NOT NULL CHECK (environment = 'staging'),
  applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT OR IGNORE INTO staging_bootstrap (singleton, environment)
VALUES (1, 'staging');
