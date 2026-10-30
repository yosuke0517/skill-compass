-- Authorization lifecycle metadata only; no audio or transcript content.
ALTER TABLE interview_relay_sessions ADD COLUMN ended_at INTEGER;
ALTER TABLE interview_relay_sessions ADD COLUMN end_reason TEXT;
ALTER TABLE interview_learning_sessions ADD COLUMN ended_at INTEGER;
ALTER TABLE interview_learning_sessions ADD COLUMN end_reason TEXT;
CREATE TRIGGER interview_learning_end AFTER UPDATE OF ended_at,end_reason ON interview_relay_sessions BEGIN
 UPDATE interview_learning_sessions SET ended_at=NEW.ended_at,end_reason=NEW.end_reason WHERE id=NEW.id;
END;
