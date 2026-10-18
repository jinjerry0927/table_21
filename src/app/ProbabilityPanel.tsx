import { type CSSProperties, useMemo } from 'react';
import { calculateHandOdds, getPublicAnalysisInput } from '../game/blackjack/analysis';
import { RESHUFFLE_AT_REMAINING, SHOE_DECKS, SHOE_SIZE } from '../game/blackjack/engine';
import { SUITS, type GameState } from '../game/blackjack/types';

const SUIT_LABEL = { spades: '스페이드', hearts: '하트', diamonds: '다이아몬드', clubs: '클럽' };
const SUIT_SYMBOL = { spades: '♠', hearts: '♥', diamonds: '♦', clubs: '♣' };
const percent = (value: number | undefined) => value === undefined ? '—' : (value * 100).toFixed(1) + '%';

export function ProbabilityPanel({ game }: { game: GameState }) {
  const { input, odds } = useMemo(() => {
    const input = getPublicAnalysisInput(game);
    return { input, odds: input.ready ? calculateHandOdds(input) : null };
  }, [game]);
  const consumed = SHOE_SIZE - input.shoeRemaining;

  return (
    <aside className="probability-panel" aria-label="확률 분석">
      <div className="analysis-heading"><div><span className="eyebrow">LIVE PROBABILITY</span><h2>확률 분석</h2></div><span className="analysis-rule">{SHOE_DECKS} DECK · S17</span></div>
      <p className="analysis-basis">{input.message}</p>
      <dl className="analysis-odds">
        <div className="analysis-win"><dt>승리</dt><dd aria-label="스탠드 승리 확률">{percent(odds?.win)}</dd></div>
        <div><dt>무승부</dt><dd aria-label="스탠드 무승부 확률">{percent(odds?.push)}</dd></div>
        <div><dt>패배</dt><dd aria-label="스탠드 패배 확률">{percent(odds?.loss)}</dd></div>
      </dl>
      <div className="analysis-bust"><span>다음 한 장 버스트</span><strong aria-label="다음 히트 버스트 확률">{percent(odds?.hitBust)}</strong></div>
      {input.ready && !odds && <p className="analysis-note">현재 카드 정보로는 확률을 계산할 수 없습니다.</p>}
      <div className="analysis-shoe"><span>슈 잔여 <b>{input.shoeRemaining} / {SHOE_SIZE}장</b></span><span>소모율 {(consumed / SHOE_SIZE * 100).toFixed(1)}%</span></div>
      <progress className="analysis-progress" aria-label="슈 소모율" value={consumed} max={SHOE_SIZE} />
      <p className="analysis-note">라운드 사이 잔여 {RESHUFFLE_AT_REMAINING}장 미만이면 새 슈로 초기화됩니다.</p>
      <div className="analysis-inventory-heading"><h3>미공개 카드</h3><span>{input.unseenCount}장 · 공개 {input.exposedCount}장</span></div>
      <div className="analysis-inventory" role="group" aria-label="카드 미공개 현황">
        {SUITS.map((suit) => (
          <div className={'analysis-suit ' + (suit === 'hearts' || suit === 'diamonds' ? 'red-suit' : '')} key={suit}>
            <span className="analysis-suit-label" aria-label={SUIT_LABEL[suit]}>{SUIT_SYMBOL[suit]}</span>
            <div className="analysis-card-row">
              {input.inventory.filter((card) => card.suit === suit).map((card) => (
                <span className="analysis-card" role="img" key={card.rank} data-remaining={card.unseen}
                  aria-label={SUIT_LABEL[suit] + ' ' + card.rank + ': 미공개 ' + card.unseen + '장 / ' + SHOE_DECKS + '장'}
                  title={SUIT_LABEL[suit] + ' ' + card.rank + ' · 미공개 ' + card.unseen + '/' + SHOE_DECKS}
                  style={{ '--remaining-ratio': Math.max(0, card.unseen) / SHOE_DECKS } as CSSProperties}>
                  <b>{card.rank}</b><small>{card.unseen}</small>
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
      <p className="analysis-note">각 숫자는 같은 카드 {SHOE_DECKS}장 중 미공개 수입니다. 뒷면 카드도 포함하며, 모두 공개된 카드는 흑백으로 표시합니다.</p>
      <p className="analysis-footnote">공개된 카드 이력으로 계산한 확률입니다. 히트 후 최종 승률과 스플릿 승률은 포함하지 않습니다.</p>
    </aside>
  );
}
