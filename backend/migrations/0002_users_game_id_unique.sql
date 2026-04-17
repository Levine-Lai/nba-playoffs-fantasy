CREATE UNIQUE INDEX IF NOT EXISTS users_game_id_unique_idx ON users (game_id COLLATE NOCASE);
