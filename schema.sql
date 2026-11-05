CREATE TABLE IF NOT EXISTS booking_requests (
  id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  details TEXT NOT NULL,
  notification_sent INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS booking_limits (
  key TEXT PRIMARY KEY,
  count INTEGER NOT NULL DEFAULT 1
);
