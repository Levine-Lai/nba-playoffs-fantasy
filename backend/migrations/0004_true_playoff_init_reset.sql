INSERT INTO game_rules (key, value, updated_at)
VALUES ('first_deadline', '2026-04-18T16:30:00Z', CURRENT_TIMESTAMP)
ON CONFLICT(key) DO UPDATE SET
  value = excluded.value,
  updated_at = excluded.updated_at;

INSERT INTO game_rules (key, value, updated_at)
VALUES ('weekly_free_transfers', '6', CURRENT_TIMESTAMP)
ON CONFLICT(key) DO UPDATE SET
  value = excluded.value,
  updated_at = excluded.updated_at;

INSERT INTO game_rules (key, value, updated_at)
VALUES ('transfer_penalty', '50', CURRENT_TIMESTAMP)
ON CONFLICT(key) DO UPDATE SET
  value = excluded.value,
  updated_at = excluded.updated_at;

UPDATE user_states
SET
  overall_points = 0,
  overall_rank = 0,
  total_players = 0,
  gameday_points = 0,
  used_this_week = 0,
  weekly_free_limit = 6,
  total_transfers = 0,
  history_json = '[]',
  updated_at = CURRENT_TIMESTAMP;

DELETE FROM app_state
WHERE key IN ('league_points_ledger_v1', 'user_chips_v1');
