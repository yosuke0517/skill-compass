-- Opt-in only. No FK to short-lived relay sessions: learning history lives 30 days.
ALTER TABLE interview_relay_sessions ADD COLUMN save_learning INTEGER NOT NULL DEFAULT 0 CHECK(save_learning IN (0,1));
CREATE TABLE interview_learning_sessions (
 id TEXT PRIMARY KEY, owner TEXT NOT NULL, created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL,
 consent_version TEXT NOT NULL DEFAULT 'text-only-30d-v1'
);
CREATE INDEX interview_learning_owner ON interview_learning_sessions(owner,created_at);
CREATE INDEX interview_learning_expiry ON interview_learning_sessions(expires_at);
CREATE TABLE interview_learning_turns (
 id TEXT PRIMARY KEY, session_id TEXT NOT NULL REFERENCES interview_learning_sessions(id) ON DELETE CASCADE,
 created_at INTEGER NOT NULL, source TEXT NOT NULL, text TEXT NOT NULL
);
CREATE INDEX interview_learning_turn_session ON interview_learning_turns(session_id,created_at);
CREATE TABLE interview_learning_generations (
 id TEXT PRIMARY KEY, session_id TEXT NOT NULL REFERENCES interview_learning_sessions(id) ON DELETE CASCADE,
 created_at INTEGER NOT NULL, turn_ids_json TEXT NOT NULL, request_json TEXT NOT NULL,
 output_json TEXT, status TEXT NOT NULL DEFAULT 'pending', error_code TEXT,
 latency_ms INTEGER, sent_at INTEGER, displayed_at INTEGER,
 rating TEXT, comment TEXT, evaluated_at INTEGER
);
CREATE INDEX interview_learning_generation_session ON interview_learning_generations(session_id,created_at);
CREATE TRIGGER interview_learning_consent AFTER INSERT ON interview_relay_sessions WHEN NEW.save_learning=1 BEGIN
 INSERT INTO interview_learning_sessions(id,owner,created_at,expires_at)
 VALUES(NEW.id,NEW.owner,NEW.created_at,NEW.created_at+2592000000);
END;
