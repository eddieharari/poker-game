import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { getSocket } from '../socket.js';
import { useAuthStore } from '../store/authStore.js';
import { getLegalMoves, applyMove } from '@poker5o/shared';
import type {
  BackgammonGameState,
  BackgammonMove,
  BackgammonMoveSource,
  DoublingCubeValue,
} from '@poker5o/shared';

// ─── Styles ───────────────────────────────────────────────────────────────────

const BG_STYLES = `
  @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;600;700&display=swap');
  .bg-h { font-family: 'Space Grotesk', sans-serif !important; }
  .checker-white { background: radial-gradient(circle at 35% 35%, #fff, #c8b08a); border: 2px solid #8a6a3a; }
  .checker-black { background: radial-gradient(circle at 35% 35%, #555, #1a1a1a); border: 2px solid #666; }
  @keyframes bg-pulse { 0%,100% { opacity:0.4; } 50% { opacity:1; } }
  .legal-dot { animation: bg-pulse 1.2s infinite; }
  @media (orientation: portrait) and (max-width: 900px) {
    .bg-portrait-overlay { display: flex !important; }
    .bg-game { display: none !important; }
  }
`;

// ─── Board orientation ────────────────────────────────────────────────────────
// Player 0 (white): home board 1-6, moves 24→1
//   TOP=[13..24], BOTTOM=[12..1]  (home board at BOTTOM-RIGHT)
// Player 1 (black): home board 19-24, moves 1→24
//   TOP=[12..1],  BOTTOM=[13..24] (home board at BOTTOM-RIGHT, flipped view)

function getPoints(pi: 0 | 1) {
  if (pi === 1) return {
    top:    [12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1],
    bottom: [13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24],
  };
  return {
    top:    [13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24],
    bottom: [12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1],
  };
}

// ─── Main component ───────────────────────────────────────────────────────────

export function BackgammonPage() {
  const { roomId } = useParams<{ roomId: string }>();
  const navigate   = useNavigate();
  const { profile } = useAuthStore();
  const socket = getSocket();

  const [state, setState] = useState<BackgammonGameState | null>(null);
  const [playerIndex, setPlayerIndex] = useState<0 | 1 | null>(null);

  // Client-side tentative move buffer (shown before confirmation)
  const [baseState,       setBaseState]       = useState<BackgammonGameState | null>(null);
  const [tentativeMoves,  setTentativeMoves]  = useState<BackgammonMove[]>([]);
  const [tentativeState,  setTentativeState]  = useState<BackgammonGameState | null>(null);
  const [movedDests,      setMovedDests]      = useState<Set<string>>(new Set()); // stringified BackgammonMoveDest

  const [forfeitConfirm,  setForfeitConfirm]  = useState(false);
  const [ignorePortrait,  setIgnorePortrait]  = useState(false);

  // Determine our player index
  useEffect(() => {
    if (!state || !profile) return;
    if (state.players[0].id === profile.id) setPlayerIndex(0);
    else if (state.players[1].id === profile.id) setPlayerIndex(1);
  }, [state?.players[0]?.id, state?.players[1]?.id, profile?.id]);

  // Socket setup
  useEffect(() => {
    if (!roomId) return;
    socket.emit('backgammon:join', { roomId });

    const onState = (s: BackgammonGameState) => setState(s);
    const onError = ({ message }: { message: string }) => toast.error(message);
    const onForfeited = ({ forfeiterIndex }: { forfeiterIndex: 0 | 1 }) => {
      toast(forfeiterIndex === playerIndex ? 'You forfeited.' : 'Opponent forfeited — you win!', {
        icon: forfeiterIndex === playerIndex ? '🏳️' : '🏆', duration: 4000,
      });
    };

    socket.on('backgammon:state',    onState);
    socket.on('backgammon:error',    onError);
    socket.on('backgammon:forfeited', onForfeited);
    return () => {
      socket.off('backgammon:state',    onState);
      socket.off('backgammon:error',    onError);
      socket.off('backgammon:forfeited', onForfeited);
    };
  }, [roomId, socket, playerIndex]);

  // Reset / initialize tentative state whenever server state or our player index changes
  useEffect(() => {
    if (!state || playerIndex === null) return;
    const isMyMovingTurn = state.phase === 'MOVING' && state.currentPlayerIndex === playerIndex;
    setBaseState(isMyMovingTurn ? state : null);
    setTentativeMoves([]);
    setTentativeState(isMyMovingTurn ? state : null);
    setMovedDests(new Set());
  }, [state, playerIndex]);

  const displayState = tentativeState ?? state;
  const pi: 0 | 1    = playerIndex ?? 0;
  const oppIdx: 0 | 1 = pi === 0 ? 1 : 0;
  const isMyTurn = state?.currentPlayerIndex === playerIndex;
  const myPlayer  = state ? state.players[pi]     : null;
  const oppPlayer = state ? state.players[oppIdx] : null;

  // Legal sources in the current tentative state for highlighting
  const legalMoves = (displayState && isMyTurn && displayState.phase === 'MOVING' && displayState.currentPlayerIndex === playerIndex && playerIndex !== null)
    ? getLegalMoves(displayState)
    : [];
  const legalSources = new Set(legalMoves.map(m => String(m.from)));

  // Turn is complete when all dice used (applyMove auto-advances currentPlayer)
  const turnComplete = tentativeState !== null
    && tentativeMoves.length > 0
    && (tentativeState.phase !== 'MOVING' || tentativeState.currentPlayerIndex !== pi);

  // ─── Handlers ───────────────────────────────────────────────────────────────

  function handlePointClick(src: BackgammonMoveSource) {
    if (!isMyTurn || playerIndex === null || !state) return;
    if (state.phase !== 'MOVING') return;

    const current = tentativeState ?? baseState ?? state;
    if (current.phase !== 'MOVING' || current.currentPlayerIndex !== playerIndex) return;

    // Clicking a destination of a move made this turn → undo the entire turn
    if (movedDests.has(String(src)) && tentativeMoves.length > 0) {
      setTentativeMoves([]);
      setTentativeState(baseState);
      setMovedDests(new Set());
      return;
    }

    // Find legal moves from this source, pick highest die
    const moves = getLegalMoves(current);
    const fromHere = moves.filter(m => m.from === src);
    if (fromHere.length === 0) return;
    const best = fromHere.reduce((a, b) => b.dieUsed > a.dieUsed ? b : a);

    const newTState = applyMove(current, best);
    setTentativeMoves(prev => [...prev, best]);
    setTentativeState(newTState);
    setMovedDests(prev => new Set([...prev, String(best.to)]));
  }

  function handleConfirmTurn() {
    if (!roomId || !turnComplete || tentativeMoves.length === 0) return;
    socket.emit('backgammon:submit_turn', { roomId, moves: tentativeMoves });
    setTentativeMoves([]);
    setTentativeState(null);
    setBaseState(null);
    setMovedDests(new Set());
  }

  function handleRoll() {
    if (!roomId || !isMyTurn || state?.phase !== 'ROLLING') return;
    socket.emit('backgammon:roll', { roomId });
  }

  function handleOfferDouble() {
    if (!roomId) return;
    socket.emit('backgammon:offer_double', { roomId });
  }

  function handleAcceptDouble() {
    if (!roomId) return;
    socket.emit('backgammon:accept_double', { roomId });
  }

  function handleDropDouble() {
    if (!roomId) return;
    socket.emit('backgammon:drop_double', { roomId });
  }

  function handleForfeit() {
    if (!roomId) return;
    socket.emit('backgammon:forfeit', { roomId });
    setForfeitConfirm(false);
    navigate('/lobby');
  }

  // ─── Loading ──────────────────────────────────────────────────────────────

  if (!state) {
    return (
      <div className="h-screen flex items-center justify-center bg-[#0f0800]">
        <p className="text-white/50 text-sm">Connecting…</p>
      </div>
    );
  }

  const { cube, phase, gameResult, matchConfig } = state;
  const isMatchMode = matchConfig.mode === 'match';
  const canOfferDouble = isMyTurn && phase === 'ROLLING' && (cube.owner === null || cube.owner === pi);
  const { top: TOP_POINTS, bottom: BOTTOM_POINTS } = getPoints(pi);

  return (
    <div className="bg-game h-screen flex flex-col bg-[#0f0800] text-white select-none overflow-hidden"
      style={{ fontFamily: "'Inter', sans-serif" }}>
      <style>{BG_STYLES}</style>

      {/* Portrait hint (hidden unless portrait + mobile via CSS) */}
      {!ignorePortrait && (
        <div className="bg-portrait-overlay hidden fixed inset-0 z-50 bg-[#0f0800] flex-col items-center justify-center p-8">
          <p className="text-6xl mb-5">↻</p>
          <p className="text-white text-xl font-bold mb-2">Rotate your device</p>
          <p className="text-white/50 text-sm text-center">Backgammon is best played in landscape</p>
          <button onClick={() => setIgnorePortrait(true)}
            className="mt-6 text-xs text-white/30 underline">Continue in portrait</button>
        </div>
      )}

      {/* Header */}
      <header className="flex-shrink-0 flex items-center justify-between px-4 pt-2 pb-1">
        <button onClick={() => navigate('/lobby')} className="text-white/40 hover:text-white text-sm">← Lobby</button>
        <div className="text-center">
          <p className="bg-h text-xs font-semibold tracking-widest text-[#FFD700] uppercase">Backgammon</p>
          <p className="text-[10px] text-white/40">
            {isMatchMode
              ? `Match to ${matchConfig.matchLength} · ${(matchConfig.matchStake ?? 0).toLocaleString()} chips`
              : `${matchConfig.pointValue} chips/pt`}
          </p>
        </div>
        <button onClick={() => setForfeitConfirm(true)} className="text-xs text-red-400/60 hover:text-red-400">Give Up</button>
      </header>

      {/* Opponent bar */}
      <PlayerBar player={oppPlayer} isTop showScore={isMatchMode} />

      {/* Board — fills remaining vertical space */}
      <div className="flex-1 min-h-0 px-2">
        <BoardSurface
          state={displayState ?? state}
          playerIndex={pi}
          legalSources={legalSources}
          movedDests={movedDests}
          dice={displayState?.dice ?? null}
          cube={cube}
          canOfferDouble={canOfferDouble}
          topPoints={TOP_POINTS}
          bottomPoints={BOTTOM_POINTS}
          onPointClick={handlePointClick}
          onOfferDouble={handleOfferDouble}
        />
      </div>

      {/* My bar */}
      <PlayerBar player={myPlayer} isTop={false} showScore={isMatchMode} />

      {/* Action area */}
      <div className="flex-shrink-0 px-4 pb-safe pb-3">
        <ActionArea
          phase={phase}
          isMyTurn={isMyTurn}
          turnComplete={turnComplete}
          onRoll={handleRoll}
          onConfirm={handleConfirmTurn}
        />
      </div>

      {/* Game over */}
      {phase === 'GAME_OVER' && gameResult && (
        <GameOverOverlay
          result={gameResult}
          players={state.players}
          playerIndex={pi}
          matchConfig={matchConfig}
          rake={state.rake ?? 0}
          onLeave={() => navigate('/lobby')}
        />
      )}

      {/* Double offer modal (shown to the non-offering player) */}
      {phase === 'AWAITING_DOUBLE' && !isMyTurn && (
        <DoubleModal
          newValue={(cube.value * 2) as DoublingCubeValue}
          offererName={state.players[state.currentPlayerIndex].name}
          onAccept={handleAcceptDouble}
          onDrop={handleDropDouble}
        />
      )}

      {/* Forfeit confirm */}
      {forfeitConfirm && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#1a1200] border border-red-500/30 rounded-2xl p-6 w-full max-w-xs space-y-4">
            <h3 className="bg-h text-lg font-semibold text-red-400 text-center">Give Up?</h3>
            <p className="text-white/60 text-sm text-center">You will forfeit and your opponent wins.</p>
            <div className="flex gap-3">
              <button onClick={() => setForfeitConfirm(false)}
                className="flex-1 py-2.5 rounded-xl border border-white/10 text-white/70 text-sm">Cancel</button>
              <button onClick={handleForfeit}
                className="flex-1 py-2.5 rounded-xl bg-red-600 text-white text-sm font-semibold">Give Up</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Player bar ───────────────────────────────────────────────────────────────

function PlayerBar({ player, isTop, showScore }: {
  player: BackgammonGameState['players'][0] | null;
  isTop: boolean;
  showScore: boolean;
}) {
  if (!player) return <div className="flex-shrink-0 h-9" />;
  return (
    <div className={`flex-shrink-0 flex items-center justify-between px-4 py-1 ${isTop ? 'opacity-80' : ''}`}>
      <div className="flex items-center gap-2">
        <img src={player.avatarUrl} alt="" className="w-7 h-7 rounded-full border border-white/20 object-cover" />
        <div>
          <p className="text-sm font-semibold text-white leading-none">{player.name}</p>
          <p className="text-[10px] text-white/40 mt-0.5">{player.color === 'white' ? '⚪ White' : '⚫ Black'}</p>
        </div>
      </div>
      <div className="flex items-center gap-3">
        {showScore && (
          <div className="text-center">
            <p className="text-base font-bold text-[#FFD700] leading-none">{player.matchScore}</p>
            <p className="text-[9px] text-white/30">pts</p>
          </div>
        )}
        <div className="text-center">
          <p className="text-base font-bold text-white leading-none">{player.off}</p>
          <p className="text-[9px] text-white/30">off</p>
        </div>
      </div>
    </div>
  );
}

// ─── Board surface ────────────────────────────────────────────────────────────

function BoardSurface({
  state, playerIndex, legalSources, movedDests, dice, cube,
  canOfferDouble, topPoints, bottomPoints, onPointClick, onOfferDouble,
}: {
  state: BackgammonGameState;
  playerIndex: 0 | 1;
  legalSources: Set<string>;
  movedDests: Set<string>;
  dice: BackgammonGameState['dice'];
  cube: BackgammonGameState['cube'];
  canOfferDouble: boolean;
  topPoints: number[];
  bottomPoints: number[];
  onPointClick: (src: BackgammonMoveSource) => void;
  onOfferDouble: () => void;
}) {
  const { board, players } = state;
  const myColor  = playerIndex === 0 ? 'white' : 'black';
  const oppIdx: 0 | 1 = playerIndex === 0 ? 1 : 0;
  const oppColor = oppIdx === 0 ? 'white' : 'black';

  const myBar  = players[playerIndex].bar;
  const oppBar = players[oppIdx].bar;
  const myOff  = players[playerIndex].off;
  const oppOff = players[oppIdx].off;

  const isBarSrc = legalSources.has('bar');

  // Render stacked checkers for a point
  function renderCheckers(point: number, isTop: boolean) {
    const pt = board[point];
    if (!pt || pt.count === 0) return null;
    const isWhite = pt.color === 'white';
    const cls = isWhite ? 'checker-white' : 'checker-black';
    const textCls = isWhite ? 'text-gray-700' : 'text-gray-300';
    const maxShow = 5;
    const cnt = Math.min(pt.count, maxShow);
    const hasOverflow = pt.count > maxShow;
    return (
      <div className={`flex ${isTop ? 'flex-col' : 'flex-col-reverse'} items-center gap-px`}>
        {Array(cnt - (hasOverflow ? 1 : 0)).fill(0).map((_, i) => (
          <div key={i} className={`w-[min(24px,4vw)] h-[min(24px,4vw)] rounded-full ${cls} flex-shrink-0`} />
        ))}
        {hasOverflow && (
          <div className={`w-[min(24px,4vw)] h-[min(24px,4vw)] rounded-full ${cls} flex items-center justify-center flex-shrink-0`}>
            <span className={`text-[10px] font-bold ${textCls}`}>{pt.count}</span>
          </div>
        )}
      </div>
    );
  }

  // Single point cell (triangle + checkers)
  function renderPoint(point: number, posIdx: number, isTop: boolean) {
    const isDark   = posIdx % 2 === 0;
    const isLegalS = legalSources.has(String(point));
    const isMovedD = movedDests.has(String(point));
    const triColor = isDark ? '#8B4513' : '#2D6A27';

    return (
      <div
        key={point}
        onClick={() => onPointClick(point)}
        className={`relative flex-1 flex ${isTop ? 'flex-col' : 'flex-col-reverse'} items-center cursor-pointer overflow-hidden
          ${isLegalS ? 'ring-1 ring-[#00FF9D]/60' : ''}
          ${isMovedD ? 'ring-2 ring-[#FFD700]' : ''}
        `}
        style={{ minWidth: 0 }}
      >
        {/* Responsive triangle */}
        <svg viewBox="0 0 1 1" preserveAspectRatio="none"
          className="absolute inset-0 w-full h-full pointer-events-none">
          {isTop
            ? <polygon points="0.5,0.92 0,0 1,0" fill={triColor} opacity="0.75" />
            : <polygon points="0.5,0.08 0,1 1,1" fill={triColor} opacity="0.75" />
          }
        </svg>
        {/* Checkers */}
        <div className={`relative z-10 w-full flex ${isTop ? 'flex-col items-center pt-0.5' : 'flex-col-reverse items-center pb-0.5'}`}>
          {renderCheckers(point, isTop)}
        </div>
        {/* Legal source dot */}
        {isLegalS && (
          <div className={`absolute ${isTop ? 'bottom-1' : 'top-1'} w-2.5 h-2.5 rounded-full bg-[#00FF9D]/70 legal-dot z-20`} />
        )}
        {/* Point number */}
        <span className={`absolute ${isTop ? 'bottom-0' : 'top-0'} text-[7px] text-white/20 z-20 select-none w-full text-center`}>{point}</span>
      </div>
    );
  }

  // Cube visual
  function CubeIcon({ small }: { small?: boolean }) {
    const sz = small ? 'w-7 h-7 text-xs' : 'w-9 h-9 text-sm';
    return (
      <div className={`${sz} rounded-lg border-2 border-[#FFD700] text-[#FFD700] font-bold flex items-center justify-center bg-[#FFD700]/10 flex-shrink-0`}>
        {cube.value === 1 ? '64' : cube.value}
      </div>
    );
  }

  return (
    <div className="h-full rounded-2xl border border-[#FFD700]/20 bg-[#1a0f00] flex flex-col overflow-hidden">

      {/* Opp bear-off strip */}
      <div className="flex-shrink-0 bg-[#0f0800] border-b border-[#FFD700]/10 px-3 py-0.5 flex items-center justify-end gap-1">
        <span className="text-[9px] text-white/25">Off:</span>
        <div className="flex gap-px flex-wrap max-w-[140px]">
          {Array(Math.min(oppOff, 15)).fill(0).map((_, i) => (
            <div key={i} className={`w-2 h-2 rounded-full ${oppColor === 'white' ? 'checker-white' : 'checker-black'}`} />
          ))}
          {oppOff === 0 && <span className="text-[9px] text-white/20">—</span>}
        </div>
      </div>

      {/* TOP ROW */}
      <div className="flex flex-1 min-h-0 px-1 pt-0.5 gap-px">
        {topPoints.slice(0, 6).map((p, i) => renderPoint(p, i, true))}

        {/* Center bar top half (opp's bar + cube if opp owns) */}
        <div
          className="flex-shrink-0 flex flex-col items-center justify-start gap-1 pt-1"
          style={{ width: 28 }}
        >
          {cube.owner === oppIdx && <CubeIcon small />}
          {oppBar > 0 && (
            <div className={`w-6 h-6 rounded-full ${oppColor === 'white' ? 'checker-white' : 'checker-black'} flex items-center justify-center`}>
              {oppBar > 1 && <span className="text-[9px] font-bold text-gray-700">{oppBar}</span>}
            </div>
          )}
        </div>

        {topPoints.slice(6).map((p, i) => renderPoint(p, i + 6, true))}
      </div>

      {/* CENTER DIVIDER — dice + centered cube + double offer */}
      <div className="flex-shrink-0 flex items-center justify-center gap-3 bg-[#0f0800] px-2" style={{ height: 54 }}>
        {/* Cube if unclaimed (centered on board) */}
        {cube.owner === null && <CubeIcon />}

        {/* Dice */}
        {dice && (
          <div className="flex items-center gap-1.5">
            {dice.values.map((v, i) => {
              const inRem = dice.remaining.filter(r => r === v).length;
              const total = dice.values.filter(x => x === v).length;
              const used  = i < (total - inRem);
              return <Die key={i} value={v} used={used} />;
            })}
            {/* Extra 2 dice for doubles */}
            {dice.values[0] === dice.values[1] && (
              <div className="flex gap-1 ml-0.5">
                {[0, 1].map(i => (
                  <Die key={`e${i}`} value={dice.values[0]} used={dice.remaining.length <= i} small />
                ))}
              </div>
            )}
          </div>
        )}

        {/* Double offer button (in divider when rolling, no dice yet) */}
        {canOfferDouble && !dice && (
          <button onClick={onOfferDouble}
            className="text-xs px-2.5 py-1.5 rounded-lg bg-[#FFD700]/10 border border-[#FFD700]/30 text-[#FFD700] font-semibold hover:bg-[#FFD700]/20">
            ×{cube.value * 2}
          </button>
        )}
      </div>

      {/* BOTTOM ROW */}
      <div className="flex flex-1 min-h-0 px-1 pb-0.5 gap-px">
        {bottomPoints.slice(0, 6).map((p, i) => renderPoint(p, i, false))}

        {/* Center bar bottom half (my bar + cube if mine) */}
        <div
          onClick={() => myBar > 0 && isBarSrc ? onPointClick('bar') : undefined}
          className={`flex-shrink-0 flex flex-col items-center justify-end gap-1 pb-1
            ${isBarSrc && myBar > 0 ? 'cursor-pointer ring-1 ring-[#00FF9D]/60 rounded' : ''}
          `}
          style={{ width: 28 }}
        >
          {myBar > 0 && (
            <div className={`w-6 h-6 rounded-full ${myColor === 'white' ? 'checker-white' : 'checker-black'} flex items-center justify-center
              ${movedDests.has('bar') ? 'ring-2 ring-[#FFD700]' : ''}
            `}>
              {myBar > 1 && <span className="text-[9px] font-bold text-gray-300">{myBar}</span>}
            </div>
          )}
          {cube.owner === playerIndex && <CubeIcon small />}
        </div>

        {bottomPoints.slice(6).map((p, i) => renderPoint(p, i + 6, false))}
      </div>

      {/* My bear-off strip */}
      <div className="flex-shrink-0 bg-[#0f0800] border-t border-[#FFD700]/10 px-3 py-0.5 flex items-center justify-end gap-1">
        <span className="text-[9px] text-white/25">Off:</span>
        <div className="flex gap-px flex-wrap max-w-[140px]">
          {Array(Math.min(myOff, 15)).fill(0).map((_, i) => (
            <div key={i} className={`w-2 h-2 rounded-full ${myColor === 'white' ? 'checker-white' : 'checker-black'}`} />
          ))}
          {myOff === 0 && <span className="text-[9px] text-white/20">—</span>}
        </div>
      </div>
    </div>
  );
}

// ─── Die ──────────────────────────────────────────────────────────────────────

function Die({ value, used, small }: { value: number; used: boolean; small?: boolean }) {
  const sz = small ? 'w-7 h-7' : 'w-9 h-9';
  const pipSz = small ? 'w-4 h-4' : 'w-6 h-6';
  const dotSz = small ? 'w-1 h-1' : 'w-1.5 h-1.5';
  const pips = getPips(value);
  return (
    <div className={`${sz} rounded-lg flex items-center justify-center ${used ? 'bg-white/10 opacity-40' : 'bg-white shadow-lg'}`}>
      <div className={`grid grid-cols-3 gap-px ${pipSz}`}>
        {pips.map((on, i) => (
          <div key={i} className="flex items-center justify-center">
            {on && <div className={`${dotSz} rounded-full ${used ? 'bg-white/30' : 'bg-gray-800'}`} />}
          </div>
        ))}
      </div>
    </div>
  );
}

function getPips(v: number): boolean[] {
  const patterns: Record<number, number[]> = {
    1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8],
  };
  const r = Array(9).fill(false);
  (patterns[v] ?? []).forEach(i => { r[i] = true; });
  return r;
}

// ─── Action area ──────────────────────────────────────────────────────────────

function ActionArea({ phase, isMyTurn, turnComplete, onRoll, onConfirm }: {
  phase: BackgammonGameState['phase'];
  isMyTurn: boolean;
  turnComplete: boolean;
  onRoll: () => void;
  onConfirm: () => void;
}) {
  if (!isMyTurn) {
    return (
      <p className="text-center text-white/30 text-sm py-2">Opponent's turn…</p>
    );
  }

  if (phase === 'ROLLING') {
    return (
      <button onClick={onRoll}
        className="w-full py-3 rounded-xl bg-h text-sm tracking-widest uppercase font-semibold"
        style={{ background: '#00FF9D', color: '#000', boxShadow: '0 0 20px rgba(0,255,157,0.3)' }}>
        Roll Dice
      </button>
    );
  }

  if (phase === 'MOVING') {
    if (turnComplete) {
      return (
        <button onClick={onConfirm}
          className="w-full py-3 rounded-xl bg-h text-sm tracking-widest uppercase font-semibold"
          style={{ background: '#FFD700', color: '#000', boxShadow: '0 0 20px rgba(255,215,0,0.3)' }}>
          Confirm Turn
        </button>
      );
    }
    return (
      <p className="text-center text-white/40 text-sm py-2">
        Tap a checker · Tap again to undo
      </p>
    );
  }

  if (phase === 'AWAITING_DOUBLE') {
    return (
      <p className="text-center text-white/30 text-sm py-2">Waiting for opponent to respond…</p>
    );
  }

  return null;
}

// ─── Double modal ─────────────────────────────────────────────────────────────

function DoubleModal({ newValue, offererName, onAccept, onDrop }: {
  newValue: DoublingCubeValue;
  offererName: string;
  onAccept: () => void;
  onDrop: () => void;
}) {
  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-[#1a1200] border border-[#FFD700]/30 rounded-2xl p-6 w-full max-w-xs space-y-4">
        <div className="text-center">
          <div className="w-14 h-14 rounded-xl border-2 border-[#FFD700] text-[#FFD700] text-2xl font-bold flex items-center justify-center mx-auto mb-3">
            {newValue}
          </div>
          <h3 className="bg-h text-lg font-semibold text-[#FFD700]">Double Offered</h3>
          <p className="text-white/50 text-sm mt-1">
            <span className="text-white font-medium">{offererName}</span> wants to double the stakes to{' '}
            <span className="text-[#FFD700] font-bold">{newValue}×</span>
          </p>
        </div>
        <div className="flex gap-3">
          <button onClick={onDrop}
            className="flex-1 py-2.5 rounded-xl border border-red-500/40 text-red-400 text-sm font-semibold">
            Drop (lose {newValue / 2} pts)
          </button>
          <button onClick={onAccept}
            className="flex-1 py-2.5 rounded-xl bg-[#FFD700] text-black text-sm font-semibold">
            Accept
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Game over overlay ────────────────────────────────────────────────────────

function GameOverOverlay({ result, players, playerIndex, matchConfig, rake, onLeave }: {
  result: BackgammonGameState['gameResult'];
  players: BackgammonGameState['players'];
  playerIndex: 0 | 1;
  matchConfig: BackgammonGameState['matchConfig'];
  rake: number;
  onLeave: () => void;
}) {
  if (!result) return null;
  const iWon = result.winner === playerIndex;
  const isMatchMode = matchConfig.mode === 'match';
  const chipsTransfer = isMatchMode
    ? (matchConfig.matchStake ?? result.pointsWon * matchConfig.pointValue)
    : result.pointsWon * matchConfig.pointValue;
  const netChips = iWon ? chipsTransfer - rake : -chipsTransfer;

  const winLabels: Record<string, string> = {
    normal: 'Win', gammon: 'Gammon! (×2)', backgammon: 'Backgammon! (×3)', forfeit: 'Forfeit',
  };

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-[#1a1200] border border-[#FFD700]/30 rounded-2xl p-6 w-full max-w-xs space-y-4 text-center">
        <p className="text-4xl">{iWon ? '🏆' : '😞'}</p>
        <h2 className="bg-h text-2xl font-bold text-[#FFD700]">{iWon ? 'You Win!' : 'You Lose'}</h2>
        <p className="text-white/60 text-sm">{winLabels[result.winType] ?? result.winType}</p>

        <div className="space-y-2 text-left">
          <div className="flex justify-between text-sm">
            <span className="text-white/40">{isMatchMode ? 'Match stake' : `${result.pointsWon} pts × ${matchConfig.pointValue}`}</span>
            <span className="text-white font-semibold">{chipsTransfer.toLocaleString()} chips</span>
          </div>
          {rake > 0 && (
            <div className="flex justify-between text-sm">
              <span className="text-white/40">Rake</span>
              <span className="text-white/60">−{rake.toLocaleString()}</span>
            </div>
          )}
          <div className="flex justify-between text-sm border-t border-white/10 pt-2">
            <span className="text-white/70">Net</span>
            <span className={`font-bold text-lg ${netChips >= 0 ? 'text-[#00FF9D]' : 'text-red-400'}`}>
              {netChips >= 0 ? '+' : ''}{netChips.toLocaleString()}
            </span>
          </div>
        </div>

        {isMatchMode && (
          <div className="bg-white/5 rounded-xl p-3">
            <p className="text-[10px] text-white/40 mb-2 uppercase tracking-widest">Match Score</p>
            <div className="flex justify-center gap-8">
              {players.map((p, i) => (
                <div key={i} className="text-center">
                  <p className={`text-2xl font-bold ${i === result.winner ? 'text-[#FFD700]' : 'text-white/40'}`}>{p.matchScore}</p>
                  <p className="text-xs text-white/30">{p.name}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        <button onClick={onLeave} className="w-full py-3 rounded-xl font-semibold text-sm"
          style={{ background: '#00FF9D', color: '#000' }}>
          Back to Lobby
        </button>
      </div>
    </div>
  );
}
