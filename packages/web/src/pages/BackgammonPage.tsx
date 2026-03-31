import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { getSocket } from '../socket.js';
import { useAuthStore } from '../store/authStore.js';
import { getLegalMoves } from '@poker5o/shared';
import type {
  BackgammonGameState,
  BackgammonMove,
  BackgammonMoveSource,
  BackgammonMoveDest,
  BackgammonPoint,
  DoublingCubeValue,
} from '@poker5o/shared';

// ─── Styles ───────────────────────────────────────────────────────────────────

const BG_STYLES = `
  @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;600;700&display=swap');
  .bg-h { font-family: 'Space Grotesk', sans-serif !important; }
  .bg-point-light { fill: #C8884A; }
  .bg-point-dark  { fill: #2D5A27; }
  .bg-board-surface { background: #1A0F00; }
  .checker-white { background: radial-gradient(circle at 35% 35%, #fff, #c8b08a); border: 2px solid #8a6a3a; }
  .checker-black { background: radial-gradient(circle at 35% 35%, #555, #1a1a1a); border: 2px solid #666; }
  @keyframes highlight-pulse { 0%,100% { opacity:0.5; } 50% { opacity:1; } }
  .legal-dot { animation: highlight-pulse 1s infinite; }
`;

// ─── Board constants ──────────────────────────────────────────────────────────

// Top row: points 13-24 (left to right)
// Bottom row: points 12-1 (left to right)
const TOP_POINTS    = [13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24];
const BOTTOM_POINTS = [12, 11, 10,  9,  8,  7,  6,  5,  4,  3,  2,  1];

// ─── Main component ───────────────────────────────────────────────────────────

export function BackgammonPage() {
  const { roomId } = useParams<{ roomId: string }>();
  const navigate   = useNavigate();
  const { profile } = useAuthStore();
  const [state, setState] = useState<BackgammonGameState | null>(null);
  const [playerIndex, setPlayerIndex] = useState<0 | 1 | null>(null);
  const [selected, setSelected] = useState<BackgammonMoveSource | null>(null);
  const [legalMoves, setLegalMoves] = useState<BackgammonMove[]>([]);
  const [forfeitConfirm, setForfeitConfirm] = useState(false);
  const socket = getSocket();

  // Determine our player index from state once loaded
  useEffect(() => {
    if (!state || !profile) return;
    if (state.players[0].id === profile.id) setPlayerIndex(0);
    else if (state.players[1].id === profile.id) setPlayerIndex(1);
  }, [state, profile]);

  // Socket events
  useEffect(() => {
    if (!roomId) return;

    socket.emit('backgammon:join', { roomId });

    const onState = (s: BackgammonGameState) => {
      setState(s);
      setSelected(null);
    };
    const onError = ({ message }: { message: string }) => toast.error(message);
    const onForfeited = ({ forfeiterIndex }: { forfeiterIndex: 0 | 1 }) => {
      const iMe = forfeiterIndex === playerIndex;
      toast(iMe ? 'You forfeited.' : 'Opponent forfeited — you win!', {
        icon: iMe ? '🏳️' : '🏆', duration: 4000,
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

  // Recompute legal moves whenever state / selection changes
  useEffect(() => {
    if (!state || playerIndex === null) { setLegalMoves([]); return; }
    if (state.currentPlayerIndex !== playerIndex || state.phase !== 'MOVING') {
      setLegalMoves([]); return;
    }
    setLegalMoves(getLegalMoves(state));
  }, [state, playerIndex]);

  const isMyTurn = state?.currentPlayerIndex === playerIndex;
  const myPlayer = playerIndex !== null && state ? state.players[playerIndex] : null;
  const oppPlayer = playerIndex !== null && state ? state.players[playerIndex === 0 ? 1 : 0] : null;

  // ─── Actions ───────────────────────────────────────────────────────────────

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

  function handlePointClick(point: BackgammonMoveSource) {
    if (!isMyTurn || state?.phase !== 'MOVING' || !state) return;

    if (selected === null) {
      // Check if clicking on own checker
      const color = playerIndex === 0 ? 'white' : 'black';
      if (point === 'bar') {
        if (myPlayer && myPlayer.bar > 0) setSelected('bar');
        return;
      }
      const pt = state.board[point as number] as BackgammonPoint;
      if (pt && pt.color === color && pt.count > 0) {
        setSelected(point);
      }
    } else {
      // Try to make a move
      const move = legalMoves.find(
        m => m.from === selected && m.to === point
      );
      if (move) {
        if (roomId) socket.emit('backgammon:move', { roomId, move });
        setSelected(null);
      } else if (point === selected) {
        // Deselect
        setSelected(null);
      } else {
        // Re-select different source
        const color = playerIndex === 0 ? 'white' : 'black';
        if (point !== 'bar') {
          const pt = state.board[point as number] as BackgammonPoint;
          if (pt && pt.color === color && pt.count > 0) setSelected(point);
          else setSelected(null);
        }
      }
    }
  }

  function handleBearOffClick() {
    if (!isMyTurn || state?.phase !== 'MOVING') return;
    if (selected === null) return;
    const move = legalMoves.find(m => m.from === selected && m.to === 'off');
    if (move) {
      if (roomId) socket.emit('backgammon:move', { roomId, move });
      setSelected(null);
    }
  }

  // Legal destinations for the selected source
  const legalDests = selected !== null
    ? legalMoves.filter(m => m.from === selected).map(m => m.to)
    : [];

  // Sources that have legal moves
  const legalSources = new Set(legalMoves.map(m => m.from));

  if (!state) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#0f0800]">
        <div className="text-white/60 text-sm">Connecting…</div>
      </div>
    );
  }

  const { cube, dice, phase, gameResult, matchConfig } = state;
  const isMatchMode = matchConfig.mode === 'match';

  return (
    <div className="min-h-screen flex flex-col items-center justify-start bg-[#0f0800] text-white select-none"
      style={{ fontFamily: "'Inter', sans-serif" }}>
      <style>{BG_STYLES}</style>

      {/* Header */}
      <header className="w-full max-w-lg px-4 pt-3 pb-2 flex items-center justify-between">
        <button onClick={() => navigate('/lobby')} className="text-white/40 hover:text-white text-sm flex items-center gap-1">
          ← Lobby
        </button>
        <div className="text-center">
          <p className="bg-h text-xs font-semibold tracking-widest text-[#FFD700] uppercase">
            Backgammon
          </p>
          {isMatchMode && (
            <p className="text-xs text-white/40">
              Match to {matchConfig.matchLength} · {matchConfig.pointValue} chips/pt
            </p>
          )}
          {!isMatchMode && (
            <p className="text-xs text-white/40">{matchConfig.pointValue} chips per point</p>
          )}
        </div>
        <button
          onClick={() => setForfeitConfirm(true)}
          className="text-xs text-red-400/60 hover:text-red-400 transition-colors"
        >
          Give Up
        </button>
      </header>

      {/* Opponent bar */}
      <PlayerBar player={oppPlayer} isTop showScore={isMatchMode} />

      {/* Board */}
      <div className="w-full max-w-lg px-2 my-1">
        <BoardSurface
          state={state}
          playerIndex={playerIndex ?? 0}
          selected={selected}
          legalDests={legalDests}
          legalSources={legalSources}
          onPointClick={handlePointClick}
          onBearOffClick={handleBearOffClick}
        />
      </div>

      {/* My bar */}
      <PlayerBar player={myPlayer} isTop={false} showScore={isMatchMode} />

      {/* Dice + Actions */}
      <div className="w-full max-w-lg px-4 pb-4 space-y-3 mt-1">
        {/* Dice display */}
        {dice && (
          <DiceRow dice={dice} />
        )}

        {/* Cube display */}
        <CubeRow
          cube={cube}
          playerIndex={playerIndex ?? 0}
          isMyTurn={isMyTurn}
          phase={phase}
          onOfferDouble={handleOfferDouble}
        />

        {/* Action buttons */}
        <ActionArea
          phase={phase}
          isMyTurn={isMyTurn}
          playerIndex={playerIndex ?? 0}
          cube={cube}
          onRoll={handleRoll}
          onOfferDouble={handleOfferDouble}
          onAcceptDouble={handleAcceptDouble}
          onDropDouble={handleDropDouble}
        />
      </div>

      {/* GAME OVER overlay */}
      {phase === 'GAME_OVER' && gameResult && (
        <GameOverOverlay
          result={gameResult}
          players={state.players}
          playerIndex={playerIndex ?? 0}
          matchConfig={matchConfig}
          rake={state.rake ?? 0}
          onLeave={() => navigate('/lobby')}
        />
      )}

      {/* Double offer modal (shown to the NON-offering player) */}
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
            <p className="text-white/60 text-sm text-center">You will forfeit the game and your opponent wins.</p>
            <div className="flex gap-3">
              <button onClick={() => setForfeitConfirm(false)}
                className="flex-1 py-2.5 rounded-xl border border-white/10 text-white/70 text-sm font-medium">
                Cancel
              </button>
              <button onClick={handleForfeit}
                className="flex-1 py-2.5 rounded-xl bg-red-600 text-white text-sm font-semibold">
                Give Up
              </button>
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
  if (!player) return <div className="h-12" />;
  return (
    <div className={`w-full max-w-lg px-4 py-2 flex items-center justify-between ${isTop ? 'opacity-80' : ''}`}>
      <div className="flex items-center gap-2">
        <img src={player.avatarUrl} alt="" className="w-8 h-8 rounded-full border-2 border-white/20 object-cover" />
        <div>
          <p className="text-sm font-semibold text-white">{player.name}</p>
          <p className="text-xs text-white/40">{player.color === 'white' ? '⚪ White' : '⚫ Black'}</p>
        </div>
      </div>
      <div className="flex items-center gap-3">
        {showScore && (
          <div className="text-center">
            <p className="text-lg font-bold text-[#FFD700]">{player.matchScore}</p>
            <p className="text-xs text-white/30">pts</p>
          </div>
        )}
        <div className="text-center">
          <p className="text-lg font-bold text-white">{player.off}</p>
          <p className="text-xs text-white/30">off</p>
        </div>
      </div>
    </div>
  );
}

// ─── Board surface ────────────────────────────────────────────────────────────

function BoardSurface({
  state, playerIndex, selected, legalDests, legalSources, onPointClick, onBearOffClick,
}: {
  state: BackgammonGameState;
  playerIndex: 0 | 1;
  selected: BackgammonMoveSource | null;
  legalDests: BackgammonMoveDest[];
  legalSources: Set<BackgammonMoveSource>;
  onPointClick: (p: BackgammonMoveSource) => void;
  onBearOffClick: () => void;
}) {
  const { board, players } = state;
  const myColor = playerIndex === 0 ? 'white' : 'black';
  const oppColor = playerIndex === 0 ? 'black' : 'white';

  const isLegalDest = (p: BackgammonMoveDest) => legalDests.includes(p);
  const isLegalSrc  = (p: BackgammonMoveSource) => legalSources.has(p);

  function renderCheckers(point: number, isTop: boolean) {
    const pt = board[point] as BackgammonPoint;
    if (!pt || pt.count === 0) return null;
    const isWhite = pt.color === 'white';
    const maxShow = 5;
    const showCount = pt.count > maxShow;
    const display = showCount ? maxShow - 1 : pt.count;
    const size = 'w-7 h-7';
    const checkerClass = isWhite ? 'checker-white' : 'checker-black';
    const textColor = isWhite ? 'text-gray-700' : 'text-gray-300';

    return (
      <div className={`flex flex-col ${isTop ? '' : 'flex-col-reverse'} items-center gap-0.5`}>
        {Array(display).fill(0).map((_, i) => (
          <div key={i} className={`${size} rounded-full ${checkerClass} flex items-center justify-center flex-shrink-0`} />
        ))}
        {showCount && (
          <div className={`${size} rounded-full ${checkerClass} flex items-center justify-center flex-shrink-0`}>
            <span className={`text-xs font-bold ${textColor}`}>{pt.count}</span>
          </div>
        )}
      </div>
    );
  }

  function PointCell({ point, isTop }: { point: number; isTop: boolean }) {
    const isDark   = (isTop ? point - 13 : 12 - point) % 2 === 0;
    const isSelected = selected === point;
    const isLegalS  = isLegalSrc(point);
    const isLegalD  = isLegalDest(point);

    return (
      <div
        onClick={() => onPointClick(point)}
        className={`relative flex ${isTop ? 'flex-col' : 'flex-col-reverse'} items-center cursor-pointer
          rounded-sm transition-all
          ${isSelected ? 'ring-2 ring-[#FFD700]' : ''}
          ${isLegalS && !isSelected ? 'ring-1 ring-white/30' : ''}
          ${isLegalD ? 'ring-2 ring-[#00FF9D]' : ''}
        `}
        style={{ width: 42, minHeight: 120, padding: '2px 1px' }}
      >
        {/* Triangle */}
        <div className="absolute inset-0 flex items-stretch pointer-events-none">
          <svg width="100%" height="100%" preserveAspectRatio="none" viewBox="0 0 42 120">
            {isTop
              ? <polygon points="21,110 0,0 42,0" fill={isDark ? '#8B4513' : '#2D6A27'} opacity="0.7" />
              : <polygon points="21,10 0,120 42,120" fill={isDark ? '#8B4513' : '#2D6A27'} opacity="0.7" />
            }
          </svg>
        </div>
        {/* Checkers */}
        <div className="relative z-10">{renderCheckers(point, isTop)}</div>
        {/* Legal destination dot */}
        {isLegalD && (
          <div className={`absolute ${isTop ? 'bottom-2' : 'top-2'} w-4 h-4 rounded-full bg-[#00FF9D]/70 legal-dot z-20`} />
        )}
        {/* Point number */}
        <span className={`absolute ${isTop ? 'bottom-0.5' : 'top-0.5'} text-[9px] text-white/30 z-20`}>{point}</span>
      </div>
    );
  }

  // Bar
  const myBar  = players[playerIndex].bar;
  const oppBar = players[playerIndex === 0 ? 1 : 0].bar;
  const isBarSelected = selected === 'bar';
  const isBarSrc = isLegalSrc('bar');

  // Bear-off zone
  const myOff  = players[playerIndex].off;
  const oppOff = players[playerIndex === 0 ? 1 : 0].off;
  const isBearOffDest = isLegalDest('off');

  return (
    <div className="rounded-2xl overflow-hidden border border-[#FFD700]/20 bg-[#1a0f00]">
      {/* Bear-off tray (opponent side) */}
      <div className="flex justify-end px-3 py-1.5 bg-[#0f0800] border-b border-[#FFD700]/10">
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-white/30">Borne off:</span>
          <div className="flex gap-0.5">
            {Array(Math.min(oppOff, 15)).fill(0).map((_, i) => (
              <div key={i} className={`w-3 h-3 rounded-full ${oppColor === 'white' ? 'checker-white' : 'checker-black'}`} />
            ))}
            {oppOff === 0 && <span className="text-xs text-white/20">—</span>}
          </div>
        </div>
      </div>

      {/* Top row: points 13-24 */}
      <div className="flex items-start px-2 pt-1 gap-0.5">
        {TOP_POINTS.slice(0, 6).map(p => <PointCell key={p} point={p} isTop />)}
        {/* Bar */}
        <div
          onClick={() => onPointClick('bar')}
          className={`flex flex-col items-center justify-start mx-1 cursor-pointer rounded
            ${isBarSelected ? 'ring-2 ring-[#FFD700]' : ''}
            ${isBarSrc ? 'ring-2 ring-[#FFD700]' : ''}
          `}
          style={{ width: 30, minHeight: 120 }}
        >
          {oppBar > 0 && (
            <div className={`w-6 h-6 rounded-full ${oppColor === 'white' ? 'checker-white' : 'checker-black'} flex items-center justify-center mt-1`}>
              {oppBar > 1 && <span className="text-[9px] font-bold text-gray-700">{oppBar}</span>}
            </div>
          )}
          <div className="flex-1 w-px bg-[#FFD700]/20 my-1" />
          {myBar > 0 && (
            <div className={`w-6 h-6 rounded-full ${myColor === 'white' ? 'checker-white' : 'checker-black'} flex items-center justify-center mb-1`}>
              {myBar > 1 && <span className="text-[9px] font-bold text-gray-300">{myBar}</span>}
            </div>
          )}
        </div>
        {TOP_POINTS.slice(6).map(p => <PointCell key={p} point={p} isTop />)}

        {/* Bear-off zone (top = opponent's off) */}
        <div
          onClick={isBearOffDest ? onBearOffClick : undefined}
          className={`flex flex-col items-center justify-end ml-1 px-1 rounded
            ${isBearOffDest ? 'ring-2 ring-[#00FF9D] cursor-pointer' : ''}
          `}
          style={{ width: 28, minHeight: 120 }}
        >
          {isBearOffDest && <div className="w-4 h-4 rounded-full bg-[#00FF9D]/70 legal-dot mb-2" />}
        </div>
      </div>

      {/* Divider */}
      <div className="h-3 mx-2 my-0.5 bg-[#0f0800] rounded flex items-center justify-center">
        <div className="w-full h-px bg-[#FFD700]/10" />
      </div>

      {/* Bottom row: points 12-1 */}
      <div className="flex items-end px-2 pb-1 gap-0.5">
        {BOTTOM_POINTS.slice(0, 6).map(p => <PointCell key={p} point={p} isTop={false} />)}
        {/* Bar (bottom) */}
        <div className="flex flex-col items-center justify-end mx-1" style={{ width: 30, minHeight: 120 }}>
          <div className="flex-1 w-px bg-[#FFD700]/20 my-1" />
        </div>
        {BOTTOM_POINTS.slice(6).map(p => <PointCell key={p} point={p} isTop={false} />)}

        {/* Bear-off zone (bottom = my off) */}
        <div
          onClick={isBearOffDest ? onBearOffClick : undefined}
          className={`flex flex-col items-end justify-start ml-1 px-1 rounded
            ${isBearOffDest ? 'ring-2 ring-[#00FF9D] cursor-pointer' : ''}
          `}
          style={{ width: 28, minHeight: 120 }}
        >
          {isBearOffDest && <div className="w-4 h-4 rounded-full bg-[#00FF9D]/70 legal-dot mt-2" />}
        </div>
      </div>

      {/* Bear-off tray (my side) */}
      <div className="flex justify-end px-3 py-1.5 bg-[#0f0800] border-t border-[#FFD700]/10">
        <div
          onClick={isBearOffDest ? onBearOffClick : undefined}
          className={`flex items-center gap-1.5 ${isBearOffDest ? 'cursor-pointer ring-1 ring-[#00FF9D] rounded-lg px-1' : ''}`}
        >
          <span className="text-xs text-white/30">Borne off:</span>
          <div className="flex gap-0.5">
            {Array(Math.min(myOff, 15)).fill(0).map((_, i) => (
              <div key={i} className={`w-3 h-3 rounded-full ${myColor === 'white' ? 'checker-white' : 'checker-black'}`} />
            ))}
            {myOff === 0 && <span className="text-xs text-white/20">—</span>}
          </div>
          {isBearOffDest && <span className="text-[#00FF9D] text-xs ml-1">← tap to bear off</span>}
        </div>
      </div>
    </div>
  );
}

// ─── Dice row ─────────────────────────────────────────────────────────────────

function DiceRow({ dice }: { dice: BackgammonGameState['dice'] }) {
  if (!dice) return null;
  const { values, remaining } = dice;

  return (
    <div className="flex items-center justify-center gap-2">
      {values.map((v, i) => {
        // A die is "used" if its value no longer appears in remaining
        const inRemaining = remaining.filter(r => r === v).length;
        const totalOfValue = values.filter(x => x === v).length;
        const usedCount = totalOfValue - inRemaining;
        const isUsed = i < usedCount;
        return (
          <Die key={i} value={v} used={isUsed} />
        );
      })}
      {/* For doubles, show extra dice */}
      {values[0] === values[1] && remaining.length > 0 && (
        <div className="flex gap-1 ml-1">
          {[0, 1].map(i => (
            <Die key={`extra-${i}`} value={values[0]} used={remaining.length <= i} small />
          ))}
        </div>
      )}
    </div>
  );
}

function Die({ value, used, small }: { value: number; used: boolean; small?: boolean }) {
  const size = small ? 'w-7 h-7' : 'w-10 h-10';
  const pips = getPips(value);
  return (
    <div className={`${size} rounded-lg flex items-center justify-center
      ${used ? 'bg-white/10 opacity-40' : 'bg-white shadow-lg'}
      transition-all`}
    >
      <div className={`grid grid-cols-3 gap-px ${small ? 'w-5 h-5' : 'w-7 h-7'}`}>
        {pips.map((on, i) => (
          <div key={i} className="flex items-center justify-center">
            {on && <div className={`${small ? 'w-1 h-1' : 'w-1.5 h-1.5'} rounded-full ${used ? 'bg-white/30' : 'bg-gray-800'}`} />}
          </div>
        ))}
      </div>
    </div>
  );
}

function getPips(v: number): boolean[] {
  // 9-cell grid (3x3), positions 0-8
  const patterns: Record<number, number[]> = {
    1: [4],
    2: [0, 8],
    3: [0, 4, 8],
    4: [0, 2, 6, 8],
    5: [0, 2, 4, 6, 8],
    6: [0, 2, 3, 5, 6, 8],
  };
  const res = Array(9).fill(false);
  (patterns[v] ?? []).forEach(i => { res[i] = true; });
  return res;
}

// ─── Cube row ─────────────────────────────────────────────────────────────────

function CubeRow({ cube, playerIndex, isMyTurn, phase, onOfferDouble }: {
  cube: BackgammonGameState['cube'];
  playerIndex: 0 | 1;
  isMyTurn: boolean;
  phase: BackgammonGameState['phase'];
  onOfferDouble: () => void;
}) {
  const canOffer = isMyTurn && phase === 'ROLLING' && (cube.owner === null || cube.owner === playerIndex);
  const pos = cube.owner === null ? 'center' : cube.owner === playerIndex ? 'mine' : 'theirs';
  const label = pos === 'center' ? 'Cube (centered)' : pos === 'mine' ? 'You own the cube' : 'Opponent owns cube';

  return (
    <div className="flex items-center justify-between px-1">
      <div className="flex items-center gap-2">
        <div className={`w-10 h-10 rounded-lg border-2 flex items-center justify-center font-bold text-lg
          ${pos === 'mine' ? 'border-[#FFD700] text-[#FFD700] bg-[#FFD700]/10' : 'border-white/30 text-white/50 bg-white/5'}
        `}>
          {cube.value === 1 ? '64' : cube.value}
        </div>
        <span className="text-xs text-white/40">{label}</span>
      </div>
      {canOffer && (
        <button onClick={onOfferDouble}
          className="text-xs px-3 py-1.5 rounded-lg bg-[#FFD700]/10 border border-[#FFD700]/30 text-[#FFD700] font-semibold hover:bg-[#FFD700]/20 transition-colors">
          Double → {cube.value * 2}
        </button>
      )}
    </div>
  );
}

// ─── Action area ──────────────────────────────────────────────────────────────

function ActionArea({ phase, isMyTurn, onRoll }: {
  phase: BackgammonGameState['phase'];
  isMyTurn: boolean;
  playerIndex?: 0 | 1;
  cube?: BackgammonGameState['cube'];
  onRoll: () => void;
  onOfferDouble?: () => void;
  onAcceptDouble?: () => void;
  onDropDouble?: () => void;
}) {
  if (!isMyTurn) {
    return (
      <div className="text-center py-2">
        <p className="text-white/30 text-sm">Opponent's turn…</p>
      </div>
    );
  }

  if (phase === 'ROLLING') {
    return (
      <button onClick={onRoll}
        className="w-full py-3 rounded-xl bg-h text-sm tracking-widest uppercase font-semibold transition-all hover:scale-105"
        style={{ background: '#00FF9D', color: '#000', boxShadow: '0 0 25px rgba(0,255,157,0.3)' }}>
        Roll Dice
      </button>
    );
  }

  if (phase === 'MOVING') {
    return (
      <div className="text-center py-2">
        <p className="text-white/50 text-sm">Select a checker to move</p>
      </div>
    );
  }

  if (phase === 'AWAITING_DOUBLE') {
    return (
      <div className="text-center py-2">
        <p className="text-white/30 text-sm">Waiting for opponent to respond to your double…</p>
      </div>
    );
  }

  return null;
}

// ─── Double offer modal ───────────────────────────────────────────────────────

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
          <div className="w-16 h-16 rounded-xl border-2 border-[#FFD700] text-[#FFD700] text-3xl font-bold flex items-center justify-center mx-auto mb-3">
            {newValue}
          </div>
          <h3 className="bg-h text-lg font-semibold text-[#FFD700]">Double Offered</h3>
          <p className="text-white/50 text-sm mt-1">
            <span className="text-white font-medium">{offererName}</span> wants to double the stakes to <span className="text-[#FFD700] font-bold">{newValue}×</span>
          </p>
        </div>
        <div className="flex gap-3">
          <button onClick={onDrop}
            className="flex-1 py-2.5 rounded-xl border border-red-500/40 text-red-400 text-sm font-semibold hover:bg-red-500/10 transition-colors">
            Drop (lose {(newValue / 2)} pts)
          </button>
          <button onClick={onAccept}
            className="flex-1 py-2.5 rounded-xl bg-[#FFD700] text-black text-sm font-semibold hover:opacity-90 transition-opacity">
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
  const chipsWon = result.pointsWon * matchConfig.pointValue;
  const netChips = iWon ? chipsWon - rake : -(chipsWon + rake);

  const winLabels: Record<string, string> = {
    normal: 'Win',
    gammon: 'Gammon! (×2)',
    backgammon: 'Backgammon! (×3)',
    forfeit: 'Forfeit',
  };

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-[#1a1200] border border-[#FFD700]/30 rounded-2xl p-6 w-full max-w-xs space-y-4 text-center">
        <p className="text-4xl">{iWon ? '🏆' : '😞'}</p>
        <h2 className="bg-h text-2xl font-bold text-[#FFD700]">
          {iWon ? 'You Win!' : 'You Lose'}
        </h2>
        <p className="text-white/60 text-sm">{winLabels[result.winType] ?? result.winType}</p>

        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-white/40">Points won</span>
            <span className="text-white font-semibold">{result.pointsWon} × {matchConfig.pointValue} chips</span>
          </div>
          {rake > 0 && (
            <div className="flex justify-between text-sm">
              <span className="text-white/40">Rake</span>
              <span className="text-white/60">−{rake} chips</span>
            </div>
          )}
          <div className="flex justify-between text-sm border-t border-white/10 pt-2">
            <span className="text-white/70">Net</span>
            <span className={`font-bold text-lg ${netChips >= 0 ? 'text-[#00FF9D]' : 'text-red-400'}`}>
              {netChips >= 0 ? '+' : ''}{netChips.toLocaleString()}
            </span>
          </div>
        </div>

        {matchConfig.mode === 'match' && (
          <div className="bg-white/5 rounded-xl p-3">
            <p className="text-xs text-white/40 mb-2 uppercase tracking-widest">Match Score</p>
            <div className="flex justify-center gap-6">
              {players.map((p, i) => (
                <div key={i} className="text-center">
                  <p className={`text-2xl font-bold ${i === result.winner ? 'text-[#FFD700]' : 'text-white/40'}`}>
                    {p.matchScore}
                  </p>
                  <p className="text-xs text-white/30">{p.name}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        <button onClick={onLeave}
          className="w-full py-3 rounded-xl font-semibold text-sm"
          style={{ background: '#00FF9D', color: '#000' }}>
          Back to Lobby
        </button>
      </div>
    </div>
  );
}
