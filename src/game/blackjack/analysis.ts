import { SHOE_DECKS } from './engine';
import { RANKS, SUITS, type Card, type GameState, type ProbabilityOdds, type Rank, type Suit } from './types';

export interface CardInventory {
  suit: Suit;
  rank: Rank;
  unseen: number;
}

export interface PublicAnalysisInput {
  inventory: CardInventory[];
  unknownCounts: number[];
  playerRanks: Rank[];
  dealerUp: Rank | null;
  dealerCheckedNoBlackjack: boolean;
  exposedCount: number;
  unseenCount: number;
  shoeRemaining: number;
  ready: boolean;
  message: string;
}

export type HandOdds = ProbabilityOdds;

const rankValue = (rank: Rank) => rank === 'A' ? 1 : ['10', 'J', 'Q', 'K'].includes(rank) ? 10 : Number(rank);

// This boundary reads public cards and the shoe's size, never its contents or the hole card.
export function getPublicAnalysisInput(game: GameState): PublicAnalysisInput {
  const hidden = ['INSURANCE_OFFER', 'DEALER_PEEK', 'PLAYER_TURN', 'PAUSED'].includes(game.phase);
  const known = new Map<string, Card>();
  const exposed = [
    ...game.discard,
    ...game.hands.flatMap((hand) => hand.cards),
    ...(hidden ? game.dealerCards.slice(0, 1) : game.dealerCards),
  ];
  for (const card of exposed) known.set(card.id, card);
  const inventory = SUITS.flatMap((suit) => RANKS.map((rank) => ({ suit, rank, unseen: SHOE_DECKS })));
  for (const card of known.values()) {
    const entry = inventory.find((item) => item.suit === card.suit && item.rank === card.rank);
    if (entry) entry.unseen -= 1;
  }
  const valid = inventory.every((item) => item.unseen >= 0);
  const unknownCounts = Array<number>(10).fill(0);
  for (const entry of inventory) unknownCounts[rankValue(entry.rank) - 1] += Math.max(0, entry.unseen);
  const hand = game.hands[game.activeHandIndex];
  const split = game.hands.length > 1 || hand?.fromSplit;
  const ready = valid && game.phase === 'PLAYER_TURN' && Boolean(hand) && !split;
  const message = !valid ? '카드 이력을 확인할 수 없어 확률을 표시하지 않습니다.'
    : game.phase === 'PAUSED' ? '게임을 계속하면 확률을 다시 표시합니다.'
    : split ? '스플릿 중에는 카드 현황만 표시합니다. 승률은 단일 핸드 기준입니다.'
    : game.phase === 'INSURANCE_OFFER' ? '보험 선택과 딜러 확인이 끝나면 확률을 표시합니다.'
    : game.phase === 'BETTING' ? '카드가 배분되면 현재 패의 확률을 표시합니다.'
    : ready ? '지금 스탠드할 때 · 단일 핸드 · S17'
    : '라운드가 종료되었습니다. 다음 패에서 다시 계산합니다.';
  return {
    inventory,
    unknownCounts,
    playerRanks: hand?.cards.map((card) => card.rank) ?? [],
    dealerUp: game.dealerCards[0]?.rank ?? null,
    dealerCheckedNoBlackjack: game.dealerPeeked,
    exposedCount: known.size,
    unseenCount: unknownCounts.reduce((sum, count) => sum + count, 0),
    shoeRemaining: game.shoe.length,
    ready,
    message,
  };
}

function addCard(total: number, soft: boolean, value: number) {
  let next = total + (value === 1 ? 11 : value);
  let aces = Number(soft) + Number(value === 1);
  while (next > 21 && aces > 0) {
    next -= 10;
    aces -= 1;
  }
  return { total: next, soft: aces > 0 };
}

export function calculateHandOdds(input: Pick<PublicAnalysisInput, 'unknownCounts' | 'playerRanks' | 'dealerUp' | 'dealerCheckedNoBlackjack'>): HandOdds | null {
  const { unknownCounts, playerRanks, dealerUp, dealerCheckedNoBlackjack } = input;
  if (!dealerUp || playerRanks.length < 2 || unknownCounts.length !== 10
    || unknownCounts.some((count) => !Number.isInteger(count) || count < 0)) return null;
  const unknownTotal = unknownCounts.reduce((sum, count) => sum + count, 0);
  if (unknownTotal < 2) return null;
  const up = rankValue(dealerUp);
  const excludedHole = dealerCheckedNoBlackjack ? up === 1 ? 10 : up === 10 ? 1 : 0 : 0;
  const holeTotal = unknownTotal - (excludedHole ? unknownCounts[excludedHole - 1] : 0);
  if (holeTotal === 0) return null;
  let player = { total: 0, soft: false };
  for (const rank of playerRanks) player = addCard(player.total, player.soft, rankValue(rank));
  const natural = playerRanks.length === 2 && player.total === 21;
  const result: HandOdds = { win: 0, push: 0, loss: 0, hitBust: 0 };
  const counts = [...unknownCounts];
  const cache = new Map<string, number[]>();

  // Finite-shoe enumeration: bucket 0 is bust, buckets 1..5 are 17..21.
  function dealerDistribution(total: number, soft: boolean, remaining: number): number[] {
    if (total >= 17) {
      const terminal = Array<number>(6).fill(0);
      terminal[total > 21 ? 0 : total - 16] = 1;
      return terminal;
    }
    if (remaining === 0) throw new Error('Insufficient public card pool');
    const key = total + ':' + Number(soft) + ':' + counts.join(',');
    const cached = cache.get(key);
    if (cached) return cached;
    const distribution = Array<number>(6).fill(0);
    for (let index = 0; index < counts.length; index += 1) {
      const count = counts[index];
      if (count === 0) continue;
      counts[index] -= 1;
      const next = addCard(total, soft, index + 1);
      const branch = dealerDistribution(next.total, next.soft, remaining - 1);
      counts[index] += 1;
      for (let outcome = 0; outcome < distribution.length; outcome += 1) {
        distribution[outcome] += (count / remaining) * branch[outcome];
      }
    }
    cache.set(key, distribution);
    return distribution;
  }

  try {
    for (let hole = 1; hole <= 10; hole += 1) {
      const count = counts[hole - 1];
      if (count === 0 || hole === excludedHole) continue;
      const weight = count / holeTotal;
      counts[hole - 1] -= 1;
      for (let next = 1; next <= 10; next += 1) {
        if (addCard(player.total, player.soft, next).total > 21) {
          result.hitBust += weight * counts[next - 1] / (unknownTotal - 1);
        }
      }
      if (player.total > 21) result.loss += weight;
      else if ((up === 1 && hole === 10) || (up === 10 && hole === 1)) {
        result[natural ? 'push' : 'loss'] += weight;
      } else if (natural) result.win += weight;
      else {
        const initial = addCard(up === 1 ? 11 : up, up === 1, hole);
        const distribution = dealerDistribution(initial.total, initial.soft, unknownTotal - 1);
        for (let outcome = 0; outcome < distribution.length; outcome += 1) {
          const winner = outcome === 0 || player.total > outcome + 16 ? 'win'
            : player.total === outcome + 16 ? 'push' : 'loss';
          result[winner] += weight * distribution[outcome];
        }
      }
      counts[hole - 1] += 1;
    }
  } catch {
    return null;
  }
  return result;
}
