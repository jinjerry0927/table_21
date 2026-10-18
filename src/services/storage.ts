import { createInitialState } from '../game/blackjack/engine';
import { REVIEW_ACTIONS, REVIEW_LIMIT } from '../game/blackjack/review';
import { RANKS, type GamePhase, type GameState, type ProbabilityOdds, type RoundReviewEntry } from '../game/blackjack/types';

const PRIMARY_KEY = 'table21.snapshot.v1';
const BACKUP_KEY = 'table21.snapshot.v1.backup';

const PHASES: GamePhase[] = [
  'LOBBY', 'MODE_SETUP', 'BETTING', 'INITIAL_DEAL', 'INSURANCE_OFFER', 'DEALER_PEEK', 'PLAYER_TURN',
  'DEALER_REVEAL', 'DEALER_TURN', 'SETTLEMENT', 'ROUND_COMPLETE', 'CHALLENGE_COMPLETE', 'CHALLENGE_FAILED', 'PAUSED',
];

export type AnimationSpeed = 'normal' | 'fast' | 'minimal';

export interface UserSettings {
  masterVolume: number;
  effectsVolume: number;
  ambienceVolume: number;
  animationSpeed: AnimationSpeed;
}

export interface StoredSnapshot {
  schemaVersion: 1;
  game: GameState;
  settings: UserSettings;
  tutorialComplete: boolean;
  tutorialStep: number;
}

export const DEFAULT_SETTINGS: UserSettings = {
  masterVolume: 0.8,
  effectsVolume: 0.8,
  ambienceVolume: 0.2,
  animationSpeed: 'normal',
};

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isValidGame(value: unknown): value is GameState {
  if (!value || typeof value !== 'object') return false;
  const game = value as Partial<GameState>;
  return game.schemaVersion === 1
    && typeof game.phase === 'string'
    && PHASES.includes(game.phase as GamePhase)
    && isFiniteNumber(game.bankrollCents)
    && game.bankrollCents >= 0
    && Number.isInteger(game.bankrollCents)
    && isFiniteNumber(game.freeBankrollCents)
    && game.freeBankrollCents >= 0
    && Number.isInteger(game.freeBankrollCents)
    && Array.isArray(game.shoe)
    && Array.isArray(game.discard)
    && Array.isArray(game.dealerCards)
    && Array.isArray(game.hands)
    && !!game.stats
    && isFiniteNumber(game.stats.rounds)
    && Array.isArray(game.stats.bankrollHistory);
}

function isValidSettings(value: unknown): value is UserSettings {
  if (!value || typeof value !== 'object') return false;
  const settings = value as Partial<UserSettings>;
  return isFiniteNumber(settings.masterVolume)
    && isFiniteNumber(settings.effectsVolume)
    && isFiniteNumber(settings.ambienceVolume)
    && ['normal', 'fast', 'minimal'].includes(settings.animationSpeed ?? '');
}

function parseRoundReview(value: unknown): RoundReviewEntry[] {
  if (!Array.isArray(value) || value.length > REVIEW_LIMIT) return [];
  const valid = value.every((raw) => {
    if (!raw || typeof raw !== 'object') return false;
    const entry = raw as Partial<RoundReviewEntry>;
    const validOdds = entry.odds === null || (!!entry.odds && ['win', 'push', 'loss', 'hitBust'].every((key) => {
      const number = entry.odds![key as keyof ProbabilityOdds];
      return isFiniteNumber(number) && number >= -1e-9 && number <= 1 + 1e-9;
    }) && Math.abs(entry.odds.win + entry.odds.push + entry.odds.loss - 1) < 1e-8);
    return REVIEW_ACTIONS.includes(entry.action!)
      && Number.isInteger(entry.handNumber) && entry.handNumber! >= 1 && entry.handNumber! <= 4
      && Array.isArray(entry.playerRanks) && entry.playerRanks.length >= 2 && entry.playerRanks.length <= 32
      && entry.playerRanks.every((rank) => RANKS.includes(rank))
      && (entry.dealerUp === null || RANKS.includes(entry.dealerUp!))
      && Number.isInteger(entry.total) && entry.total! >= 0 && entry.total! <= 31
      && typeof entry.soft === 'boolean' && validOdds;
  });
  return valid ? value as RoundReviewEntry[] : [];
}

function parseSnapshot(raw: string | null): StoredSnapshot | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<StoredSnapshot>;
    if (value.schemaVersion !== 1 || !isValidGame(value.game) || !isValidSettings(value.settings)) return null;
    return {
      schemaVersion: 1,
      game: { ...value.game, roundReview: parseRoundReview(value.game.roundReview) },
      settings: value.settings,
      tutorialComplete: Boolean(value.tutorialComplete),
      tutorialStep: Number.isInteger(value.tutorialStep) ? Math.max(0, Math.min(6, value.tutorialStep ?? 0)) : 0,
    };
  } catch {
    return null;
  }
}

export function loadSnapshot(): { snapshot: StoredSnapshot; recoveredFromBackup: boolean; error: string | null } {
  const fallback = (error: string | null) => ({
    snapshot: { schemaVersion: 1 as const, game: createInitialState(), settings: DEFAULT_SETTINGS, tutorialComplete: false, tutorialStep: 0 },
    recoveredFromBackup: false,
    error,
  });
  try {
    const primaryRaw = localStorage.getItem(PRIMARY_KEY);
    const primary = parseSnapshot(primaryRaw);
    if (primary) return { snapshot: primary, recoveredFromBackup: false, error: null };
    const backup = parseSnapshot(localStorage.getItem(BACKUP_KEY));
    if (backup) return { snapshot: backup, recoveredFromBackup: true, error: '저장 데이터가 손상되어 마지막 정상 백업을 복구했습니다.' };
    return fallback(primaryRaw ? '저장 데이터를 복구하지 못해 안전한 초기 상태로 시작합니다.' : null);
  } catch {
    return fallback('브라우저 저장소에 접근할 수 없습니다. 현재 탭에서 플레이할 수 있지만 진행 상황은 저장되지 않습니다.');
  }
}

export function saveSnapshot(snapshot: StoredSnapshot): string | null {
  try {
    const current = localStorage.getItem(PRIMARY_KEY);
    if (parseSnapshot(current)) localStorage.setItem(BACKUP_KEY, current as string);
    localStorage.setItem(PRIMARY_KEY, JSON.stringify(snapshot));
    return null;
  } catch {
    return '브라우저 저장 공간에 기록하지 못했습니다. 현재 탭에서는 계속 플레이할 수 있습니다.';
  }
}

export function clearStoredData(): void {
  localStorage.removeItem(PRIMARY_KEY);
  localStorage.removeItem(BACKUP_KEY);
}

export function hasResumableGame(game: GameState): boolean {
  return game.phase !== 'LOBBY' && !['CHALLENGE_COMPLETE', 'CHALLENGE_FAILED'].includes(game.phase);
}
