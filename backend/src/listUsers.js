import { db } from './db.js';

const query = (process.argv[2] ?? '').trim();
const where = query ? 'WHERE u.account LIKE @query OR u.game_id LIKE @query' : '';
const rows = db.prepare(`
  SELECT
    u.id,
    u.account,
    u.game_id AS gameId,
    u.created_at AS createdAt,
    s.team_name AS teamName,
    s.manager_name AS managerName,
    s.roster_value AS rosterValue,
    s.bank,
    s.total_transfers AS totalTransfers,
    s.overall_points AS overallPoints,
    s.overall_rank AS overallRank
  FROM users u
  LEFT JOIN user_states s ON s.user_id = u.id
  ${where}
  ORDER BY u.id DESC
`).all(query ? { query: `%${query}%` } : {});

if (!rows.length) {
  console.log(query ? `No users matched: ${query}` : 'No users found.');
  process.exit(0);
}

console.table(rows);
