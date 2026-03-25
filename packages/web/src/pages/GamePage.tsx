import { useEffect, useState, useRef } from 'react';
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

function prepareReveal(state: GameState, revealedCols: number): GameState {
  return {
    ...state,
    players: state.players.map(p => ({
      ...p,
      columns: p.columns.map((col, colIdx) =>
        col.map((card, rowIdx) => ({
          ...card,
          faceDown: rowIdx === 4 && colIdx > revealedCols,
        }))
      ),
    })) as [Player, Player],
  };
}

// ─── GamePage ─────────────────────────────────────────────────────────────────

export function GamePage() {
  const { roomId } = useParams<{ roomId: string }>();
  const navigate = useNavigate();
  const { profile } = useAuthStore();
  const { gameState, score, playerIndex, stake, completeWinBonus, opponentLeft, setOpponentLeft, startingPlayer, reset } = useGameStore();

  useSocketEvents();
  const { cardW, cardH } = useCardSize();
  const [confirmForfeit, setConfirmForfeit] = useState(false);
  const [timerSeconds, setTimerSeconds] = useState<number | null>(null);
  const timerIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Reveal animation: -1 = not started, 0-4 = column index revealed so far
  const [revealedCols, setRevealedCols] = useState(-1);

  // Kick off progressive reveal when score arrives
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

    // Re-join the socket.io room on reconnect (room membership is lost on disconnect)
    const handleReconnect = () => socket.emit('room:join', { roomId });
    socket.on('connect', handleReconnect);

    return () => {
      clearInterval(pingInterval);
      socket.off('connect', handleReconnect);
    };
  }, [roomId]);

  useEffect(() => {
    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }

    const deadline = gameState?.turnDeadline;
    if (!deadline) {
      setTimerSeconds(null);
      return;
    }

    const update = () => {
      const remaining = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
      setTimerSeconds(remaining);
    };
    update();
    timerIntervalRef.current = setInterval(update, 250);

    return () => {
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current);
        timerIntervalRef.current = null;
      }
    };
  }, [gameState?.turnDeadline]);

  if (!roomId || !profile) return <Navigate to="/lobby" replace />;

  if (playerIndex === null || !gameState) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundImage: 'url(/bg-poker.png)', backgroundSize: 'cover', backgroundPosition: 'center' }}>
        <div className="text-center space-y-3">
          <div className="text-5xl animate-bounce">🃏</div>
          <p className="text-white/50">Connecting to game…</p>
        </div>
      </div>
    );
  }

  const opponentIndex = playerIndex === 0 ? 1 : 0;
  const isRevealMode = !!score;
  const allRevealed  = isRevealMode && revealedCols >= 4;

  // In reveal mode use the progressively-revealed state; otherwise live state
  const displayState = isRevealMode ? prepareReveal(gameState, revealedCols) : gameState;
  const myPlayer     = displayState.players[playerIndex];
  const themPlayer   = displayState.players[opponentIndex];

  const isMyTurn    = gameState.currentPlayerIndex === playerIndex;
  const drawAllowed = canDrawCard(gameState, profile.id);

  function handleDraw() {
    if (!roomId) return;
    getSocket().emit('action:draw', { roomId });
  }

  function handleForfeit() {
    if (!roomId) return;
    getSocket().emit('game:forfeit', { roomId });
    setConfirmForfeit(false);
  }

  function handlePlace(columnIndex: number) {
    if (!roomId) return;
    getSocket().emit('action:place', { roomId, columnIndex });
  }

  function goToLobby() {
    reset();
    const { session } = useAuthStore.getState();
    useAuthStore.getState().fetchProfile(session);
    navigate('/lobby', { replace: true });
  }

  // Result info (available once score exists)
  const iWon  = score ? score.winner === playerIndex : false;
  const isDraw = score ? score.winner === 'draw' : false;

  const phaseLabel: Record<string, string> = {
    SETUP_PHASE: 'Setup — dealing first row',
    MAIN_PHASE:  `Row ${gameState.currentRow + 1} of 5`,
    GAME_OVER:   'Game Over',
  };

  return (
    <div
      className="h-screen flex flex-col overflow-hidden"
      style={{
        backgroundImage: 'url(/bg-poker.png)',
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundRepeat: 'no-repeat',
      }}
    >
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <header className="flex-shrink-0 bg-black/60 backdrop-blur-sm border-b border-white/10 px-4 py-2 flex items-center justify-between">
        <div className="flex items-center gap-3">
          {!isRevealMode && (
            <button
              onClick={() => setConfirmForfeit(true)}
              className="text-white/50 hover:text-white transition-colors"
              aria-label="Forfeit"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
          )}
          <h1 className="font-display text-lg text-gold">Poker5O</h1>
        </div>

        {/* Center: phase label OR result banner */}
        <div className="flex items-center gap-3">
          {isRevealMode ? (
            allRevealed ? (
              <>
                <span className="text-2xl">{isDraw ? '🤝' : iWon ? '🏆' : '😞'}</span>
                <span className="font-display text-xl text-gold">
                  {isDraw ? 'Draw!' : iWon ? 'You Win!' : 'You Lose!'}
                </span>
                <span className="text-white/50 text-sm">
                  {score!.player0Wins}–{score!.player1Wins}
                  {score!.draws > 0 ? ` (${score!.draws} tied)` : ''}
                </span>
                {score!.completeWinBonus && score!.isCompleteWin && (
                  <span className="text-xs font-semibold bg-gold/20 text-gold border border-gold/40 rounded-full px-2 py-0.5">
                    🏆 Complete Win — Double Payout!
                  </span>
                )}
              </>
            ) : (
              <>
                <span className="text-white/50 text-sm animate-pulse">Revealing results…</span>
                <button onClick={() => setRevealedCols(4)} className="btn-ghost text-xs px-2 py-1">
                  Skip
                </button>
              </>
            )
          ) : (
            <>
              <span className="text-xs text-white/50 bg-black/30 px-3 py-1 rounded-full">
                {phaseLabel[gameState.phase] ?? ''}
              </span>
              {stake != null && (
                <span className="text-xs font-semibold text-gold bg-gold/10 border border-gold/30 px-3 py-1 rounded-full">
                  Pot: {(stake * 2).toLocaleString()} chips{completeWinBonus ? ' (2x bonus)' : ''}
                </span>
              )}
            </>
          )}
        </div>

        {/* Right actions */}
        <div className="flex items-center gap-2">
          {isRevealMode ? (
            <button onClick={goToLobby} className="btn-primary px-4 py-1.5 text-sm">
              Back to Lobby
            </button>
          ) : (
            <>
              <button
                onClick={() => navigate('/lobby')}
                className="text-xs text-white/50 hover:text-white border border-white/20 hover:border-white/40 px-2 py-1 rounded transition-colors"
              >
                Exit to Lobby
              </button>
              <button
                onClick={() => setConfirmForfeit(true)}
                className="text-xs text-red-400/70 hover:text-red-400 border border-red-900/40 hover:border-red-500/50 px-2 py-1 rounded transition-colors"
              >
                Give Up
              </button>
            </>
          )}
        </div>
      </header>

      {/* ── Main content ───────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col overflow-hidden px-1 py-0.5">

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
          className="flex-shrink-0 border-y border-white/10 bg-black/40 relative"
          style={{ height: 120 }}
        >
          {isRevealMode ? (
            /* ── Result row: V/X badges + hand labels per column ── */
            <div className="h-full flex flex-col items-center justify-center gap-1 px-1">
              {/* Column badges */}
              <div className="flex justify-around w-full">
                {score!.columnResults.map((r, i) => {
                  if (i > revealedCols) {
                    return <div key={i} style={{ width: cardW }} />;
                  }
                  const myWon = r.winner === playerIndex;
                  const draw  = r.winner === 'draw';
                  return (
                    <div
                      key={i}
                      style={{ width: cardW }}
                      className="flex flex-col items-center gap-0.5"
                    >
                      <span
                        className={`text-2xl font-black leading-none select-none transition-all duration-300
                          ${myWon ? 'text-green-400' : draw ? 'text-yellow-400' : 'text-red-500'}`}
                      >
                        {myWon ? '✓' : draw ? '—' : '✗'}
                      </span>
                      {/* My hand strength */}
                      <span className="text-[9px] text-gold font-semibold whitespace-nowrap leading-none text-center">
                        {r[playerIndex === 0 ? 'player0Hand' : 'player1Hand'].label}
                      </span>
                      {/* Opponent hand strength */}
                      <span className="text-[9px] text-white/40 whitespace-nowrap leading-none text-center">
                        {r[playerIndex === 0 ? 'player1Hand' : 'player0Hand'].label}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            /* ── Normal draw controls ── */
            <div className="h-full flex items-center justify-center gap-6">
              {/* Deck */}
              <div className="flex flex-col items-center gap-1">
                <div
                  style={{
                    width: 56, height: 84,
                    background: `repeating-linear-gradient(45deg, rgba(255,255,255,0.07) 0, rgba(255,255,255,0.07) 1px, transparent 0, transparent 50%), repeating-linear-gradient(-45deg, rgba(255,255,255,0.07) 0, rgba(255,255,255,0.07) 1px, transparent 0, transparent 50%), linear-gradient(135deg, #1e3a8a, #1e40af)`,
                    backgroundSize: '10px 10px, 10px 10px, 100% 100%',
                  }}
                  className="rounded-lg border border-blue-700 shadow flex items-center justify-center"
                >
                  <span className="text-white font-bold text-lg">{gameState.deck.length}</span>
                </div>
                <span className="text-white/30 text-xs">Deck</span>
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

              {/* Turn countdown timer */}
              {timerSeconds !== null && (
                <div className="absolute right-4 flex flex-col items-center gap-1">
                  {isMyTurn ? (
                    <div className={`flex flex-col items-center font-bold tabular-nums transition-colors ${
                      timerSeconds <= 10 ? 'text-red-400' : timerSeconds <= 20 ? 'text-yellow-400' : 'text-white/70'
                    }`}>
                      <span className={`text-3xl leading-none ${timerSeconds <= 10 ? 'animate-pulse' : ''}`}>
                        {timerSeconds}
                      </span>
                      <span className="text-xs font-normal mt-0.5">your turn</span>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center text-white/30">
                      <span className="text-lg leading-none tabular-nums">{timerSeconds}</span>
                      <span className="text-xs font-normal mt-0.5">opp. turn</span>
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

      {/* ── "Who goes first" banner ────────────────────────────────────────── */}
      {startingPlayer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none">
          <div className="flex flex-col items-center gap-3 animate-fade-in">
            <span className="text-6xl">🃏</span>
            <div className="text-center bg-black/80 backdrop-blur-sm rounded-2xl px-10 py-6 border border-gold/40 shadow-2xl shadow-gold/10">
              <p className="text-white/60 text-sm font-medium uppercase tracking-widest mb-1">First to play</p>
              <p className={`font-display text-4xl font-bold ${startingPlayer.index === playerIndex ? 'text-gold' : 'text-white'}`}>
                {startingPlayer.index === playerIndex ? 'You' : startingPlayer.name}
              </p>
              {startingPlayer.index === playerIndex && (
                <p className="text-gold/60 text-sm mt-2">Get ready…</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Opponent disconnected modal ─────────────────────────────────────── */}
      {opponentLeft && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-felt border border-white/10 rounded-2xl p-6 w-full max-w-sm shadow-2xl space-y-4">
            <div className="text-center space-y-2">
              <p className="text-3xl animate-pulse">📡</p>
              <h2 className="font-display text-xl text-gold">Opponent Disconnected</h2>
              <p className="text-white/60 text-sm">
                Your opponent lost connection. They have 10 minutes to reconnect before the game is abandoned.
              </p>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setOpponentLeft(false)} className="btn-ghost flex-1">Wait</button>
              <button
                onClick={() => { setOpponentLeft(false); navigate('/lobby'); }}
                className="flex-1 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white font-semibold transition-colors"
              >
                Go to Lobby
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Give Up confirmation ────────────────────────────────────────────── */}
      {confirmForfeit && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-felt border border-white/10 rounded-2xl p-6 w-full max-w-sm shadow-2xl space-y-4">
            <div className="text-center space-y-2">
              <p className="text-3xl">🏳️</p>
              <h2 className="font-display text-xl text-gold">Give Up?</h2>
              <p className="text-white/60 text-sm">
                You will forfeit the game and lose your stake. This cannot be undone.
              </p>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setConfirmForfeit(false)} className="btn-ghost flex-1">Cancel</button>
              <button
                onClick={handleForfeit}
                className="flex-1 py-2 rounded-xl bg-red-600 hover:bg-red-500 text-white font-semibold transition-colors"
              >
                Yes, Give Up
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
