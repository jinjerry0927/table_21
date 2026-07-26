import { type CSSProperties, type FormEvent, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import {
  CHALLENGE_TARGETS,
  evaluateHand,
  formatMoney,
  getActionAvailability,
  getBetLimits,
  isNaturalBlackjack,
  transition,
  validateBet,
} from '../game/blackjack/engine';
import type { Card, ChallengeDifficulty, GameEvent, GameState, PlayerAction, PlayerHand } from '../game/blackjack/types';
import { TableAudio } from '../services/audio';
import {
  clearStoredData,
  hasResumableGame,
  loadSnapshot,
  saveSnapshot,
  type AnimationSpeed,
  type UserSettings,
} from '../services/storage';

type Screen = 'lobby' | 'table' | 'stats' | 'settings' | 'help';

const SUIT_SYMBOL: Record<Card['suit'], string> = { spades: '♠', hearts: '♥', diamonds: '♦', clubs: '♣' };
const DIFFICULTY_LABEL: Record<ChallengeDifficulty, string> = { easy: '쉬움', normal: '보통', hard: '어려움' };

const TUTORIAL_STEPS = [
  { target: 'dealer', title: '1. 게임 목표와 딜러', body: '딜러보다 21에 가깝게 만들되 21을 넘기지 마세요. 딜러는 S17 규칙을 사용합니다.' },
  { target: 'bankroll', title: '2. 보유금과 베팅', body: '상단에서 현재 보유금과 세션 손익을 항상 확인할 수 있습니다.' },
  { target: 'betting', title: '3. 베팅 확정', body: '금액을 직접 입력하거나 빠른 추가 버튼을 누른 뒤 베팅을 확정하세요.' },
  { target: 'hands', title: '4. 카드와 점수', body: '핸드마다 점수와 SOFT/HARD 상태가 표시됩니다. 스플릿 핸드는 왼쪽부터 진행합니다.' },
  { target: 'actions', title: '5. 가능한 행동', body: '현재 가능한 행동만 활성화됩니다. 비활성 버튼에는 이유가 함께 표시됩니다.' },
  { target: 'result', title: '6. 결과와 정산', body: '결과, 지급 배율, 자금 변화를 한곳에서 확인할 수 있습니다.' },
  { target: 'navigation', title: '7. 통계와 다음 라운드', body: '상단 메뉴에서 통계·게임 방법·설정을 열 수 있고 진행 중인 게임은 자동 저장됩니다.' },
];

function gameReducer(state: GameState, event: GameEvent): GameState {
  return transition(state, event);
}

export function App() {
  const [loaded] = useState(loadSnapshot);
  const [game, dispatch] = useReducer(gameReducer, loaded.snapshot.game);
  const [settings, setSettings] = useState<UserSettings>(loaded.snapshot.settings);
  const [tutorialComplete, setTutorialComplete] = useState(loaded.snapshot.tutorialComplete);
  const [tutorialStep, setTutorialStep] = useState(loaded.snapshot.tutorialStep);
  const [tutorialOpen, setTutorialOpen] = useState(false);
  const [screen, setScreen] = useState<Screen>('lobby');
  const [storageMessage, setStorageMessage] = useState(loaded.error);
  const [motionSkip, setMotionSkip] = useState(false);
  const [audio] = useState(() => new TableAudio(loaded.snapshot.settings));

  useEffect(() => {
    const error = saveSnapshot({ schemaVersion: 1, game, settings, tutorialComplete, tutorialStep });
    if (error) window.setTimeout(() => setStorageMessage(error), 0);
  }, [game, settings, tutorialComplete, tutorialStep]);

  useEffect(() => {
    audio.applySettings(settings);
  }, [audio, settings]);

  const previousGame = useRef(game);
  useEffect(() => {
    const previous = previousGame.current;
    if (game.roundId !== previous.roundId && game.roundId) audio.play('card');
    if (game.bankrollCents < previous.bankrollCents && game.phase === 'INITIAL_DEAL') audio.play('chip');
    if (game.lastSettledRoundId !== previous.lastSettledRoundId) audio.play(game.roundProfitCents >= 0 ? 'win' : 'lose');
    previousGame.current = game;
  }, [audio, game]);

  const motionScale = settings.animationSpeed === 'normal' ? 1 : settings.animationSpeed === 'fast' ? 0.5 : 0.01;
  const appStyle = { '--motion-scale': motionScale } as CSSProperties;

  const enableAudio = () => void audio.enable();

  const navigate = (next: Screen) => {
    audio.play('button');
    if (screen === 'table' && next !== 'table' && !['ROUND_COMPLETE', 'CHALLENGE_COMPLETE', 'CHALLENGE_FAILED', 'PAUSED'].includes(game.phase)) {
      dispatch({ type: 'PAUSE' });
    }
    setScreen(next);
  };

  const startSession = (mode: 'free' | 'challenge', difficulty?: ChallengeDifficulty) => {
    if (hasResumableGame(game) && !window.confirm('진행 중인 게임을 종료하고 새 게임을 시작할까요?')) return;
    dispatch({ type: 'CREATE_SESSION', mode, difficulty });
    setScreen('table');
    if (!tutorialComplete) {
      setTutorialStep(0);
      setTutorialOpen(true);
    }
  };

  const resumeGame = () => {
    if (game.phase === 'PAUSED') dispatch({ type: 'RESUME' });
    setScreen('table');
  };

  const completeTutorial = () => {
    setTutorialComplete(true);
    setTutorialOpen(false);
  };

  const restartTutorial = () => {
    setTutorialStep(0);
    setTutorialOpen(true);
    setScreen(hasResumableGame(game) ? 'table' : 'lobby');
  };

  const resetAllData = () => {
    if (!window.confirm('모든 게임 통계와 설정을 초기화할까요?')) return;
    if (!window.confirm('이 작업은 되돌릴 수 없습니다. 정말 초기화할까요?')) return;
    clearStoredData();
    window.location.reload();
  };

  const highlight = (target: string) => tutorialOpen && TUTORIAL_STEPS[tutorialStep]?.target === target ? 'tutorial-target' : '';

  return (
    <div className={`app-shell ${motionSkip ? 'motion-skip' : ''}`} style={appStyle} onPointerDown={enableAudio}>
      <a className="skip-link" href="#main-content">본문으로 건너뛰기</a>
      <Header screen={screen} navigate={navigate} hasGame={hasResumableGame(game)} highlight={highlight('navigation')} />
      {storageMessage && (
        <div className="storage-banner" role="status">
          <span>{storageMessage}</span>
          <button type="button" onClick={() => setStorageMessage(null)} aria-label="저장 안내 닫기">×</button>
        </div>
      )}
      <main id="main-content">
        {screen === 'lobby' && <Lobby game={game} resumeGame={resumeGame} startSession={startSession} navigate={navigate} />}
        {screen === 'table' && (
          <TableScreen
            game={game}
            dispatch={dispatch}
            navigate={navigate}
            highlight={highlight}
            setMotionSkip={setMotionSkip}
          />
        )}
        {screen === 'stats' && <StatsScreen game={game} />}
        {screen === 'settings' && (
          <SettingsScreen
            settings={settings}
            setSettings={setSettings}
            restartTutorial={restartTutorial}
            resetAllData={resetAllData}
          />
        )}
        {screen === 'help' && <HelpScreen />}
      </main>
      <footer>
        <span>TABLE 21 V1 STANDARD</span>
        <span>가상 게임머니 전용 · 현금 가치 없음</span>
      </footer>
      {tutorialOpen && (
        <Tutorial
          step={tutorialStep}
          setStep={setTutorialStep}
          finish={completeTutorial}
          skip={completeTutorial}
        />
      )}
    </div>
  );
}

function Header({ screen, navigate, hasGame, highlight }: { screen: Screen; navigate: (screen: Screen) => void; hasGame: boolean; highlight: string }) {
  const items: [Screen, string][] = [['lobby', '로비'], ['stats', '통계'], ['help', '게임 방법'], ['settings', '설정']];
  return (
    <header className={highlight}>
      <button className="brand" type="button" onClick={() => navigate('lobby')} aria-label="TABLE 21 로비">
        <span className="brand-mark">21</span>
        <span><strong>TABLE 21</strong><small>PRIVATE BLACKJACK CLUB</small></span>
      </button>
      <nav aria-label="주 메뉴">
        {items.map(([id, label]) => <button key={id} type="button" className={screen === id ? 'active' : ''} onClick={() => navigate(id)}>{label}</button>)}
        {hasGame && <button type="button" className={screen === 'table' ? 'active table-link' : 'table-link'} onClick={() => navigate('table')}>테이블</button>}
      </nav>
    </header>
  );
}

function Lobby({ game, resumeGame, startSession, navigate }: {
  game: GameState;
  resumeGame: () => void;
  startSession: (mode: 'free' | 'challenge', difficulty?: ChallengeDifficulty) => void;
  navigate: (screen: Screen) => void;
}) {
  const history = game.stats.bankrollHistory;
  return (
    <div className="lobby-page page-wrap">
      <section className="hero-panel">
        <div className="hero-copy">
          <span className="eyebrow">A PRIVATE TABLE AWAITS</span>
          <h1>당신의 판단으로<br /><em>21</em>에 가까이.</h1>
          <p>현금과 연결되지 않은 가상 게임머니로 즐기는 정교한 싱글플레이 블랙잭.</p>
          <div className="hero-actions">
            <button type="button" className="primary gold" onClick={() => startSession('free')}>자유 플레이</button>
            <button type="button" className="secondary" onClick={() => navigate('help')}>규칙 먼저 보기</button>
          </div>
        </div>
        <div className="hero-art" aria-hidden="true">
          <div className="table-orbit"><span>♠</span><span>♥</span><span>♦</span><span>♣</span></div>
          <div className="hero-card back-card" />
          <div className="hero-card ace-card"><b>A</b><i>♠</i></div>
          <div className="hero-card king-card"><b>K</b><i>♥</i></div>
          <div className="hero-chip">21</div>
        </div>
      </section>

      {hasResumableGame(game) && (
        <section className="resume-card">
          <div><span className="eyebrow">IN PROGRESS</span><h2>진행 중인 테이블</h2><p>{game.mode === 'free' ? '자유 플레이' : `${DIFFICULTY_LABEL[game.challengeDifficulty ?? 'normal']} 챌린지`} · {formatMoney(game.bankrollCents)} · {game.sessionRounds} 라운드</p></div>
          <button type="button" className="primary" onClick={resumeGame}>이어하기</button>
        </section>
      )}

      <section className="lobby-grid">
        <article className="mode-card free-card">
          <span className="card-number">01</span><span className="eyebrow">OPEN TABLE</span>
          <h2>자유 플레이</h2><p>$1,000으로 시작해 제한 없이 자신만의 흐름을 만드세요.</p>
          <ul><li>테이블 최대 한도 없음</li><li>파산 시 즉시 재시작</li><li>모든 기록 누적</li></ul>
          <button type="button" className="primary" onClick={() => startSession('free')}>테이블 입장</button>
        </article>
        <article className="mode-card challenge-card">
          <span className="card-number">02</span><span className="eyebrow">TARGET BANKROLL</span>
          <h2>목표 자금 챌린지</h2><p>$1,000에서 시작해 목표에 도달하세요. 보유금 구간별 베팅 한도가 적용됩니다.</p>
          <div className="difficulty-row">
            {(Object.keys(CHALLENGE_TARGETS) as ChallengeDifficulty[]).map((difficulty) => (
              <button key={difficulty} type="button" onClick={() => startSession('challenge', difficulty)}>
                <span>{DIFFICULTY_LABEL[difficulty]}</span><strong>{formatMoney(CHALLENGE_TARGETS[difficulty])}</strong>
              </button>
            ))}
          </div>
        </article>
        <article className="snapshot-card">
          <span className="eyebrow">YOUR LEDGER</span><h2>플레이 스냅샷</h2>
          <div className="snapshot-stats"><div><small>현재 자유 자금</small><strong>{formatMoney(game.freeBankrollCents)}</strong></div><div><small>최근 손익</small><strong className={game.stats.netProfitCents >= 0 ? 'positive' : 'negative'}>{signedMoney(game.stats.netProfitCents)}</strong></div><div><small>현재 연속</small><strong>{streakLabel(game.stats.currentStreak)}</strong></div></div>
          <BankrollChart values={history} compact />
          <button className="text-button" type="button" onClick={() => navigate('stats')}>상세 통계 보기 →</button>
        </article>
      </section>
    </div>
  );
}

function TableScreen({ game, dispatch, navigate, highlight, setMotionSkip }: {
  game: GameState;
  dispatch: React.Dispatch<GameEvent>;
  navigate: (screen: Screen) => void;
  highlight: (target: string) => string;
  setMotionSkip: (value: boolean) => void;
}) {
  const [betInput, setBetInput] = useState(() => Math.max(1, Math.floor((game.lastBetCents || 1_000) / 100)).toString());
  const [allInStage, setAllInStage] = useState<0 | 1 | 2>(0);
  const betInputRef = useRef<HTMLInputElement>(null);
  const modalButtonRef = useRef<HTMLButtonElement>(null);
  const cents = Math.round(Number(betInput || 0) * 100);
  const betError = game.phase === 'BETTING' ? validateBet(game, cents) : null;
  const limits = getBetLimits(game);

  useEffect(() => {
    if (allInStage > 0) modalButtonRef.current?.focus();
    else betInputRef.current?.focus();
  }, [allInStage]);

  const submitBet = (event?: FormEvent) => {
    event?.preventDefault();
    if (betError) return;
    if (cents === game.bankrollCents && allInStage === 0) {
      setAllInStage(1);
      return;
    }
    dispatch({ type: 'BET_CONFIRMED', amountCents: cents });
  };

  const addBet = (dollars: number) => {
    const next = Math.min(limits.maxCents, Math.max(0, cents) + dollars * 100);
    setBetInput(Math.floor(next / 100).toString());
  };

  const applyPreset = (type: 'previous' | 'double' | 'allin' | 'clear') => {
    const next = type === 'previous' ? game.lastBetCents : type === 'double' ? cents * 2 : type === 'allin' ? game.bankrollCents : 0;
    setBetInput(Math.floor(Math.min(next, limits.maxCents) / 100).toString());
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && allInStage > 0) {
        setAllInStage(0);
        return;
      }
      if (event.key === ' ' && !(event.target instanceof HTMLInputElement) && !(event.target instanceof HTMLButtonElement)) {
        event.preventDefault();
        setMotionSkip(true);
        window.setTimeout(() => setMotionSkip(false), 40);
      }
      if (event.target instanceof HTMLInputElement || allInStage > 0 || game.phase !== 'PLAYER_TURN') return;
      const keyMap: Record<string, PlayerAction> = { h: 'HIT', s: 'STAND', d: 'DOUBLE', p: 'SPLIT', r: 'SURRENDER' };
      const action = keyMap[event.key.toLowerCase()];
      if (action && getActionAvailability(game, action).enabled) dispatch({ type: action });
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [allInStage, dispatch, game, setMotionSkip]);

  const dealerHidden = ['INSURANCE_OFFER', 'DEALER_PEEK', 'PLAYER_TURN', 'PAUSED'].includes(game.phase);
  const activeHand = game.hands[game.activeHandIndex];
  const sessionProfit = game.bankrollCents - game.startingBankrollCents;
  const targetProgress = game.challengeTargetCents ? Math.min(100, (game.bankrollCents / game.challengeTargetCents) * 100) : 0;

  if (game.phase === 'LOBBY') return <EmptyTable start={() => dispatch({ type: 'CREATE_SESSION', mode: 'free' })} navigate={navigate} />;

  return (
    <div className="table-page">
      <section className={`table-status ${highlight('bankroll')}`} aria-label="현재 게임 요약">
        <div><small>보유금</small><strong>{formatMoney(game.bankrollCents)}</strong></div>
        <div><small>세션 손익</small><strong className={sessionProfit >= 0 ? 'positive' : 'negative'}>{signedMoney(sessionProfit)}</strong></div>
        <div><small>라운드</small><strong>{game.sessionRounds + (game.roundId && game.lastSettledRoundId !== game.roundId ? 1 : 0)}</strong></div>
        <div><small>연속 기록</small><strong>{streakLabel(game.stats.currentStreak)}</strong></div>
        <button type="button" className="pause-button" onClick={() => dispatch({ type: game.phase === 'PAUSED' ? 'RESUME' : 'PAUSE' })}>{game.phase === 'PAUSED' ? '계속하기' : '일시정지'}</button>
      </section>
      {game.mode === 'challenge' && (
        <div className="challenge-progress" aria-label={`목표 ${formatMoney(game.challengeTargetCents ?? 0)} 중 ${targetProgress.toFixed(0)}%`}>
          <span>{DIFFICULTY_LABEL[game.challengeDifficulty ?? 'normal']} 목표 {formatMoney(game.challengeTargetCents ?? 0)}</span><div><i style={{ width: `${targetProgress}%` }} /></div><b>{targetProgress.toFixed(0)}%</b>
        </div>
      )}

      <section className="casino-table" aria-label="블랙잭 테이블">
        <div className={`dealer-zone ${highlight('dealer')}`}>
          <div className="zone-heading"><span className="eyebrow">HOUSE · S17</span><h2>딜러</h2></div>
          <div className="score-badge">{game.dealerCards.length === 0 ? '—' : dealerHidden ? evaluateHand(game.dealerCards.slice(0, 1)).total : scoreLabel(game.dealerCards)}</div>
          <div className="cards dealer-cards">
            {game.dealerCards.map((card, index) => <PlayingCard key={card.id} card={card} hidden={dealerHidden && index === 1} index={index} />)}
            {game.dealerCards.length === 0 && <CardPlaceholder />}
          </div>
        </div>

        <div className={`table-message ${highlight('result')}`} role="status" aria-live="polite">
          <span className="message-dot" /><strong>{game.notice}</strong>
          {game.roundProfitCents !== 0 && <small>이번 라운드 {signedMoney(game.roundProfitCents)}</small>}
        </div>

        <div className={`player-zone ${highlight('hands')}`}>
          <div className="hands-row">
            {game.hands.map((hand, index) => <HandView key={hand.id} hand={hand} index={index} active={game.phase === 'PLAYER_TURN' && index === game.activeHandIndex} />)}
            {game.hands.length === 0 && <div className="empty-hand"><div className="empty-cards"><CardPlaceholder /><CardPlaceholder /></div><p>베팅을 확정하면 카드가 배분됩니다.</p></div>}
          </div>
        </div>

        {game.phase === 'BETTING' && (
          <form className={`bet-console ${highlight('betting')}`} onSubmit={submitBet}>
            <div className="bet-heading"><div><span className="eyebrow">PLACE YOUR BET</span><h2>베팅 금액</h2></div><span>허용 범위 {formatMoney(limits.minCents)} – {formatMoney(limits.maxCents)}</span></div>
            <label className={betError ? 'money-input invalid' : 'money-input'}><span>$</span><input ref={betInputRef} type="number" min="0" step="1" value={betInput} onChange={(event) => setBetInput(event.target.value)} aria-describedby="bet-help" /></label>
            <div className="quick-bets" aria-label="빠른 금액 추가">{[10, 50, 100, 500, 1000, ...(game.bankrollCents >= 500_000 ? [5000, 10000] : [])].map((amount) => <button key={amount} type="button" onClick={() => addBet(amount)}>+{amount.toLocaleString()}</button>)}</div>
            <div className="bet-presets"><button type="button" onClick={() => applyPreset('previous')}>이전 금액</button><button type="button" onClick={() => applyPreset('double')}>2배</button><button type="button" onClick={() => applyPreset('allin')}>올인</button><button type="button" onClick={() => applyPreset('clear')}>초기화</button></div>
            <p id="bet-help" className={betError ? 'input-help error' : 'input-help'}>{betError ?? 'Enter 키로 베팅을 확정할 수 있습니다. 확정 전에는 보유금이 차감되지 않습니다.'}</p>
            <button className="primary confirm-bet" type="submit" disabled={Boolean(betError)}>베팅 확정 <span>{!betError && formatMoney(cents)}</span></button>
          </form>
        )}

        {game.phase === 'INSURANCE_OFFER' && (
          <div className="decision-console">
            <span className="eyebrow">DEALER SHOWS AN ACE</span><h2>보험을 선택하시겠습니까?</h2>
            <p>보험 베팅 {formatMoney(game.baseBetCents / 2)} · 딜러 블랙잭이면 2:1 지급</p>
            <div>{activeHand && isNaturalBlackjack(activeHand) && <button className="primary gold" type="button" onClick={() => dispatch({ type: 'EVEN_MONEY' })}>EVEN MONEY <small>1:1 즉시 정산</small></button>}<button className="primary" type="button" disabled={game.bankrollCents < game.baseBetCents / 2} onClick={() => dispatch({ type: 'INSURANCE_DECISION', accept: true })}>INSURANCE 수락</button><button className="secondary" type="button" onClick={() => dispatch({ type: 'INSURANCE_DECISION', accept: false })}>거절</button></div>
          </div>
        )}

        {game.phase === 'PLAYER_TURN' && <ActionConsole game={game} dispatch={dispatch} highlight={highlight('actions')} />}

        {['ROUND_COMPLETE', 'CHALLENGE_COMPLETE', 'CHALLENGE_FAILED'].includes(game.phase) && (
          <RoundComplete game={game} dispatch={dispatch} navigate={navigate} />
        )}

        {game.phase === 'PAUSED' && (
          <div className="pause-overlay" role="dialog" aria-modal="true" aria-labelledby="pause-title"><span className="eyebrow">TABLE SAVED</span><h2 id="pause-title">게임이 일시 정지되었습니다</h2><p>현재 카드 순서와 모든 상태가 안전하게 저장되었습니다.</p><div><button className="primary" type="button" onClick={() => dispatch({ type: 'RESUME' })}>계속하기</button><button className="secondary" type="button" onClick={() => navigate('lobby')}>로비로</button></div></div>
        )}
      </section>

      <div className="keyboard-legend" aria-label="키보드 단축키"><span>H HIT</span><span>S STAND</span><span>D DOUBLE</span><span>P SPLIT</span><span>R SURRENDER</span><span>SPACE 연출 건너뛰기</span></div>

      {allInStage > 0 && (
        <div className="modal-backdrop" role="presentation">
          <div className="confirm-modal" role="dialog" aria-modal="true" aria-labelledby="allin-title">
            <span className="eyebrow">ALL IN · {allInStage}/2</span><h2 id="allin-title">{allInStage === 1 ? '보유금 전액을 베팅할까요?' : '마지막 확인입니다'}</h2>
            <p>{allInStage === 1 ? `${formatMoney(game.bankrollCents)} 전액이 이번 라운드에 걸립니다.` : '패배하면 보유금이 $0이 됩니다. 그래도 진행할까요?'}</p>
            <div><button ref={modalButtonRef} className="primary danger" type="button" onClick={() => allInStage === 1 ? setAllInStage(2) : (setAllInStage(0), dispatch({ type: 'BET_CONFIRMED', amountCents: cents }))}>{allInStage === 1 ? '계속 확인' : '올인 확정'}</button><button className="secondary" type="button" onClick={() => setAllInStage(0)}>취소</button></div>
          </div>
        </div>
      )}
    </div>
  );
}

function ActionConsole({ game, dispatch, highlight }: { game: GameState; dispatch: React.Dispatch<GameEvent>; highlight: string }) {
  const actions: { action: PlayerAction; label: string; help: string }[] = [
    { action: 'HIT', label: 'HIT', help: '카드 받기' },
    { action: 'STAND', label: 'STAND', help: '멈추기' },
    { action: 'DOUBLE', label: 'DOUBLE', help: '베팅 2배 + 한 장' },
    { action: 'SPLIT', label: 'SPLIT', help: '같은 랭크 나누기' },
    { action: 'SURRENDER', label: 'SURRENDER', help: '절반 반환' },
  ];
  return (
    <div className={`action-console ${highlight}`}>
      {actions.map(({ action, label, help }) => {
        const availability = getActionAvailability(game, action);
        return <button key={action} type="button" className={action === 'HIT' || action === 'STAND' ? 'main-action' : ''} disabled={!availability.enabled} title={availability.reason || help} onClick={() => dispatch({ type: action })}><strong>{label}</strong><small>{availability.enabled ? help : availability.reason}</small></button>;
      })}
    </div>
  );
}

function RoundComplete({ game, dispatch, navigate }: { game: GameState; dispatch: React.Dispatch<GameEvent>; navigate: (screen: Screen) => void }) {
  const challengeEnded = game.phase === 'CHALLENGE_COMPLETE' || game.phase === 'CHALLENGE_FAILED';
  const bankrupt = game.bankrollCents <= 0;
  return (
    <div className={`round-complete ${game.roundProfitCents >= 0 ? 'win-panel' : 'loss-panel'}`}>
      <span className="eyebrow">{game.phase === 'CHALLENGE_COMPLETE' ? 'CHALLENGE CLEARED' : game.phase === 'CHALLENGE_FAILED' ? 'CHALLENGE FAILED' : 'ROUND SETTLED'}</span>
      <h2>{game.hands.map((hand) => hand.result).join(' · ')}</h2>
      <p>{game.notice}</p>
      <div className="settlement-grid">{game.hands.map((hand, index) => <div key={hand.id}><small>{game.hands.length > 1 ? `${index + 1}번 핸드` : '핸드 정산'}</small><strong>{signedMoney(hand.profitCents ?? 0)}</strong><span>베팅 {formatMoney(hand.betCents)} · 지급 {formatMoney(hand.payoutCents ?? 0)}</span></div>)}{game.insuranceBetCents > 0 && <div><small>보험 정산</small><strong>{game.insuranceResolved ? '완료' : '대기'}</strong><span>보험 {formatMoney(game.insuranceBetCents)}</span></div>}</div>
      <div className="round-buttons">
        {!challengeEnded && !bankrupt && <button className="primary" type="button" onClick={() => dispatch({ type: 'NEXT_ROUND' })}>다음 라운드</button>}
        {(challengeEnded || bankrupt) && <button className="primary" type="button" onClick={() => dispatch({ type: 'RESTART_SESSION' })}>$1,000으로 다시 시작</button>}
        <button className="secondary" type="button" onClick={() => navigate('stats')}>통계 보기</button>
        <button className="text-button" type="button" onClick={() => navigate('lobby')}>로비로</button>
      </div>
    </div>
  );
}

function HandView({ hand, index, active }: { hand: PlayerHand; index: number; active: boolean }) {
  const value = evaluateHand(hand.cards);
  return (
    <article className={`player-hand ${active ? 'active-hand' : ''} ${hand.status === 'settled' ? 'settled-hand' : ''}`} aria-label={`${index + 1}번 핸드 ${value.total}점`}>
      <div className="hand-title"><span>{hand.fromSplit ? `HAND ${index + 1}` : 'PLAYER'}</span><b>{value.total}{value.soft && !value.busted ? ' · SOFT' : value.busted ? ' · BUST' : ' · HARD'}</b></div>
      <div className="cards">{hand.cards.map((card, cardIndex) => <PlayingCard key={card.id} card={card} index={cardIndex} />)}</div>
      <div className="hand-meta"><span>베팅 {formatMoney(hand.betCents)}</span>{hand.doubled && <em>DOUBLE</em>}{hand.result && <strong>{hand.result}</strong>}</div>
    </article>
  );
}

function PlayingCard({ card, hidden = false, index = 0 }: { card: Card; hidden?: boolean; index?: number }) {
  if (hidden) return <div className="playing-card card-back" style={{ '--card-index': index } as CSSProperties} aria-label="딜러의 숨겨진 카드"><span>21</span></div>;
  const red = card.suit === 'hearts' || card.suit === 'diamonds';
  return <div className={`playing-card ${red ? 'red-card' : 'black-card'}`} style={{ '--card-index': index } as CSSProperties} aria-label={`${card.rank} ${SUIT_SYMBOL[card.suit]}`}><span className="corner top"><b>{card.rank}</b><i>{SUIT_SYMBOL[card.suit]}</i></span><strong className="center-suit">{SUIT_SYMBOL[card.suit]}</strong><span className="corner bottom"><b>{card.rank}</b><i>{SUIT_SYMBOL[card.suit]}</i></span></div>;
}

function CardPlaceholder() {
  return <div className="card-placeholder" aria-hidden="true"><span>21</span></div>;
}

function StatsScreen({ game }: { game: GameState }) {
  const stats = game.stats;
  const resolved = Math.max(1, stats.handsResolved);
  const cards = [
    ['총 라운드', stats.rounds.toLocaleString()], ['해결 핸드', stats.handsResolved.toLocaleString()], ['승률', `${((stats.wins / resolved) * 100).toFixed(1)}%`], ['누적 손익', signedMoney(stats.netProfitCents)],
    ['최고 보유금', formatMoney(stats.highestBankrollCents)], ['최저 보유금', formatMoney(stats.lowestBankrollCents)], ['평균 기본 베팅', formatMoney(stats.rounds ? Math.round(stats.totalBaseBetCents / stats.rounds) : 0)], ['최대 기본 베팅', formatMoney(stats.maxBaseBetCents)],
    ['블랙잭', `${stats.blackjacks}회 · ${((stats.blackjacks / resolved) * 100).toFixed(1)}%`], ['플레이어 버스트', `${stats.playerBusts}회 · ${((stats.playerBusts / resolved) * 100).toFixed(1)}%`], ['딜러 버스트', `${stats.dealerBusts}회`], ['최고 연승 / 연패', `${stats.bestWinStreak} / ${stats.worstLoseStreak}`],
  ];
  return (
    <div className="page-wrap stats-page">
      <div className="page-heading"><span className="eyebrow">PLAYER LEDGER</span><h1>상세 통계</h1><p>핸드 기준 승·무·패와 라운드 기준 자금 흐름을 분리해 집계합니다.</p></div>
      <section className="stats-chart-panel"><div><h2>라운드별 보유금 변화</h2><p>각 점은 한 라운드의 전체 핸드 정산이 끝난 뒤의 보유금입니다.</p></div><BankrollChart values={stats.bankrollHistory} /></section>
      <section className="stat-card-grid">{cards.map(([label, value]) => <article key={label}><small>{label}</small><strong>{value}</strong></article>)}</section>
      <section className="detail-grid">
        <article><span className="eyebrow">DOUBLE DOWN</span><h2>더블다운</h2><dl><div><dt>시도</dt><dd>{stats.doubleAttempts}</dd></div><div><dt>승리 / 무승부</dt><dd>{stats.doubleWins} / {stats.doublePushes}</dd></div><div><dt>손익</dt><dd>{signedMoney(stats.doubleProfitCents)}</dd></div></dl></article>
        <article><span className="eyebrow">SPLIT</span><h2>스플릿</h2><dl><div><dt>시도</dt><dd>{stats.splitAttempts}</dd></div><div><dt>생성 핸드</dt><dd>{stats.splitHandsCreated}</dd></div><div><dt>손익</dt><dd>{signedMoney(stats.splitProfitCents)}</dd></div></dl></article>
        <article><span className="eyebrow">INSURANCE</span><h2>보험</h2><dl><div><dt>시도 / 적중</dt><dd>{stats.insuranceAttempts} / {stats.insuranceWins}</dd></div><div><dt>손익</dt><dd>{signedMoney(stats.insuranceProfitCents)}</dd></div><div><dt>서렌더</dt><dd>{stats.surrenders}</dd></div></dl></article>
      </section>
      <section className="recent-panel"><h2>최근 세션</h2>{stats.recentRounds.length === 0 ? <p className="empty-copy">아직 완료한 라운드가 없습니다.</p> : <div className="recent-list">{stats.recentRounds.map((round) => <div key={round.roundId}><span>{new Date(round.finishedAt).toLocaleString('ko-KR')}</span><b>{round.mode === 'free' ? '자유 플레이' : '챌린지'}</b><span>베팅 {formatMoney(round.baseBetCents)}</span><strong className={round.profitCents >= 0 ? 'positive' : 'negative'}>{signedMoney(round.profitCents)}</strong><span>{formatMoney(round.bankrollCents)}</span></div>)}</div>}</section>
    </div>
  );
}

function SettingsScreen({ settings, setSettings, restartTutorial, resetAllData }: {
  settings: UserSettings;
  setSettings: React.Dispatch<React.SetStateAction<UserSettings>>;
  restartTutorial: () => void;
  resetAllData: () => void;
}) {
  const updateVolume = (key: 'masterVolume' | 'effectsVolume' | 'ambienceVolume', value: number) => setSettings((current) => ({ ...current, [key]: value }));
  return (
    <div className="page-wrap settings-page">
      <div className="page-heading"><span className="eyebrow">PREFERENCES</span><h1>설정</h1><p>설정은 이 브라우저와 현재 사이트 주소에만 저장됩니다.</p></div>
      <section className="settings-grid">
        <article><span className="eyebrow">AUDIO</span><h2>사운드</h2><RangeSetting label="전체 볼륨" value={settings.masterVolume} setValue={(value) => updateVolume('masterVolume', value)} /><RangeSetting label="효과음" value={settings.effectsVolume} setValue={(value) => updateVolume('effectsVolume', value)} /><RangeSetting label="환경음" value={settings.ambienceVolume} setValue={(value) => updateVolume('ambienceVolume', value)} /><p className="setting-note">브라우저 정책에 따라 첫 사용자 입력 후에만 오디오가 시작됩니다.</p></article>
        <article><span className="eyebrow">MOTION</span><h2>진행 속도</h2><div className="segmented">{([['normal', '보통'], ['fast', '빠르게'], ['minimal', '애니메이션 최소화']] as [AnimationSpeed, string][]).map(([value, label]) => <button key={value} type="button" className={settings.animationSpeed === value ? 'active' : ''} onClick={() => setSettings((current) => ({ ...current, animationSpeed: value }))}>{label}</button>)}</div><p className="setting-note">운영체제의 모션 감소 설정도 항상 우선 적용됩니다.</p></article>
        <article><span className="eyebrow">GUIDE</span><h2>첫 실행 가이드</h2><p>테이블의 주요 영역과 실제 조작 순서를 7단계로 다시 확인합니다.</p><button className="secondary" type="button" onClick={restartTutorial}>가이드 다시 보기</button></article>
        <article className="danger-zone"><span className="eyebrow">DATA</span><h2>통계 및 저장 데이터 초기화</h2><p>진행 중인 게임, 누적 통계, 설정과 튜토리얼 상태를 모두 삭제합니다.</p><button className="danger-button" type="button" onClick={resetAllData}>모든 데이터 초기화</button></article>
      </section>
    </div>
  );
}

function RangeSetting({ label, value, setValue }: { label: string; value: number; setValue: (value: number) => void }) {
  return <label className="range-setting"><span>{label}<b>{Math.round(value * 100)}%</b></span><input type="range" min="0" max="1" step="0.05" value={value} onChange={(event) => setValue(Number(event.target.value))} /></label>;
}

function HelpScreen() {
  const actions = [['HIT', '카드 받기', '현재 핸드에 카드 한 장을 추가합니다.'], ['STAND', '멈추기', '현재 점수로 플레이를 마칩니다.'], ['DOUBLE', '더블다운', '최초 두 장에서 베팅을 두 배로 늘리고 한 장만 받은 뒤 멈춥니다.'], ['SPLIT', '스플릿', '같은 랭크의 두 장을 두 핸드로 나눕니다. 최대 4개 핸드입니다.'], ['SURRENDER', '서렌더', '딜러 확인 뒤 최초 두 장에서 베팅의 절반을 돌려받고 포기합니다.']];
  return (
    <div className="page-wrap help-page">
      <div className="page-heading"><span className="eyebrow">TABLE 21 V1 STANDARD</span><h1>게임 방법</h1><p>이 게임은 6덱, 딜러 S17, 블랙잭 3:2를 사용하는 고정 하우스 프리셋입니다.</p></div>
      <section className="rule-intro"><div className="rule-21">21</div><div><h2>목표와 카드 점수</h2><p>딜러보다 21에 가까운 점수를 만들되 21을 넘으면 즉시 패배합니다. 숫자 카드는 표시값, J/Q/K는 10, A는 유리하게 1 또는 11입니다. 여러 A도 필요한 만큼 1로 낮춰 계산합니다.</p><p><strong>BLACKJACK</strong>은 최초 두 장의 A + 10점 카드입니다. 스플릿으로 만든 21은 일반 21입니다.</p></div></section>
      <section className="rule-grid">{actions.map(([english, korean, description]) => <article key={english}><span>{english}</span><h2>{korean}</h2><p>{description}</p></article>)}</section>
      <section className="help-columns"><article><h2>딜러와 정산</h2><ul><li>딜러는 16 이하에서 HIT, 모든 17에서 STAND합니다.</li><li>블랙잭은 3:2, 일반 승리는 1:1, 동점은 원금 반환입니다.</li><li>플레이어와 딜러의 동시 블랙잭은 PUSH입니다.</li><li>딜러 블랙잭은 플레이어의 일반 21보다 우선합니다.</li></ul></article><article><h2>보험과 이븐머니</h2><ul><li>딜러 오픈 카드가 A일 때 기본 베팅의 절반으로 보험을 선택할 수 있습니다.</li><li>딜러 블랙잭이면 보험은 2:1로 지급됩니다.</li><li>플레이어 블랙잭이면 EVEN MONEY로 1:1 이익을 즉시 확정할 수 있습니다.</li></ul></article><article><h2>모드 차이</h2><ul><li>자유 플레이: $1 최소 베팅, 별도 테이블 최대 한도 없음.</li><li>챌린지: 모두 $1,000 시작, 난이도별 목표와 보유금 구간별 한도 적용.</li><li>실제 돈, 현금성 보상, 전략 추천 기능은 없습니다.</li></ul></article></section>
    </div>
  );
}

function EmptyTable({ start, navigate }: { start: () => void; navigate: (screen: Screen) => void }) {
  return <div className="empty-table-page"><span className="eyebrow">NO ACTIVE TABLE</span><h1>먼저 게임을 시작하세요</h1><p>자유 플레이를 바로 시작하거나 로비에서 챌린지를 선택할 수 있습니다.</p><div><button className="primary" type="button" onClick={start}>자유 플레이 시작</button><button className="secondary" type="button" onClick={() => navigate('lobby')}>로비로</button></div></div>;
}

function Tutorial({ step, setStep, finish, skip }: { step: number; setStep: (step: number) => void; finish: () => void; skip: () => void }) {
  const current = TUTORIAL_STEPS[step];
  return (
    <aside className="tutorial-popover" aria-live="polite"><div className="tutorial-progress">{TUTORIAL_STEPS.map((_, index) => <i key={index} className={index <= step ? 'done' : ''} />)}</div><span className="eyebrow">FIRST TABLE GUIDE · {step + 1}/7</span><h2>{current.title}</h2><p>{current.body}</p><div><button type="button" className="text-button" onClick={skip}>건너뛰기</button>{step > 0 && <button type="button" className="secondary" onClick={() => setStep(step - 1)}>이전</button>}<button type="button" className="primary" onClick={() => step === TUTORIAL_STEPS.length - 1 ? finish() : setStep(step + 1)}>{step === TUTORIAL_STEPS.length - 1 ? '완료' : '다음'}</button></div></aside>
  );
}

function BankrollChart({ values, compact = false }: { values: number[]; compact?: boolean }) {
  const points = useMemo(() => {
    const data = values.length ? values : [100_000];
    const min = Math.min(...data);
    const max = Math.max(...data);
    const spread = Math.max(1, max - min);
    return data.map((value, index) => `${data.length === 1 ? 0 : (index / (data.length - 1)) * 100},${44 - ((value - min) / spread) * 38}`).join(' ');
  }, [values]);
  return <svg className={compact ? 'bankroll-chart compact' : 'bankroll-chart'} viewBox="0 0 100 48" role="img" aria-label="라운드별 보유금 변화 그래프" preserveAspectRatio="none"><defs><linearGradient id={compact ? 'gold-fill-compact' : 'gold-fill'} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#e8c978" stopOpacity=".38" /><stop offset="1" stopColor="#e8c978" stopOpacity="0" /></linearGradient></defs><polygon points={`0,48 ${points} 100,48`} fill={`url(#${compact ? 'gold-fill-compact' : 'gold-fill'})`} /><polyline points={points} fill="none" stroke="#e8c978" strokeWidth="1.4" vectorEffect="non-scaling-stroke" /></svg>;
}

function scoreLabel(cards: Card[]): string {
  const value = evaluateHand(cards);
  return `${value.total}${value.soft && !value.busted ? ' · S' : ''}`;
}

function signedMoney(cents: number): string {
  return `${cents >= 0 ? '+' : ''}${formatMoney(cents)}`;
}

function streakLabel(streak: number): string {
  return streak > 0 ? `${streak}연승` : streak < 0 ? `${Math.abs(streak)}연패` : '—';
}
