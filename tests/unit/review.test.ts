import { beforeEach, describe, expect, it, vi } from 'vitest';
import { calculateHandOdds, getPublicAnalysisInput } from '../../src/game/blackjack/analysis';
import { createInitialState, createShoe, evaluateHand, shuffleCards, transition } from '../../src/game/blackjack/engine';
import { transitionWithReview } from '../../src/game/blackjack/review';
import { DEFAULT_SETTINGS, loadSnapshot, saveSnapshot } from '../../src/services/storage';
import type { GameState, Rank } from '../../src/game/blackjack/types';

const random = { nextInt: (max: number) => max - 1 };
function dealt(order: Rank[] = ['5', '6', '7', '10', '4', '5']): GameState {
  const pool = createShoe();
  const first = order.map((rank) => pool.splice(pool.findIndex((card) => card.rank === rank), 1)[0]);
  return transitionWithReview({ ...createInitialState(), phase: 'BETTING', shoe: [...first, ...pool] }, { type: 'BET_CONFIRMED', amountCents: 100 }, random);
}

describe('선택 시점의 라운드 회고', () => {
  beforeEach(() => { localStorage.clear(); vi.restoreAllMocks(); });

  it('HIT와 STAND 직전 패·확률을 기록하고 정산 뒤에도 값을 유지한다', () => {
    const first = dealt();
    const firstOdds = calculateHandOdds(getPublicAnalysisInput(first));
    const hit = transitionWithReview(first, { type: 'HIT' }, random);
    expect(hit.roundReview).toHaveLength(1);
    expect(hit.roundReview![0]).toMatchObject({ action: 'HIT', playerRanks: ['5', '7'], total: 12, odds: firstOdds });
    expect(evaluateHand(hit.hands[0].cards).total).toBe(16);
    const secondOdds = calculateHandOdds(getPublicAnalysisInput(hit));
    const settled = transitionWithReview(hit, { type: 'STAND' }, random);
    expect(settled.phase).toBe('ROUND_COMPLETE');
    expect(settled.roundReview![1]).toMatchObject({ action: 'STAND', total: 16, odds: secondOdds });
    expect(settled.roundReview![0]).toEqual(hit.roundReview![0]);
  });

  it('숨은 패와 슈 순서가 달라도 선택 직전 기록은 같다', () => {
    const first = dealt();
    const changed = { ...first, dealerCards: [first.dealerCards[0], { ...first.dealerCards[1], rank: '2' as const }], shoe: [...first.shoe].reverse() };
    const left = transitionWithReview(first, { type: 'STAND' }, random);
    const right = transitionWithReview(changed, { type: 'STAND' }, random);
    expect(left.roundReview).toEqual(right.roundReview);
  });

  it('HIT로 21점 또는 버스트가 되어 즉시 정산돼도 이전 공개 정보만 기록한다', () => {
    for (const nextCard of ['9', 'K'] as Rank[]) {
      const first = dealt(['5', '6', '7', '10', nextCard]);
      const after = transitionWithReview(first, { type: 'HIT' }, random);
      expect(after.phase).toBe('ROUND_COMPLETE');
      expect(after.roundReview![0].total).toBe(12);
      expect(after.roundReview![0].playerRanks).toEqual(['5', '7']);
      expect(after.roundReview![0].odds).toEqual(calculateHandOdds(getPublicAnalysisInput(first)));
    }
  });

  it('보험 선택은 확률 없이 기록하고 확인 후부터 확률을 남긴다', () => {
    const insurance = dealt(['5', 'A', '7', '6', '4']);
    const ready = transitionWithReview(insurance, { type: 'INSURANCE_DECISION', accept: false }, random);
    expect(ready.roundReview![0]).toMatchObject({ action: 'INSURANCE_DECLINE', odds: null });
    const after = transitionWithReview(ready, { type: 'HIT' }, random);
    expect(after.roundReview![1].odds).not.toBeNull();
  });

  it('스플릿 후에는 핸드별 선택만 기록하고 스플릿 승률을 만들지 않는다', () => {
    let state = dealt(['8', '6', '8', '10', '2', '3', '5']);
    state = transitionWithReview(state, { type: 'SPLIT' }, random);
    state = transitionWithReview(state, { type: 'STAND' }, random);
    state = transitionWithReview(state, { type: 'STAND' }, random);
    expect(state.roundReview!.map((entry) => entry.handNumber)).toEqual([1, 1, 2]);
    expect(state.roundReview![0].odds).not.toBeNull();
    expect(state.roundReview!.slice(1).every((entry) => entry.odds === null)).toBe(true);
  });

  it('더블과 서렌더·이븐머니도 실제 선택 시점을 기록한다', () => {
    const doubled = transitionWithReview(dealt(['5', '6', '6', '10', '10']), { type: 'DOUBLE' }, random);
    expect(doubled.roundReview![0]).toMatchObject({ action: 'DOUBLE', total: 11 });
    const surrendered = transitionWithReview(dealt(), { type: 'SURRENDER' }, random);
    expect(surrendered.roundReview![0].action).toBe('SURRENDER');
    const even = transitionWithReview(dealt(['A', 'A', 'K', '6']), { type: 'EVEN_MONEY' }, random);
    expect(even.roundReview![0]).toMatchObject({ action: 'EVEN_MONEY', total: 21, odds: null });
  });

  it('잘못된 행동, 일시정지·재개, 중복 정산은 기록을 추가하지 않는다', () => {
    const first = dealt();
    const invalid = transitionWithReview(first, { type: 'SPLIT' }, random);
    expect(invalid.roundReview).toHaveLength(0);
    const paused = transitionWithReview(first, { type: 'PAUSE' }, random);
    const resumed = transitionWithReview(paused, { type: 'RESUME' }, random);
    expect(resumed.roundReview).toHaveLength(0);
    const settled = transitionWithReview(resumed, { type: 'STAND' }, random);
    expect(transitionWithReview(settled, { type: 'STAND' }, random).roundReview).toEqual(settled.roundReview);
  });

  it('다음 라운드와 새 세션에서 회고를 비운다', () => {
    const settled = transitionWithReview(dealt(), { type: 'STAND' }, random);
    expect(transitionWithReview(settled, { type: 'NEXT_ROUND' }, random).roundReview).toEqual([]);
    expect(transitionWithReview(settled, { type: 'RESTART_SESSION' }, random).roundReview).toEqual([]);
  });

  it('저장 복구는 당시 확률까지 유지하고 이전 형식도 이어진다', () => {
    const game = transitionWithReview(dealt(), { type: 'HIT' }, random);
    saveSnapshot({ schemaVersion: 1, game, settings: DEFAULT_SETTINGS, tutorialComplete: true, tutorialStep: 0 });
    expect(loadSnapshot().snapshot.game.roundReview).toEqual(game.roundReview);
    const legacy = { ...game };
    delete legacy.roundReview;
    localStorage.setItem('table21.snapshot.v1', JSON.stringify({ schemaVersion: 1, game: legacy, settings: DEFAULT_SETTINGS }));
    const restored = loadSnapshot().snapshot.game;
    expect(restored.roundReview).toEqual([]);
    expect(restored.hands).toEqual(game.hands);
  });

  it('손상된 회고만 비우고 게임 상태는 보존한다', () => {
    const game = { ...dealt(), roundReview: [{ action: 'HIT', playerRanks: null }] };
    localStorage.setItem('table21.snapshot.v1', JSON.stringify({ schemaVersion: 1, game, settings: DEFAULT_SETTINGS }));
    const restored = loadSnapshot().snapshot.game;
    expect(restored.roundReview).toEqual([]);
    expect(restored.roundId).toBe(game.roundId);
  });

  it('저장소 접근이 차단되어도 게임을 시작할 수 있다', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new DOMException('blocked', 'SecurityError'); });
    expect(loadSnapshot()).toMatchObject({ snapshot: { game: { phase: 'LOBBY' } }, error: expect.stringMatching(/저장소/) });
  });
});

describe('반복 플레이 안정성', () => {
  it('300라운드 동안 카드 312장 보존과 정산·재셔플 경계를 유지한다', () => {
    let seed = 21;
    const seeded = { nextInt(max: number) { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed % max; } };
    let state: GameState = { ...createInitialState(), phase: 'BETTING', shoe: shuffleCards(createShoe(), seeded) };
    for (let round = 0; round < 300; round += 1) {
      const bankroll = state.bankrollCents;
      state = transition(state, { type: 'BET_CONFIRMED', amountCents: 100 }, seeded);
      if (state.phase === 'INSURANCE_OFFER') state = transition(state, { type: 'INSURANCE_DECISION', accept: false }, seeded);
      while (state.phase === 'PLAYER_TURN') {
        state = transition(state, { type: evaluateHand(state.hands[state.activeHandIndex].cards).total < 16 ? 'HIT' : 'STAND' }, seeded);
      }
      expect(state.phase).toBe('ROUND_COMPLETE');
      expect(state.bankrollCents).toBe(bankroll + state.roundProfitCents);
      expect(state.stats.rounds).toBe(round + 1);
      const all = [...state.shoe, ...state.discard, ...state.dealerCards, ...state.hands.flatMap((hand) => hand.cards)];
      expect(all).toHaveLength(312);
      expect(new Set(all.map((card) => card.id)).size).toBe(312);
      expect(getPublicAnalysisInput(state).unseenCount).toBe(state.shoe.length);
      const remaining = state.shoe.length;
      state = transition(state, { type: 'NEXT_ROUND' }, seeded);
      expect(state.shoe.length).toBe(remaining < 78 ? 312 : remaining);
      expect(state.roundReview).toEqual([]);
    }
  });
});
