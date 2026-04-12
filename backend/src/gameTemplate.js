export const STARTERS_TEMPLATE = [
  {
    id: "p1",
    name: "N. Jokic",
    team: "DEN",
    position: "C",
    salary: 20.5,
    nextOpponent: "MIN",
    upcoming: ["PHX", "OKC"],
    points: 56,
    color: "hot"
  },
  {
    id: "p2",
    name: "S. Curry",
    team: "GSW",
    position: "G",
    salary: 18.2,
    nextOpponent: "LAL",
    upcoming: ["DEN", "LAC"],
    points: 44,
    color: "cold"
  },
  {
    id: "p3",
    name: "G. Antetokounmpo",
    team: "MIL",
    position: "F",
    salary: 21.1,
    nextOpponent: "BOS",
    upcoming: ["NYK", "PHI"],
    points: 51,
    color: "hot"
  },
  {
    id: "p4",
    name: "J. Brunson",
    team: "NYK",
    position: "G",
    salary: 15.6,
    nextOpponent: "MIA",
    upcoming: ["CLE", "BOS"],
    points: 32,
    color: "cold"
  },
  {
    id: "p5",
    name: "A. Edwards",
    team: "MIN",
    position: "F",
    salary: 16.8,
    nextOpponent: "DEN",
    upcoming: ["OKC", "DAL"],
    points: 39,
    color: "hot"
  }
];

export const BENCH_TEMPLATE = [
  {
    id: "p6",
    name: "L. James",
    team: "LAL",
    position: "F",
    salary: 17.8,
    nextOpponent: "GSW",
    upcoming: ["PHX", "DEN"],
    points: 0,
    color: "hot"
  },
  {
    id: "p7",
    name: "J. Tatum",
    team: "BOS",
    position: "F",
    salary: 19.4,
    nextOpponent: "MIL",
    upcoming: ["MIA", "PHI"],
    points: 0,
    color: "cold"
  },
  {
    id: "p8",
    name: "D. Lillard",
    team: "MIL",
    position: "G",
    salary: 15.2,
    nextOpponent: "BOS",
    upcoming: ["PHI", "NYK"],
    points: 0,
    color: "cold"
  },
  {
    id: "p9",
    name: "V. Wembanyama",
    team: "SAS",
    position: "C",
    salary: 16.3,
    nextOpponent: "NOP",
    upcoming: ["DAL", "OKC"],
    points: 0,
    color: "hot"
  },
  {
    id: "p10",
    name: "T. Maxey",
    team: "PHI",
    position: "G",
    salary: 13.9,
    nextOpponent: "CLE",
    upcoming: ["MIL", "BOS"],
    points: 0,
    color: "cold"
  }
];

export const MARKET_TEMPLATE = [
  {
    id: "p11",
    name: "D. Fox",
    team: "SAC",
    position: "G",
    salary: 14.8,
    recentAverage: 41,
    trend: "up"
  },
  {
    id: "p12",
    name: "B. Adebayo",
    team: "MIA",
    position: "C",
    salary: 15.1,
    recentAverage: 33,
    trend: "down"
  },
  {
    id: "p13",
    name: "K. Durant",
    team: "PHX",
    position: "F",
    salary: 18.7,
    recentAverage: 45,
    trend: "up"
  },
  {
    id: "p14",
    name: "D. Booker",
    team: "PHX",
    position: "G",
    salary: 17.3,
    recentAverage: 37,
    trend: "up"
  },
  {
    id: "p15",
    name: "C. Holmgren",
    team: "OKC",
    position: "C",
    salary: 12.6,
    recentAverage: 30,
    trend: "up"
  },
  {
    id: "p16",
    name: "K. Leonard",
    team: "LAC",
    position: "F",
    salary: 14.2,
    recentAverage: 29,
    trend: "down"
  },
  {
    id: "p17",
    name: "P. Banchero",
    team: "ORL",
    position: "F",
    salary: 13.8,
    recentAverage: 34,
    trend: "up"
  }
];

export const GAMEWEEK = {
  id: 1,
  label: "PLAYOFF WEEK 1 - DAY 2",
  deadline: "2026-04-10T06:30:00Z"
};

export const POINTS_BASELINE = {
  average: 118,
  top: 304
};

export const DEFAULT_LEAGUES = {
  privateClassic: [],
  publicClassic: [],
  global: []
};

export const SCHEDULE = {
  gameweek: "PLAYOFF WEEK 1 - DAY 2",
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
};

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
};

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

export function buildInitialUserState(gameId) {
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
    history: []
  };
}

export function buildLeaguesForUser(state, gameId) {
  return clone(DEFAULT_LEAGUES);
}
