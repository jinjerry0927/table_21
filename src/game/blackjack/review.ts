import { calculateHandOdds, getPublicAnalysisInput } from './analysis';
import { evaluateHand, transition } from './engine';
import type { GameEvent, GameState, RandomSource, ReviewAction, RoundReviewSnapshot } from './types';

export const REVIEW_ACTIONS: readonly ReviewAction[] = [
  'HIT', 'STAND', 'DOUBLE', 'SPLIT', 'SURRENDER', 'INSURANCE_ACCEPT', 'INSURANCE_DECLINE', 'EVEN_MONEY',
];
export const REVIEW_LIMIT = 100;

export function createReviewSnapshot(game: GameState): RoundReviewSnapshot {
  const input = getPublicAnalysisInput(game);
  const hand = game.hands[game.activeHandIndex];
  const value = evaluateHand(hand?.cards ?? []);
  return {
    handNumber: game.activeHandIndex + 1,
    playerRanks: input.playerRanks,
    dealerUp: input.dealerUp,
    total: value.total,
    soft: value.soft,
    odds: input.ready ? calculateHandOdds(input) : null,
  };
}

export function transitionWithReview(state: GameState, event: GameEvent, random?: RandomSource): GameState {
  const next = transition(state, event, random);
  if (next.roundId !== state.roundId || next.sessionId !== state.sessionId) return next;
  const action = event.type === 'INSURANCE_DECISION'
    ? event.accept ? 'INSURANCE_ACCEPT' : 'INSURANCE_DECLINE'
    : event.type;
  if (!state.roundId || !REVIEW_ACTIONS.includes(action as ReviewAction)) return next;
  const changed = next.hands !== state.hands || next.phase !== state.phase || next.bankrollCents !== state.bankrollCents;
  if (!changed) return next;
  // Capture the decision's public information before dealing or revealing any later cards.
  const entry = { ...createReviewSnapshot(state), action: action as ReviewAction };
  return { ...next, roundReview: [...(state.roundReview ?? []), entry].slice(-REVIEW_LIMIT) };
}
