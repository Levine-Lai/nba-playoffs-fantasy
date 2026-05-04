INSERT INTO game_rules (key, value, updated_at)
VALUES ('weekly_free_transfers', '8', CURRENT_TIMESTAMP)
ON CONFLICT(key) DO UPDATE SET
  value = excluded.value,
  updated_at = excluded.updated_at;

UPDATE user_states
SET weekly_free_limit = 8,
    updated_at = CURRENT_TIMESTAMP
WHERE weekly_free_limit <> 8;
