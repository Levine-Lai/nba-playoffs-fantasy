export type PlayerColor = "hot" | "cold";

export interface Player {
  id: string;
  code?: string | null;
  name: string;
  teamId?: number | null;
  teamCode?: string | null;
  team: string;
  position: string;
  salary: number;
  nextOpponent?: string;
  nextOpponentName?: string | null;
  nextOpponentLogoUrl?: string | null;
  nextOpponentLogoFallbackUrl?: string | null;
  upcoming?: string[];
  points?: number;
  color?: PlayerColor;
  totalPoints?: number;
  recentAverage?: number;
  selectedByPercent?: number;
  canSelect?: boolean;
  canTransact?: boolean;
  status?: string;
  headshotUrl?: string | null;
  headshotFallbackUrl?: string | null;
  teamLogoUrl?: string | null;
  teamLogoFallbackUrl?: string | null;
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
  hasTeam: boolean;
  budget: number;
  rosterValue: number;
  bank: number;
  captainDecisionLocked: boolean;
  lineup: Lineup;
  transactions: {
    transferMode?: "LIMITLESS" | "LIMITED";
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
  visible?: boolean;
  message?: string;
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
  code?: string | null;
  name: string;
  teamId?: number | null;
  teamCode?: string | null;
  team: string;
  position: string;
  salary: number;
  recentAverage: number;
  trend?: "up" | "down";
  nextOpponent?: string;
  nextOpponentName?: string | null;
  nextOpponentLogoUrl?: string | null;
  nextOpponentLogoFallbackUrl?: string | null;
  points?: number;
  totalPoints?: number;
  selectedByPercent?: number;
  headshotUrl?: string | null;
  headshotFallbackUrl?: string | null;
  teamLogoUrl?: string | null;
  teamLogoFallbackUrl?: string | null;
}

export interface TransferHistoryItem {
  id: string;
  timestamp: string;
  outPlayer: string;
  inPlayer: string;
  cost: number;
  note: string;
  windowKey?: string;
}

export interface TransactionsResponse {
  gameweek: Gameweek;
  hasTeam: boolean;
  transferMode: "LIMITLESS" | "LIMITED";
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
  code?: string;
  rank: number;
  lastRank: number;
  memberCount?: number;
  isOwner?: boolean;
  members?: LeagueMemberEntry[];
}

export interface LeagueMemberEntry {
  userId: string;
  gameId: string;
  teamName: string;
  managerName: string;
  rank: number;
  gamedayPoints: number;
  totalPoints: number;
}

export interface LeaguesResponse {
  privateClassic: LeagueEntry[];
  publicClassic: LeagueEntry[];
  global: LeagueEntry[];
}

export interface LeagueMutationResponse {
  league: {
    id: string;
    name: string;
    code: string;
  };
  leagues: LeaguesResponse;
}

export interface LeagueDetailResponse {
  league: LeagueEntry;
}

export interface ScheduleGame {
  id: string;
  date: string;
  tipoff: string;
  gamedayKey?: string;
  gamedayLabel?: string;
  gamedayDateLabel?: string;
  gamedayIndex?: number;
  home: string;
  away: string;
  homeTeam?: TeamAsset;
  awayTeam?: TeamAsset;
  status: "upcoming" | "live" | "final";
  homeScore?: number | null;
  awayScore?: number | null;
  statusText?: string;
  stageLabel?: string;
}

export interface TeamAsset {
  name: string;
  code?: string | null;
  triCode?: string;
  logoUrl?: string | null;
  logoFallbackUrl?: string | null;
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

export interface PlayerDataMeta {
  players: number;
  teams: Array<{
    id: number;
    code?: number | null;
    name: string;
    shortName: string;
  }>;
  elementTypes: Array<{
    id: number;
    singularName: string;
    shortName: string;
    squadSelect: number;
  }>;
  firstDeadline: string | null;
  weeklyFreeTransfers: number;
  initialBudget: number;
}

export interface PlayerSearchResponse {
  players: Player[];
  meta: PlayerDataMeta;
}

