import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../../src/app/App';

describe('TABLE 21 사용자 흐름', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('로비에서 자유 플레이를 시작하고 베팅을 확정한다', async () => {
    render(<App />);
    expect(screen.getByRole('heading', { name: /당신의 판단으로/ })).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole('button', { name: '자유 플레이' })[0]);
    fireEvent.click(screen.getByRole('button', { name: '건너뛰기' }));
    expect(screen.getByText('베팅 금액')).toBeInTheDocument();
    const analysis = screen.getByRole('complementary', { name: '확률 분석' });
    expect(within(analysis).getAllByRole('img')).toHaveLength(52);
    expect(within(analysis).getByLabelText('스페이드 A: 미공개 6장 / 6장')).toBeInTheDocument();
    const input = screen.getByRole('spinbutton');
    fireEvent.change(input, { target: { value: '10' } });
    fireEvent.click(screen.getByRole('button', { name: /베팅 확정/ }));
    await waitFor(() => expect(screen.getByRole('heading', { name: '딜러' })).toBeInTheDocument());
    expect(screen.getByText(/보유금/)).toBeInTheDocument();
  });

  it('통계, 게임 방법, 설정 화면이 주 메뉴로 연결된다', () => {
    render(<App />);
    const nav = screen.getByRole('navigation', { name: '주 메뉴' });
    fireEvent.click(within(nav).getByRole('button', { name: '통계' }));
    expect(screen.getByRole('heading', { name: '상세 통계' })).toBeInTheDocument();
    fireEvent.click(within(nav).getByRole('button', { name: '게임 방법' }));
    expect(screen.getByRole('heading', { name: '게임 방법' })).toBeInTheDocument();
    fireEvent.click(within(nav).getByRole('button', { name: '설정' }));
    expect(screen.getByRole('heading', { name: '설정' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '가이드 다시 보기' })).toBeInTheDocument();
  });

  it('설정과 튜토리얼 상태를 로컬 저장소에 기록한다', async () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: '설정' }));
    const master = screen.getByRole('slider', { name: /전체 볼륨/ });
    fireEvent.change(master, { target: { value: '0.5' } });
    await waitFor(() => {
      const raw = localStorage.getItem('table21.snapshot.v1');
      expect(raw).not.toBeNull();
      expect(JSON.parse(raw as string).settings.masterVolume).toBe(0.5);
    });
  });
});
