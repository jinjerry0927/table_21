import { describe, expect, it } from 'vitest';
import {
  __test,
  createInitialState,
  createShoe,
  evaluateHand,
  formatMoney,
  getActionAvailability,
  getBetLimits,
  isNaturalBlackjack,
  transition,
} from '../../src/game/blackjack/engine';
import type { Card, GameState, PlayerHand, RandomSource, Rank, Suit } from '../../src/game/blackjack/types';

const identityRandom: RandomSource = { nextInt: (max) => max - 1 };
let id = 0;
const card = (rank: Rank, suit: Suit = 'spades'): Card => ({ id: `test-${id += 1}`, rank, suit });

function bettingWith(drawOrder: Card[], overrides: Partial<GameState> = {}): GameState {
  const filler = Array.from({ length: Math.max(0, 90 - drawOrder.length) }, (_, index) => card((index % 2 === 0 ? '2' : '3') as Rank, 'clubs'));
  return {
    ...createInitialState(),
    phase: 'BETTING',
    shoe: [...drawOrder, ...filler],
    notice: '',
    ...overrides,
  };
}

const bet = (state: GameState, amountCents = 10_000) => transition(state, { type: 'BET_CONFIRMED', amountCents }, identityRandom);

describe('카드와 핸드 계산', () => {
  it('6덱 슈는 중복 ID 없이 312장이다', () => {
    const shoe = createShoe();
    expect(shoe).toHaveLength(312);
    expect(new Set(shoe.map((item) => item.id)).size).toBe(312);
    expect(shoe.filter((item) => item.rank === 'A')).toHaveLength(24);
  });

  it('여러 A를 필요한 만큼 1로 낮춘다', () => {
    expect(evaluateHand([card('A'), card('A'), card('9')])).toEqual({ total: 21, soft: true, busted: false });
    expect(evaluateHand([card('A'), card('A'), card('9'), card('K')])).toEqual({ total: 21, soft: false, busted: false });
  });

  it('스플릿 21은 내추럴 블랙잭이 아니다', () => {
    const base: PlayerHand = { id: 'h', cards: [card('A'), card('K')], betCents: 1_000, status: 'active', fromSplit: false, splitAces: false, doubled: false, actionsTaken: 0 };
    expect(isNaturalBlackjack(base)).toBe(true);
    expect(isNaturalBlackjack({ ...base, fromSplit: true })).toBe(false);
  });

  it('센트 금액을 부동소수점 없이 표시한다', () => {
    expect(formatMoney(100_000)).toBe('$1,000');
    expect(formatMoney(100_050)).toBe('$1,000.50');
    expect(formatMoney(-150)).toBe('-$1.50');
  });
});

describe('최초 배분, 딜러와 정산', () => {
  it('플레이어 블랙잭을 3:2로 정산한다', () => {
    const state = bet(bettingWith([card('A'), card('9'), card('K'), card('7')]));
    expect(state.phase).toBe('ROUND_COMPLETE');
    expect(state.hands[0].result).toBe('BLACKJACK');
    expect(state.hands[0].payoutCents).toBe(25_000);
    expect(state.bankrollCents).toBe(115_000);
  });

  it('플레이어와 딜러 동시 블랙잭은 PUSH다', () => {
    const state = bet(bettingWith([card('A'), card('K'), card('K'), card('A')]));
    expect(state.hands[0].result).toBe('PUSH');
    expect(state.bankrollCents).toBe(100_000);
  });

  it('딜러는 하드 16에서 히트하고 버스트한다', () => {
    let state = bet(bettingWith([card('10'), card('9'), card('7'), card('7'), card('K')]));
    state = transition(state, { type: 'STAND' }, identityRandom);
    expect(state.dealerCards).toHaveLength(3);
    expect(evaluateHand(state.dealerCards).busted).toBe(true);
    expect(state.hands[0].result).toBe('WIN');
    expect(state.bankrollCents).toBe(110_000);
  });

  it('딜러는 소프트 17에서 스탠드한다', () => {
    let state = bet(bettingWith([card('10'), card('A'), card('7'), card('6'), card('K')]));
    expect(state.phase).toBe('INSURANCE_OFFER');
    state = transition(state, { type: 'INSURANCE_DECISION', accept: false }, identityRandom);
    state = transition(state, { type: 'STAND' }, identityRandom);
    expect(state.dealerCards).toHaveLength(2);
    expect(evaluateHand(state.dealerCards)).toEqual({ total: 17, soft: true, busted: false });
    expect(state.hands[0].result).toBe('PUSH');
  });

  it('딜러 10점 오픈 카드는 플레이어 행동 전에 블랙잭을 확인한다', () => {
    const state = bet(bettingWith([card('9'), card('Q'), card('7'), card('A')]));
    expect(state.phase).toBe('ROUND_COMPLETE');
    expect(state.dealerPeeked).toBe(true);
    expect(state.hands[0].result).toBe('LOSS');
  });
});

describe('플레이어 행동', () => {
  it('더블다운은 추가 베팅 후 한 장만 받고 자동 스탠드한다', () => {
    let state = bet(bettingWith([card('5'), card('9'), card('6'), card('7'), card('10'), card('K')]));
    state = transition(state, { type: 'DOUBLE' }, identityRandom);
    expect(state.hands[0].doubled).toBe(true);
    expect(state.hands[0].cards).toHaveLength(3);
    expect(state.hands[0].betCents).toBe(20_000);
    expect(state.hands[0].result).toBe('WIN');
    expect(state.bankrollCents).toBe(120_000);
  });

  it('같은 랭크만 스플릿하고 10과 K 조합은 거절한다', () => {
    const invalid = bet(bettingWith([card('10'), card('6'), card('K'), card('9')]));
    expect(getActionAvailability(invalid, 'SPLIT').enabled).toBe(false);
    let valid = bet(bettingWith([card('8'), card('9'), card('8'), card('7'), card('3'), card('2'), card('K')]));
    expect(getActionAvailability(valid, 'SPLIT').enabled).toBe(true);
    valid = transition(valid, { type: 'SPLIT' }, identityRandom);
    expect(valid.hands).toHaveLength(2);
    expect(valid.bankrollCents).toBe(80_000);
  });

  it('스플릿 A는 각 핸드에 한 장만 받고 자동 스탠드한다', () => {
    let state = bet(bettingWith([card('A'), card('9'), card('A'), card('7'), card('K'), card('9'), card('K')]));
    state = transition(state, { type: 'SPLIT' }, identityRandom);
    expect(state.hands).toHaveLength(2);
    expect(state.hands.every((hand) => hand.cards.length === 2)).toBe(true);
    expect(state.phase).toBe('ROUND_COMPLETE');
    expect(state.hands.every((hand) => hand.result !== 'BLACKJACK')).toBe(true);
  });

  it('서렌더는 원래 베팅의 절반을 반환한다', () => {
    let state = bet(bettingWith([card('10'), card('9'), card('6'), card('7')]));
    state = transition(state, { type: 'SURRENDER' }, identityRandom);
    expect(state.hands[0].result).toBe('SURRENDER');
    expect(state.hands[0].payoutCents).toBe(5_000);
    expect(state.bankrollCents).toBe(95_000);
  });

  it('추가 자금이 부족하면 더블과 스플릿을 비활성화한다', () => {
    const doubleState = bet(bettingWith([card('5'), card('9'), card('6'), card('7')], { bankrollCents: 10_000 }), 10_000);
    expect(getActionAvailability(doubleState, 'DOUBLE')).toMatchObject({ enabled: false });
    const splitState = bet(bettingWith([card('8'), card('9'), card('8'), card('7')], { bankrollCents: 10_000 }), 10_000);
    expect(getActionAvailability(splitState, 'SPLIT')).toMatchObject({ enabled: false });
  });
});

describe('보험, 이븐머니, 모드', () => {
  it('보험은 딜러 블랙잭이면 2:1 이익으로 기본 베팅 손실을 상쇄한다', () => {
    let state = bet(bettingWith([card('9'), card('A'), card('7'), card('K')]));
    state = transition(state, { type: 'INSURANCE_DECISION', accept: true }, identityRandom);
    expect(state.phase).toBe('ROUND_COMPLETE');
    expect(state.insuranceBetCents).toBe(5_000);
    expect(state.stats.insuranceWins).toBe(1);
    expect(state.bankrollCents).toBe(100_000);
    expect(state.roundProfitCents).toBe(0);
  });

  it('이븐머니는 블랙잭을 1:1 이익으로 즉시 정산한다', () => {
    let state = bet(bettingWith([card('A'), card('A'), card('K'), card('9')]));
    state = transition(state, { type: 'EVEN_MONEY' }, identityRandom);
    expect(state.hands[0].result).toBe('EVEN_MONEY');
    expect(state.bankrollCents).toBe(110_000);
  });

  it('챌린지 보유금 구간별 한도와 마지막 올인을 계산한다', () => {
    expect(getBetLimits({ mode: 'challenge', bankrollCents: 200_000 })).toEqual({ minCents: 1_000, maxCents: 25_000 });
    expect(getBetLimits({ mode: 'challenge', bankrollCents: 500_000 })).toEqual({ minCents: 1_000, maxCents: 50_000 });
    expect(getBetLimits({ mode: 'challenge', bankrollCents: 800_000 })).toEqual({ minCents: 1_000, maxCents: 100_000 });
    expect(getBetLimits({ mode: 'challenge', bankrollCents: 700 })).toEqual({ minCents: 700, maxCents: 700 });
  });

  it('목표 자금은 모든 핸드 정산 후 판정한다', () => {
    let state = bettingWith([card('A'), card('9'), card('K'), card('7')], {
      mode: 'challenge', challengeDifficulty: 'easy', challengeTargetCents: 500_000, bankrollCents: 499_000,
    });
    state = bet(state, 1_000);
    expect(state.phase).toBe('CHALLENGE_COMPLETE');
    expect(state.bankrollCents).toBe(500_500);
    expect(state.stats.challengeResults.easy.success).toBe(1);
  });

  it('챌린지 전환 뒤에도 자유 플레이 자금과 중도 포기 기록을 보존한다', () => {
    const free = bettingWith([], { bankrollCents: 135_000, freeBankrollCents: 135_000 });
    const challenge = transition(free, { type: 'CREATE_SESSION', mode: 'challenge', difficulty: 'normal' }, identityRandom);
    expect(challenge.bankrollCents).toBe(100_000);
    expect(challenge.freeBankrollCents).toBe(135_000);
    const backToFree = transition(challenge, { type: 'CREATE_SESSION', mode: 'free' }, identityRandom);
    expect(backToFree.bankrollCents).toBe(135_000);
    expect(backToFree.stats.challengeResults.normal.abandoned).toBe(1);
  });
});

describe('안전한 상태 전이', () => {
  it('정산 완료 상태에서 잘못된 행동으로 통계가 중복 적용되지 않는다', () => {
    const settled = bet(bettingWith([card('A'), card('9'), card('K'), card('7')]));
    const rounds = settled.stats.rounds;
    const bankroll = settled.bankrollCents;
    const afterInvalid = transition(settled, { type: 'STAND' }, identityRandom);
    expect(afterInvalid.stats.rounds).toBe(rounds);
    expect(afterInvalid.bankrollCents).toBe(bankroll);
  });

  it('75% 이상 소진된 슈는 다음 라운드 전에 셔플한다', () => {
    const shortShoe = Array.from({ length: __test.RESHUFFLE_AT_REMAINING - 1 }, () => card('2'));
    const state = bet(bettingWith([], { shoe: shortShoe }), 1_000);
    expect(state.shoe.length).toBe(308);
  });
});
