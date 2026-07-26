import { beforeEach, describe, expect, it } from 'vitest';
import { createInitialState } from '../../src/game/blackjack/engine';
import { DEFAULT_SETTINGS, loadSnapshot, saveSnapshot } from '../../src/services/storage';

describe('저장과 복구', () => {
  beforeEach(() => localStorage.clear());

  it('진행 중 상태와 카드 순서를 그대로 복구한다', () => {
    const game = {
      ...createInitialState(),
      phase: 'PLAYER_TURN' as const,
      roundId: 'round-save-test',
      bankrollCents: 99_000,
      shoe: [{ id: 'next-card', rank: 'A' as const, suit: 'spades' as const }],
    };
    expect(saveSnapshot({ schemaVersion: 1, game, settings: DEFAULT_SETTINGS, tutorialComplete: false, tutorialStep: 3 })).toBeNull();
    const loaded = loadSnapshot();
    expect(loaded.snapshot.game.phase).toBe('PLAYER_TURN');
    expect(loaded.snapshot.game.roundId).toBe('round-save-test');
    expect(loaded.snapshot.game.shoe[0].id).toBe('next-card');
    expect(loaded.snapshot.tutorialStep).toBe(3);
  });

  it('현재 스냅샷이 손상되면 마지막 정상 백업을 사용한다', () => {
    const first = { ...createInitialState(), bankrollCents: 111_100, freeBankrollCents: 111_100 };
    const second = { ...first, bankrollCents: 122_200, freeBankrollCents: 122_200 };
    saveSnapshot({ schemaVersion: 1, game: first, settings: DEFAULT_SETTINGS, tutorialComplete: false, tutorialStep: 0 });
    saveSnapshot({ schemaVersion: 1, game: second, settings: DEFAULT_SETTINGS, tutorialComplete: true, tutorialStep: 6 });
    localStorage.setItem('table21.snapshot.v1', '{broken-json');
    const loaded = loadSnapshot();
    expect(loaded.recoveredFromBackup).toBe(true);
    expect(loaded.snapshot.game.bankrollCents).toBe(111_100);
    expect(loaded.error).toMatch(/백업/);
  });

  it('복구 가능한 데이터가 없으면 안전한 초기 상태를 제공한다', () => {
    localStorage.setItem('table21.snapshot.v1', '{broken-json');
    const loaded = loadSnapshot();
    expect(loaded.snapshot.game.phase).toBe('LOBBY');
    expect(loaded.snapshot.game.bankrollCents).toBe(100_000);
    expect(loaded.error).toMatch(/초기 상태/);
  });
});
