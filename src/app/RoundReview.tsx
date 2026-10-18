import { useMemo } from 'react';
import { evaluateHand, formatMoney } from '../game/blackjack/engine';
import { createReviewSnapshot } from '../game/blackjack/review';
import type { GameState, ReviewAction, RoundReviewSnapshot } from '../game/blackjack/types';

const ACTION_LABEL: Record<ReviewAction, string> = {
  HIT: 'HIT', STAND: 'STAND', DOUBLE: 'DOUBLE', SPLIT: 'SPLIT', SURRENDER: 'SURRENDER',
  INSURANCE_ACCEPT: '보험 수락', INSURANCE_DECLINE: '보험 거절', EVEN_MONEY: 'EVEN MONEY',
};
const percent = (value: number | undefined) => value === undefined ? '—' : (value * 100).toFixed(1) + '%';

function Change({ current, previous }: { current: number | undefined; previous: number | undefined }) {
  if (current === undefined || previous === undefined) return null;
  const delta = (current - previous) * 100;
  if (Math.abs(delta) < 0.05) return null;
  return <small className="review-delta">{delta > 0 ? '+' : ''}{delta.toFixed(1)}%p</small>;
}

export function RoundReview({ game }: { game: GameState }) {
  const current = useMemo(() => game.phase === 'PLAYER_TURN' ? createReviewSnapshot(game) : null, [game]);
  const entries = game.roundReview ?? [];
  const rows: (RoundReviewSnapshot & { label: string; live?: boolean })[] = entries.map((entry) => ({ ...entry, label: ACTION_LABEL[entry.action] }));
  if (current) rows.push({ ...current, label: '현재', live: true });
  const ended = ['ROUND_COMPLETE', 'CHALLENGE_COMPLETE', 'CHALLENGE_FAILED'].includes(game.phase);

  return (
    <section className="round-review" aria-label="라운드 회고">
      <div className="review-heading"><div><span className="eyebrow">YOUR DECISIONS</span><h2>이번 라운드 회고</h2></div><span>{entries.length}회 선택 기록</span></div>
      <p className="review-description">선택 직전의 패와 확률입니다. 승률은 그때 스탠드할 경우이며, 증감은 같은 핸드의 직전 기록 대비입니다.</p>
      {ended && <p className="review-result">최종 {game.hands.map((hand) => evaluateHand(hand.cards).total + '점').join(' · ')}<strong>손익 {game.roundProfitCents >= 0 ? '+' : ''}{formatMoney(game.roundProfitCents)}</strong></p>}
      {rows.length === 0 ? <p className="review-empty">{ended ? '기록된 선택이 없습니다. 자동 정산되었거나 회고 기능 추가 전 저장된 라운드입니다.' : game.phase === 'PAUSED' ? '게임을 계속하면 현재 패와 기록을 확인할 수 있습니다.' : '카드를 받고 행동을 선택하면 이곳에 기록됩니다.'}</p> : (
        <div className="review-scroll" tabIndex={0} role="region" aria-label="선택과 확률 변화 기록">
          <table>
            <caption className="sr-only">현재 라운드의 선택 직전 패, 스탠드 승률, 다음 히트 버스트 확률</caption>
            <thead><tr><th scope="col">선택</th><th scope="col">패 · 점수</th><th scope="col">스탠드 승률</th><th scope="col">다음 히트 버스트</th></tr></thead>
            <tbody>{rows.map((row, index) => {
              const previous = rows.slice(0, index).reverse().find((item) => item.handNumber === row.handNumber);
              return (
                <tr key={index} className={row.live ? 'review-current' : ''}>
                  <th scope="row">{row.label}{game.hands.length > 1 && <small>핸드 {row.handNumber}</small>}</th>
                  <td><span>{row.playerRanks.join(' · ')}</span><strong>{row.total}점{row.soft && ' · SOFT'}</strong></td>
                  <td>{percent(row.odds?.win)}<Change current={row.odds?.win} previous={previous?.odds?.win} /></td>
                  <td>{percent(row.odds?.hitBust)}<Change current={row.odds?.hitBust} previous={previous?.odds?.hitBust} /></td>
                </tr>
              );
            })}</tbody>
          </table>
        </div>
      )}
      <p className="review-footnote">보험 확인 전과 스플릿 중에는 확률을 기록하지 않습니다. 선택의 정답 판정은 포함하지 않으며, 다음 라운드에서 기록이 초기화됩니다.</p>
    </section>
  );
}
