import {
  RANKS,
  SUITS,
  type ActionAvailability,
  type Card,
  type ChallengeDifficulty,
  type GameEvent,
  type GamePhase,
  type GameState,
  type GameStats,
  type HandResult,
  type HandValue,
  type PlayerAction,
  type PlayerHand,
  type RandomSource,
  type Rank,
} from './types';

const SIX_DECK_SIZE = 312;
const RESHUFFLE_AT_REMAINING = Math.floor(SIX_DECK_SIZE * 0.25);
const STARTING_BANKROLL_CENTS = 100_000;

export const CHALLENGE_TARGETS: Record<ChallengeDifficulty, number> = {
  easy: 500_000,
  normal: 1_000_000,
  hard: 2_500_000,
};

const cryptoRandom: RandomSource = {
  nextInt(maxExclusive) {
    if (!Number.isInteger(maxExclusive) || maxExclusive <= 0) throw new Error('난수 범위가 올바르지 않습니다.');
    const range = 0x1_0000_0000;
    const limit = range - (range % maxExclusive);
    const buffer = new Uint32Array(1);
    do {
      globalThis.crypto.getRandomValues(buffer);
    } while (buffer[0] >= limit);
    return buffer[0] % maxExclusive;
  },
};

let fallbackId = 0;
const makeId = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${(fallbackId += 1).toString(36)}`;

export function createEmptyStats(): GameStats {
  const challengeBase = { success: 0, failed: 0, abandoned: 0, bestBankrollCents: STARTING_BANKROLL_CENTS, bestRounds: null };
  return {
    rounds: 0,
    handsResolved: 0,
    wins: 0,
    losses: 0,
    pushes: 0,
    blackjacks: 0,
    playerBusts: 0,
    dealerBusts: 0,
    netProfitCents: 0,
    highestBankrollCents: STARTING_BANKROLL_CENTS,
    lowestBankrollCents: STARTING_BANKROLL_CENTS,
    totalBaseBetCents: 0,
    maxBaseBetCents: 0,
    doubleAttempts: 0,
    doubleWins: 0,
    doublePushes: 0,
    doubleProfitCents: 0,
    splitAttempts: 0,
    splitHandsCreated: 0,
    splitProfitCents: 0,
    surrenders: 0,
    insuranceAttempts: 0,
    insuranceWins: 0,
    insuranceProfitCents: 0,
    bestWinStreak: 0,
    worstLoseStreak: 0,
    currentStreak: 0,
    bankrollHistory: [STARTING_BANKROLL_CENTS],
    recentRounds: [],
    challengeResults: {
      easy: { ...challengeBase },
      normal: { ...challengeBase },
      hard: { ...challengeBase },
    },
  };
}

export function createInitialState(stats = createEmptyStats(), now = Date.now()): GameState {
  return {
    schemaVersion: 1,
    phase: 'LOBBY',
    resumePhase: null,
    mode: 'free',
    challengeDifficulty: null,
    challengeTargetCents: null,
    sessionId: makeId('session'),
    sessionStartedAt: now,
    sessionRounds: 0,
    bankrollCents: STARTING_BANKROLL_CENTS,
    freeBankrollCents: STARTING_BANKROLL_CENTS,
    startingBankrollCents: STARTING_BANKROLL_CENTS,
    baseBetCents: 0,
    lastBetCents: 1_000,
    roundId: null,
    lastSettledRoundId: null,
    roundProfitCents: 0,
    shoe: [],
    discard: [],
    dealerCards: [],
    hands: [],
    activeHandIndex: 0,
    insuranceBetCents: 0,
    insuranceResolved: false,
    dealerPeeked: false,
    stats,
    notice: 'TABLE 21에 오신 것을 환영합니다.',
  };
}

export function createShoe(decks = 6): Card[] {
  const cards: Card[] = [];
  for (let deck = 0; deck < decks; deck += 1) {
    for (const suit of SUITS) {
      for (const rank of RANKS) cards.push({ id: `${deck}-${suit}-${rank}`, suit, rank });
    }
  }
  return cards;
}

export function shuffleCards(cards: readonly Card[], random: RandomSource = cryptoRandom): Card[] {
  const result = [...cards];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = random.nextInt(index + 1);
    [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
  }
  return result;
}

export function createShuffledShoe(random: RandomSource = cryptoRandom): Card[] {
  return shuffleCards(createShoe(), random);
}

export function evaluateHand(cards: readonly Card[]): HandValue {
  let total = 0;
  let acesAsEleven = 0;
  for (const card of cards) {
    if (card.rank === 'A') {
      total += 11;
      acesAsEleven += 1;
    } else if (['J', 'Q', 'K'].includes(card.rank)) {
      total += 10;
    } else {
      total += Number(card.rank);
    }
  }
  while (total > 21 && acesAsEleven > 0) {
    total -= 10;
    acesAsEleven -= 1;
  }
  return { total, soft: acesAsEleven > 0, busted: total > 21 };
}

export const isTenValue = (rank: Rank) => ['10', 'J', 'Q', 'K'].includes(rank);
export const isNaturalBlackjack = (hand: PlayerHand) => !hand.fromSplit && hand.cards.length === 2 && evaluateHand(hand.cards).total === 21;
export const dealerHasBlackjack = (cards: readonly Card[]) => cards.length === 2 && evaluateHand(cards).total === 21;

export function getBetLimits(state: Pick<GameState, 'mode' | 'bankrollCents'>): { minCents: number; maxCents: number } {
  if (state.bankrollCents <= 0) return { minCents: 0, maxCents: 0 };
  if (state.mode === 'free') return { minCents: 100, maxCents: state.bankrollCents };
  if (state.bankrollCents < 1_000) return { minCents: state.bankrollCents, maxCents: state.bankrollCents };
  if (state.bankrollCents < 250_000) return { minCents: 1_000, maxCents: Math.min(25_000, state.bankrollCents) };
  if (state.bankrollCents < 750_000) return { minCents: 1_000, maxCents: Math.min(50_000, state.bankrollCents) };
  return { minCents: 1_000, maxCents: Math.min(100_000, state.bankrollCents) };
}

export function validateBet(state: GameState, amountCents: number): string | null {
  const { minCents, maxCents } = getBetLimits(state);
  if (!Number.isInteger(amountCents) || amountCents % 100 !== 0) return '베팅 금액은 $1 단위로 입력해 주세요.';
  if (amountCents < minCents) return `최소 베팅은 ${formatMoney(minCents)}입니다.`;
  if (amountCents > maxCents) return `현재 최대 베팅은 ${formatMoney(maxCents)}입니다.`;
  if (amountCents > state.bankrollCents) return '보유금보다 많이 베팅할 수 없습니다.';
  return null;
}

export function getActionAvailability(state: GameState, action: PlayerAction): ActionAvailability {
  if (state.phase !== 'PLAYER_TURN') return { enabled: false, reason: '지금은 플레이어 행동 단계가 아닙니다.' };
  const hand = state.hands[state.activeHandIndex];
  if (!hand || hand.status !== 'active') return { enabled: false, reason: '진행할 수 있는 핸드가 없습니다.' };
  const firstDecision = hand.cards.length === 2 && hand.actionsTaken === 0;
  switch (action) {
    case 'HIT':
    case 'STAND':
      return { enabled: true, reason: '' };
    case 'DOUBLE':
      if (!firstDecision) return { enabled: false, reason: '더블다운은 최초 두 장에서만 가능합니다.' };
      if (hand.splitAces) return { enabled: false, reason: '스플릿 A 핸드는 더블다운할 수 없습니다.' };
      if (state.bankrollCents < hand.betCents) return { enabled: false, reason: '추가 베팅에 필요한 보유금이 부족합니다.' };
      return { enabled: true, reason: '' };
    case 'SPLIT':
      if (!firstDecision || hand.cards[0].rank !== hand.cards[1].rank) return { enabled: false, reason: '같은 랭크의 최초 두 장만 스플릿할 수 있습니다.' };
      if (state.hands.length >= 4) return { enabled: false, reason: '한 라운드에서 최대 4개 핸드까지 허용됩니다.' };
      if (hand.cards[0].rank === 'A' && hand.fromSplit) return { enabled: false, reason: 'A는 한 번만 스플릿할 수 있습니다.' };
      if (state.bankrollCents < hand.betCents) return { enabled: false, reason: '추가 베팅에 필요한 보유금이 부족합니다.' };
      return { enabled: true, reason: '' };
    case 'SURRENDER':
      if (!firstDecision || hand.fromSplit || state.hands.length !== 1) return { enabled: false, reason: '서렌더는 스플릿 전 최초 두 장에서만 가능합니다.' };
      if (!state.dealerPeeked) return { enabled: false, reason: '딜러의 블랙잭 확인 후에만 가능합니다.' };
      return { enabled: true, reason: '' };
  }
}

function draw(shoe: Card[]): Card {
  const card = shoe.shift();
  if (!card) throw new Error('슈에 카드가 부족합니다. 다음 라운드 전에 셔플해 주세요.');
  return card;
}

function cloneHands(hands: readonly PlayerHand[]): PlayerHand[] {
  return hands.map((hand) => ({ ...hand, cards: [...hand.cards] }));
}

function withNotice(state: GameState, notice: string): GameState {
  return { ...state, notice };
}

function beginSession(state: GameState, mode: GameState['mode'], difficulty: ChallengeDifficulty | undefined, now = Date.now()): GameState {
  const freeBankrollCents = state.mode === 'free' ? state.bankrollCents : state.freeBankrollCents;
  let stats = state.stats;
  if (state.mode === 'challenge' && state.challengeDifficulty && !['LOBBY', 'CHALLENGE_COMPLETE', 'CHALLENGE_FAILED'].includes(state.phase)) {
    const result = stats.challengeResults[state.challengeDifficulty];
    stats = {
      ...stats,
      challengeResults: {
        ...stats.challengeResults,
        [state.challengeDifficulty]: { ...result, abandoned: result.abandoned + 1 },
      },
    };
  }
  const bankrollCents = mode === 'free' ? freeBankrollCents : STARTING_BANKROLL_CENTS;
  return {
    ...createInitialState(stats, now),
    phase: 'BETTING',
    mode,
    challengeDifficulty: mode === 'challenge' ? (difficulty ?? 'normal') : null,
    challengeTargetCents: mode === 'challenge' ? CHALLENGE_TARGETS[difficulty ?? 'normal'] : null,
    bankrollCents,
    freeBankrollCents,
    startingBankrollCents: bankrollCents,
    shoe: createShuffledShoe(),
    notice: mode === 'challenge' ? '목표 자금 챌린지를 시작합니다.' : '자유 플레이 테이블이 준비되었습니다.',
  };
}

function startRound(state: GameState, amountCents: number, random: RandomSource): GameState {
  const error = validateBet(state, amountCents);
  if (error) return withNotice(state, error);
  let shoe = [...state.shoe];
  let discard = [...state.discard];
  if (shoe.length < RESHUFFLE_AT_REMAINING) {
    shoe = createShuffledShoe(random);
    discard = [];
  }
  const playerFirst = draw(shoe);
  const dealerUp = draw(shoe);
  const playerSecond = draw(shoe);
  const dealerHole = draw(shoe);
  const hand: PlayerHand = {
    id: makeId('hand'),
    cards: [playerFirst, playerSecond],
    betCents: amountCents,
    status: 'active',
    fromSplit: false,
    splitAces: false,
    doubled: false,
    actionsTaken: 0,
  };
  let next: GameState = {
    ...state,
    phase: 'INITIAL_DEAL',
    bankrollCents: state.bankrollCents - amountCents,
    baseBetCents: amountCents,
    lastBetCents: amountCents,
    roundId: makeId('round'),
    roundProfitCents: 0,
    shoe,
    discard,
    dealerCards: [dealerUp, dealerHole],
    hands: [hand],
    activeHandIndex: 0,
    insuranceBetCents: 0,
    insuranceResolved: false,
    dealerPeeked: !isTenValue(dealerUp.rank) && dealerUp.rank !== 'A',
    notice: '카드가 배분되었습니다.',
  };
  if (dealerUp.rank === 'A') return { ...next, phase: 'INSURANCE_OFFER', notice: '딜러의 오픈 카드가 A입니다. 보험 또는 이븐머니를 선택하세요.' };
  if (isTenValue(dealerUp.rank)) {
    next = { ...next, phase: 'DEALER_PEEK', dealerPeeked: true };
    if (dealerHasBlackjack(next.dealerCards)) return settleRound(next, true);
  }
  if (isNaturalBlackjack(hand)) return settleRound({ ...next, dealerPeeked: true }, false);
  return { ...next, phase: 'PLAYER_TURN', dealerPeeked: true, notice: '행동을 선택하세요.' };
}

function decideInsurance(state: GameState, accept: boolean): GameState {
  if (state.phase !== 'INSURANCE_OFFER') return withNotice(state, '지금은 보험을 선택할 수 없습니다.');
  const insurance = state.baseBetCents / 2;
  if (accept && state.bankrollCents < insurance) return withNotice(state, '보험 베팅에 필요한 보유금이 부족합니다.');
  let next: GameState = {
    ...state,
    phase: 'DEALER_PEEK',
    bankrollCents: accept ? state.bankrollCents - insurance : state.bankrollCents,
    insuranceBetCents: accept ? insurance : 0,
    dealerPeeked: true,
    notice: accept ? `보험 ${formatMoney(insurance)}을 선택했습니다.` : '보험을 거절했습니다.',
  };
  if (dealerHasBlackjack(next.dealerCards)) return settleRound(next, true);
  next = { ...next, insuranceResolved: accept };
  if (isNaturalBlackjack(next.hands[0])) return settleRound(next, false);
  return { ...next, phase: 'PLAYER_TURN', notice: accept ? '딜러 블랙잭이 아닙니다. 보험 베팅을 잃었습니다.' : '딜러 블랙잭이 아닙니다. 행동을 선택하세요.' };
}

function takeEvenMoney(state: GameState): GameState {
  const hand = state.hands[0];
  if (state.phase !== 'INSURANCE_OFFER' || !hand || !isNaturalBlackjack(hand)) return withNotice(state, '이븐머니를 선택할 수 없는 상태입니다.');
  const settledHand: PlayerHand = {
    ...hand,
    status: 'settled',
    result: 'EVEN_MONEY',
    payoutCents: hand.betCents * 2,
    profitCents: hand.betCents,
  };
  return finalizeSettlement({ ...state, dealerPeeked: true, hands: [settledHand] }, 0, false);
}

function hit(state: GameState): GameState {
  const available = getActionAvailability(state, 'HIT');
  if (!available.enabled) return withNotice(state, available.reason);
  const shoe = [...state.shoe];
  const hands = cloneHands(state.hands);
  const hand = hands[state.activeHandIndex];
  hand.cards.push(draw(shoe));
  hand.actionsTaken += 1;
  const value = evaluateHand(hand.cards);
  if (value.busted) hand.status = 'busted';
  else if (value.total === 21) hand.status = 'stood';
  const next = { ...state, shoe, hands, notice: value.busted ? 'BUST · 21을 초과했습니다.' : `${value.total}${value.soft ? ' · SOFT' : ''}` };
  return hand.status === 'active' ? next : advancePlayerTurn(next);
}

function stand(state: GameState): GameState {
  const available = getActionAvailability(state, 'STAND');
  if (!available.enabled) return withNotice(state, available.reason);
  const hands = cloneHands(state.hands);
  hands[state.activeHandIndex] = { ...hands[state.activeHandIndex], status: 'stood', actionsTaken: hands[state.activeHandIndex].actionsTaken + 1 };
  return advancePlayerTurn({ ...state, hands, notice: 'STAND · 현재 점수로 멈춥니다.' });
}

function doubleDown(state: GameState): GameState {
  const available = getActionAvailability(state, 'DOUBLE');
  if (!available.enabled) return withNotice(state, available.reason);
  const shoe = [...state.shoe];
  const hands = cloneHands(state.hands);
  const hand = hands[state.activeHandIndex];
  hand.betCents *= 2;
  hand.doubled = true;
  hand.actionsTaken += 1;
  hand.cards.push(draw(shoe));
  hand.status = evaluateHand(hand.cards).busted ? 'busted' : 'stood';
  return advancePlayerTurn({ ...state, shoe, hands, bankrollCents: state.bankrollCents - state.hands[state.activeHandIndex].betCents, notice: 'DOUBLE · 베팅을 두 배로 늘리고 한 장을 받았습니다.' });
}

function splitHand(state: GameState): GameState {
  const available = getActionAvailability(state, 'SPLIT');
  if (!available.enabled) return withNotice(state, available.reason);
  const shoe = [...state.shoe];
  const hands = cloneHands(state.hands);
  const original = hands[state.activeHandIndex];
  const [leftCard, rightCard] = original.cards;
  const splitAces = leftCard.rank === 'A';
  const createHand = (card: Card, suffix: string): PlayerHand => ({
    id: `${original.id}-${suffix}`,
    cards: [card, draw(shoe)],
    betCents: original.betCents,
    status: splitAces ? 'stood' : 'active',
    fromSplit: true,
    splitAces,
    doubled: false,
    actionsTaken: splitAces ? 1 : 0,
  });
  const replacements = [createHand(leftCard, 'a'), createHand(rightCard, 'b')];
  hands.splice(state.activeHandIndex, 1, ...replacements);
  const next = {
    ...state,
    shoe,
    hands,
    bankrollCents: state.bankrollCents - original.betCents,
    notice: splitAces ? 'SPLIT A · 각 핸드에 한 장씩 배분하고 자동으로 멈춥니다.' : 'SPLIT · 왼쪽 핸드부터 진행합니다.',
  };
  return splitAces ? advancePlayerTurn(next) : next;
}

function surrender(state: GameState): GameState {
  const available = getActionAvailability(state, 'SURRENDER');
  if (!available.enabled) return withNotice(state, available.reason);
  const hands = cloneHands(state.hands);
  hands[0] = { ...hands[0], status: 'surrendered', actionsTaken: 1 };
  return runDealerAndSettle({ ...state, hands, notice: 'SURRENDER · 원래 베팅의 절반을 반환합니다.' });
}

function advancePlayerTurn(state: GameState): GameState {
  const nextIndex = state.hands.findIndex((hand, index) => index > state.activeHandIndex && hand.status === 'active');
  if (nextIndex >= 0) return { ...state, activeHandIndex: nextIndex, notice: `${nextIndex + 1}번 핸드를 진행합니다.` };
  return runDealerAndSettle(state);
}

function runDealerAndSettle(state: GameState): GameState {
  const needsDealer = state.hands.some((hand) => hand.status === 'stood' && !evaluateHand(hand.cards).busted);
  if (!needsDealer) return settleRound({ ...state, phase: 'DEALER_REVEAL' }, dealerHasBlackjack(state.dealerCards));
  const shoe = [...state.shoe];
  const dealerCards = [...state.dealerCards];
  let value = evaluateHand(dealerCards);
  while (value.total < 17) {
    dealerCards.push(draw(shoe));
    value = evaluateHand(dealerCards);
  }
  return settleRound({ ...state, phase: 'DEALER_TURN', shoe, dealerCards }, dealerHasBlackjack(dealerCards));
}

function resultForHand(hand: PlayerHand, dealerCards: readonly Card[], dealerBlackjack: boolean): { result: HandResult; payoutCents: number; profitCents: number } {
  const player = evaluateHand(hand.cards);
  const dealer = evaluateHand(dealerCards);
  if (hand.status === 'surrendered') return { result: 'SURRENDER', payoutCents: hand.betCents / 2, profitCents: -hand.betCents / 2 };
  if (player.busted || hand.status === 'busted') return { result: 'BUST', payoutCents: 0, profitCents: -hand.betCents };
  if (dealerBlackjack) {
    if (isNaturalBlackjack(hand)) return { result: 'PUSH', payoutCents: hand.betCents, profitCents: 0 };
    return { result: 'LOSS', payoutCents: 0, profitCents: -hand.betCents };
  }
  if (isNaturalBlackjack(hand)) return { result: 'BLACKJACK', payoutCents: (hand.betCents * 5) / 2, profitCents: (hand.betCents * 3) / 2 };
  if (dealer.busted) return { result: 'WIN', payoutCents: hand.betCents * 2, profitCents: hand.betCents };
  if (player.total > dealer.total) return { result: 'WIN', payoutCents: hand.betCents * 2, profitCents: hand.betCents };
  if (player.total === dealer.total) return { result: 'PUSH', payoutCents: hand.betCents, profitCents: 0 };
  return { result: 'LOSS', payoutCents: 0, profitCents: -hand.betCents };
}

function settleRound(state: GameState, dealerBlackjack: boolean): GameState {
  if (!state.roundId || state.lastSettledRoundId === state.roundId) return state;
  const hands = state.hands.map((hand) => ({ ...hand, status: 'settled' as const, ...resultForHand(hand, state.dealerCards, dealerBlackjack) }));
  const insurancePayout = state.insuranceBetCents > 0 && dealerBlackjack ? state.insuranceBetCents * 3 : 0;
  return finalizeSettlement({ ...state, hands }, insurancePayout, evaluateHand(state.dealerCards).busted);
}

function finalizeSettlement(state: GameState, insurancePayout: number, dealerBusted: boolean): GameState {
  if (!state.roundId || state.lastSettledRoundId === state.roundId) return state;
  const handPayout = state.hands.reduce((sum, hand) => sum + (hand.payoutCents ?? 0), 0);
  const handProfit = state.hands.reduce((sum, hand) => sum + (hand.profitCents ?? 0), 0);
  const insuranceProfit = state.insuranceBetCents > 0 ? insurancePayout - state.insuranceBetCents : 0;
  const roundProfit = handProfit + insuranceProfit;
  const bankroll = state.bankrollCents + handPayout + insurancePayout;
  const roundResult: 'win' | 'loss' | 'push' = roundProfit > 0 ? 'win' : roundProfit < 0 ? 'loss' : 'push';
  const currentStreak = roundProfit > 0 ? Math.max(1, state.stats.currentStreak + 1) : roundProfit < 0 ? Math.min(-1, state.stats.currentStreak - 1) : 0;
  const splitProfit = state.hands.some((hand) => hand.fromSplit) ? handProfit : 0;
  const doubledHands = state.hands.filter((hand) => hand.doubled);
  const stats: GameStats = {
    ...state.stats,
    rounds: state.stats.rounds + 1,
    handsResolved: state.stats.handsResolved + state.hands.length,
    wins: state.stats.wins + state.hands.filter((hand) => ['WIN', 'BLACKJACK', 'EVEN_MONEY'].includes(hand.result ?? '')).length,
    losses: state.stats.losses + state.hands.filter((hand) => ['LOSS', 'BUST', 'SURRENDER'].includes(hand.result ?? '')).length,
    pushes: state.stats.pushes + state.hands.filter((hand) => hand.result === 'PUSH').length,
    blackjacks: state.stats.blackjacks + state.hands.filter((hand) => hand.result === 'BLACKJACK').length,
    playerBusts: state.stats.playerBusts + state.hands.filter((hand) => hand.result === 'BUST').length,
    dealerBusts: state.stats.dealerBusts + (dealerBusted ? 1 : 0),
    netProfitCents: state.stats.netProfitCents + roundProfit,
    highestBankrollCents: Math.max(state.stats.highestBankrollCents, bankroll),
    lowestBankrollCents: Math.min(state.stats.lowestBankrollCents, bankroll),
    totalBaseBetCents: state.stats.totalBaseBetCents + state.baseBetCents,
    maxBaseBetCents: Math.max(state.stats.maxBaseBetCents, state.baseBetCents),
    doubleAttempts: state.stats.doubleAttempts + doubledHands.length,
    doubleWins: state.stats.doubleWins + doubledHands.filter((hand) => ['WIN', 'BLACKJACK'].includes(hand.result ?? '')).length,
    doublePushes: state.stats.doublePushes + doubledHands.filter((hand) => hand.result === 'PUSH').length,
    doubleProfitCents: state.stats.doubleProfitCents + doubledHands.reduce((sum, hand) => sum + (hand.profitCents ?? 0), 0),
    splitAttempts: state.stats.splitAttempts + (state.hands.length > 1 ? 1 : 0),
    splitHandsCreated: state.stats.splitHandsCreated + (state.hands.length > 1 ? state.hands.length : 0),
    splitProfitCents: state.stats.splitProfitCents + splitProfit,
    surrenders: state.stats.surrenders + state.hands.filter((hand) => hand.result === 'SURRENDER').length,
    insuranceAttempts: state.stats.insuranceAttempts + (state.insuranceBetCents > 0 ? 1 : 0),
    insuranceWins: state.stats.insuranceWins + (insurancePayout > 0 ? 1 : 0),
    insuranceProfitCents: state.stats.insuranceProfitCents + insuranceProfit,
    bestWinStreak: Math.max(state.stats.bestWinStreak, currentStreak),
    worstLoseStreak: Math.max(state.stats.worstLoseStreak, Math.abs(Math.min(0, currentStreak))),
    currentStreak,
    bankrollHistory: [...state.stats.bankrollHistory, bankroll].slice(-80),
    recentRounds: [
      {
        roundId: state.roundId,
        finishedAt: Date.now(),
        mode: state.mode,
        baseBetCents: state.baseBetCents,
        profitCents: roundProfit,
        bankrollCents: bankroll,
        result: roundResult,
      },
      ...state.stats.recentRounds,
    ].slice(0, 20),
  };
  let phase: GamePhase = 'ROUND_COMPLETE';
  let nextStats = stats;
  if (state.mode === 'challenge' && state.challengeDifficulty) {
    const challenge = { ...stats.challengeResults[state.challengeDifficulty] };
    challenge.bestBankrollCents = Math.max(challenge.bestBankrollCents, bankroll);
    if (state.challengeTargetCents && bankroll >= state.challengeTargetCents) {
      phase = 'CHALLENGE_COMPLETE';
      challenge.success += 1;
      const rounds = state.sessionRounds + 1;
      challenge.bestRounds = challenge.bestRounds === null ? rounds : Math.min(challenge.bestRounds, rounds);
    } else if (bankroll <= 0) {
      phase = 'CHALLENGE_FAILED';
      challenge.failed += 1;
    }
    nextStats = { ...stats, challengeResults: { ...stats.challengeResults, [state.challengeDifficulty]: challenge } };
  }
  const resultLabel = state.hands.map((hand) => hand.result).join(' · ');
  return {
    ...state,
    phase,
    bankrollCents: bankroll,
    freeBankrollCents: state.mode === 'free' ? bankroll : state.freeBankrollCents,
    lastSettledRoundId: state.roundId,
    roundProfitCents: roundProfit,
    sessionRounds: state.sessionRounds + 1,
    insuranceResolved: true,
    stats: nextStats,
    notice: `${resultLabel} · ${roundProfit >= 0 ? '+' : ''}${formatMoney(roundProfit)}`,
  };
}

function nextRound(state: GameState, random: RandomSource): GameState {
  if (!['ROUND_COMPLETE', 'CHALLENGE_COMPLETE', 'CHALLENGE_FAILED'].includes(state.phase)) return withNotice(state, '현재 라운드가 아직 끝나지 않았습니다.');
  if (state.phase !== 'ROUND_COMPLETE') return state;
  if (state.bankrollCents <= 0) return withNotice(state, '보유금이 없습니다. 세션을 다시 시작하거나 로비로 이동하세요.');
  const discard = [...state.discard, ...state.dealerCards, ...state.hands.flatMap((hand) => hand.cards)];
  let shoe = [...state.shoe];
  let nextDiscard = discard;
  let notice = '다음 베팅을 입력하세요.';
  if (shoe.length < RESHUFFLE_AT_REMAINING) {
    shoe = createShuffledShoe(random);
    nextDiscard = [];
    notice = '75% 컷 카드에 도달해 새 슈를 셔플했습니다.';
  }
  return {
    ...state,
    phase: 'BETTING',
    roundId: null,
    baseBetCents: 0,
    roundProfitCents: 0,
    dealerCards: [],
    hands: [],
    activeHandIndex: 0,
    insuranceBetCents: 0,
    insuranceResolved: false,
    dealerPeeked: false,
    shoe,
    discard: nextDiscard,
    notice,
  };
}

export function transition(state: GameState, event: GameEvent, random: RandomSource = cryptoRandom): GameState {
  switch (event.type) {
    case 'CREATE_SESSION':
      return beginSession(state, event.mode, event.difficulty, event.now);
    case 'BET_CONFIRMED':
      return state.phase === 'BETTING' ? startRound(state, event.amountCents, random) : withNotice(state, '지금은 베팅을 확정할 수 없습니다.');
    case 'INSURANCE_DECISION':
      return decideInsurance(state, event.accept);
    case 'EVEN_MONEY':
      return takeEvenMoney(state);
    case 'HIT':
      return hit(state);
    case 'STAND':
      return stand(state);
    case 'DOUBLE':
      return doubleDown(state);
    case 'SPLIT':
      return splitHand(state);
    case 'SURRENDER':
      return surrender(state);
    case 'NEXT_ROUND':
      return nextRound(state, random);
    case 'RESTART_SESSION':
      return beginSession(
        state.mode === 'free' ? { ...state, bankrollCents: STARTING_BANKROLL_CENTS, freeBankrollCents: STARTING_BANKROLL_CENTS } : state,
        state.mode,
        state.challengeDifficulty ?? undefined,
      );
    case 'PAUSE':
      if (['LOBBY', 'PAUSED', 'ROUND_COMPLETE', 'CHALLENGE_COMPLETE', 'CHALLENGE_FAILED'].includes(state.phase)) return state;
      return { ...state, resumePhase: state.phase as Exclude<GamePhase, 'PAUSED'>, phase: 'PAUSED', notice: '게임이 일시 정지되었습니다.' };
    case 'RESUME':
      if (state.phase !== 'PAUSED' || !state.resumePhase) return state;
      return { ...state, phase: state.resumePhase, resumePhase: null, notice: '저장된 지점에서 게임을 이어갑니다.' };
  }
}

export function formatMoney(cents: number): string {
  const sign = cents < 0 ? '-' : '';
  const absolute = Math.abs(cents);
  const dollars = Math.floor(absolute / 100);
  const remainder = absolute % 100;
  return `${sign}$${dollars.toLocaleString('en-US')}${remainder === 0 ? '' : `.${remainder.toString().padStart(2, '0')}`}`;
}

export const __test = { RESHUFFLE_AT_REMAINING, STARTING_BANKROLL_CENTS };
