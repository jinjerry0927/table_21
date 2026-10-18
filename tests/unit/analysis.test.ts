import { describe, expect, it } from 'vitest';
import { calculateHandOdds, getPublicAnalysisInput } from '../../src/game/blackjack/analysis';
import { createInitialState, createShoe, transition } from '../../src/game/blackjack/engine';
import { DEFAULT_SETTINGS, loadSnapshot, saveSnapshot } from '../../src/services/storage';
import type { GameState, Rank } from '../../src/game/blackjack/types';

const random = { nextInt: (max: number) => max - 1 };
const start = () => transition({ ...createInitialState(), phase: 'BETTING', shoe: createShoe() }, { type: 'BET_CONFIRMED', amountCents: 100 }, random);
const counts = (...values: number[]) => {
  const result = Array<number>(10).fill(0);
  for (const value of values) result[value - 1] += 1;
  return result;
};
const odds = (values: number[], playerRanks: Rank[], dealerUp: Rank, dealerCheckedNoBlackjack = true) =>
  calculateHandOdds({ unknownCounts: counts(...values), playerRanks, dealerUp, dealerCheckedNoBlackjack });

describe('공개 정보 경계와 카드 이력', () => {
  it('첫 배분에서 공개 3장과 미공개 309장을 구분하고 숨은 패를 차감하지 않는다', () => {
    const input = getPublicAnalysisInput(start());
    expect(input).toMatchObject({ exposedCount: 3, unseenCount: 309, shoeRemaining: 308, ready: true });
    expect(input.inventory).toHaveLength(52);
    expect(input.inventory.find((card) => card.suit === 'spades' && card.rank === '4')?.unseen).toBe(6);
  });

  it('숨은 패와 실제 슈 순서를 바꿔도 분석 입력이 동일하다', () => {
    const state = start();
    const changed = { ...state, shoe: [...state.shoe].reverse(), dealerCards: [state.dealerCards[0], { ...state.dealerCards[1], rank: 'K' as const, suit: 'hearts' as const }] };
    expect(getPublicAnalysisInput(changed)).toEqual(getPublicAnalysisInput(state));
  });

  it('라운드 종료 시 숨은 패를 공개하고 다음 라운드에도 이력을 보존한다', () => {
    const settled = transition(start(), { type: 'STAND' }, random);
    expect(settled.phase).toBe('ROUND_COMPLETE');
    const before = getPublicAnalysisInput(settled);
    const next = getPublicAnalysisInput(transition(settled, { type: 'NEXT_ROUND' }, random));
    expect(next.inventory).toEqual(before.inventory);
    expect(next.exposedCount + next.shoeRemaining).toBe(312);
  });

  it('재셔플하면 모든 카드의 미공개 수가 6장으로 복구된다', () => {
    const shoe = createShoe();
    const state: GameState = { ...createInitialState(), phase: 'ROUND_COMPLETE', shoe: shoe.slice(0, 77), discard: shoe.slice(77) };
    const input = getPublicAnalysisInput(transition(state, { type: 'NEXT_ROUND' }, random));
    expect(input.exposedCount).toBe(0);
    expect(input.inventory.every((card) => card.unseen === 6)).toBe(true);
    expect(input.shoeRemaining).toBe(312);
  });

  it('같은 카드 6장이 모두 공개돼야 미공개 수가 0이다', () => {
    const discard = createShoe().filter((card) => card.suit === 'spades' && card.rank === 'A');
    const input = getPublicAnalysisInput({ ...createInitialState(), phase: 'BETTING', discard });
    expect(input.inventory.find((card) => card.suit === 'spades' && card.rank === 'A')?.unseen).toBe(0);
    expect(input.inventory.find((card) => card.suit === 'hearts' && card.rank === 'A')?.unseen).toBe(6);
  });

  it('저장 복구 후에도 같은 공개 정보로 계산한다', () => {
    localStorage.clear();
    const game = start();
    saveSnapshot({ schemaVersion: 1, game, settings: DEFAULT_SETTINGS, tutorialComplete: true, tutorialStep: 0 });
    expect(getPublicAnalysisInput(loadSnapshot().snapshot.game)).toEqual(getPublicAnalysisInput(game));
  });

  it('스플릿과 일시정지 중에는 승률을 제시하지 않는다', () => {
    const state = start();
    expect(getPublicAnalysisInput({ ...state, hands: [state.hands[0], { ...state.hands[0], id: 'second' }] }).ready).toBe(false);
    expect(getPublicAnalysisInput({ ...state, phase: 'PAUSED', resumePhase: 'PLAYER_TURN' }).ready).toBe(false);
  });
});

describe('유한 슈의 스탠드·버스트 확률', () => {
  it('가능한 딜러 17과 20을 각각 반영하고 다음 카드 버스트를 계산한다', () => {
    expect(odds([7, 10], ['10', '8'], '10')).toEqual({ win: 0.5, push: 0, loss: 0.5, hitBust: 1 });
  });

  it('딜러가 뽑은 카드를 다음 추출에서 제거한다', () => {
    expect(odds([5, 10], ['10', '10'], '6')).toEqual({ win: 0, push: 0, loss: 1, hitBust: 1 });
  });

  it('블랙잭 확인 결과로 숨은 패 분포와 다음 카드 확률을 함께 보정한다', () => {
    expect(odds([1, 7], ['10', '8'], '10')).toEqual({ win: 1, push: 0, loss: 0, hitBust: 0 });
    expect(odds([1, 7], ['10', '8'], '10', false)).toEqual({ win: 0.5, push: 0, loss: 0.5, hitBust: 0.5 });
  });

  it('딜러는 소프트 17에서 멈춘다', () => {
    expect(odds([2, 6, 10], ['10', '8'], 'A')).toEqual({ win: 0.5, push: 0, loss: 0.5, hitBust: 0.75 });
  });

  it('플레이어 A를 1로 바꿀 수 있으면 다음 한 장으로 버스트하지 않는다', () => {
    expect(odds([7, 10], ['A', '6'], '10')?.hitBust).toBe(0);
  });

  it('내추럴 블랙잭은 딜러의 일반 21보다 우선한다', () => {
    expect(odds([2, 10], ['A', 'K'], '9')?.win).toBe(1);
    expect(odds([10, 10], ['A', 'K'], 'A', false)?.push).toBe(1);
  });

  it('실제 6덱에서도 승·무·패 합이 1이며 입력을 변경하지 않는다', () => {
    const input = getPublicAnalysisInput(start());
    const before = [...input.unknownCounts];
    const result = calculateHandOdds(input);
    expect(result).not.toBeNull();
    expect(result!.win + result!.push + result!.loss).toBeCloseTo(1, 12);
    expect(result!.hitBust).toBeGreaterThanOrEqual(0);
    expect(result!.hitBust).toBeLessThanOrEqual(1);
    expect(input.unknownCounts).toEqual(before);
  });

  it('불가능한 숨은 패 조건이나 부족한 카드 정보에는 숫자를 만들지 않는다', () => {
    expect(odds([1, 1], ['10', '8'], '10')).toBeNull();
    expect(odds([2], ['10', '8'], '10')).toBeNull();
  });
});
