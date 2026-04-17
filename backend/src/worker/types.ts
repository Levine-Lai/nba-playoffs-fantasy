export interface Env {
  PLAYOFF_FANTASY_DB: D1Database;
  APP_ORIGIN?: string;
  LIVE_TIME_ZONE?: string;
}

export type PlayerColor = "hot" | "cold";

export interface TeamAsset {
  name: string;
  code?: string | null;
  triCode?: string;
  id?: number | null;
  logoUrl?: string | null;
  logoFallbackUrl?: string | null;
}

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

export interface UserState {
  teamName: string;
  managerName: string;
  overallPoints: number;
  overallRank: number;
  totalPlayers: number;
  gamedayPoints: number;
  fanLeague: string;
  captainId: string;
  captainDecisionLocked: boolean;
  starters: Player[];
  bench: Player[];
  market: Player[];
  usedThisWeek: number;
  weeklyFreeLimit: number;
  totalTransfers: number;
  rosterValue: number;
  bank: number;
  history: TransferHistoryItem[];
}

export interface StoredLineupSnapshot {
  starters: Player[];
  bench: Player[];
  captainId: string;
  rosterValue: number;
  bank: number;
}

export interface TransferWindowSnapshot {
  periodKey: string;
  lineup: StoredLineupSnapshot;
  history: TransferHistoryItem[];
  totalTransfers: number;
}

export interface UserChipCardState {
  label: "Play" | "Active" | "Played";
  canActivate: boolean;
  isActive: boolean;
  isPlayed: boolean;
}

export interface UserChipsState {
  transferWindowSnapshot?: TransferWindowSnapshot | null;
  wildcard: {
    used: boolean;
    activePeriodKey?: string | null;
    activatedAt?: string | null;
  };
  allStar: {
    used: boolean;
    activePeriodKey?: string | null;
    activatedAt?: string | null;
    originalLineup?: StoredLineupSnapshot | null;
    activeLineup?: StoredLineupSnapshot | null;
  };
}

export interface PublicUser {
  id: string;
  account: string;
  gameId: string;
  displayName: string;
}

export interface AuthUser {
  id: string;
  account: string;
  gameId: string;
  token?: string;
}

export interface GameweekPayload {
  id: number;
  label: string;
  deadline: string;
}

export interface TransferWindowContext {
  key: string;
  label: string;
  limit: number;
  mode: "LIMITLESS" | "LIMITED";
}

export interface EditablePeriodContext {
  gameweek: GameweekPayload;
  transferWindow: TransferWindowContext;
  beforeCompetitionStart: boolean;
  period: {
    key: string;
    label: string;
    roundNumber: number;
    dayNumber: number;
    deadline: string;
    gamedayIndex: number;
    gamedayKey: string;
  };
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

export interface TransactionsPayload {
  gameweek: GameweekPayload;
  hasTeam: boolean;
  transferMode: "LIMITLESS" | "LIMITED";
  freeTransfersLeft: number;
  usedThisWeek: number;
  weeklyFreeLimit: number;
  bank: number;
  rosterValue: number;
  history: TransferHistoryItem[];
  chips: {
    wildcard: UserChipCardState;
    allStar: UserChipCardState;
  };
  lineup: {
    starters: Player[];
    bench: Player[];
    captainId: string;
  };
  market: Player[];
}

export interface StoredScheduleGame {
  id: string;
  date: string;
  tipoff: string;
  gamedayKey?: string;
  gamedayLabel?: string;
  gamedayDateLabel?: string;
  gamedayIndex?: number;
  home: string;
  away: string;
  homeTeam?: TeamAsset | null;
  awayTeam?: TeamAsset | null;
  status: "upcoming" | "live" | "final";
  homeScore?: number | null;
  awayScore?: number | null;
  statusText?: string;
  stageLabel?: string;
}

export interface StoredScheduleCache {
  ready?: boolean;
  updatedAt?: string;
  deadline?: string | null;
  gameweek?: string;
  currentGameday?: {
    key?: string;
    label?: string;
    dateLabel?: string;
    index?: number;
    gameweekNumber?: number;
    gamedayNumber?: number;
    deadline?: string;
  } | null;
  games?: StoredScheduleGame[];
  testingGames?: StoredScheduleGame[];
}

export interface NextMatchup {
  opponent: TeamAsset;
  gamedayLabel: string | null;
  tipoff: string | null;
  upcomingSchedule?: PlayerScheduleCell[];
}
