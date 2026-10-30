-- No users are authorized and no spending allowance is granted by this migration.
-- Exact authenticated user IDs only. This table has no browser write endpoint.
CREATE TABLE interview_relay_developers (
  user_id TEXT PRIMARY KEY,
  enabled INTEGER NOT NULL DEFAULT 0 CHECK(enabled IN (0,1)),
  budget_microusd INTEGER NOT NULL DEFAULT 0 CHECK(budget_microusd >= 0)
);
ALTER TABLE interview_relay_sessions ADD COLUMN usage_mode TEXT NOT NULL DEFAULT 'standard' CHECK(usage_mode IN ('standard','developer'));
ALTER TABLE interview_relay_sessions ADD COLUMN charged_until INTEGER NOT NULL DEFAULT 0;

DROP TRIGGER interview_reserve;
CREATE TRIGGER interview_reserve BEFORE INSERT ON interview_relay_sessions BEGIN
  SELECT CASE WHEN EXISTS(SELECT 1 FROM interview_relay_sessions WHERE relay_until>NEW.created_at OR
    (state='active' AND expires_at>NEW.created_at AND heartbeat+30000>NEW.created_at)) THEN RAISE(ABORT,'active session') END;
  SELECT CASE WHEN NEW.usage_mode='standard' AND NOT EXISTS(SELECT 1 FROM interview_relay_allowance WHERE id=1 AND
    duration_remaining >= NEW.expires_at-NEW.created_at AND hints_remaining >= NEW.hint_limit) THEN RAISE(ABORT,'allowance exhausted') END;
  SELECT CASE WHEN NEW.usage_mode='developer' AND NOT EXISTS(SELECT 1 FROM interview_relay_developers WHERE user_id=NEW.owner AND enabled=1 AND budget_microusd>=15000)
    THEN RAISE(ABORT,'developer access or estimate budget unavailable') END;
  UPDATE interview_relay_allowance SET duration_remaining=duration_remaining-(NEW.expires_at-NEW.created_at), hints_remaining=hints_remaining-NEW.hint_limit
    WHERE id=1 AND NEW.usage_mode='standard';
END;

-- Reserve conservative estimated cost before granting processing: $0.03/minute
-- for audio+relay, $0.002 per hint attempt. Not a Google billing hard cap.
-- charged_until never decreases on disconnect/reconnect; no automatic refunds.
CREATE TRIGGER interview_developer_charge BEFORE UPDATE ON interview_relay_sessions
WHEN NEW.usage_mode='developer' AND NEW.state='active' AND
 (NEW.relay_until>0 OR (NEW.code_hash IS NOT OLD.code_hash AND NEW.code_hash IS NOT NULL)) BEGIN
  SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM interview_relay_developers WHERE user_id=NEW.owner AND enabled=1 AND
    budget_microusd >= ((MAX(0,NEW.charged_until-MAX(OLD.charged_until,OLD.created_at))+1)/2 + MAX(0,NEW.hints-OLD.hints)*2000))
    THEN RAISE(ABORT,'developer access or estimate budget exhausted') END;
  UPDATE interview_relay_developers SET budget_microusd=budget_microusd-
    ((MAX(0,NEW.charged_until-MAX(OLD.charged_until,OLD.created_at))+1)/2 + MAX(0,NEW.hints-OLD.hints)*2000)
    WHERE user_id=NEW.owner;
END;
