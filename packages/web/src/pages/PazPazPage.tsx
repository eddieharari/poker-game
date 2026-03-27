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

// ─── Design canvas (fixed resolution — CSS-scaled to fit any screen) ─────────

const DESIGN_W = 1440;
const DESIGN_H = 900;
const PANEL_GAP = 5; // px gap between the 3 panels

// 3 panels fill the full DESIGN_W with PANEL_GAP px gaps, no outer margin
// border-4 = 8px total, p-3 = 24px total, gap-1 cards = 16px → cardW = 85px
const effectivePanelW = Math.floor((DESIGN_W - PANEL_GAP * 2) / 3);          // 476px
const cardW = Math.max(40, Math.floor((effectivePanelW - 8 - 24 - 16) / 5)); // 85px
const cardH = Math.round(cardW * (50 / 36));                                   // 118px
const fanScale = 1.0; // DESIGN_W is wide enough for all 12 fan cards

// ─── Card sizes ───────────────────────────────────────────────────────────────

const LG = { w: cardW, h: cardH }; // fan cards match slot cards at design res

// ─── Face-down card ───────────────────────────────────────────────────────────

// const FACE_DOWN_CARD: Card = { rank: 'A', suit: 'spades', faceDown: true };

// ─── Hand themes (one per flop) ───────────────────────────────────────────────

const NEON_PURPLE_GLOW   = 'inset 0 0 24px rgba(200,0,255,0.40), 0 0 18px rgba(200,0,255,0.22)';
const NEON_PURPLE_BORDER = 'rgba(200,0,255,0.85)';

const HAND_THEMES = [
  {
    label: 'BACK HAND',
    glow: NEON_PURPLE_GLOW,
    border: NEON_PURPLE_BORDER,
    badgeCls: 'bg-blue-200 text-blue-800 border-blue-100',
    commCls:  'border-blue-300 bg-blue-50/80',
    mySlotCls:'border-blue-300 bg-blue-50/70 text-blue-400 hover:bg-blue-100',
    oppSlotCls:'border-blue-200 bg-blue-50/40',
  },
  {
    label: 'MIDDLE HAND',
    glow: NEON_PURPLE_GLOW,
    border: NEON_PURPLE_BORDER,
    badgeCls: 'bg-purple-200 text-purple-800 border-purple-100',
    commCls:  'border-purple-300 bg-purple-50/80',
    mySlotCls:'border-purple-300 bg-purple-50/70 text-purple-400 hover:bg-purple-100',
    oppSlotCls:'border-purple-200 bg-purple-50/40',
  },
  {
    label: 'FRONT HAND',
    glow: NEON_PURPLE_GLOW,
    border: NEON_PURPLE_BORDER,
    badgeCls: 'bg-green-200 text-green-800 border-green-100',
    commCls:  'border-green-300 bg-green-50/80',
    mySlotCls:'border-green-300 bg-green-50/70 text-green-400 hover:bg-green-100',
    oppSlotCls:'border-green-200 bg-green-50/40',
  },
] as const;

// ─── Arc fan offsets ──────────────────────────────────────────────────────────
// Transform applied as translateX(x) then rotate(r) around bottom-center.
// x is true screen-space pixels from center; y is always 0 so cards don't
// extend below the canvas bottom and get clipped.

const FAN_OFFSETS = [
  { x: -275, r: -20 }, { x: -225, r: -16 }, { x: -175, r: -13 },
  { x: -125, r:  -9 }, { x:  -75, r:  -6 }, { x:  -25, r:  -2 },
  { x:   25, r:   2 }, { x:   75, r:   6 }, { x:  125, r:   9 },
  { x:  175, r:  13 }, { x:  225, r:  16 }, { x:  275, r:  20 },
];

// ─── Inline CSS for animations + playful font ─────────────────────────────────

const PZ_STYLES = `
  @import url('https://fonts.googleapis.com/css2?family=Fredoka+One&family=Nunito:wght@400;600;800&display=swap');
  .pz-h { font-family: 'Fredoka One', cursive !important; }
  @keyframes pzCloud {
    0%   { background-position: 0% 0%; }
    100% { background-position: 100% 100%; }
  }
  .pz-clouds {
    background-image:
      radial-gradient(circle at 20% 30%, rgba(255,255,255,0.8) 0%, rgba(255,255,255,0) 10%),
      radial-gradient(circle at 80% 20%, rgba(255,255,255,0.6) 0%, rgba(255,255,255,0) 15%),
      radial-gradient(circle at 50% 80%, rgba(255,255,255,0.7) 0%, rgba(255,255,255,0) 20%);
    background-size: 150% 150%;
    animation: pzCloud 20s ease-in-out infinite alternate;
  }
  .pz-btn { transition: all 0.1s; position: relative; top: 0; }
  .pz-btn:active { top: 4px; box-shadow: none !important; }
`;

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

  const [confirmExit, setConfirmExit] = useState(false);

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

  // Scoring reveal
  const [revealedFlops, setRevealedFlops] = useState(0);

  // CSS scale — shrink/grow the fixed 1440×900 canvas to fill any viewport
  const [cssScale, setCssScale] = useState(
    () => Math.min(window.innerWidth / DESIGN_W, window.innerHeight / DESIGN_H)
  );
  useEffect(() => {
    const onResize = () => setCssScale(Math.min(window.innerWidth / DESIGN_W, window.innerHeight / DESIGN_H));
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const timerSeconds    = useCountdown(gameState?.assignDeadline  ?? null);
  const pressureSeconds = useCountdown(gameState?.pressureDeadline ?? null);

  const playerIndex: 0 | 1 | null = gameState
    ? gameState.players[0].id === profile?.id ? 0
      : gameState.players[1].id === profile?.id ? 1
      : null
    : null;

  const myPlayer  = playerIndex !== null && gameState ? gameState.players[playerIndex] : null;
  const oppPlayer = playerIndex !== null && gameState ? gameState.players[playerIndex === 0 ? 1 : 0] : null;

  // Init assignment array
  useEffect(() => {
    if (myPlayer && myPlayer.dealtCards.length === 12 && assignment.length !== 12) {
      setAssignment(new Array(12).fill(null));
    }
  }, [myPlayer?.dealtCards.length]);

  // Deal animation
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
        clearInterval(dealIntervalRef.current!);
        dealIntervalRef.current = null;
      }
    }, 500);
    return () => {
      if (dealIntervalRef.current) { clearInterval(dealIntervalRef.current); dealIntervalRef.current = null; }
    };
  }, [myPlayer?.dealtCards.length]);

  // Socket
  useEffect(() => {
    if (!roomId) return;
    const socket = getSocket();
    socket.on('pazpaz:state', (state) => { setGameState(state); setError(null); retryRef.current = 0; });
    socket.on('pazpaz:error', ({ message }) => {
      setError(message);
      if (message === 'Room not found' && retryRef.current < 5) {
        retryRef.current += 1;
        setRetryCount(retryRef.current);
        setTimeout(() => socket.emit('pazpaz:join', { roomId }), 1000);
      }
    });
    socket.emit('pazpaz:join', { roomId });
    return () => { socket.off('pazpaz:state'); socket.off('pazpaz:error'); };
  }, [roomId]);

  // Reveal animation
  useEffect(() => {
    if (gameState?.phase !== 'SCORING') { setRevealedFlops(0); return; }
    if (revealedFlops >= 3) return;
    const delay = revealedFlops === 0 ? 700 : 900;
    const t = setTimeout(() => setRevealedFlops(f => f + 1), delay);
    return () => clearTimeout(t);
  }, [gameState?.phase, revealedFlops]);

  // Win/lose sound
  const resultSoundPlayed = useRef(false);
  useEffect(() => {
    if (revealedFlops < 3 || resultSoundPlayed.current || !gameState) return;
    resultSoundPlayed.current = true;
    const myIdx = gameState.players[0].id === profile?.id ? 0 : 1;
    const w = gameState.winner;
    if (w === 'draw' || w === null) return;
    if (w === myIdx) playWinSound(); else playLoseSound();
  }, [revealedFlops]);

  // Partial save
  useEffect(() => {
    if (!roomId || submitted || !gameState || gameState.phase !== 'ASSIGNING') return;
    const dealtCards = myPlayer?.dealtCards ?? [];
    if (dealtCards.length === 0 || assignment.length === 0 || !assignment.some(a => a !== null)) return;
    const hands: [Card[], Card[], Card[]] = [[], [], []];
    for (let i = 0; i < dealtCards.length; i++) {
      const fi = assignment[i];
      if (fi !== null && fi !== undefined) hands[fi].push(dealtCards[i]);
    }
    getSocket().emit('pazpaz:partial_save', { roomId, assignment: { hands } });
  }, [assignment]);

  if (!roomId || !profile) return <Navigate to="/lobby" replace />;

  if (!gameState) {
    return (
      <div className="min-h-screen flex items-center justify-center"
        style={{ background: 'linear-gradient(135deg, #87CEEB 0%, #E0F6FF 100%)' }}>
        <style>{PZ_STYLES}</style>
        <div className="text-center space-y-3 bg-white/70  p-10 rounded-3xl border-2 border-white shadow-xl">
          <div className="text-6xl animate-bounce">🃏</div>
          <p className="pz-h text-2xl text-blue-600">Connecting…</p>
          {error && <p className="text-red-500 text-sm">{error}</p>}
          {retryCount > 0 && <p className="text-gray-400 text-xs">Retrying… ({retryCount}/5)</p>}
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

  // ── Helpers ──────────────────────────────────────────────────────────────────
  const dealtCards = myPlayer?.dealtCards ?? [];

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
    if (fi !== null && fi !== undefined) assignmentByFlop[fi].push(dealtCards[i]);
  }
  const allAssigned     = assignment.length === 12 && assignment.every(a => a !== null);
  const iHaveSubmitted  = submitted || (myPlayer?.hasSubmitted ?? false);
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
    if (assignment[cardIdx] !== null && assignment[cardIdx] !== undefined) return;
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

  // Scoring helpers
  const allFlopResults = isScoringPhase ? (gameState.flopResults ?? []) : [];
  const allRevealed    = revealedFlops >= 3;
  const winner         = gameState.winner;
  const iWon           = winner === playerIndex;
  const isDraw         = winner === 'draw';

  function getOppScoringCards(flopIdx: number): Card[] {
    if (!isScoringPhase || flopIdx >= revealedFlops) return [];
    const result = allFlopResults[flopIdx];
    if (!result) return [];
    return playerIndex === 0 ? result.player1Hole : result.player0Hole;
  }

  function getCommunityCards(flopIdx: number): Card[] {
    if (isScoringPhase && allFlopResults[flopIdx]) return allFlopResults[flopIdx].communityCards;
    return gameState!.flops[flopIdx];
  }

  // Fan — cards emerge from canvas bottom, no y-offset clipping
  const visibleCards  = displayOrder.slice(0, dealtVisible).map(idx => ({ idx, card: dealtCards[idx] }));
  const fanW          = 2 * (275 + LG.w / 2) + 40; // span of ±(275+halfCard) + margin = ~675px
  const fanH          = LG.h;                         // just card height; no extra rise

  // ─── Render ──────────────────────────────────────────────────────────────────
  return (
    /* Outer shell: always fills the viewport, clips overflow, centers the canvas */
    <div
      className="w-screen h-screen overflow-hidden flex items-center justify-center"
      style={{ background: 'linear-gradient(135deg, #87CEEB 0%, #E0F6FF 100%)' }}
    >
      <style>{PZ_STYLES}</style>
      {/* Fixed-size design canvas scaled to fit */}
      <div
        style={{
          width: DESIGN_W,
          height: DESIGN_H,
          transform: `scale(${cssScale})`,
          transformOrigin: 'center center',
          position: 'relative',
          overflow: 'hidden',
          background: 'linear-gradient(135deg, #87CEEB 0%, #E0F6FF 100%)',
          fontFamily: "'Nunito', sans-serif",
          flexShrink: 0,
          willChange: 'transform',
          isolation: 'isolate',
        }}
      >
      <div className="pz-clouds absolute inset-0 z-0 pointer-events-none" />

      {/* ── Floating top-left: back to lobby ──────────────────────────────── */}
      {!isScoringPhase && (
        <div className="absolute top-4 left-4 z-50">
          <button
            onClick={() => setConfirmExit(true)}
            className="pz-btn flex items-center gap-2 bg-white text-red-500 px-4 py-2 rounded-2xl font-bold text-sm shadow-[0_4px_0_#d1d5db] border-2 border-gray-100 hover:bg-gray-50"
          >
            ← Lobby
          </button>
        </div>
      )}

      {/* ── Floating top-center: opponent info ────────────────────────────── */}
      <div className="absolute top-4 left-1/2 -translate-x-1/2 z-50">
        <div className="flex items-center gap-3 bg-white/85  px-4 py-2 rounded-full border-2 border-white shadow-md">
          {oppPlayer?.avatarUrl
            ? <img src={oppPlayer.avatarUrl} className="w-9 h-9 rounded-full border-2 border-blue-300 object-cover" alt="" />
            : <div className="w-9 h-9 rounded-full border-2 border-blue-300 bg-blue-100 flex items-center justify-center text-blue-500 text-sm font-bold">{oppPlayer?.name?.[0] ?? '?'}</div>
          }
          <div>
            <div className="pz-h text-blue-700 text-base leading-tight">{oppPlayer?.name ?? 'Opponent'}</div>
            <div className="text-[11px] text-gray-500 font-semibold">
              {oppHasSubmitted ? '✅ Ready' : '🤔 Thinking…'}
            </div>
          </div>
        </div>
      </div>

      {/* ── Floating top-right: timer / result ────────────────────────────── */}
      <div className="absolute top-4 right-4 z-50">
        {isScoringPhase && allRevealed ? (
          <div className={`px-5 py-2 rounded-2xl border-4 text-white shadow-[0_4px_0_rgba(0,0,0,0.2)] text-center
            ${isDraw ? 'bg-yellow-400 border-yellow-300' : iWon ? 'bg-green-500 border-green-400' : 'bg-red-500 border-red-400'}`}>
            <div className="pz-h text-2xl leading-tight">
              {isDraw ? '🤝 DRAW' : iWon ? '🏆 YOU WIN!' : '😞 YOU LOSE'}
            </div>
            {gameState.stake != null && (
              <div className="text-sm font-bold opacity-90">
                {isDraw ? '±0 chips' : iWon ? `+${gameState.stake} chips` : `-${gameState.stake} chips`}
              </div>
            )}
          </div>
        ) : isScoringPhase ? (
          <div className="flex items-center gap-2 bg-white/90  px-4 py-2 rounded-full border-2 border-white shadow-md">
            <span className="text-gray-500 text-sm font-semibold animate-pulse">Revealing…</span>
            <button onClick={() => setRevealedFlops(3)} className="text-xs text-blue-500 underline font-bold">Skip</button>
          </div>
        ) : timerSeconds !== null ? (
          <div className={`flex items-center gap-2 bg-white px-5 py-2 rounded-full border-4 shadow-[0_4px_0_#d1d5db]
            ${timerSeconds <= 30 ? 'border-red-400 text-red-500 animate-pulse' : 'border-gray-200 text-gray-700'}`}>
            <span className="text-lg">⏱</span>
            <span className="pz-h text-2xl tabular-nums">
              {Math.floor(timerSeconds / 60)}:{String(timerSeconds % 60).padStart(2, '0')}
            </span>
          </div>
        ) : null}
      </div>

      {/* ── Main: 3 panels — full width, 5px gaps, no outer margin ──────── */}
      <main className={`absolute inset-0 flex items-stretch pt-20 overflow-hidden ${isScoringPhase ? 'pb-16' : 'pb-[200px]'}`}
        style={{ gap: PANEL_GAP }}>
            {([0, 1, 2] as const).map(flopIdx => {
              const theme      = HAND_THEMES[flopIdx];
              const result     = allFlopResults[flopIdx];
              const isRevealed = flopIdx < revealedFlops;
              const oppCards   = getOppScoringCards(flopIdx);
              const myFlopCards = isScoringPhase
                ? (playerIndex === 0 ? result?.player0Hole : result?.player1Hole) ?? assignmentByFlop[flopIdx]
                : assignmentByFlop[flopIdx];
              const communityCards = getCommunityCards(flopIdx);
              const hasAll = isScoringPhase && !!allFlopResults[flopIdx];

              const isActive = !iHaveSubmitted && !isScoringPhase && selectedCardIdx !== null && assignmentByFlop[flopIdx].length < 4;

              const flopResult = isRevealed && result
                ? result.winner === playerIndex ? 'WIN' : result.winner === 'draw' ? 'DRAW' : 'LOSE'
                : null;

              const oppUsedHole = isScoringPhase && isRevealed && result
                ? (playerIndex === 0 ? result.player1UsedHole : result.player0UsedHole) : [];
              const myUsedHole = isScoringPhase && isRevealed && result
                ? (playerIndex === 0 ? result.player0UsedHole : result.player1UsedHole) : [];

              // Badge: result during scoring, hand label otherwise
              const badge = flopResult === 'WIN'
                ? { cls: 'bg-green-400 text-white border-green-300', text: '🏆 WIN' }
                : flopResult === 'LOSE'
                ? { cls: 'bg-red-400 text-white border-red-300', text: '😞 LOSE' }
                : flopResult === 'DRAW'
                ? { cls: 'bg-yellow-400 text-white border-yellow-300', text: '🤝 DRAW' }
                : { cls: theme.badgeCls, text: theme.label };

              return (
                <div
                  key={flopIdx}
                  onClick={isActive ? () => handleFlopClick(flopIdx) : undefined}
                  onDragOver={(!iHaveSubmitted && !isScoringPhase && assignmentByFlop[flopIdx].length < 4) ? e => e.preventDefault() : undefined}
                  onDrop={(!iHaveSubmitted && !isScoringPhase) ? e => {
                    e.preventDefault();
                    const s = e.dataTransfer.getData('cardIndex');
                    if (s !== '') handleFlopDrop(flopIdx, parseInt(s));
                  } : undefined}
                  className={`relative flex flex-col items-center gap-2 bg-white/70 border-4 p-3 pt-6 rounded-2xl transition-transform
                    ${isActive ? 'cursor-pointer scale-[1.01]' : 'hover:scale-[1.002]'}`}
                  style={{
                    boxShadow: theme.glow,
                    borderColor: theme.border,
                    width: effectivePanelW,
                    flexShrink: 0,
                  }}
                >
                  {/* Floating badge */}
                  <div className={`absolute -top-4 left-1/2 -translate-x-1/2 px-4 py-1.5 rounded-full pz-h text-sm border-2 shadow-sm whitespace-nowrap z-10 ${badge.cls}`}>
                    {badge.text}
                  </div>

                  {/* Opponent row */}
                  <div className="w-full">
                    <p className="text-[10px] text-gray-500 font-bold uppercase tracking-wide mb-1 text-center">{oppPlayer?.name ?? 'Opponent'}</p>
                    <div className="flex gap-1 justify-center">
                      {[0, 1, 2, 3].map(s => {
                        const card   = oppCards[s];
                        const isUsed = card && oppUsedHole.some(c => c.rank === card.rank && c.suit === card.suit);
                        return card ? (
                          <div key={s} style={isUsed ? { borderRadius: 8, boxShadow: '0 0 10px 3px rgba(0,191,255,0.9)', outline: '2px solid #00bfff' } : {}}>
                            <PlayingCard card={card} width={cardW} height={cardH} />
                          </div>
                        ) : (
                          <div key={s}
                            className={`rounded-xl border-2 border-dashed flex-shrink-0 opacity-60 ${theme.oppSlotCls}`}
                            style={{ width: cardW, height: cardH }}
                          />
                        );
                      })}
                    </div>
                    {isScoringPhase && isRevealed && result && (
                      <p className="text-2xl font-black text-black text-center mt-1">
                        {(playerIndex === 0 ? result.player1Best : result.player0Best).label}
                      </p>
                    )}
                  </div>

                  {/* Community board */}
                  <div className="w-full bg-white/75 p-2 rounded-2xl border-2 border-white shadow-inner">
                    <p className="text-[9px] text-gray-400 font-bold uppercase tracking-wide text-center mb-1.5">Board</p>
                    {/* All 5 community cards in one row */}
                    <div className="flex gap-1 justify-center">
                      {[0, 1, 2, 3, 4].map(i => {
                        const card = communityCards[i];
                        const show = card && (i < 3 || hasAll);
                        return show
                          ? <PlayingCard key={i} card={card} width={cardW} height={cardH} />
                          : <div key={i} className={`rounded-xl border-2 border-dashed flex-shrink-0 ${theme.commCls}`} style={{ width: cardW, height: cardH }} />;
                      })}
                    </div>
                  </div>

                  {/* My row */}
                  <div className="w-full">
                    <p className="text-[10px] text-blue-600 font-bold uppercase tracking-wide mb-1 text-center">
                      You {!isScoringPhase ? `(${assignmentByFlop[flopIdx].length}/4)` : ''}
                    </p>
                    <div className="flex gap-1 justify-center">
                      {[0, 1, 2, 3].map(s => {
                        const card   = myFlopCards[s];
                        const isUsed = card && myUsedHole.some(c => c.rank === card.rank && c.suit === card.suit);
                        return card ? (
                          <div key={s} style={isUsed ? { borderRadius: 8, boxShadow: '0 0 10px 3px rgba(255,0,64,0.9)', outline: '2px solid #ff0040' } : {}}>
                            <PlayingCard card={card} width={cardW} height={cardH} />
                          </div>
                        ) : (
                          <div key={s}
                            className={`rounded-xl border-2 border-dashed flex items-center justify-center flex-shrink-0 transition cursor-pointer ${theme.mySlotCls}`}
                            style={{ width: cardW, height: cardH }}
                          >
                            {!iHaveSubmitted && !isScoringPhase && (
                              <span className="text-2xl font-black leading-none select-none">+</span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                    {isScoringPhase && isRevealed && result && (
                      <p className="text-2xl font-black text-black text-center mt-1">
                        {(playerIndex === 0 ? result.player0Best : result.player1Best).label}
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
      </main>

      {/* ── Hint + controls — float above the fan ─────────────────────────── */}
      {!isScoringPhase && !iHaveSubmitted && (
        <div className="absolute left-1/2 -translate-x-1/2 z-50 flex flex-col items-center gap-1"
          style={{ bottom: LG.h + 14 }}>
          <p className="text-center text-gray-700 text-[11px] font-bold bg-black/10 px-4 py-0.5 rounded-full whitespace-nowrap">
            {selectedCardIdx !== null ? '👆 Click a hand or drag' : `YOUR HAND · ${assignment.filter(a => a !== null).length}/12 — Click or drag cards to assign`}
          </p>
          <div className="flex gap-2 justify-center">
            <button
              onClick={() => setIsSorted(s => !s)}
              className="pz-btn px-4 py-1.5 rounded-[1.5rem] bg-white/90 text-gray-700 font-bold text-sm shadow-[0_4px_0_#d1d5db] border border-gray-100 hover:bg-white"
            >
              ↕ {isSorted ? 'Sorted' : 'Sort'}
            </button>
            {oppHasSubmitted && pressureSeconds !== null && (
              <div className={`px-4 py-1.5 rounded-[1.5rem] font-bold text-sm ${pressureSeconds <= 30 ? 'bg-red-100 text-red-500 animate-pulse' : 'bg-yellow-100 text-yellow-700'}`}>
                ⚡ {Math.floor(pressureSeconds / 60)}:{String(pressureSeconds % 60).padStart(2, '0')}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Fan cards — emerge from the very bottom of the canvas ──────────── */}
      {!isScoringPhase && (
        <div
          className="absolute z-40 overflow-visible"
          style={{ bottom: 0, left: '50%', marginLeft: -fanW / 2, width: fanW, height: fanH }}
        >
          {visibleCards.map(({ idx, card }, displayPos) => {
            const off = FAN_OFFSETS[displayPos] ?? { x: 0, r: 0 };
            const fi = assignment[idx];
            const flopAssigned = fi !== null && fi !== undefined ? fi : undefined;
            const isSelected   = selectedCardIdx === idx;

            return (
              <div
                key={idx}
                style={{
                  position: 'absolute',
                  left: '50%',
                  bottom: 0,
                  width: LG.w,
                  marginLeft: -LG.w / 2,
                  // translateX first (screen-space), then rotate around bottom-center — no y clipping
                  transform: `translateX(${off.x * fanScale}px) rotate(${off.r}deg)${isSelected ? ' translateY(-16px) scale(1.12)' : ''}`,
                  transformOrigin: 'bottom center',
                  zIndex: isSelected ? 50 : displayPos + 1,
                  transition: 'transform 0.15s ease',
                }}
                className={!iHaveSubmitted ? 'cursor-pointer' : ''}
                onClick={!iHaveSubmitted ? () => handleCardClick(idx) : undefined}
                draggable={!iHaveSubmitted && flopAssigned === undefined}
                onDragStart={!iHaveSubmitted && flopAssigned === undefined ? e => {
                  e.dataTransfer.setData('cardIndex', String(idx));
                  setDraggedIdx(idx);
                  setSelectedCardIdx(null);
                } : undefined}
                onDragEnd={() => setDraggedIdx(null)}
              >
                <div className={`transition-opacity ${flopAssigned !== undefined ? 'opacity-35' : ''} ${isSelected ? 'ring-2 ring-yellow-400 ring-offset-1 ring-offset-transparent rounded-xl' : ''}`}>
                  <PlayingCard card={card} width={LG.w} height={LG.h} />
                </div>
                {flopAssigned !== undefined && (
                  <span className="absolute -top-2 -right-2 w-5 h-5 rounded-full bg-yellow-400 text-black text-[10px] font-bold flex items-center justify-center shadow z-10">
                    F{flopAssigned + 1}
                  </span>
                )}
                {draggedIdx === idx && <div className="absolute inset-0 rounded-xl bg-black/20" />}
              </div>
            );
          })}
        </div>
      )}

      {/* ── Bottom-left: player info ───────────────────────────────────────── */}
      <div className="absolute bottom-4 left-4 z-50">
        <div className="flex items-center gap-3 bg-white/95  p-2 pr-5 rounded-[2rem] shadow-[0_8px_20px_rgba(0,0,0,0.07)] border border-white/80">
          {myPlayer?.avatarUrl
            ? <img src={myPlayer.avatarUrl} className="w-11 h-11 rounded-full border-2 border-gray-700 object-cover" alt="" />
            : <div className="w-11 h-11 rounded-full border-2 border-gray-700 bg-gray-200 flex items-center justify-center text-gray-600 font-bold">{myPlayer?.name?.[0] ?? 'Y'}</div>
          }
          <div>
            <div className="pz-h text-gray-900 text-base leading-tight">{myPlayer?.name ?? 'You'}</div>
            <div className="text-xs text-gray-500 font-semibold">{iHaveSubmitted ? '✅ Submitted' : '🃏 Assigning…'}</div>
          </div>
        </div>
      </div>

      {/* ── Bottom-right: confirm / back ───────────────────────────────────── */}
      <div className="absolute bottom-4 right-4 z-50">
        {isScoringPhase ? (
          <button
            onClick={goToLobby}
            className="pz-btn px-6 py-3 rounded-2xl bg-blue-500 text-white pz-h text-xl shadow-[0_6px_0_#2563eb] hover:bg-blue-400 border-2 border-blue-400 flex items-center gap-2"
          >
            ← Back to Lobby
          </button>
        ) : iHaveSubmitted ? (
          <div className="px-5 py-3 rounded-2xl bg-green-100 text-green-700 pz-h text-lg border-2 border-green-200 shadow-sm">
            {oppHasSubmitted ? '🎯 Revealing…' : '⏳ Waiting for opponent'}
          </div>
        ) : (
          <button
            onClick={handleSubmit}
            disabled={!allAssigned}
            className="pz-btn px-7 py-3 rounded-2xl bg-green-500 text-white pz-h text-xl shadow-[0_6px_0_#059669] hover:bg-green-400 disabled:opacity-40 disabled:cursor-not-allowed border-2 border-green-400 flex items-center gap-2"
          >
            ✓ Confirm Hand
          </button>
        )}
      </div>

      {/* Error */}
      {error && error !== 'Room not found' && (
        <div className="absolute top-20 left-1/2 -translate-x-1/2 z-50 bg-red-500/90 text-white px-6 py-2 rounded-full text-sm font-semibold shadow">
          {error}
        </div>
      )}

      {/* ── Exit confirmation modal ─────────────────────────────────────────── */}
      {confirmExit && (
        <div className="fixed inset-0 bg-black/40 z-[100] flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl border-2 border-white p-6 w-full max-w-sm shadow-2xl space-y-4">
            <div className="text-center space-y-2">
              <p className="text-3xl">🚪</p>
              <h2 className="pz-h text-2xl text-blue-700">Exit the Game?</h2>
              <p className="text-gray-500 text-sm font-semibold">
                You'll leave the game in progress. Your partial assignment is saved.
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
                onClick={goToLobby}
                className="pz-btn flex-1 py-2 rounded-2xl bg-blue-500 hover:bg-blue-400 text-white font-bold border-2 border-blue-400 shadow-[0_4px_0_#2563eb]"
              >
                Exit to Lobby
              </button>
            </div>
          </div>
        </div>
      )}
      </div>
    </div>
  );
}
