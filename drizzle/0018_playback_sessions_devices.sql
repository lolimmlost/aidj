-- Cross-device sync: playback sessions and device registry
-- Phase 2 of cross-device sync implementation

CREATE TABLE IF NOT EXISTS playback_sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE UNIQUE,
  active_device_id TEXT,
  active_device_name TEXT,
  active_device_type TEXT,
  queue JSONB NOT NULL DEFAULT '[]',
  original_queue JSONB DEFAULT '[]',
  current_index INTEGER NOT NULL DEFAULT 0,
  current_position_ms INTEGER DEFAULT 0,
  is_playing BOOLEAN DEFAULT false,
  volume REAL DEFAULT 0.5,
  is_shuffled BOOLEAN DEFAULT false,
  queue_updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  position_updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  play_state_updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS playback_sessions_user_id_idx ON playback_sessions(user_id);

CREATE TABLE IF NOT EXISTS devices (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  device_name TEXT NOT NULL,
  device_type TEXT NOT NULL,
  user_agent TEXT,
  last_seen_at TIMESTAMP NOT NULL DEFAULT NOW(),
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS devices_user_id_idx ON devices(user_id);
