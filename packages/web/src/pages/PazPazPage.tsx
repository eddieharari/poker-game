import { useEffect, useState } from 'react';
import { useParams, Navigate, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore.js';
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

function isRed(suit: string): boolean {
  return suit === 'hearts' || suit === 'diamonds';
}

function CardView({
  card,
  selected,
  onClick,
  small = false,
  flopAssigned,
}: {
  card: Card;
  selected?: boolean;
  onClick?: () => void;
  small?: boolean;
  flopAssigned?: number; // 0,1,2 if assigned to a flop
}) {
  const red = isRed(card.suit);
  const sizeClass = small ? 'w-10 h-14 text-xs' : 'w-12 h-16 text-sm';

  return (
    <div
      onClick={onClick}
      className={`
        ${sizeClass} rounded-lg border flex flex-col items-center justify-center
        font-bold cursor-pointer select-none transition-all relative
        ${selected ? 'border-gold bg-gold/20 shadow-lg shadow-gold/30 scale-105' : 'border-white/20 bg-black/60 hover:border-white/40'}
        ${flopAssigned !== undefined ? 'border-opacity-50' : ''}
        ${onClick ? 'hover:scale-105 active:scale-95' : ''}
      `}
    >
      <span className={red ? 'text-red-400' : 'text-white'}>{card.rank}</span>
      <span className={`text-lg leading-none ${red ? 'text-red-400' : 'text-white'}`}>
        {SUIT_SYMBOL[card.suit]}
      </span>
      {flopAssigned !== undefined && (
        <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-gold text-black text-[9px] font-bold flex items-center justify-center">
          {flopAssigned + 1}
        </span>
      )}
    </div>
  );
}

function EmptyCardSlot({ small = false }: { small?: boolean }) {
  const sizeClass = small ? 'w-10 h-14' : 'w-12 h-16';
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

  const [gameState, setGameState] = useState<PazPazGameState | null>(null);
  const [error, setError] = useState<string | null>(null);

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
    });

    socket.on('pazpaz:error', ({ message }) => {
      setError(message);
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
        </div>
      </div>
    );
  }

  if (gameState.phase === 'SCORING') {
    return <ScoringView gameState={gameState} playerIndex={playerIndex ?? 0} onBack={() => navigate('/lobby')} />;
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

  const allAssigned = assignment.length === 12 && assignment.every(a => a !== null);

  function handleCardClick(cardIdx: number) {
    if (submitted) return;
    const currentFlopAssign = assignment[cardIdx];
    if (currentFlopAssign !== null && currentFlopAssign !== undefined) {
      // Remove from flop
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
      className="min-h-screen flex flex-col"
      style={{ backgroundImage: 'url(/bg-poker.png)', backgroundSize: 'cover', backgroundPosition: 'center', backgroundRepeat: 'no-repeat' }}
    >
      {/* Header */}
      <header className="bg-black/60 backdrop-blur-sm border-b border-white/10 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="font-display text-xl text-gold">PAZPAZ</h1>
          <span className="text-xs text-white/50 bg-black/30 px-2 py-1 rounded-full">Assigning</span>
        </div>
        <div className="flex items-center gap-4">
          {/* Players */}
          <div className="flex items-center gap-2">
            <img src={myPlayer?.avatarUrl} alt="" className="w-7 h-7 rounded-full border border-gold/50" />
            <span className="text-sm font-semibold">{myPlayer?.name}</span>
            {iHaveSubmitted && <span className="text-xs text-green-400">Submitted</span>}
          </div>
          <span className="text-white/30">vs</span>
          <div className="flex items-center gap-2">
            <img src={opponentPlayer?.avatarUrl} alt="" className="w-7 h-7 rounded-full border border-white/20" />
            <span className="text-sm text-white/70">{opponentPlayer?.name}</span>
            {opponentHasSubmitted
              ? <span className="text-xs text-green-400">Submitted</span>
              : <span className="text-xs text-white/40">Waiting…</span>
            }
          </div>
        </div>
        {/* Timer */}
        {timerSeconds !== null && (
          <div className={`text-sm font-bold tabular-nums ${timerSeconds <= 20 ? 'text-red-400 animate-pulse' : 'text-white/60'}`}>
            {Math.floor(timerSeconds / 60)}:{String(timerSeconds % 60).padStart(2, '0')}
          </div>
        )}
      </header>

      <div className="flex-1 p-4 space-y-4 overflow-auto">
        {error && (
          <div className="bg-red-500/20 border border-red-500/50 rounded-xl px-4 py-2 text-red-300 text-sm">
            {error}
          </div>
        )}

        {/* Instructions */}
        {!iHaveSubmitted && (
          <p className="text-white/50 text-sm text-center">
            {selectedCardIdx !== null
              ? 'Click a flop to assign the selected card'
              : 'Click a card to select it, then click a flop to assign it. Click an assigned card to remove it.'
            }
          </p>
        )}

        {/* 3 Flop columns */}
        <div className="grid grid-cols-3 gap-3">
          {([0, 1, 2] as const).map(flopIdx => (
            <FlopColumn
              key={flopIdx}
              flopIdx={flopIdx}
              communityCards={gameState.flops[flopIdx]}
              assignedCards={assignmentByFlop[flopIdx]}
              isActive={selectedCardIdx !== null && assignmentByFlop[flopIdx].length < 4}
              onClick={() => handleFlopClick(flopIdx)}
              disabled={iHaveSubmitted}
            />
          ))}
        </div>

        {/* My Hand */}
        <div className="bg-black/40 backdrop-blur-sm rounded-2xl p-4 border border-white/10">
          <p className="text-white/60 text-xs font-semibold uppercase tracking-wider mb-3">Your 12 Cards</p>
          <div className="flex flex-wrap gap-2 justify-center">
            {dealtCards.map((card, idx) => {
              const flopAssigned = assignment[idx] !== null && assignment[idx] !== undefined ? (assignment[idx] as 0 | 1 | 2) : undefined;
              return (
                <CardView
                  key={idx}
                  card={card}
                  selected={selectedCardIdx === idx}
                  onClick={() => handleCardClick(idx)}
                  flopAssigned={flopAssigned}
                />
              );
            })}
          </div>
        </div>

        {/* Submit */}
        <div className="flex justify-center">
          {iHaveSubmitted ? (
            <div className="text-center space-y-2">
              <p className="text-green-400 font-semibold">Assignment submitted!</p>
              <p className="text-white/50 text-sm">
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
              className="btn-primary px-8 py-3 text-lg disabled:opacity-40 disabled:cursor-not-allowed"
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
  assignedCards,
  isActive,
  onClick,
  disabled,
}: {
  flopIdx: 0 | 1 | 2;
  communityCards: Card[];
  assignedCards: Card[];
  isActive: boolean;
  onClick: () => void;
  disabled: boolean;
}) {
  return (
    <div
      onClick={disabled ? undefined : onClick}
      className={`
        bg-black/40 backdrop-blur-sm rounded-2xl p-3 border transition-all
        ${isActive && !disabled ? 'border-gold/60 bg-gold/5 cursor-pointer hover:border-gold shadow-lg shadow-gold/10' : 'border-white/10'}
      `}
    >
      <p className="text-center text-white/60 text-xs font-semibold uppercase tracking-wider mb-2">
        Flop {flopIdx + 1}
      </p>

      {/* Community cards */}
      <div className="flex gap-1 justify-center mb-3">
        {communityCards.map((card, i) => (
          <CardView key={i} card={card} small />
        ))}
      </div>

      {/* Hole card slots */}
      <div className="border-t border-white/10 pt-2">
        <p className="text-center text-white/40 text-[10px] mb-1">Your hand</p>
        <div className="flex gap-1 justify-center flex-wrap">
          {[0, 1, 2, 3].map(slotIdx => {
            const card = assignedCards[slotIdx];
            return card ? <CardView key={slotIdx} card={card} small /> : <EmptyCardSlot key={slotIdx} small />;
          })}
        </div>
        <p className="text-center text-white/30 text-[10px] mt-1">{assignedCards.length}/4</p>
      </div>
    </div>
  );
}

// ─── Scoring view ─────────────────────────────────────────────────────────────

function ScoringView({
  gameState,
  playerIndex,
  onBack,
}: {
  gameState: PazPazGameState;
  playerIndex: 0 | 1;
  onBack: () => void;
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
      {/* Header */}
      <header className="bg-black/60 backdrop-blur-sm border-b border-white/10 px-4 py-3 flex items-center justify-between">
        <h1 className="font-display text-xl text-gold">PAZPAZ — Results</h1>
        <button onClick={onBack} className="btn-ghost text-sm px-3 py-1">Back to Lobby</button>
      </header>

      <div className="flex-1 p-4 space-y-4 overflow-auto">
        {/* Winner banner */}
        <div className={`text-center bg-black/60 backdrop-blur-sm rounded-2xl p-6 border border-white/10`}>
          <p className={`font-display text-4xl font-bold ${winnerColor}`}>{winnerLabel}</p>
          <p className="text-white/50 text-sm mt-2">
            {players[0].name} vs {players[1].name}
          </p>
        </div>

        {/* Flop results */}
        {flopResults && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {flopResults.map(result => (
              <FlopResult
                key={result.flopIndex}
                result={result}
                playerIndex={playerIndex}
                me={me}
                them={them}
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
}: {
  result: PazPazFlopResult;
  playerIndex: 0 | 1;
  me: { name: string };
  them: { name: string };
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

      {/* Community cards */}
      <div>
        <p className="text-white/40 text-[10px] mb-1">Community (5)</p>
        <div className="flex gap-1 flex-wrap">
          {result.communityCards.map((card, i) => (
            <CardView key={i} card={card} small />
          ))}
        </div>
      </div>

      {/* My hand */}
      <div className={`rounded-xl p-2 ${winnerIsMe ? 'bg-green-500/10 border border-green-500/30' : 'bg-white/5'}`}>
        <p className="text-white/60 text-[10px] mb-1">{me.name} (You)</p>
        <div className="flex gap-1 flex-wrap">
          {myHole.map((card, i) => <CardView key={i} card={card} small />)}
        </div>
        <p className="text-gold text-xs mt-1">{myBest.label}</p>
      </div>

      {/* Opponent hand */}
      <div className={`rounded-xl p-2 ${winnerIsThem ? 'bg-green-500/10 border border-green-500/30' : 'bg-white/5'}`}>
        <p className="text-white/60 text-[10px] mb-1">{them.name}</p>
        <div className="flex gap-1 flex-wrap">
          {themHole.map((card, i) => <CardView key={i} card={card} small />)}
        </div>
        <p className="text-gold text-xs mt-1">{themBest.label}</p>
      </div>
    </div>
  );
}
