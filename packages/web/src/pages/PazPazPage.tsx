import { useEffect, useRef, useState } from 'react';
import { useParams, Navigate, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore.js';
import { useGameStore } from '../store/gameStore.js';
import { getSocket } from '../socket.js';
import { PlayingCard } from '../components/game/PlayingCard.js';
import { playDealSound, playWinSound, playLoseSound } from '../sounds.js';
import type {
  PazPazGameState,
  PazPazAssignment,
  Card,
  Rank,
} from '@poker5o/shared';

// ─── Rank order ───────────────────────────────────────────────────────────────

const RANK_ORDER: Record<Rank, number> = {
  '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9,
  '10': 10, 'J': 11, 'Q': 12, 'K': 13, 'A': 14,
};

// ─── Countdown timer hook ─────────────────────────────────────────────────────

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

// Card sizes
const SM = { w: 36, h: 50 };  // hole cards (both phases)
const LG = { w: 84, h: 117 }; // my dealt cards fan — 50% bigger
// Community cards in scoring: up to 1.5× SM, calculated responsively at runtime

// ─── Empty slot placeholder ───────────────────────────────────────────────────

function EmptySlot({ width = 40, height = 56 }: { width?: number; height?: number }) {
  return (
    <div
      style={{ width, height }}
      className="rounded-lg border border-dashed border-white/20 bg-white/5 flex-shrink-0"
    />
  );
}

// ─── FaceDown card using PlayingCard ─────────────────────────────────────────

const FACE_DOWN_CARD: Card = { rank: 'A', suit: 'spades', faceDown: true };

// ─── Main page ────────────────────────────────────────────────────────────────

export function PazPazPage() {
  const { roomId } = useParams<{ roomId: string }>();
  const navigate = useNavigate();
  const { profile } = useAuthStore();
  const reset = useGameStore(s => s.reset);

  const [gameState, setGameState] = useState<PazPazGameState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const retryRef = useRef(0);
  const [retryCount, setRetryCount] = useState(0);

  // Assignment state
  const [assignment, setAssignment] = useState<(0 | 1 | 2 | null)[]>([]);
  const [selectedCardIdx, setSelectedCardIdx] = useState<number | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [isSorted, setIsSorted] = useState(false);

  // Deal animation
  const [dealtVisible, setDealtVisible] = useState(0);
  const dealAnimStarted = useRef(false);
  const dealIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Drag state
  const [draggedIdx, setDraggedIdx] = useState<number | null>(null);

  // Scoring reveal: which flop result is revealed (0 = none, 1/2/3 = flops revealed)
  const [revealedFlops, setRevealedFlops] = useState(0);

  // Card size for flop rows (full-width layout).
  // Each flop section is full-width; we fit 5 community cards per row.
  // Available inner width ≈ vw - outer padding (32) - section inner padding (16) - 4 card gaps (16)
  const [vw, setVw] = useState(window.innerWidth);
  useEffect(() => {
    const onResize = () => setVw(window.innerWidth);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  const commW = Math.max(SM.w, Math.floor((vw - 64) / 5));
  const commH = Math.round(commW * (SM.h / SM.w));

  const timerSeconds = useCountdown(gameState?.assignDeadline ?? null);
  const pressureSeconds = useCountdown(gameState?.pressureDeadline ?? null);

  const playerIndex: 0 | 1 | null = gameState
    ? gameState.players[0].id === profile?.id ? 0
      : gameState.players[1].id === profile?.id ? 1
      : null
    : null;

  const myPlayer = playerIndex !== null && gameState ? gameState.players[playerIndex] : null;
  const oppPlayer = playerIndex !== null && gameState ? gameState.players[playerIndex === 0 ? 1 : 0] : null;

  // Init assignment array when cards arrive
  useEffect(() => {
    if (myPlayer && myPlayer.dealtCards.length === 12 && assignment.length !== 12) {
      setAssignment(new Array(12).fill(null));
    }
  }, [myPlayer?.dealtCards.length]);

  // Deal animation: reveal cards one by one when they first arrive
  useEffect(() => {
    const numCards = myPlayer?.dealtCards.length ?? 0;
    if (numCards === 0 || dealAnimStarted.current) return;
    dealAnimStarted.current = true;

    let count = 0;
    dealIntervalRef.current = setInterval(() => {
      count++;
      setDealtVisible(count);
      playDealSound();
      if (count >= numCards) {
        if (dealIntervalRef.current) {
          clearInterval(dealIntervalRef.current);
          dealIntervalRef.current = null;
        }
      }
    }, 500);

    return () => {
      if (dealIntervalRef.current) {
        clearInterval(dealIntervalRef.current);
        dealIntervalRef.current = null;
      }
    };
  }, [myPlayer?.dealtCards.length]);

  // Socket setup
  useEffect(() => {
    if (!roomId) return;
    const socket = getSocket();

    socket.on('pazpaz:state', (state) => {
      setGameState(state);
      setError(null);
      retryRef.current = 0;
    });

    socket.on('pazpaz:error', ({ message }) => {
      setError(message);
      if (message === 'Room not found' && retryRef.current < 5) {
        retryRef.current += 1;
        setRetryCount(retryRef.current);
        setTimeout(() => socket.emit('pazpaz:join', { roomId }), 1000);
      }
    });

    socket.emit('pazpaz:join', { roomId });

    return () => {
      socket.off('pazpaz:state');
      socket.off('pazpaz:error');
    };
  }, [roomId]);

  // Reveal animation when phase is SCORING
  useEffect(() => {
    if (gameState?.phase !== 'SCORING') { setRevealedFlops(0); return; }
    if (revealedFlops >= 3) return;
    const delay = revealedFlops === 0 ? 700 : 900;
    const t = setTimeout(() => setRevealedFlops(f => f + 1), delay);
    return () => clearTimeout(t);
  }, [gameState?.phase, revealedFlops]);

  // Play win/lose sound once when all flops are revealed
  const resultSoundPlayed = useRef(false);
  useEffect(() => {
    if (revealedFlops < 3 || resultSoundPlayed.current || !gameState) return;
    resultSoundPlayed.current = true;
    const myIdx = gameState.players[0].id === profile?.id ? 0 : 1;
    const w = gameState.winner;
    if (w === 'draw' || w === null) return;
    if (w === myIdx) playWinSound();
    else playLoseSound();
  }, [revealedFlops]);

  // Send partial save whenever assignment changes
  useEffect(() => {
    if (!roomId || submitted || !gameState || gameState.phase !== 'ASSIGNING') return;
    const dealtCards = myPlayer?.dealtCards ?? [];
    if (dealtCards.length === 0 || assignment.length === 0) return;
    const someAssigned = assignment.some(a => a !== null);
    if (!someAssigned) return;

    const hands: [Card[], Card[], Card[]] = [[], [], []];
    for (let i = 0; i < dealtCards.length; i++) {
      const fi = assignment[i];
      if (fi !== null && fi !== undefined) hands[fi].push(dealtCards[i]);
    }
    getSocket().emit('pazpaz:partial_save', { roomId, assignment: { hands } });
  }, [assignment]);

  if (!roomId || !profile) return <Navigate to="/lobby" replace />;

  // Loading / error state
  if (!gameState) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundImage: 'url(/bg-poker.png)', backgroundSize: 'cover', backgroundPosition: 'center' }}>
        <div className="text-center space-y-3">
          <div className="text-5xl animate-bounce">🃏</div>
          <p className="text-white/50">Connecting to game…</p>
          {error && <p className="text-red-400 text-sm">{error}</p>}
          {retryCount > 0 && <p className="text-white/30 text-xs">Retrying… ({retryCount}/5)</p>}
        </div>
      </div>
    );
  }

  const isScoringPhase = gameState.phase === 'SCORING';

  function goToLobby() {
    reset();
    const { session } = useAuthStore.getState();
    useAuthStore.getState().fetchProfile(session);
    navigate('/lobby', { replace: true });
  }

  // ── ASSIGNING phase helpers ─────────────────────────────────────────────────
  const dealtCards = myPlayer?.dealtCards ?? [];

  // Sorted display indices (plain computation — no useMemo to avoid hooks-after-return violation)
  const displayOrder = (() => {
    const indices = Array.from({ length: dealtCards.length }, (_, i) => i);
    if (isSorted && dealtCards.length > 0) {
      indices.sort((a, b) => RANK_ORDER[dealtCards[a].rank] - RANK_ORDER[dealtCards[b].rank]);
    }
    return indices;
  })();

  const assignmentByFlop: Card[][] = [[], [], []];
  for (let i = 0; i < dealtCards.length; i++) {
    const fi = assignment[i];
    if (fi !== null && fi !== undefined) {
      assignmentByFlop[fi].push(dealtCards[i]);
    }
  }
  const allAssigned = assignment.length === 12 && assignment.every(a => a !== null);
  const iHaveSubmitted = submitted || (myPlayer?.hasSubmitted ?? false);
  const oppHasSubmitted = oppPlayer?.hasSubmitted ?? false;

  function handleCardClick(cardIdx: number) {
    if (iHaveSubmitted || isScoringPhase) return;
    if (assignment[cardIdx] !== null && assignment[cardIdx] !== undefined) {
      setAssignment(prev => { const n = [...prev]; n[cardIdx] = null; return n; });
      setSelectedCardIdx(null);
    } else {
      setSelectedCardIdx(cardIdx === selectedCardIdx ? null : cardIdx);
    }
  }

  function handleFlopDrop(flopIdx: 0 | 1 | 2, cardIdx: number) {
    if (iHaveSubmitted || isScoringPhase) return;
    if (assignmentByFlop[flopIdx].length >= 4) return;
    if (assignment[cardIdx] !== null && assignment[cardIdx] !== undefined) return; // already assigned elsewhere
    setAssignment(prev => { const n = [...prev]; n[cardIdx] = flopIdx; return n; });
    setSelectedCardIdx(null);
  }

  function handleFlopClick(flopIdx: 0 | 1 | 2) {
    if (iHaveSubmitted || isScoringPhase || selectedCardIdx === null) return;
    if (assignmentByFlop[flopIdx].length >= 4) return;
    setAssignment(prev => { const n = [...prev]; n[selectedCardIdx] = flopIdx; return n; });
    setSelectedCardIdx(null);
  }

  function handleSubmit() {
    if (!roomId || !allAssigned || submitted || isScoringPhase) return;
    const hands: [Card[], Card[], Card[]] = [[], [], []];
    for (let i = 0; i < dealtCards.length; i++) {
      const fi = assignment[i];
      if (fi !== null && fi !== undefined) hands[fi].push(dealtCards[i]);
    }
    getSocket().emit('pazpaz:submit', { roomId, assignment: { hands } as PazPazAssignment });
    setSubmitted(true);
  }

  // ── Scoring result helpers ─────────────────────────────────────────────────
  const allFlopResults = isScoringPhase ? (gameState.flopResults ?? []) : [];
  const allRevealed = revealedFlops >= 3;
  const winner = gameState.winner;
  const iWon = winner === playerIndex;
  const isDraw = winner === 'draw';

  function getOppScoringCards(flopIdx: number): Card[] {
    if (!isScoringPhase || flopIdx >= revealedFlops) return [];
    const result = allFlopResults[flopIdx];
    if (!result) return [];
    return playerIndex === 0 ? result.player1Hole : result.player0Hole;
  }

  function getCommunityCards(flopIdx: number): { cards: Card[]; hasAll: boolean } {
    if (isScoringPhase && allFlopResults[flopIdx]) {
      return { cards: allFlopResults[flopIdx].communityCards, hasAll: true };
    }
    return { cards: gameState!.flops[flopIdx], hasAll: false };
  }

  // ─── Arc fan display ─────────────────────────────────────────────────────
  // Cards visible so far (deal animation) but also respect display order
  const visibleCards = displayOrder.slice(0, dealtVisible).map(idx => ({ idx, card: dealtCards[idx] }));
  const numVisible = visibleCards.length;
  const fanTotalAngle = 50; // degrees
  const cardStep = 48; // horizontal pixels per card step (scaled with LG)
  const fanContainerW = Math.max(LG.w, (numVisible - 1) * cardStep + LG.w);
  const fanContainerH = LG.h + 36;

  // ─── Render ─────────────────────────────────────────────────────────────────
  return (
    <div
      className="h-screen flex flex-col overflow-hidden relative"
      style={{ backgroundImage: 'url(/bg-poker.png)', backgroundSize: 'cover', backgroundPosition: 'center', backgroundRepeat: 'no-repeat' }}
    >
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <header className={`flex-shrink-0 backdrop-blur-sm border-b px-4 flex items-center justify-between gap-4 transition-colors
        ${isScoringPhase && allRevealed
          ? isDraw
            ? 'bg-yellow-900/60 border-yellow-500/30 py-3'
            : iWon
              ? 'bg-green-900/60 border-green-500/30 py-3'
              : 'bg-red-900/60 border-red-500/30 py-3'
          : 'bg-black/70 border-white/10 py-2'}`}
      >
        <div className="flex items-center gap-2 flex-shrink-0">
          <h1 className="font-display text-lg text-gold">PAZPAZ</h1>
          {!isScoringPhase && (
            <span className="text-xs text-white/50 bg-black/30 px-2 py-1 rounded-full">Assigning</span>
          )}
        </div>

        {/* Center */}
        <div className="flex items-center gap-3 min-w-0">
          {isScoringPhase ? (
            allRevealed ? (
              <div className="flex items-center gap-3">
                <span className="text-3xl">{isDraw ? '🤝' : iWon ? '🏆' : '😞'}</span>
                <div>
                  <div className={`font-display text-2xl font-black leading-none ${isDraw ? 'text-yellow-400' : iWon ? 'text-green-400' : 'text-red-400'}`}>
                    {isDraw ? 'DRAW' : iWon ? 'YOU WIN!' : 'YOU LOSE'}
                  </div>
                  {gameState.stake != null && (
                    <div className={`text-sm font-bold mt-0.5 ${isDraw ? 'text-white/50' : iWon ? 'text-green-300' : 'text-red-300'}`}>
                      {isDraw ? '±0 chips' : iWon ? `+${gameState.stake} chips` : `-${gameState.stake} chips`}
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <span className="text-white/50 text-sm animate-pulse">Revealing results…</span>
                <button onClick={() => setRevealedFlops(3)} className="btn-ghost text-xs px-2 py-1">Skip</button>
              </div>
            )
          ) : (
            timerSeconds !== null && (
              <div className={`flex items-center gap-2 px-3 py-1 rounded-full border font-bold tabular-nums text-sm ${
                timerSeconds <= 30 ? 'text-red-400 border-red-500/40 bg-red-500/10 animate-pulse' : 'text-white/70 border-white/20'
              }`}>
                ⏱ {Math.floor(timerSeconds / 60)}:{String(timerSeconds % 60).padStart(2, '0')}
              </div>
            )
          )}
        </div>

        {/* Right: back button or player status */}
        {isScoringPhase ? (
          <button onClick={goToLobby} className="btn-primary px-4 py-1.5 text-sm flex-shrink-0">
            Back to Lobby
          </button>
        ) : (
          <div className="flex items-center gap-3 text-xs flex-shrink-0">
            <div className="flex items-center gap-1.5">
              {myPlayer?.avatarUrl && <img src={myPlayer.avatarUrl} alt="" className="w-6 h-6 rounded-full border border-gold/50" />}
              <span className="font-semibold text-white/80">{myPlayer?.name}</span>
              {iHaveSubmitted ? <span className="text-green-400">✓</span> : <span className="text-white/30">…</span>}
            </div>
            <span className="text-white/20">vs</span>
            <div className="flex items-center gap-1.5">
              {oppPlayer?.avatarUrl && <img src={oppPlayer.avatarUrl} alt="" className="w-6 h-6 rounded-full border border-white/20" />}
              <span className="text-white/60">{oppPlayer?.name}</span>
              {oppHasSubmitted ? <span className="text-green-400">✓</span> : <span className="text-white/30">…</span>}
            </div>
          </div>
        )}
      </header>

      {/* Error banner */}
      {error && error !== 'Room not found' && (
        <div className="flex-shrink-0 bg-red-500/20 border-b border-red-500/30 px-4 py-1 text-red-300 text-xs text-center">{error}</div>
      )}

      {/* ── Main board ─────────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col overflow-hidden p-2 gap-2 min-h-0">

        {/* 3 Flop rows — vertical stack, scrollable */}
        <div className="flex-1 min-h-0 overflow-y-auto flex flex-col gap-2">
          {([0, 1, 2] as const).map(flopIdx => {
            const result = allFlopResults[flopIdx];
            const isRevealed = flopIdx < revealedFlops;
            const oppCards = getOppScoringCards(flopIdx);
            const myFlopCards = isScoringPhase
              ? (playerIndex === 0 ? result?.player0Hole : result?.player1Hole) ?? assignmentByFlop[flopIdx]
              : assignmentByFlop[flopIdx];
            const { cards: communityCards, hasAll } = getCommunityCards(flopIdx);

            const isActive = !iHaveSubmitted && !isScoringPhase && selectedCardIdx !== null && assignmentByFlop[flopIdx].length < 4;

            const flopWinnerLabel = isRevealed && result
              ? result.winner === playerIndex ? 'WIN'
                : result.winner === 'draw' ? 'DRAW'
                : 'LOSE'
              : null;
            const flopWinnerColor = flopWinnerLabel === 'WIN' ? 'text-green-400'
              : flopWinnerLabel === 'DRAW' ? 'text-yellow-400'
              : 'text-red-500';

            const oppUsedHole = isScoringPhase && isRevealed && result
              ? (playerIndex === 0 ? result.player1UsedHole : result.player0UsedHole)
              : [];
            const myUsedHole = isScoringPhase && isRevealed && result
              ? (playerIndex === 0 ? result.player0UsedHole : result.player1UsedHole)
              : [];

            return (
              <div
                key={flopIdx}
                onClick={isActive ? () => handleFlopClick(flopIdx) : undefined}
                onDragOver={(!iHaveSubmitted && !isScoringPhase && assignmentByFlop[flopIdx].length < 4) ? (e) => e.preventDefault() : undefined}
                onDrop={(!iHaveSubmitted && !isScoringPhase) ? (e) => {
                  e.preventDefault();
                  const idxStr = e.dataTransfer.getData('cardIndex');
                  if (idxStr !== '') handleFlopDrop(flopIdx, parseInt(idxStr));
                } : undefined}
                className={`flex-shrink-0 bg-black/40 rounded-xl p-2 border transition-all
                  ${isActive ? 'border-gold/60 bg-gold/5 cursor-pointer hover:border-gold shadow-lg shadow-gold/10' : 'border-white/10'}
                  ${isScoringPhase && isRevealed && result
                    ? result.winner === playerIndex ? 'border-green-500/40 bg-green-500/5'
                      : result.winner === 'draw' ? 'border-yellow-500/30'
                      : 'border-red-500/30 bg-red-500/5'
                    : ''}`}
              >
                {/* Row header */}
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-2">
                    <span className="text-white/60 text-[10px] font-semibold uppercase tracking-wider">Flop {flopIdx + 1}</span>
                    {!isScoringPhase && (
                      <span className="text-white/30 text-[10px]">{assignmentByFlop[flopIdx].length}/4 assigned</span>
                    )}
                  </div>
                  {isScoringPhase && flopWinnerLabel && (
                    <span className={`font-black text-xl tracking-widest ${flopWinnerColor}`}>{flopWinnerLabel}</span>
                  )}
                </div>

                {/* Opponent hole cards */}
                <div className="mb-1.5">
                  <p className="text-[10px] text-white/30 mb-1">{oppPlayer?.name ?? 'Opponent'}</p>
                  <div className="flex gap-1 items-center">
                    {[0, 1, 2, 3].map(s => {
                      const card = oppCards[s];
                      const isUsed = card && oppUsedHole.some(c => c.rank === card.rank && c.suit === card.suit);
                      return card ? (
                        <div key={s} className={isUsed ? 'ring-2 ring-red-500 rounded-sm' : ''}>
                          <PlayingCard card={card} width={commW} height={commH} />
                        </div>
                      ) : (
                        <PlayingCard key={s} card={FACE_DOWN_CARD} width={commW} height={commH} />
                      );
                    })}
                    {isScoringPhase && isRevealed && result && (
                      <span className="ml-2 text-xs text-white/60 font-semibold">
                        {(playerIndex === 0 ? result.player1Best : result.player0Best).label}
                      </span>
                    )}
                  </div>
                </div>

                {/* Community board: flop (3) + turn/river (2) */}
                <div className="mb-1.5">
                  <p className="text-[9px] text-white/40 mb-1">Board</p>
                  <div className="flex gap-1 mb-1">
                    {communityCards.slice(0, 3).map((card, i) => (
                      <PlayingCard key={i} card={card} width={commW} height={commH} />
                    ))}
                  </div>
                  <div className="flex gap-1">
                    {hasAll ? (
                      <>
                        <PlayingCard card={communityCards[3]} width={commW} height={commH} />
                        <PlayingCard card={communityCards[4]} width={commW} height={commH} />
                      </>
                    ) : (
                      <>
                        <EmptySlot width={commW} height={commH} />
                        <EmptySlot width={commW} height={commH} />
                      </>
                    )}
                  </div>
                </div>

                {/* My hole cards */}
                <div>
                  <p className="text-[10px] text-gold/70 mb-1">
                    You {!isScoringPhase ? `(${assignmentByFlop[flopIdx].length}/4)` : ''}
                  </p>
                  <div className="flex gap-1 items-center">
                    {[0, 1, 2, 3].map(s => {
                      const card = myFlopCards[s];
                      const isUsed = card && myUsedHole.some(c => c.rank === card.rank && c.suit === card.suit);
                      return card ? (
                        <div key={s} className={isUsed ? 'ring-2 ring-red-500 rounded-sm' : ''}>
                          <PlayingCard card={card} width={commW} height={commH} />
                        </div>
                      ) : (
                        <EmptySlot key={s} width={commW} height={commH} />
                      );
                    })}
                    {isScoringPhase && isRevealed && result && (
                      <span className="ml-2 text-xs text-gold font-bold">
                        {(playerIndex === 0 ? result.player0Best : result.player1Best).label}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* My 12 dealt cards - arc/fan display (only shown during ASSIGNING) */}
        {!isScoringPhase && (
          <div className="flex-shrink-0 bg-black/50 rounded-xl px-3 py-2 border border-white/10">
            <div className="flex items-center justify-between mb-1">
              <p className="text-white/60 text-xs font-semibold uppercase tracking-wider">Your Cards</p>
              <div className="flex items-center gap-2">
                <span className="text-xs text-white/40">{assignment.filter(a => a !== null).length}/12</span>
                {!iHaveSubmitted && dealtVisible >= 12 && (
                  <button
                    onClick={() => setIsSorted(s => !s)}
                    className={`text-xs px-2 py-0.5 rounded border transition-colors ${
                      isSorted ? 'border-gold/60 text-gold bg-gold/10' : 'border-white/20 text-white/50 hover:border-white/40'
                    }`}
                  >
                    {isSorted ? '🂠 Sorted' : '🂠 Sort'}
                  </button>
                )}
              </div>
            </div>

            {!iHaveSubmitted && (
              <p className="text-white/40 text-xs text-center mb-2">
                {selectedCardIdx !== null ? '👆 Click a flop or drag card there' : 'Click or drag a card to assign it'}
              </p>
            )}

            {/* Arc/fan layout */}
            <div className="relative overflow-visible mx-auto" style={{ width: fanContainerW, height: fanContainerH }}>
              {visibleCards.map(({ idx, card }, displayPos) => {
                const angle = numVisible > 1
                  ? (displayPos / (numVisible - 1) - 0.5) * fanTotalAngle
                  : 0;
                const x = displayPos * cardStep;
                const fi = assignment[idx];
                const flopAssigned = fi !== null && fi !== undefined ? fi : undefined;
                const isSelected = selectedCardIdx === idx;

                return (
                  <div
                    key={idx}
                    style={{
                      position: 'absolute',
                      left: x,
                      bottom: 0,
                      width: LG.w,
                      transformOrigin: 'bottom center',
                      transform: `rotate(${angle}deg) ${isSelected ? 'translateY(-12px) scale(1.08)' : ''}`,
                      zIndex: isSelected ? 50 : displayPos + 1,
                      transition: 'transform 0.15s ease',
                    }}
                    className={!iHaveSubmitted ? 'cursor-pointer' : ''}
                    onClick={!iHaveSubmitted ? () => handleCardClick(idx) : undefined}
                    draggable={!iHaveSubmitted && flopAssigned === undefined}
                    onDragStart={!iHaveSubmitted && flopAssigned === undefined ? (e) => {
                      e.dataTransfer.setData('cardIndex', String(idx));
                      setDraggedIdx(idx);
                      setSelectedCardIdx(null);
                    } : undefined}
                    onDragEnd={() => setDraggedIdx(null)}
                  >
                    <div className={`transition-opacity ${flopAssigned !== undefined ? 'opacity-35' : ''} ${isSelected ? 'ring-2 ring-gold ring-offset-1 ring-offset-black rounded-lg' : ''}`}>
                      <PlayingCard card={card} width={LG.w} height={LG.h} />
                    </div>
                    {flopAssigned !== undefined && (
                      <span className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-gold text-black text-[10px] font-bold flex items-center justify-center shadow z-10">
                        F{flopAssigned + 1}
                      </span>
                    )}
                    {draggedIdx === idx && (
                      <div className="absolute inset-0 rounded-lg bg-black/30" />
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

      {/* Submit / waiting / pressure timer / back to lobby */}
        <div className="flex-shrink-0 flex flex-col items-center gap-2 pb-1">
          {/* Pressure timer: show when opponent submitted but I haven't */}
          {!isScoringPhase && oppHasSubmitted && !iHaveSubmitted && pressureSeconds !== null && (
            <div className={`flex items-center gap-2 px-4 py-1.5 rounded-full border font-bold tabular-nums text-sm ${
              pressureSeconds <= 30 ? 'text-red-400 border-red-500/40 bg-red-500/10 animate-pulse' : 'text-yellow-400 border-yellow-500/40 bg-yellow-500/10'
            }`}>
              ⚡ Submit in {Math.floor(pressureSeconds / 60)}:{String(pressureSeconds % 60).padStart(2, '0')}
            </div>
          )}

          {isScoringPhase ? null : iHaveSubmitted ? (
            <div className="text-center space-y-1">
              <p className="text-green-400 font-semibold text-sm">Assignment submitted!</p>
              <p className="text-white/40 text-xs">
                {oppHasSubmitted ? 'Both submitted — revealing…' : 'Waiting for opponent…'}
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
