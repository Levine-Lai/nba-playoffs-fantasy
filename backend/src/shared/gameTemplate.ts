import type { TransferHistoryItem, UserState } from "../worker/types";

export const GAMEWEEK = {
  id: 1,
  label: "Day 1",
  deadline: "2026-04-18T16:30:00Z"
} as const;

export const POINTS_BASELINE = {
  average: 118,
  top: 304
} as const;

export const SCHEDULE = {
  gameweek: "Postseason",
  deadline: "Sat 18 Apr 16:30",
  games: [
    {
      id: "g1",
      date: "2026-04-18",
      tipoff: "01:00",
      home: "Cleveland Cavaliers",
      away: "Toronto Raptors",
      status: "upcoming"
    },
    {
      id: "g2",
      date: "2026-04-18",
      tipoff: "03:30",
      home: "Denver Nuggets",
      away: "Minnesota Timberwolves",
      status: "upcoming"
    },
    {
      id: "g3",
      date: "2026-04-18",
      tipoff: "06:00",
      home: "New York Knicks",
      away: "Atlanta Hawks",
      status: "upcoming"
    },
    {
      id: "g4",
      date: "2026-04-18",
      tipoff: "08:30",
      home: "Los Angeles Lakers",
      away: "Houston Rockets",
      status: "upcoming"
    }
  ]
} as const;

export const HELP_RULES = {
  rosterRules: [
    "Each team starts with 10 players: 5 starters and 5 bench players.",
    "Only starters score full points for the day.",
    "Captain receives 1.5x points multiplier.",
    "Playable slates are numbered Day 1, Day 2, and so on until the final playoff game.",
    "Before the first deadline, transfers are unlimited.",
    "After Day 1 starts, every normal transfer costs -50 points for that slate.",
    "Transfer penalties appear in standings only after that slate deadline has passed.",
    "After a gameday deadline, the locked lineup becomes that day's scoring lineup, and the next playable gameday opens for edits.",
    "Wildcard can be used once for the whole playoff run and removes transfer penalties for that gameday without reverting the confirmed squad.",
    "All-Star can be used once for the whole playoff run, ignores budget for that gameday, and then restores the original squad."
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
    teamName: gameId,
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
    weeklyFreeLimit: 0,
    totalTransfers: 0,
    rosterValue: 0,
    bank: 100,
    history: [] as TransferHistoryItem[]
  };
}
