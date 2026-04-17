INSERT INTO game_rules (key, value, updated_at)
VALUES ("weekly_free_transfers", "0", CURRENT_TIMESTAMP)
ON CONFLICT(key) DO UPDATE SET
  value = excluded.value,
  updated_at = excluded.updated_at;

INSERT INTO game_rules (key, value, updated_at)
VALUES ("transfer_penalty", "50", CURRENT_TIMESTAMP)
ON CONFLICT(key) DO UPDATE SET
  value = excluded.value,
  updated_at = excluded.updated_at;
