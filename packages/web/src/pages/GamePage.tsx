import { useEffect, useLayoutEffect, useState, useRef } from 'react';
import { useParams, Navigate, useNavigate } from 'react-router-dom';
import { useGameStore } from '../store/gameStore.js';
import { useAuthStore } from '../store/authStore.js';
import { useSocketEvents } from '../hooks/useSocketEvents.js';
import { useCardSize } from '../hooks/useCardSize.js';
import { getSocket } from '../socket.js';
import { canDrawCard } from '@poker5o/shared';
import type { GameState, Player } from '@poker5o/shared';
import { PlayerGrid } from '../components/game/PlayerGrid.js';
import { DrawnCard } from '../components/game/DrawnCard.js';

// ─── Progressive reveal helper ────────────────────────────────────────────────

function prepareReveal(state: GameState, revealedCols: number, myPlayerIndex: 0 | 1): GameState {
  const opponentIndex: 0 | 1 = myPlayerIndex === 0 ? 1 : 0;
  return {
    ...state,
    players: state.players.map((p, pIdx) => ({
      ...p,
      columns: p.columns.map((col, colIdx) =>
        col.map((card, rowIdx) => ({
          ...card,
          faceDown: pIdx === opponentIndex && rowIdx === 4 && colIdx > revealedCols,
        }))
      ),
    })) as [Player, Player],
  };
}

// ─── Dark space theme CSS ─────────────────────────────────────────────────────

const PZ_STYLES = `
  @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=Inter:wght@400;500;600;700&display=swap');
  .pz-h { font-family: 'Space Grotesk', sans-serif !important; }
  .glass-panel {
    background: rgba(26, 28, 35, 0.6);
    backdrop-filter: blur(16px);
    -webkit-backdrop-filter: blur(16px);
    border: 1px solid rgba(255,255,255,0.05);
    box-shadow: 0 8px 32px 0 rgba(0,0,0,0.37);
  }
  .pz-btn {
    transition: all 0.2s ease;
    background: linear-gradient(180deg, #2A2A40 0%, #1A1C23 100%);
    border: 1px solid rgba(255,255,255,0.1);
    color: #E0E6ED;
    box-shadow: 0 4px 15px rgba(0,0,0,0.4);
  }
  .pz-btn:hover {
    background: linear-gradient(180deg, #33334D 0%, #252538 100%);
    border-color: rgba(69,243,255,0.5);
    box-shadow: 0 0 15px rgba(69,243,255,0.4);
    color: #fff;
  }
  .pz-btn:active { box-shadow: none; }
  .gp-stars {
    position: fixed; top: 0; left: 0; right: 0; bottom: 0;
    z-index: 0; pointer-events: none;
    background-image:
      radial-gradient(1px 1px at 20px 30px, #fff, rgba(0,0,0,0)),
      radial-gradient(1px 1px at 40px 70px, #fff, rgba(0,0,0,0)),
      radial-gradient(1px 1px at 50px 160px, #fff, rgba(0,0,0,0)),
      radial-gradient(2px 2px at 90px 40px, rgba(255,255,255,0.8), rgba(0,0,0,0)),
      radial-gradient(2px 2px at 130px 80px, rgba(255,255,255,0.8), rgba(0,0,0,0)),
      radial-gradient(1px 1px at 160px 120px, #fff, rgba(0,0,0,0));
    background-repeat: repeat;
    background-size: 300px 300px;
    animation: gp-twinkle 8s infinite alternate;
  }
  @keyframes gp-twinkle { 0% { opacity: 0.3; } 100% { opacity: 0.7; } }
  .gp-nebula {
    position: fixed; top: 0; left: 0; right: 0; bottom: 0;
    z-index: 0; pointer-events: none;
    background:
      radial-gradient(circle at 15% 50%, rgba(110,86,207,0.15) 0%, transparent 50%),
      radial-gradient(circle at 85% 30%, rgba(69,243,255,0.1) 0%, transparent 50%);
  }
`;

// ─── GamePage ─────────────────────────────────────────────────────────────────

export function GamePage() {
  const { roomId } = useParams<{ roomId: string }>();
  const navigate = useNavigate();
  const { profile } = useAuthStore();
  const { gameState, score, playerIndex, stake, completeWinBonus, opponentLeft, setOpponentLeft, startingPlayer, reset } = useGameStore();

  useSocketEvents();
  const { cardW, cardH, recompute } = useCardSize();

  // Re-compute card sizes the moment the game layout becomes visible.
  // useCardSize computes at mount (loading spinner), but the actual game
  // DOM only renders after the socket responds — by then the viewport may
  // have settled to a different size (iOS address bar, etc.).
  // useLayoutEffect runs synchronously before the browser paints, so the
  // user never sees a frame with wrong sizes.
  const gameReady = playerIndex !== null && !!gameState;
  useLayoutEffect(() => {
    if (gameReady) recompute();
  }, [gameReady]);
  const [confirmForfeit, setConfirmForfeit] = useState(false);
  const [confirmExit, setConfirmExit] = useState(false);
  const [timerSeconds, setTimerSeconds] = useState<number | null>(null);
  const timerIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [revealedCols, setRevealedCols] = useState(-1);

  useEffect(() => {
    if (!score) { setRevealedCols(-1); return; }
    if (revealedCols >= 4) return;
    const delay = revealedCols === -1 ? 600 : 750;
    const t = setTimeout(() => setRevealedCols(c => c + 1), delay);
    return () => clearTimeout(t);
  }, [score, revealedCols]);

  useEffect(() => {
    if (!roomId) return;
    const socket = getSocket();
    socket.emit('room:join', { roomId });
    const pingInterval = setInterval(() => {
      if (socket.connected) socket.emit('game:ping', { roomId });
    }, 15_000);
    const handleReconnect = () => socket.emit('room:join', { roomId });
    socket.on('connect', handleReconnect);
    return () => {
      clearInterval(pingInterval);
      socket.off('connect', handleReconnect);
    };
  }, [roomId]);

  useEffect(() => {
    if (timerIntervalRef.current) { clearInterval(timerIntervalRef.current); timerIntervalRef.current = null; }
    const deadline = gameState?.turnDeadline;
    if (!deadline) { setTimerSeconds(null); return; }
    const update = () => setTimerSeconds(Math.max(0, Math.ceil((deadline - Date.now()) / 1000)));
    update();
    timerIntervalRef.current = setInterval(update, 250);
    return () => { if (timerIntervalRef.current) { clearInterval(timerIntervalRef.current); timerIntervalRef.current = null; } };
  }, [gameState?.turnDeadline]);

  if (!roomId || !profile) return <Navigate to="/lobby" replace />;

  if (playerIndex === null || !gameState) {
    return (
      <div className="min-h-screen flex items-center justify-center"
        style={{ background: 'radial-gradient(circle at 50% 50%, #12141D 0%, #0B0C10 100%)', color: '#E0E6ED' }}>
        <style>{PZ_STYLES}</style>
        <div className="gp-stars" /><div className="gp-nebula" />
        <div className="glass-panel relative z-10 text-center space-y-3 p-10 rounded-3xl border border-white/10 shadow-xl">
          <div className="text-6xl animate-bounce">🃏</div>
          <p className="pz-h text-2xl text-[#45F3FF]">Connecting to game…</p>
        </div>
      </div>
    );
  }

  const opponentIndex = playerIndex === 0 ? 1 : 0;
  const isRevealMode = !!score;
  const allRevealed  = isRevealMode && revealedCols >= 4;

  const displayState = isRevealMode ? prepareReveal(gameState, revealedCols, playerIndex) : gameState;
  const myPlayer     = displayState.players[playerIndex];
  const themPlayer   = displayState.players[opponentIndex];

  const isMyTurn    = gameState.currentPlayerIndex === playerIndex;
  const drawAllowed = canDrawCard(gameState, profile.id);

  function handleDraw() { if (roomId) getSocket().emit('action:draw', { roomId }); }
  function handleForfeit() { if (roomId) { getSocket().emit('game:forfeit', { roomId }); setConfirmForfeit(false); } }
  function handlePlace(columnIndex: number) { if (roomId) getSocket().emit('action:place', { roomId, columnIndex }); }

  function goToLobby() {
    reset();
    const { session } = useAuthStore.getState();
    useAuthStore.getState().fetchProfile(session);
    navigate('/lobby', { replace: true });
  }

  const iWon   = score ? score.winner === playerIndex : false;
  const isDraw = score ? score.winner === 'draw' : false;

  const phaseLabel: Record<string, string> = {
    SETUP_PHASE: 'Dealing first row',
    MAIN_PHASE:  `Row ${gameState.currentRow + 1} of 5`,
    GAME_OVER:   'Game Over',
  };

  return (
    <div
      className="h-screen flex flex-col overflow-hidden relative"
      style={{ background: 'radial-gradient(circle at 50% 50%, #12141D 0%, #0B0C10 100%)', fontFamily: "'Inter', sans-serif", color: '#E0E6ED' }}
    >
      <style>{PZ_STYLES}</style>
      <div className="gp-stars" />
      <div className="gp-nebula" />

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <header className="flex-shrink-0 relative z-10 glass-panel border-b border-white/5 px-4 py-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-[#45F3FF] animate-pulse" style={{ boxShadow: '0 0 12px #45F3FF' }} />
          <h1 className="pz-h text-lg tracking-widest text-white uppercase">Poker5O</h1>
        </div>

        {/* Center: phase / result */}
        <div className="flex items-center gap-2">
          {isRevealMode ? (
            allRevealed ? (
              <>
                <span className="text-xl">{isDraw ? '🤝' : iWon ? '🏆' : '😞'}</span>
                <span className="pz-h text-lg font-bold"
                  style={{ color: isDraw ? '#FFD700' : iWon ? '#00FF9D' : '#FF3366', textShadow: isDraw ? '0 0 15px rgba(255,215,0,0.5)' : iWon ? '0 0 15px rgba(0,255,157,0.5)' : '0 0 15px rgba(255,51,102,0.5)' }}>
                  {isDraw ? 'Draw!' : iWon ? 'You Win!' : 'You Lose!'}
                </span>
                <span className="text-gray-500 text-xs font-semibold glass-panel px-2 py-0.5 rounded-full border border-white/10">
                  {score!.player0Wins}–{score!.player1Wins}
                  {score!.draws > 0 ? ` (${score!.draws} tied)` : ''}
                </span>
                {score!.completeWinBonus && score!.isCompleteWin && (
                  <span className="text-xs font-semibold bg-[#FFD700]/10 text-[#FFD700] border border-[#FFD700]/30 rounded-full px-2 py-0.5">
                    🏆 5-0 Double!
                  </span>
                )}
              </>
            ) : (
              <>
                <span className="text-gray-500 text-xs animate-pulse glass-panel px-3 py-1 rounded-full border border-white/10">Revealing…</span>
                <button onClick={() => setRevealedCols(4)} className="text-xs text-[#45F3FF] underline font-bold">Skip</button>
              </>
            )
          ) : (
            <>
              <span className="text-xs text-gray-400 glass-panel px-3 py-1 rounded-full border border-white/10">
                {phaseLabel[gameState.phase] ?? ''}
              </span>
              {stake != null && (
                <span className="text-xs font-bold glass-panel px-3 py-1 rounded-full border border-[#FFD700]/30"
                  style={{ color: '#FFD700' }}>
                  Pot: {(stake * 2).toLocaleString()}{completeWinBonus ? ' (2×)' : ''}
                </span>
              )}
            </>
          )}
        </div>

        {/* Right actions */}
        <div className="flex items-center gap-2">
          {isRevealMode ? (
            <button
              onClick={goToLobby}
              className="pz-h text-sm tracking-widest uppercase px-5 py-2 rounded-xl transition-all border font-medium hover:scale-105"
              style={{ background: '#00FF9D', color: '#000', borderColor: '#00FF9D', boxShadow: '0 0 20px rgba(0,255,157,0.3)' }}
            >
              ← Lobby
            </button>
          ) : (
            <>
              <button onClick={() => setConfirmExit(true)} className="pz-btn text-xs px-3 py-1.5 rounded-xl border border-white/10">
                Exit
              </button>
              <button
                onClick={() => setConfirmForfeit(true)}
                className="text-xs px-3 py-1.5 rounded-xl border font-medium transition-all"
                style={{ background: 'linear-gradient(180deg, #2A2A40 0%, #1A1C23 100%)', border: '1px solid rgba(255,51,102,0.4)', color: '#FF3366' }}
              >
                Give Up
              </button>
            </>
          )}
        </div>
      </header>

      {/* ── Main content — neon-bordered game area ─────────────────────────── */}
      <div
        className="relative z-10 flex-1 flex flex-col overflow-hidden mx-2 my-2 rounded-2xl"
        style={{
          border: '1px solid rgba(69,243,255,0.3)',
          boxShadow: '0 0 40px rgba(69,243,255,0.08), inset 0 0 30px rgba(69,243,255,0.02)',
        }}
      >
        {/* Opponent grid */}
        <PlayerGrid
          player={themPlayer}
          isMe={false}
          currentRow={gameState.currentRow}
          drawnCard={null}
          isMyTurn={!isMyTurn}
          phase={gameState.phase}
          onPlaceCard={() => {}}
          avatarUrl={gameState.players[opponentIndex]?.avatarUrl}
          cardW={cardW}
          cardH={cardH}
          revealAll={isRevealMode}
        />

        {/* ── Center strip ──────────────────────────────────────────────── */}
        <div
          className="flex-shrink-0 relative"
          style={{
            height: isRevealMode ? 180 : 120,
            background: 'rgba(0,0,0,0.35)',
            borderTop: '1px solid rgba(69,243,255,0.12)',
            borderBottom: '1px solid rgba(69,243,255,0.12)',
          }}
        >
          {isRevealMode ? (
            <div className="h-full flex flex-col items-center justify-center px-1">
              <div className="flex justify-around w-full">
                {score!.columnResults.map((r, i) => {
                  if (i > revealedCols) return <div key={i} style={{ width: cardW }} />;
                  const myWon = r.winner === playerIndex;
                  const draw  = r.winner === 'draw';
                  return (
                    <div key={i} style={{ width: cardW }} className="flex flex-col items-center gap-0.5">
                      <span
                        className="text-6xl font-black leading-none select-none transition-all duration-300"
                        style={{
                          color: myWon ? '#00FF9D' : draw ? '#FFD700' : '#FF3366',
                          textShadow: myWon ? '0 0 20px rgba(0,255,157,0.7)' : draw ? '0 0 20px rgba(255,215,0,0.7)' : '0 0 20px rgba(255,51,102,0.7)',
                        }}
                      >
                        {myWon ? '✓' : draw ? '—' : '✗'}
                      </span>
                      <span className="pz-h text-xl whitespace-nowrap leading-tight text-center" style={{ color: '#45F3FF' }}>
                        {r[playerIndex === 0 ? 'player0Hand' : 'player1Hand'].label}
                      </span>
                      <span className="pz-h text-xl text-gray-500 whitespace-nowrap leading-tight text-center">
                        {r[playerIndex === 0 ? 'player1Hand' : 'player0Hand'].label}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="h-full flex items-center justify-center gap-6">
              {/* Deck */}
              <div className="flex flex-col items-center gap-1">
                <div
                  className="rounded-lg flex items-center justify-center"
                  style={{
                    width: 56, height: 84,
                    background: 'linear-gradient(135deg, #1a1a2e 0%, #0d0d1a 100%)',
                    border: '1px solid rgba(69,243,255,0.3)',
                    boxShadow: '0 0 12px rgba(69,243,255,0.15)',
                  }}
                >
                  <span className="pz-h font-bold text-lg" style={{ color: '#45F3FF' }}>{gameState.deck.length}</span>
                </div>
                <span className="text-xs tracking-widest" style={{ color: 'rgba(69,243,255,0.4)' }}>Deck</span>
              </div>

              {/* Draw / drawn card */}
              <DrawnCard
                card={isMyTurn ? gameState.drawnCard : null}
                isMyTurn={isMyTurn}
                canDraw={drawAllowed}
                onDraw={handleDraw}
                cardW={56}
                cardH={84}
              />

              {/* Timer */}
              {timerSeconds !== null && (
                <div className="absolute right-4 flex flex-col items-center">
                  {isMyTurn ? (
                    <div
                      className={`glass-panel flex flex-col items-center px-4 py-2 rounded-2xl border font-bold tabular-nums
                        ${timerSeconds <= 10 ? 'border-red-500/50 text-red-400 animate-pulse' : 'border-[#45F3FF]/40 text-white'}`}
                      style={{ boxShadow: timerSeconds <= 10 ? undefined : '0 0 20px rgba(69,243,255,0.15)' }}
                    >
                      <span className={`text-3xl leading-none ${timerSeconds <= 10 ? 'animate-pulse' : ''}`}>{timerSeconds}</span>
                      <span className="text-[10px] font-normal mt-0.5 uppercase tracking-widest" style={{ color: 'rgba(69,243,255,0.6)' }}>your turn</span>
                    </div>
                  ) : (
                    <div className="glass-panel flex flex-col items-center px-4 py-2 rounded-2xl border border-white/10 text-gray-600">
                      <span className="text-lg leading-none tabular-nums">{timerSeconds}</span>
                      <span className="text-[10px] font-normal mt-0.5 uppercase tracking-widest">opp.</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* My grid */}
        <PlayerGrid
          player={myPlayer}
          isMe={true}
          currentRow={gameState.currentRow}
          drawnCard={isRevealMode ? null : gameState.drawnCard}
          isMyTurn={isMyTurn}
          phase={gameState.phase}
          onPlaceCard={isRevealMode ? () => {} : handlePlace}
          avatarUrl={profile.avatar_url}
          cardW={cardW}
          cardH={cardH}
          revealAll={isRevealMode}
        />
      </div>

      {/* ── "Who goes first" banner ─────────────────────────────────────────── */}
      {startingPlayer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none">
          <div className="flex flex-col items-center gap-3 animate-fade-in">
            <span className="text-6xl">🃏</span>
            <div className="glass-panel border border-white/10 rounded-3xl px-10 py-6 shadow-2xl text-center">
              <p className="text-gray-500 text-xs font-bold uppercase tracking-widest mb-1">First to play</p>
              <p className="pz-h text-4xl"
                style={{
                  color: startingPlayer.index === playerIndex ? '#45F3FF' : '#E0E6ED',
                  textShadow: startingPlayer.index === playerIndex ? '0 0 20px rgba(69,243,255,0.5)' : 'none',
                }}>
                {startingPlayer.index === playerIndex ? 'You' : startingPlayer.name}
              </p>
              {startingPlayer.index === playerIndex && (
                <p className="text-sm mt-2" style={{ color: 'rgba(69,243,255,0.6)' }}>Get ready…</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Opponent disconnected modal ─────────────────────────────────────── */}
      {opponentLeft && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
          <div className="glass-panel border border-white/10 rounded-3xl p-6 w-full max-w-sm shadow-2xl space-y-4">
            <div className="text-center space-y-2">
              <p className="text-3xl animate-pulse">📡</p>
              <h2 className="pz-h text-2xl text-[#45F3FF]">Opponent Disconnected</h2>
              <p className="text-gray-400 text-sm">They have 10 minutes to reconnect before the game is abandoned.</p>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setOpponentLeft(false)} className="pz-btn flex-1 py-2 rounded-2xl font-medium border border-white/10">Wait</button>
              <button onClick={() => { setOpponentLeft(false); navigate('/lobby'); }}
                className="flex-1 py-2 rounded-2xl font-medium border border-[#45F3FF]/40 text-[#45F3FF] transition-all hover:bg-[#45F3FF]/10">
                Go to Lobby
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Give Up confirmation ────────────────────────────────────────────── */}
      {confirmForfeit && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
          <div className="glass-panel border border-white/10 rounded-3xl p-6 w-full max-w-sm shadow-2xl space-y-4">
            <div className="text-center space-y-2">
              <p className="text-3xl">🏳️</p>
              <h2 className="pz-h text-2xl text-[#FF3366]">Give Up?</h2>
              <p className="text-gray-400 text-sm">You will forfeit the game and lose your stake. This cannot be undone.</p>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setConfirmForfeit(false)} className="pz-btn flex-1 py-2 rounded-2xl font-medium border border-white/10">Cancel</button>
              <button onClick={handleForfeit}
                className="flex-1 py-2 rounded-2xl font-medium border border-[#FF3366]/40 text-[#FF3366] transition-all hover:bg-[#FF3366]/10">
                Yes, Give Up
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Exit to Lobby confirmation ──────────────────────────────────────── */}
      {confirmExit && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
          <div className="glass-panel border border-white/10 rounded-3xl p-6 w-full max-w-sm shadow-2xl space-y-4">
            <div className="text-center space-y-2">
              <p className="text-3xl">🚪</p>
              <h2 className="pz-h text-2xl text-[#45F3FF]">Exit the Game?</h2>
              <p className="text-gray-400 text-sm">The game will continue and you can rejoin from the lobby.</p>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setConfirmExit(false)} className="pz-btn flex-1 py-2 rounded-2xl font-medium border border-white/10">Stay</button>
              <button onClick={() => { setConfirmExit(false); navigate('/lobby'); }}
                className="flex-1 py-2 rounded-2xl font-medium border border-[#45F3FF]/40 text-[#45F3FF] transition-all hover:bg-[#45F3FF]/10">
                Exit to Lobby
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
