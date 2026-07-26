import { createInitialState } from '../game/blackjack/engine';
import type { GamePhase, GameState } from '../game/blackjack/types';

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

function parseSnapshot(raw: string | null): StoredSnapshot | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<StoredSnapshot>;
    if (value.schemaVersion !== 1 || !isValidGame(value.game) || !isValidSettings(value.settings)) return null;
    return {
      schemaVersion: 1,
      game: value.game,
      settings: value.settings,
      tutorialComplete: Boolean(value.tutorialComplete),
      tutorialStep: Number.isInteger(value.tutorialStep) ? Math.max(0, Math.min(6, value.tutorialStep ?? 0)) : 0,
    };
  } catch {
    return null;
  }
}

export function loadSnapshot(): { snapshot: StoredSnapshot; recoveredFromBackup: boolean; error: string | null } {
  const primary = parseSnapshot(localStorage.getItem(PRIMARY_KEY));
  if (primary) return { snapshot: primary, recoveredFromBackup: false, error: null };
  const backup = parseSnapshot(localStorage.getItem(BACKUP_KEY));
  if (backup) return { snapshot: backup, recoveredFromBackup: true, error: '저장 데이터가 손상되어 마지막 정상 백업을 복구했습니다.' };
  return {
    snapshot: { schemaVersion: 1, game: createInitialState(), settings: DEFAULT_SETTINGS, tutorialComplete: false, tutorialStep: 0 },
    recoveredFromBackup: false,
    error: localStorage.getItem(PRIMARY_KEY) ? '저장 데이터를 복구하지 못해 안전한 초기 상태로 시작합니다.' : null,
  };
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
