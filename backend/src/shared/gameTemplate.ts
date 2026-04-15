import type { TransferHistoryItem, UserState } from "../worker/types";

export const GAMEWEEK = {
  id: 1,
  label: "Round 1 Day 1",
  deadline: "2026-04-10T06:30:00Z"
} as const;

export const POINTS_BASELINE = {
  average: 118,
  top: 304
} as const;

export const SCHEDULE = {
  gameweek: "Gameweek1",
  deadline: "Fri 10 Apr 06:30",
  games: [
    {
      id: "g1",
      date: "2026-04-10",
      tipoff: "07:00",
      home: "Miami Heat",
      away: "New York Knicks",
      status: "upcoming"
    },
    {
      id: "g2",
      date: "2026-04-10",
      tipoff: "07:30",
      home: "Boston Celtics",
      away: "Milwaukee Bucks",
      status: "upcoming"
    },
    {
      id: "g3",
      date: "2026-04-10",
      tipoff: "08:00",
      home: "Denver Nuggets",
      away: "Minnesota Timberwolves",
      status: "upcoming"
    },
    {
      id: "g4",
      date: "2026-04-10",
      tipoff: "10:00",
      home: "Los Angeles Lakers",
      away: "Golden State Warriors",
      status: "upcoming"
    }
  ]
} as const;

export const HELP_RULES = {
  rosterRules: [
    "Each team starts with 10 players: 5 starters and 5 bench players.",
    "Only starters score full points for the day.",
    "Captain receives 1.5x points multiplier.",
    "Free transfers refresh every playoff week."
  ],
  scoringRules: [
    { event: "Point", value: 1 },
    { event: "Rebound", value: 1.2 },
    { event: "Assist", value: 1.5 },
    { event: "Steal", value: 3 },
    { event: "Block", value: 3 },
    { event: "Turnover", value: -1 }
  ]
} as const;

export function buildInitialUserState(gameId: string): UserState {
  return {
    teamName: `${gameId} Squad`,
    managerName: gameId,
    overallPoints: 0,
    overallRank: 0,
    totalPlayers: 0,
    gamedayPoints: 0,
    fanLeague: "",
    captainId: "",
    captainDecisionLocked: false,
    starters: [],
    bench: [],
    market: [],
    usedThisWeek: 0,
    weeklyFreeLimit: 2,
    totalTransfers: 0,
    rosterValue: 0,
    bank: 100,
    history: [] as TransferHistoryItem[]
  };
}
