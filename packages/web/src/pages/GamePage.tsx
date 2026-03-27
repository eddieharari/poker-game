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

function prepareReveal(state: GameState, revealedCols: number, myPlayerIndex: 0 | 1): GameState {
  const opponentIndex: 0 | 1 = myPlayerIndex === 0 ? 1 : 0;
  return {
    ...state,
    players: state.players.map((p, pIdx) => ({
      ...p,
      columns: p.columns.map((col, colIdx) =>
        col.map((card, rowIdx) => ({
          ...card,
          // Only hide the opponent's row-4 card until that column is revealed
          faceDown: pIdx === opponentIndex && rowIdx === 4 && colIdx > revealedCols,
        }))
      ),
    })) as [Player, Player],
  };
}

// ─── Shared PazPaz-style CSS ──────────────────────────────────────────────────

const PZ_STYLES = `
  @import url('https://fonts.googleapis.com/css2?family=Fredoka+One&family=Nunito:wght@400;600;800&display=swap');
  .pz-h { font-family: 'Fredoka One', cursive !important; }
  .pz-btn { transition: all 0.1s; position: relative; top: 0; }
  .pz-btn:active { top: 4px; box-shadow: none !important; }
`;

// ─── GamePage ─────────────────────────────────────────────────────────────────

export function GamePage() {
  const { roomId } = useParams<{ roomId: string }>();
  const navigate = useNavigate();
  const { profile } = useAuthStore();
  const { gameState, score, playerIndex, stake, completeWinBonus, opponentLeft, setOpponentLeft, startingPlayer, reset } = useGameStore();

  useSocketEvents();
  const { cardW, cardH } = useCardSize();
  const [confirmForfeit, setConfirmForfeit] = useState(false);
  const [confirmExit, setConfirmExit] = useState(false);
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
      <div className="min-h-screen flex items-center justify-center"
        style={{ background: 'linear-gradient(135deg, #87CEEB 0%, #E0F6FF 100%)' }}>
        <style>{PZ_STYLES}</style>
        <div className="text-center space-y-3 bg-white/80 p-10 rounded-3xl border-2 border-white shadow-xl">
          <div className="text-6xl animate-bounce">🃏</div>
          <p className="pz-h text-2xl text-blue-600">Connecting to game…</p>
        </div>
      </div>
    );
  }

  const opponentIndex = playerIndex === 0 ? 1 : 0;
  const isRevealMode = !!score;
  const allRevealed  = isRevealMode && revealedCols >= 4;

  // In reveal mode use the progressively-revealed state; otherwise live state
  const displayState = isRevealMode ? prepareReveal(gameState, revealedCols, playerIndex) : gameState;
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
      style={{ background: 'linear-gradient(135deg, #87CEEB 0%, #E0F6FF 100%)', fontFamily: "'Nunito', sans-serif" }}
    >
      <style>{PZ_STYLES}</style>
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <header className="flex-shrink-0 bg-white/85 border-b-2 border-white/80 px-4 py-2 flex items-center justify-between shadow-sm">
        <div className="flex items-center gap-3">
          <h1 className="pz-h text-xl text-blue-700">Poker5O</h1>
        </div>

        {/* Center: phase label OR result banner */}
        <div className="flex items-center gap-3">
          {isRevealMode ? (
            allRevealed ? (
              <>
                <span className="text-2xl">{isDraw ? '🤝' : iWon ? '🏆' : '😞'}</span>
                <span className="pz-h text-xl text-blue-700">
                  {isDraw ? 'Draw!' : iWon ? 'You Win!' : 'You Lose!'}
                </span>
                <span className="text-gray-500 text-sm font-semibold">
                  {score!.player0Wins}–{score!.player1Wins}
                  {score!.draws > 0 ? ` (${score!.draws} tied)` : ''}
                </span>
                {score!.completeWinBonus && score!.isCompleteWin && (
                  <span className="text-xs font-semibold bg-yellow-100 text-yellow-700 border border-yellow-300 rounded-full px-2 py-0.5">
                    🏆 Complete Win — Double Payout!
                  </span>
                )}
              </>
            ) : (
              <>
                <span className="text-gray-500 text-sm font-semibold animate-pulse">Revealing results…</span>
                <button onClick={() => setRevealedCols(4)} className="text-xs text-blue-500 underline font-bold">
                  Skip
                </button>
              </>
            )
          ) : (
            <>
              <span className="text-xs text-gray-500 font-bold bg-gray-100 px-3 py-1 rounded-full">
                {phaseLabel[gameState.phase] ?? ''}
              </span>
              {stake != null && (
                <span className="text-xs font-bold text-yellow-700 bg-yellow-100 border border-yellow-300 px-3 py-1 rounded-full">
                  Pot: {(stake * 2).toLocaleString()} chips{completeWinBonus ? ' (2x bonus)' : ''}
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
              className="pz-btn px-5 py-2 rounded-2xl bg-blue-500 text-white pz-h text-base shadow-[0_4px_0_#2563eb] hover:bg-blue-400 border-2 border-blue-400"
            >
              ← Back to Lobby
            </button>
          ) : (
            <>
              <button
                onClick={() => setConfirmExit(true)}
                className="pz-btn text-xs text-gray-500 hover:text-gray-700 border-2 border-gray-200 hover:border-gray-300 bg-white px-3 py-1.5 rounded-xl font-bold transition-colors shadow-sm"
              >
                Exit to Lobby
              </button>
              <button
                onClick={() => setConfirmForfeit(true)}
                className="pz-btn text-xs text-red-500 hover:text-red-600 border-2 border-red-200 hover:border-red-300 bg-white px-3 py-1.5 rounded-xl font-bold transition-colors shadow-sm"
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
          className="flex-shrink-0 border-y-2 border-white/80 bg-white/70 relative"
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
                      <span className="text-[9px] text-blue-600 font-bold whitespace-nowrap leading-none text-center">
                        {r[playerIndex === 0 ? 'player0Hand' : 'player1Hand'].label}
                      </span>
                      {/* Opponent hand strength */}
                      <span className="text-[9px] text-gray-400 whitespace-nowrap leading-none text-center">
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
            <div className="text-center bg-white/95 rounded-3xl px-10 py-6 border-2 border-white shadow-2xl">
              <p className="text-gray-400 text-sm font-bold uppercase tracking-widest mb-1">First to play</p>
              <p className={`pz-h text-4xl ${startingPlayer.index === playerIndex ? 'text-blue-600' : 'text-gray-700'}`}>
                {startingPlayer.index === playerIndex ? 'You' : startingPlayer.name}
              </p>
              {startingPlayer.index === playerIndex && (
                <p className="text-blue-400 text-sm font-semibold mt-2">Get ready…</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Opponent disconnected modal ─────────────────────────────────────── */}
      {opponentLeft && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl border-2 border-white p-6 w-full max-w-sm shadow-2xl space-y-4">
            <div className="text-center space-y-2">
              <p className="text-3xl animate-pulse">📡</p>
              <h2 className="pz-h text-2xl text-blue-700">Opponent Disconnected</h2>
              <p className="text-gray-500 text-sm font-semibold">
                Your opponent lost connection. They have 10 minutes to reconnect before the game is abandoned.
              </p>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setOpponentLeft(false)}
                className="pz-btn flex-1 py-2 rounded-2xl bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold border-2 border-gray-200 shadow-[0_4px_0_#d1d5db]"
              >
                Wait
              </button>
              <button
                onClick={() => { setOpponentLeft(false); navigate('/lobby'); }}
                className="pz-btn flex-1 py-2 rounded-2xl bg-blue-500 hover:bg-blue-400 text-white font-bold border-2 border-blue-400 shadow-[0_4px_0_#2563eb]"
              >
                Go to Lobby
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Give Up confirmation ────────────────────────────────────────────── */}
      {confirmForfeit && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl border-2 border-white p-6 w-full max-w-sm shadow-2xl space-y-4">
            <div className="text-center space-y-2">
              <p className="text-3xl">🏳️</p>
              <h2 className="pz-h text-2xl text-blue-700">Give Up?</h2>
              <p className="text-gray-500 text-sm font-semibold">
                You will forfeit the game and lose your stake. This cannot be undone.
              </p>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setConfirmForfeit(false)}
                className="pz-btn flex-1 py-2 rounded-2xl bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold border-2 border-gray-200 shadow-[0_4px_0_#d1d5db]"
              >
                Cancel
              </button>
              <button
                onClick={handleForfeit}
                className="pz-btn flex-1 py-2 rounded-2xl bg-red-500 hover:bg-red-400 text-white font-bold border-2 border-red-400 shadow-[0_4px_0_#dc2626]"
              >
                Yes, Give Up
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Exit to Lobby confirmation ──────────────────────────────────────── */}
      {confirmExit && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl border-2 border-white p-6 w-full max-w-sm shadow-2xl space-y-4">
            <div className="text-center space-y-2">
              <p className="text-3xl">🚪</p>
              <h2 className="pz-h text-2xl text-blue-700">Exit the Game?</h2>
              <p className="text-gray-500 text-sm font-semibold">
                You'll leave the game in progress. The game will continue and you can rejoin from the lobby.
              </p>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setConfirmExit(false)}
                className="pz-btn flex-1 py-2 rounded-2xl bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold border-2 border-gray-200 shadow-[0_4px_0_#d1d5db]"
              >
                Stay
              </button>
              <button
                onClick={() => { setConfirmExit(false); navigate('/lobby'); }}
                className="pz-btn flex-1 py-2 rounded-2xl bg-blue-500 hover:bg-blue-400 text-white font-bold border-2 border-blue-400 shadow-[0_4px_0_#2563eb]"
              >
                Exit to Lobby
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
