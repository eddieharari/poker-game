import { useEffect, useRef, useState } from 'react';
import { useParams, Navigate, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore.js';
import { usePreferencesStore } from '../store/preferencesStore.js';
import { getSocket } from '../socket.js';
import type {
  PazPazGameState,
  PazPazAssignment,
  PazPazFlopResult,
  Card,
} from '@poker5o/shared';

// ─── Card rendering ───────────────────────────────────────────────────────────

const SUIT_SYMBOL: Record<string, string> = {
  spades: '♠',
  hearts: '♥',
  diamonds: '♦',
  clubs: '♣',
};

function getSuitColor(suit: string, fourColor: boolean): string {
  if (suit === 'hearts') return '#ef4444';
  if (suit === 'diamonds') return fourColor ? '#3b82f6' : '#ef4444';
  if (suit === 'clubs') return fourColor ? '#22c55e' : '#111827';
  return '#111827'; // spades
}

function CardView({
  card,
  selected,
  onClick,
  size = 'normal',
  flopAssigned,
  fourColor = false,
  twoCorner = false,
}: {
  card: Card;
  selected?: boolean;
  onClick?: () => void;
  size?: 'small' | 'normal' | 'large';
  flopAssigned?: number;
  fourColor?: boolean;
  twoCorner?: boolean;
}) {
  const suitColor = getSuitColor(card.suit, fourColor);
  const sizeClass =
    size === 'small'  ? 'w-10 h-14 text-xs' :
    size === 'large'  ? 'w-20 h-28 text-base' :
    'w-14 h-20 text-sm';

  const rankClass =
    size === 'large' ? 'text-xl font-black' : 'font-bold';
  const suitIconClass =
    size === 'large' ? 'text-2xl' : 'text-lg';

  return (
    <div
      onClick={onClick}
      className={`
        ${sizeClass} rounded-lg border flex flex-col
        font-bold cursor-pointer select-none transition-all relative
        bg-white shadow-sm
        ${selected ? 'border-gold shadow-lg shadow-gold/30 scale-105 ring-2 ring-gold/50' : 'border-gray-300 hover:border-white/60'}
        ${onClick ? 'hover:scale-105 active:scale-95' : ''}
      `}
    >
      {/* Top-left corner */}
      <div className="flex flex-col items-center leading-none pt-0.5 pl-0.5" style={{ color: suitColor }}>
        <span className={rankClass}>{card.rank}</span>
        {!twoCorner && <span className="text-xs leading-none">{SUIT_SYMBOL[card.suit]}</span>}
      </div>

      {/* Center suit */}
      <div className="flex-1 flex items-center justify-center" style={{ color: suitColor }}>
        <span className={suitIconClass}>{SUIT_SYMBOL[card.suit]}</span>
      </div>

      {/* Bottom-right corner (rotated) */}
      {!twoCorner && (
        <div className="flex flex-col items-center leading-none pb-0.5 pr-0.5 self-end rotate-180" style={{ color: suitColor }}>
          <span className={rankClass}>{card.rank}</span>
          <span className="text-xs leading-none">{SUIT_SYMBOL[card.suit]}</span>
        </div>
      )}

      {flopAssigned !== undefined && (
        <span className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-gold text-black text-[10px] font-bold flex items-center justify-center shadow">
          {flopAssigned + 1}
        </span>
      )}
    </div>
  );
}

function FaceDownCard({ size = 'normal' }: { size?: 'small' | 'normal' | 'large' }) {
  const sizeClass =
    size === 'small'  ? 'w-10 h-14' :
    size === 'large'  ? 'w-20 h-28' :
    'w-14 h-20';

  return (
    <div
      className={`${sizeClass} rounded-lg border border-blue-800 shadow-sm`}
      style={{
        background: 'repeating-linear-gradient(45deg, rgba(255,255,255,0.07) 0, rgba(255,255,255,0.07) 1px, transparent 0, transparent 50%), repeating-linear-gradient(-45deg, rgba(255,255,255,0.07) 0, rgba(255,255,255,0.07) 1px, transparent 0, transparent 50%), linear-gradient(135deg, #1e3a8a, #1e40af)',
        backgroundSize: '10px 10px, 10px 10px, 100% 100%',
      }}
    />
  );
}

function EmptyCardSlot({ size = 'normal' }: { size?: 'small' | 'normal' | 'large' }) {
  const sizeClass =
    size === 'small'  ? 'w-10 h-14' :
    size === 'large'  ? 'w-20 h-28' :
    'w-14 h-20';

  return (
    <div className={`${sizeClass} rounded-lg border border-dashed border-white/20 bg-white/5`} />
  );
}

// ─── Countdown timer ──────────────────────────────────────────────────────────

function useCountdown(deadline: number | null): number | null {
  const [seconds, setSeconds] = useState<number | null>(null);

  useEffect(() => {
    if (!deadline) { setSeconds(null); return; }
    const update = () => setSeconds(Math.max(0, Math.ceil((deadline - Date.now()) / 1000)));
    update();
    const interval = setInterval(update, 250);
    return () => clearInterval(interval);
  }, [deadline]);

  return seconds;
}

// ─── Main page ────────────────────────────────────────────────────────────────

export function PazPazPage() {
  const { roomId } = useParams<{ roomId: string }>();
  const navigate = useNavigate();
  const { profile } = useAuthStore();
  const { fourColorDeck, twoCornerDeck } = usePreferencesStore();

  const [gameState, setGameState] = useState<PazPazGameState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  const retryRef = useRef(0);

  // Assignment state: assignment[i] = flop index (0,1,2) or null
  const [assignment, setAssignment] = useState<(0 | 1 | 2 | null)[]>([]);
  const [selectedCardIdx, setSelectedCardIdx] = useState<number | null>(null);
  const [submitted, setSubmitted] = useState(false);

  const timerSeconds = useCountdown(gameState?.assignDeadline ?? null);

  // Determine my player index
  const playerIndex: 0 | 1 | null = gameState
    ? gameState.players[0].id === profile?.id
      ? 0
      : gameState.players[1].id === profile?.id
        ? 1
        : null
    : null;

  const myPlayer = playerIndex !== null && gameState ? gameState.players[playerIndex] : null;
  const opponentPlayer = playerIndex !== null && gameState ? gameState.players[playerIndex === 0 ? 1 : 0] : null;

  // Initialize assignment array when dealtCards arrive
  useEffect(() => {
    if (myPlayer && myPlayer.dealtCards.length === 12 && assignment.length !== 12) {
      setAssignment(new Array(12).fill(null));
    }
  }, [myPlayer?.dealtCards.length]);

  useEffect(() => {
    if (!roomId) return;
    const socket = getSocket();

    socket.on('pazpaz:state', (state) => {
      setGameState(state);
      setError(null);
    });

    socket.on('pazpaz:error', ({ message }) => {
      setError(message);
      // Retry joining up to 5 times with 1s delay (handles race condition where room not yet created)
      if (message === 'Room not found' && retryRef.current < 5) {
        retryRef.current += 1;
        setRetryCount(retryRef.current);
        setTimeout(() => {
          socket.emit('pazpaz:join', { roomId });
        }, 1000);
      }
    });

    socket.emit('pazpaz:join', { roomId });

    return () => {
      socket.off('pazpaz:state');
      socket.off('pazpaz:error');
    };
  }, [roomId]);

  if (!roomId || !profile) return <Navigate to="/lobby" replace />;

  if (!gameState) {
    return (
      <div
        className="min-h-screen flex items-center justify-center"
        style={{ backgroundImage: 'url(/bg-poker.png)', backgroundSize: 'cover', backgroundPosition: 'center' }}
      >
        <div className="text-center space-y-3">
          <div className="text-5xl animate-bounce">🃏</div>
          <p className="text-white/50">Connecting to game…</p>
          {error && <p className="text-red-400 text-sm">{error}</p>}
          {retryCount > 0 && <p className="text-white/30 text-xs">Retrying… ({retryCount}/5)</p>}
        </div>
      </div>
    );
  }

  if (gameState.phase === 'SCORING') {
    return <ScoringView gameState={gameState} playerIndex={playerIndex ?? 0} onBack={() => navigate('/lobby')} fourColor={fourColorDeck} twoCorner={twoCornerDeck} />;
  }

  // ASSIGNING phase
  const dealtCards = myPlayer?.dealtCards ?? [];
  const assignmentByFlop: Card[][] = [[], [], []];
  for (let i = 0; i < dealtCards.length; i++) {
    const flopIdx = assignment[i];
    if (flopIdx !== null && flopIdx !== undefined) {
      assignmentByFlop[flopIdx].push(dealtCards[i]);
    }
  }

  // Track original indices for each flop's cards (for removal)
  const flopCardIndices: number[][] = [[], [], []];
  for (let i = 0; i < dealtCards.length; i++) {
    const flopIdx = assignment[i];
    if (flopIdx !== null && flopIdx !== undefined) {
      flopCardIndices[flopIdx].push(i);
    }
  }

  const allAssigned = assignment.length === 12 && assignment.every(a => a !== null);

  function handleCardClick(cardIdx: number) {
    if (submitted) return;
    const currentFlopAssign = assignment[cardIdx];
    if (currentFlopAssign !== null && currentFlopAssign !== undefined) {
      setAssignment(prev => {
        const next = [...prev];
        next[cardIdx] = null;
        return next;
      });
      setSelectedCardIdx(null);
      return;
    }
    setSelectedCardIdx(cardIdx === selectedCardIdx ? null : cardIdx);
  }

  function handleFlopClick(flopIdx: 0 | 1 | 2) {
    if (submitted || selectedCardIdx === null) return;
    if (assignmentByFlop[flopIdx].length >= 4) return;
    setAssignment(prev => {
      const next = [...prev];
      next[selectedCardIdx] = flopIdx;
      return next;
    });
    setSelectedCardIdx(null);
  }

  function handleSubmit() {
    if (!roomId || !allAssigned || submitted) return;
    const hands: [Card[], Card[], Card[]] = [[], [], []];
    for (let i = 0; i < dealtCards.length; i++) {
      const flopIdx = assignment[i];
      if (flopIdx !== null && flopIdx !== undefined) {
        hands[flopIdx].push(dealtCards[i]);
      }
    }
    const pazpazAssignment: PazPazAssignment = { hands };
    getSocket().emit('pazpaz:submit', { roomId, assignment: pazpazAssignment });
    setSubmitted(true);
  }

  const iHaveSubmitted = submitted || (myPlayer?.hasSubmitted ?? false);
  const opponentHasSubmitted = opponentPlayer?.hasSubmitted ?? false;

  return (
    <div
      className="h-screen flex flex-col overflow-hidden"
      style={{ backgroundImage: 'url(/bg-poker.png)', backgroundSize: 'cover', backgroundPosition: 'center', backgroundRepeat: 'no-repeat' }}
    >
      {/* Header */}
      <header className="flex-shrink-0 bg-black/70 backdrop-blur-sm border-b border-white/10 px-4 py-2 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="font-display text-lg text-gold">PAZPAZ</h1>
          <span className="text-xs text-white/50 bg-black/30 px-2 py-1 rounded-full">Assigning</span>
        </div>

        {/* Players status */}
        <div className="flex items-center gap-3 text-xs">
          <div className="flex items-center gap-1.5">
            <img src={myPlayer?.avatarUrl} alt="" className="w-6 h-6 rounded-full border border-gold/50" />
            <span className="font-semibold text-white/80">{myPlayer?.name}</span>
            {iHaveSubmitted
              ? <span className="text-green-400 font-semibold">✓</span>
              : <span className="text-white/40">…</span>
            }
          </div>
          <span className="text-white/30">vs</span>
          <div className="flex items-center gap-1.5">
            <img src={opponentPlayer?.avatarUrl} alt="" className="w-6 h-6 rounded-full border border-white/20" />
            <span className="text-white/60">{opponentPlayer?.name}</span>
            {opponentHasSubmitted
              ? <span className="text-green-400 font-semibold">✓</span>
              : <span className="text-white/40">…</span>
            }
          </div>
        </div>

        {/* Timer */}
        {timerSeconds !== null && (
          <div className={`text-sm font-bold tabular-nums px-3 py-1 rounded-full border ${
            timerSeconds <= 30
              ? 'text-red-400 border-red-500/40 bg-red-500/10 animate-pulse'
              : 'text-white/60 border-white/10'
          }`}>
            {Math.floor(timerSeconds / 60)}:{String(timerSeconds % 60).padStart(2, '0')}
          </div>
        )}
      </header>

      {/* Error banner */}
      {error && error !== 'Room not found' && (
        <div className="flex-shrink-0 bg-red-500/20 border-b border-red-500/30 px-4 py-2 text-red-300 text-sm text-center">
          {error}
        </div>
      )}

      {/* Instructions bar */}
      {!iHaveSubmitted && (
        <div className="flex-shrink-0 bg-black/50 border-b border-white/5 px-4 py-1.5 text-center">
          <p className="text-white/50 text-xs">
            {selectedCardIdx !== null
              ? '👆 Click a flop column to assign the selected card'
              : 'Click a card to select it, then click a flop column to assign it. Click an assigned card to remove it.'
            }
          </p>
        </div>
      )}

      <div className="flex-1 flex flex-col overflow-hidden p-3 gap-3">

        {/* ── Opponent's 12 face-down cards ─────────────────────────────────── */}
        <div className="flex-shrink-0 bg-black/40 backdrop-blur-sm rounded-xl px-3 py-2 border border-white/10">
          <p className="text-white/40 text-[10px] font-semibold uppercase tracking-wider mb-2 text-center">
            {opponentPlayer?.name ?? 'Opponent'}'s cards (face down)
          </p>
          <div className="flex flex-wrap gap-1 justify-center">
            {Array.from({ length: 12 }).map((_, i) => (
              <FaceDownCard key={i} size="small" />
            ))}
          </div>
        </div>

        {/* ── 3 Flop columns ────────────────────────────────────────────────── */}
        <div className="flex-1 grid grid-cols-3 gap-2 min-h-0">
          {([0, 1, 2] as const).map(flopIdx => (
            <FlopColumn
              key={flopIdx}
              flopIdx={flopIdx}
              communityCards={gameState.flops[flopIdx]}
              myAssignedCards={assignmentByFlop[flopIdx]}
              myCardIndices={flopCardIndices[flopIdx]}
              opponentAssignedCards={
                gameState.phase === 'SCORING' && gameState.assignments[playerIndex === 0 ? 1 : 0]
                  ? (gameState.assignments[playerIndex === 0 ? 1 : 0]?.hands[flopIdx] ?? [])
                  : []
              }
              isActive={selectedCardIdx !== null && assignmentByFlop[flopIdx].length < 4}
              onClick={() => handleFlopClick(flopIdx)}
              disabled={iHaveSubmitted}
              fourColor={fourColorDeck}
              twoCorner={twoCornerDeck}
            />
          ))}
        </div>

        {/* ── My 12 dealt cards ─────────────────────────────────────────────── */}
        <div className="flex-shrink-0 bg-black/50 backdrop-blur-sm rounded-xl px-3 py-2 border border-white/10">
          <div className="flex items-center justify-between mb-2">
            <p className="text-white/60 text-xs font-semibold uppercase tracking-wider">Your 12 Cards</p>
            <span className="text-xs text-white/40">
              {assignment.filter(a => a !== null).length}/12 assigned
            </span>
          </div>
          <div className="flex flex-wrap gap-1.5 justify-center">
            {dealtCards.map((card, idx) => {
              const flopAssigned = assignment[idx] !== null && assignment[idx] !== undefined ? (assignment[idx] as 0 | 1 | 2) : undefined;
              return (
                <CardView
                  key={idx}
                  card={card}
                  selected={selectedCardIdx === idx}
                  onClick={iHaveSubmitted ? undefined : () => handleCardClick(idx)}
                  size="large"
                  flopAssigned={flopAssigned}
                  fourColor={fourColorDeck}
                  twoCorner={twoCornerDeck}
                />
              );
            })}
          </div>
        </div>

        {/* ── Submit / status ───────────────────────────────────────────────── */}
        <div className="flex-shrink-0 flex justify-center">
          {iHaveSubmitted ? (
            <div className="text-center space-y-1">
              <p className="text-green-400 font-semibold text-sm">Assignment submitted!</p>
              <p className="text-white/40 text-xs">
                {opponentHasSubmitted
                  ? 'Both submitted — revealing results…'
                  : 'Waiting for opponent…'
                }
              </p>
            </div>
          ) : (
            <button
              onClick={handleSubmit}
              disabled={!allAssigned}
              className="btn-primary px-8 py-2.5 text-base disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Submit Assignment
            </button>
          )}
        </div>

      </div>
    </div>
  );
}

// ─── Flop column ──────────────────────────────────────────────────────────────

function FlopColumn({
  flopIdx,
  communityCards,
  myAssignedCards,
  myCardIndices: _myCardIndices,
  opponentAssignedCards,
  isActive,
  onClick,
  disabled,
  fourColor,
  twoCorner,
}: {
  flopIdx: 0 | 1 | 2;
  communityCards: Card[];
  myAssignedCards: Card[];
  myCardIndices: number[];
  opponentAssignedCards: Card[];
  isActive: boolean;
  onClick: () => void;
  disabled: boolean;
  fourColor: boolean;
  twoCorner: boolean;
}) {
  return (
    <div
      onClick={disabled ? undefined : onClick}
      className={`
        bg-black/40 backdrop-blur-sm rounded-xl p-2 border transition-all flex flex-col gap-2
        ${isActive && !disabled ? 'border-gold/60 bg-gold/5 cursor-pointer hover:border-gold shadow-lg shadow-gold/10' : 'border-white/10'}
      `}
    >
      <p className="text-center text-white/60 text-xs font-semibold uppercase tracking-wider">
        Flop {flopIdx + 1}
      </p>

      {/* Opponent card placeholders */}
      <div className="border border-white/10 rounded-lg p-1.5 bg-black/20">
        <p className="text-center text-white/30 text-[9px] mb-1">Opp</p>
        <div className="flex gap-0.5 justify-center flex-wrap">
          {[0, 1, 2, 3].map(slotIdx => {
            const card = opponentAssignedCards[slotIdx];
            return card
              ? <CardView key={slotIdx} card={card} size="small" fourColor={fourColor} twoCorner={twoCorner} />
              : <FaceDownCard key={slotIdx} size="small" />;
          })}
        </div>
      </div>

      {/* Community cards */}
      <div>
        <p className="text-center text-white/40 text-[9px] mb-1">Community</p>
        <div className="flex gap-0.5 justify-center flex-wrap">
          {communityCards.map((card, i) => (
            <CardView key={i} card={card} size="small" fourColor={fourColor} twoCorner={twoCorner} />
          ))}
        </div>
      </div>

      {/* My hand */}
      <div className="border border-white/10 rounded-lg p-1.5 bg-black/20">
        <p className="text-center text-white/30 text-[9px] mb-1">You {myAssignedCards.length}/4</p>
        <div className="flex gap-0.5 justify-center flex-wrap">
          {[0, 1, 2, 3].map(slotIdx => {
            const card = myAssignedCards[slotIdx];
            return card
              ? <CardView key={slotIdx} card={card} size="small" fourColor={fourColor} twoCorner={twoCorner} />
              : <EmptyCardSlot key={slotIdx} size="small" />;
          })}
        </div>
      </div>
    </div>
  );
}

// ─── Scoring view ─────────────────────────────────────────────────────────────

function ScoringView({
  gameState,
  playerIndex,
  onBack,
  fourColor,
  twoCorner,
}: {
  gameState: PazPazGameState;
  playerIndex: 0 | 1;
  onBack: () => void;
  fourColor: boolean;
  twoCorner: boolean;
}) {
  const { flopResults, winner, players } = gameState;
  const me = players[playerIndex];
  const them = players[playerIndex === 0 ? 1 : 0];
  const winnerLabel =
    winner === 'draw'
      ? 'Draw!'
      : winner === playerIndex
        ? 'You Win!'
        : `${them.name} Wins!`;

  const winnerColor =
    winner === 'draw'
      ? 'text-yellow-400'
      : winner === playerIndex
        ? 'text-green-400'
        : 'text-red-400';

  return (
    <div
      className="min-h-screen flex flex-col"
      style={{ backgroundImage: 'url(/bg-poker.png)', backgroundSize: 'cover', backgroundPosition: 'center' }}
    >
      <header className="bg-black/60 backdrop-blur-sm border-b border-white/10 px-4 py-3 flex items-center justify-between">
        <h1 className="font-display text-xl text-gold">PAZPAZ — Results</h1>
        <button onClick={onBack} className="btn-ghost text-sm px-3 py-1">Back to Lobby</button>
      </header>

      <div className="flex-1 p-4 space-y-4 overflow-auto">
        <div className="text-center bg-black/60 backdrop-blur-sm rounded-2xl p-6 border border-white/10">
          <p className={`font-display text-4xl font-bold ${winnerColor}`}>{winnerLabel}</p>
          <p className="text-white/50 text-sm mt-2">
            {players[0].name} vs {players[1].name}
          </p>
        </div>

        {flopResults && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {flopResults.map(result => (
              <FlopResult
                key={result.flopIndex}
                result={result}
                playerIndex={playerIndex}
                me={me}
                them={them}
                fourColor={fourColor}
                twoCorner={twoCorner}
              />
            ))}
          </div>
        )}

        <div className="flex justify-center">
          <button onClick={onBack} className="btn-primary px-8 py-3">Back to Lobby</button>
        </div>
      </div>
    </div>
  );
}

function FlopResult({
  result,
  playerIndex,
  me,
  them,
  fourColor,
  twoCorner,
}: {
  result: PazPazFlopResult;
  playerIndex: 0 | 1;
  me: { name: string };
  them: { name: string };
  fourColor: boolean;
  twoCorner: boolean;
}) {
  const myHole = playerIndex === 0 ? result.player0Hole : result.player1Hole;
  const themHole = playerIndex === 0 ? result.player1Hole : result.player0Hole;
  const myBest = playerIndex === 0 ? result.player0Best : result.player1Best;
  const themBest = playerIndex === 0 ? result.player1Best : result.player0Best;

  const winnerIsMe = result.winner === playerIndex;
  const winnerIsThem = result.winner === (playerIndex === 0 ? 1 : 0);
  const winnerLabel = result.winner === 'draw' ? 'Tie' : winnerIsMe ? 'You Win' : `${them.name} Wins`;
  const winnerColor = result.winner === 'draw' ? 'text-yellow-400' : winnerIsMe ? 'text-green-400' : 'text-red-400';

  return (
    <div className="bg-black/40 backdrop-blur-sm rounded-2xl p-4 border border-white/10 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-white/60 text-xs font-semibold uppercase tracking-wider">Flop {result.flopIndex + 1}</p>
        <p className={`text-xs font-bold ${winnerColor}`}>{winnerLabel}</p>
      </div>

      <div>
        <p className="text-white/40 text-[10px] mb-1">Community (5)</p>
        <div className="flex gap-1 flex-wrap">
          {result.communityCards.map((card, i) => (
            <CardView key={i} card={card} size="small" fourColor={fourColor} twoCorner={twoCorner} />
          ))}
        </div>
      </div>

      <div className={`rounded-xl p-2 ${winnerIsMe ? 'bg-green-500/10 border border-green-500/30' : 'bg-white/5'}`}>
        <p className="text-white/60 text-[10px] mb-1">{me.name} (You)</p>
        <div className="flex gap-1 flex-wrap">
          {myHole.map((card, i) => <CardView key={i} card={card} size="small" fourColor={fourColor} twoCorner={twoCorner} />)}
        </div>
        <p className="text-gold text-xs mt-1">{myBest.label}</p>
      </div>

      <div className={`rounded-xl p-2 ${winnerIsThem ? 'bg-green-500/10 border border-green-500/30' : 'bg-white/5'}`}>
        <p className="text-white/60 text-[10px] mb-1">{them.name}</p>
        <div className="flex gap-1 flex-wrap">
          {themHole.map((card, i) => <CardView key={i} card={card} size="small" fourColor={fourColor} twoCorner={twoCorner} />)}
        </div>
        <p className="text-gold text-xs mt-1">{themBest.label}</p>
      </div>
    </div>
  );
}
