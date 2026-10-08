-- Only session authorization metadata. No audio, transcripts, or provider credentials.
-- Provisioning an allowance is a separate explicit operator step; migration grants no quota.
CREATE TABLE IF NOT EXISTS interview_relay_allowance (
  id INTEGER PRIMARY KEY CHECK(id=1), duration_remaining INTEGER NOT NULL CHECK(duration_remaining>=0),
  hints_remaining INTEGER NOT NULL CHECK(hints_remaining>=0)
);
CREATE TABLE IF NOT EXISTS interview_relay_sessions (
  id TEXT PRIMARY KEY, owner TEXT NOT NULL, created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL,
  heartbeat INTEGER NOT NULL, generation INTEGER NOT NULL, state TEXT NOT NULL DEFAULT 'active',
  code_hash TEXT UNIQUE, code_expires INTEGER NOT NULL, nonce TEXT, relay_until INTEGER NOT NULL DEFAULT 0,
  hints INTEGER NOT NULL DEFAULT 0, hint_limit INTEGER NOT NULL, last_hint INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS interview_relay_expiry ON interview_relay_sessions(expires_at);
CREATE TRIGGER IF NOT EXISTS interview_reserve BEFORE INSERT ON interview_relay_sessions BEGIN
  SELECT CASE WHEN EXISTS(SELECT 1 FROM interview_relay_sessions WHERE relay_until>NEW.created_at OR
    (state='active' AND expires_at>NEW.created_at AND heartbeat+30000>NEW.created_at)) THEN RAISE(ABORT,'active session') END;
  SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM interview_relay_allowance WHERE id=1 AND
    duration_remaining >= NEW.expires_at-NEW.created_at AND hints_remaining >= NEW.hint_limit) THEN RAISE(ABORT,'allowance exhausted') END;
  UPDATE interview_relay_allowance SET duration_remaining=duration_remaining-(NEW.expires_at-NEW.created_at), hints_remaining=hints_remaining-NEW.hint_limit WHERE id=1;
END;

CREATE TRIGGER IF NOT EXISTS interview_supersede AFTER INSERT ON interview_relay_sessions BEGIN
  UPDATE interview_relay_sessions SET state='stopped',code_hash=NULL,nonce=NULL,relay_until=0 WHERE id<>NEW.id AND state='active';
END;
