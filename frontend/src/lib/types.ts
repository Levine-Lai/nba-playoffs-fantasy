export type PlayerColor = "hot" | "cold";

export interface PlayerScheduleCell {
  dateKey: string;
  hasGame: boolean;
  opponentName?: string | null;
  opponentTriCode?: string | null;
  opponentLogoUrl?: string | null;
  opponentLogoFallbackUrl?: string | null;
}

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
  upcomingSchedule?: PlayerScheduleCell[];
  points?: number;
  pointsWindowKey?: string | null;
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
}

export interface UpdateTeamNameResponse {
  teamName: string;
}

export interface PointsResponse {
  visible?: boolean;
  message?: string;
  gameweek: Gameweek;
  viewer?: {
    userId: string;
    gameId: string;
    teamName: string;
    managerName: string;
    isCurrentUser: boolean;
  };
  summary: {
    final: number;
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
  upcomingSchedule?: PlayerScheduleCell[];
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
  outPlayerId?: string;
  inPlayerId?: string;
  cost: number;
  note: string;
  windowKey?: string;
  countsTowardLimit?: boolean;
}

export interface ChipCardState {
  label: "Play" | "Active" | "Played";
  canActivate: boolean;
  isActive: boolean;
  isPlayed: boolean;
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
  chips: {
    wildcard: ChipCardState;
    allStar: ChipCardState;
  };
  lineup: Lineup;
  market: TransferMarketPlayer[];
}

export interface StandingMemberEntry {
  userId: string;
  gameId: string;
  teamName: string;
  managerName: string;
  rank: number;
  previousRank?: number;
  phasePoints?: number;
  gamedayPoints: number;
  totalPoints: number;
}

export interface StandingPhaseOption {
  key: string;
  label: string;
}

export interface StandingResponse {
  selectedPhaseKey: string;
  phaseOptions: StandingPhaseOption[];
  members: StandingMemberEntry[];
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

