export type PlayerColor = "hot" | "cold";

export interface Player {
  id: string;
  name: string;
  team: string;
  position: string;
  salary: number;
  nextOpponent?: string;
  upcoming?: string[];
  points?: number;
  color?: PlayerColor;
}

export interface Lineup {
  starters: Player[];
  bench: Player[];
  captainId: string;
}

export interface Gameweek {
  id: number;
  label: string;
  deadline: string;
}

export interface LineupResponse {
  gameweek: Gameweek;
  lineup: Lineup;
  transactions: {
    freeLeft: number;
    usedThisWeek: number;
    weeklyFreeLimit: number;
  };
}

export interface ProfileResponse {
  profile: {
    teamName: string;
    managerName: string;
    overallPoints: number;
    overallRank: number;
    totalPlayers: number;
    gamedayPoints: number;
    fanLeague: string;
  };
  transactions: {
    freeLeft: number;
    total: number;
    rosterValue: number;
    bank: number;
  };
  leagues: {
    global: LeagueEntry[];
    privateClassic: LeagueEntry[];
  };
}

export interface PointsResponse {
  gameweek: Gameweek;
  summary: {
    average: number;
    final: number;
    top: number;
  };
  lineup: Lineup;
}

export interface TransferMarketPlayer {
  id: string;
  name: string;
  team: string;
  position: string;
  salary: number;
  recentAverage: number;
  trend: "up" | "down";
}

export interface TransferHistoryItem {
  id: string;
  timestamp: string;
  outPlayer: string;
  inPlayer: string;
  cost: number;
  note: string;
}

export interface TransactionsResponse {
  freeTransfersLeft: number;
  usedThisWeek: number;
  weeklyFreeLimit: number;
  bank: number;
  rosterValue: number;
  history: TransferHistoryItem[];
  lineup: Lineup;
  market: TransferMarketPlayer[];
}

export interface LeagueEntry {
  id: string;
  name: string;
  rank: number;
  lastRank: number;
}

export interface LeaguesResponse {
  privateClassic: LeagueEntry[];
  publicClassic: LeagueEntry[];
  global: LeagueEntry[];
}

export interface ScheduleGame {
  id: string;
  date: string;
  tipoff: string;
  home: string;
  away: string;
  status: "upcoming" | "live" | "final";
}

export interface ScheduleResponse {
  gameweek: string;
  deadline: string;
  games: ScheduleGame[];
}

export interface HelpResponse {
  rosterRules: string[];
  scoringRules: Array<{
    event: string;
    value: number;
  }>;
}

export interface LoginResponse {
  token: string;
  user: AuthUser;
}

export interface RegisterResponse {
  token: string;
  user: AuthUser;
}

export interface AuthUser {
  id: string;
  account: string;
  gameId: string;
  displayName: string;
}

