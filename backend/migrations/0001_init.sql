CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  account TEXT NOT NULL UNIQUE COLLATE NOCASE,
  game_id TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS user_states (
  user_id INTEGER PRIMARY KEY,
  team_name TEXT NOT NULL,
  manager_name TEXT NOT NULL,
  overall_points INTEGER NOT NULL,
  overall_rank INTEGER NOT NULL,
  total_players INTEGER NOT NULL,
  gameday_points REAL NOT NULL,
  fan_league TEXT NOT NULL,
  captain_id TEXT NOT NULL,
  starters_json TEXT NOT NULL,
  bench_json TEXT NOT NULL,
  market_json TEXT NOT NULL,
  used_this_week INTEGER NOT NULL,
  weekly_free_limit INTEGER NOT NULL,
  total_transfers INTEGER NOT NULL,
  roster_value REAL NOT NULL,
  bank REAL NOT NULL,
  history_json TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS teams (
  id INTEGER PRIMARY KEY,
  code INTEGER,
  name TEXT NOT NULL,
  short_name TEXT NOT NULL,
  city TEXT,
  conference TEXT,
  division TEXT,
  raw_json TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS element_types (
  id INTEGER PRIMARY KEY,
  plural_name TEXT NOT NULL,
  singular_name TEXT NOT NULL,
  short_name TEXT NOT NULL,
  squad_select INTEGER NOT NULL,
  raw_json TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS players (
  id INTEGER PRIMARY KEY,
  code INTEGER,
  first_name TEXT NOT NULL,
  second_name TEXT NOT NULL,
  web_name TEXT NOT NULL,
  known_name TEXT,
  team_id INTEGER NOT NULL,
  team_short_name TEXT NOT NULL,
  element_type INTEGER NOT NULL,
  position_short TEXT NOT NULL,
  now_cost INTEGER NOT NULL,
  salary REAL NOT NULL,
  total_points INTEGER NOT NULL,
  event_points INTEGER NOT NULL,
  points_per_game REAL NOT NULL,
  selected_by_percent REAL NOT NULL,
  status TEXT NOT NULL,
  can_select INTEGER NOT NULL,
  can_transact INTEGER NOT NULL,
  news TEXT,
  points_scored INTEGER NOT NULL,
  rebounds INTEGER NOT NULL,
  assists INTEGER NOT NULL,
  blocks INTEGER NOT NULL,
  steals INTEGER NOT NULL,
  raw_json TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (team_id) REFERENCES teams(id),
  FOREIGN KEY (element_type) REFERENCES element_types(id)
);

CREATE TABLE IF NOT EXISTS game_rules (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS private_leagues (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  code TEXT NOT NULL UNIQUE,
  owner_user_id INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (owner_user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS private_league_members (
  league_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  joined_at TEXT NOT NULL,
  PRIMARY KEY (league_id, user_id),
  FOREIGN KEY (league_id) REFERENCES private_leagues(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS app_state (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_players_team_id ON players(team_id);
CREATE INDEX IF NOT EXISTS idx_players_position_short ON players(position_short);
CREATE INDEX IF NOT EXISTS idx_private_league_members_user_id ON private_league_members(user_id);
