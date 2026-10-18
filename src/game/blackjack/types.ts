export const SUITS = ['spades', 'hearts', 'diamonds', 'clubs'] as const;
export const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'] as const;

export type Suit = (typeof SUITS)[number];
export type Rank = (typeof RANKS)[number];

export interface Card {
  id: string;
  suit: Suit;
  rank: Rank;
}

export type GamePhase =
  | 'LOBBY'
  | 'MODE_SETUP'
  | 'BETTING'
  | 'INITIAL_DEAL'
  | 'INSURANCE_OFFER'
  | 'DEALER_PEEK'
  | 'PLAYER_TURN'
  | 'DEALER_REVEAL'
  | 'DEALER_TURN'
  | 'SETTLEMENT'
  | 'ROUND_COMPLETE'
  | 'CHALLENGE_COMPLETE'
  | 'CHALLENGE_FAILED'
  | 'PAUSED';

export type GameMode = 'free' | 'challenge';
export type ChallengeDifficulty = 'easy' | 'normal' | 'hard';
export type HandStatus = 'active' | 'stood' | 'busted' | 'surrendered' | 'settled';
export type HandResult = 'BLACKJACK' | 'WIN' | 'LOSS' | 'PUSH' | 'BUST' | 'SURRENDER' | 'EVEN_MONEY';

export interface PlayerHand {
  id: string;
  cards: Card[];
  betCents: number;
  status: HandStatus;
  fromSplit: boolean;
  splitAces: boolean;
  doubled: boolean;
  actionsTaken: number;
  result?: HandResult;
  payoutCents?: number;
  profitCents?: number;
}

export interface HandValue {
  total: number;
  soft: boolean;
  busted: boolean;
}

export interface RecentRound {
  roundId: string;
  finishedAt: number;
  mode: GameMode;
  baseBetCents: number;
  profitCents: number;
  bankrollCents: number;
  result: 'win' | 'loss' | 'push';
}

export interface GameStats {
  rounds: number;
  handsResolved: number;
  wins: number;
  losses: number;
  pushes: number;
  blackjacks: number;
  playerBusts: number;
  dealerBusts: number;
  netProfitCents: number;
  highestBankrollCents: number;
  lowestBankrollCents: number;
  totalBaseBetCents: number;
  maxBaseBetCents: number;
  doubleAttempts: number;
  doubleWins: number;
  doublePushes: number;
  doubleProfitCents: number;
  splitAttempts: number;
  splitHandsCreated: number;
  splitProfitCents: number;
  surrenders: number;
  insuranceAttempts: number;
  insuranceWins: number;
  insuranceProfitCents: number;
  bestWinStreak: number;
  worstLoseStreak: number;
  currentStreak: number;
  bankrollHistory: number[];
  recentRounds: RecentRound[];
  challengeResults: Record<ChallengeDifficulty, { success: number; failed: number; abandoned: number; bestBankrollCents: number; bestRounds: number | null }>;
}

export interface GameState {
  schemaVersion: 1;
  phase: GamePhase;
  resumePhase: Exclude<GamePhase, 'PAUSED'> | null;
  mode: GameMode;
  challengeDifficulty: ChallengeDifficulty | null;
  challengeTargetCents: number | null;
  sessionId: string;
  sessionStartedAt: number;
  sessionRounds: number;
  bankrollCents: number;
  freeBankrollCents: number;
  startingBankrollCents: number;
  baseBetCents: number;
  lastBetCents: number;
  roundId: string | null;
  lastSettledRoundId: string | null;
  roundProfitCents: number;
  shoe: Card[];
  discard: Card[];
  dealerCards: Card[];
  hands: PlayerHand[];
  activeHandIndex: number;
  insuranceBetCents: number;
  insuranceResolved: boolean;
  dealerPeeked: boolean;
  stats: GameStats;
  notice: string;
  roundReview?: RoundReviewEntry[];
}

export interface ProbabilityOdds {
  win: number;
  push: number;
  loss: number;
  hitBust: number;
}

export type ReviewAction = PlayerAction | 'INSURANCE_ACCEPT' | 'INSURANCE_DECLINE' | 'EVEN_MONEY';

export interface RoundReviewSnapshot {
  handNumber: number;
  playerRanks: Rank[];
  dealerUp: Rank | null;
  total: number;
  soft: boolean;
  odds: ProbabilityOdds | null;
}

export interface RoundReviewEntry extends RoundReviewSnapshot {
  action: ReviewAction;
}

export type GameEvent =
  | { type: 'CREATE_SESSION'; mode: GameMode; difficulty?: ChallengeDifficulty; now?: number }
  | { type: 'BET_CONFIRMED'; amountCents: number }
  | { type: 'INSURANCE_DECISION'; accept: boolean }
  | { type: 'EVEN_MONEY' }
  | { type: 'HIT' }
  | { type: 'STAND' }
  | { type: 'DOUBLE' }
  | { type: 'SPLIT' }
  | { type: 'SURRENDER' }
  | { type: 'NEXT_ROUND' }
  | { type: 'RESTART_SESSION' }
  | { type: 'PAUSE' }
  | { type: 'RESUME' };

export interface RandomSource {
  nextInt(maxExclusive: number): number;
}

export interface ActionAvailability {
  enabled: boolean;
  reason: string;
}

export type PlayerAction = 'HIT' | 'STAND' | 'DOUBLE' | 'SPLIT' | 'SURRENDER';
