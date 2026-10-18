import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { App } from '../../src/app/App';
import { createInitialState, createShoe } from '../../src/game/blackjack/engine';
import { DEFAULT_SETTINGS, saveSnapshot } from '../../src/services/storage';
import type { Rank } from '../../src/game/blackjack/types';

describe('라운드 회고 사용자 흐름', () => {
  beforeEach(() => {
    localStorage.clear();
    const pool = createShoe();
    const first = (['5', '6', '7', '10', '4', '5'] as Rank[]).map((rank) => pool.splice(pool.findIndex((card) => card.rank === rank), 1)[0]);
    saveSnapshot({ schemaVersion: 1, game: { ...createInitialState(), phase: 'BETTING', shoe: [...first, ...pool] }, settings: DEFAULT_SETTINGS, tutorialComplete: true, tutorialStep: 0 });
  });

  it('HIT 전후 패를 비교하고 정산까지 선택 기록을 유지한다', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: '이어하기' }));
    fireEvent.click(screen.getByRole('button', { name: /베팅 확정/ }));
    const review = screen.getByRole('region', { name: '라운드 회고' });
    expect(within(review).getByText('12점')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /^HIT/ }));
    expect(within(review).getByText('12점')).toBeInTheDocument();
    expect(within(review).getByText('16점')).toBeInTheDocument();
    expect(within(review).getByRole('rowheader', { name: 'HIT' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /^STAND/ }));
    expect(within(review).getByRole('rowheader', { name: 'STAND' })).toBeInTheDocument();
    expect(within(review).getByText('2회 선택 기록')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '다음 라운드' }));
    expect(within(review).getByText('0회 선택 기록')).toBeInTheDocument();
    expect(within(review).queryByRole('table')).not.toBeInTheDocument();
  });
});
