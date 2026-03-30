import { useEffect, useRef, useState } from 'react';
import { useParams, Navigate, useNavigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '../store/authStore.js';
import { useGameStore } from '../store/gameStore.js';
import { getSocket } from '../socket.js';
import { PlayingCard } from '../components/game/PlayingCard.js';
import { playDealSound, playWinSound, playLoseSound } from '../sounds.js';
import { useVoiceChat } from '../hooks/useVoiceChat.js';
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

// Inner usable width of each panel (border-2 = 8px, p-3 = 24px)
const effectivePanelW = Math.floor((DESIGN_W - PANEL_GAP * 2) / 3);  // 476px
const panelInnerW = effectivePanelW - 8 - 24;                          // 444px

// Hole cards: 4 per row with gap-1 (3 gaps × 4px = 12px)
const cardW = Math.max(40, Math.floor((panelInnerW - 12) / 4));        // 108px (~27% bigger)
const cardH = Math.round(cardW * (50 / 36));                            // 150px

// Community cards: 5 per row with gap-1 (4 gaps × 4px = 16px)
const commCardW = Math.max(40, Math.floor((panelInnerW - 16) / 5));    // 85px (unchanged)
const commCardH = Math.round(commCardW * (50 / 36));                    // 118px

const fanScale = 1.0; // DESIGN_W is wide enough for all 12 fan cards

// ─── Card sizes ───────────────────────────────────────────────────────────────

const LG = { w: cardW, h: cardH }; // fan cards use hole card size

// ─── Face-down card ───────────────────────────────────────────────────────────

// const FACE_DOWN_CARD: Card = { rank: 'A', suit: 'spades', faceDown: true };

// ─── Hand themes (one per flop) ───────────────────────────────────────────────

const HAND_THEMES = [
  {
    label: 'BACK HAND',
    topLine: '#39FF14',
    glow: '0 0 30px rgba(57,255,20,0.18), inset 0 0 20px rgba(57,255,20,0.08)',
    border: 'rgba(57,255,20,0.6)',
    badgeCls: 'bg-[#39FF14]/10 text-[#39FF14] border-[#39FF14]/30',
    commCls:  'border-[#39FF14]/25 bg-black/50',
    mySlotCls:'border-[#39FF14]/40 bg-black/60 text-[#39FF14]/40 hover:bg-[#39FF14]/5',
    oppSlotCls:'border-[#39FF14]/25 bg-black/50',
  },
  {
    label: 'MIDDLE HAND',
    topLine: '#FF00FF',
    glow: '0 0 30px rgba(255,0,255,0.18), inset 0 0 20px rgba(255,0,255,0.08)',
    border: 'rgba(255,0,255,0.6)',
    badgeCls: 'bg-[#FF00FF]/10 text-[#FF00FF] border-[#FF00FF]/30',
    commCls:  'border-[#FF00FF]/25 bg-black/50',
    mySlotCls:'border-[#FF00FF]/40 bg-black/60 text-[#FF00FF]/40 hover:bg-[#FF00FF]/5',
    oppSlotCls:'border-[#FF00FF]/25 bg-black/50',
  },
  {
    label: 'FRONT HAND',
    topLine: '#00FFFF',
    glow: '0 0 30px rgba(0,255,255,0.18), inset 0 0 20px rgba(0,255,255,0.08)',
    border: 'rgba(0,255,255,0.6)',
    badgeCls: 'bg-[#00FFFF]/10 text-[#00FFFF] border-[#00FFFF]/30',
    commCls:  'border-[#00FFFF]/25 bg-black/50',
    mySlotCls:'border-[#00FFFF]/40 bg-black/60 text-[#00FFFF]/40 hover:bg-[#00FFFF]/5',
    oppSlotCls:'border-[#00FFFF]/25 bg-black/50',
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

// ─── Inline CSS — dark space theme ────────────────────────────────────────────

const PZ_STYLES = `
  @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=Inter:wght@400;500;600;700&display=swap');
  .pz-h { font-family: 'Space Grotesk', sans-serif !important; }
  .pz-rotate-overlay {
    display: none;
    position: fixed;
    inset: 0;
    z-index: 99999;
    background: #0B0C10;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 20px;
    color: #E0E6ED;
    font-family: 'Space Grotesk', sans-serif;
  }
  @media (orientation: portrait) and (max-width: 1024px) {
    .pz-rotate-overlay { display: flex !important; }
  }
  .glass-panel {
    background: rgba(26, 28, 35, 0.6);
    backdrop-filter: blur(16px);
    -webkit-backdrop-filter: blur(16px);
    border: 1px solid rgba(255,255,255,0.05);
    box-shadow: 0 8px 32px 0 rgba(0,0,0,0.37);
  }
  .pz-btn {
    transition: all 0.2s ease;
    position: relative;
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
  .pz-stars {
    position: absolute; top: 0; left: 0; right: 0; bottom: 0;
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
    animation: twinkle 8s infinite alternate;
  }
  @keyframes twinkle { 0% { opacity: 0.3; } 100% { opacity: 0.7; } }
  .pz-nebula {
    position: absolute; top: 0; left: 0; right: 0; bottom: 0;
    z-index: 0; pointer-events: none;
    background:
      radial-gradient(circle at 15% 50%, rgba(110,86,207,0.15) 0%, transparent 50%),
      radial-gradient(circle at 85% 30%, rgba(69,243,255,0.1) 0%, transparent 50%);
  }
`;

// ─── Main page ────────────────────────────────────────────────────────────────

export function PazPazPage() {
  const { roomId } = useParams<{ roomId: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { profile } = useAuthStore();
  const reset = useGameStore(s => s.reset);

  const [gameState, setGameState] = useState<PazPazGameState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const retryRef = useRef(0);
  const [retryCount, setRetryCount] = useState(0);

  const [confirmExit, setConfirmExit] = useState(false);
  const [confirmForfeit, setConfirmForfeit] = useState(false);

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

  // Scoring reveal — 22 steps total (7 per flop × 3 flops + 1 overall winner)
  const [revealStep, setRevealStep] = useState(0);

  // CSS scale — shrink/grow the fixed 1440×900 canvas to fill any viewport
  const [cssScale, setCssScale] = useState(
    () => Math.min(window.innerWidth / DESIGN_W, window.innerHeight / DESIGN_H)
  );
  useEffect(() => {
    const onResize = () => setCssScale(Math.min(window.innerWidth / DESIGN_W, window.innerHeight / DESIGN_H));
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const vocal = !!(location.state as { vocal?: boolean } | null)?.vocal;

  const timerSeconds    = useCountdown(gameState?.assignDeadline  ?? null);
  const pressureSeconds = useCountdown(gameState?.pressureDeadline ?? null);

  const playerIndex: 0 | 1 | null = gameState
    ? gameState.players[0].id === profile?.id ? 0
      : gameState.players[1].id === profile?.id ? 1
      : null
    : null;

  const myPlayer  = playerIndex !== null && gameState ? gameState.players[playerIndex] : null;
  const oppPlayer = playerIndex !== null && gameState ? gameState.players[playerIndex === 0 ? 1 : 0] : null;
  const opponentPlayerId = oppPlayer?.id ?? null;
  const { connected: voiceConnected, muted, toggleMute } = useVoiceChat({ vocal, opponentPlayerId, isInitiator: playerIndex === 0 });

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
    socket.on('pazpaz:forfeited', () => { goToLobby(); });
    socket.emit('pazpaz:join', { roomId });
    return () => { socket.off('pazpaz:state'); socket.off('pazpaz:error'); socket.off('pazpaz:forfeited'); };
  }, [roomId]);

  // Reveal animation — stepped: 7 steps per flop (4 opp cards + turn + river + winner), then overall winner
  function getStepDelay(step: number): number {
    if (step === 21) return 1000; // pause before overall winner
    const r = step % 7;
    if (r === 0) return step === 0 ? 700 : 800; // before first opp card of each flop
    if (r <= 3) return 600;  // between opp cards
    if (r === 4) return 800; // before turn
    if (r === 5) return 600; // before river
    return 500;              // r === 6, before winner badge
  }
  useEffect(() => {
    if (gameState?.phase !== 'SCORING') { setRevealStep(0); return; }
    if (revealStep >= 22) return;
    const t = setTimeout(() => setRevealStep(s => s + 1), getStepDelay(revealStep));
    return () => clearTimeout(t);
  }, [gameState?.phase, revealStep]);

  // Win/lose sound — plays when overall winner is revealed (step 22)
  const resultSoundPlayed = useRef(false);
  useEffect(() => {
    if (revealStep < 22 || resultSoundPlayed.current || !gameState) return;
    resultSoundPlayed.current = true;
    const myIdx = gameState.players[0].id === profile?.id ? 0 : 1;
    const w = gameState.winner;
    if (w === 'draw' || w === null) return;
    if (w === myIdx) playWinSound(); else playLoseSound();
  }, [revealStep]);

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
        style={{ background: 'radial-gradient(circle at 50% 50%, #12141D 0%, #0B0C10 100%)', color: '#E0E6ED' }}>
        <style>{PZ_STYLES}</style>
        <div className="glass-panel text-center space-y-3 p-10 rounded-3xl border border-white/10 shadow-xl">
          <div className="text-6xl animate-bounce">🃏</div>
          <p className="pz-h text-2xl text-[#45F3FF]">Connecting…</p>
          {error && <p className="text-red-400 text-sm">{error}</p>}
          {retryCount > 0 && <p className="text-gray-500 text-xs">Retrying… ({retryCount}/5)</p>}
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

  function handleUnassignCard(card: Card) {
    if (iHaveSubmitted || isScoringPhase) return;
    const idx = dealtCards.findIndex(c => c.rank === card.rank && c.suit === card.suit);
    if (idx >= 0) {
      setAssignment(prev => { const n = [...prev]; n[idx] = null; return n; });
      setSelectedCardIdx(null);
    }
  }

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
  const allRevealed    = revealStep >= 22;
  const winner         = gameState.winner;
  const iWon           = winner === playerIndex;
  const isDraw         = winner === 'draw';

  function getOppScoringCards(flopIdx: number): Card[] {
    if (!isScoringPhase) return [];
    const result = allFlopResults[flopIdx];
    if (!result) return [];
    const allCards = playerIndex === 0 ? result.player1Hole : result.player0Hole;
    const count = Math.min(4, Math.max(0, revealStep - flopIdx * 7));
    return allCards.slice(0, count);
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
      style={{ background: 'radial-gradient(circle at 50% 50%, #12141D 0%, #0B0C10 100%)' }}
    >
      <style>{PZ_STYLES}</style>
      {/* Portrait-mode blocker — hidden in landscape via CSS */}
      <div className="pz-rotate-overlay">
        <div style={{ fontSize: 72, lineHeight: 1 }}>↺</div>
        <p style={{ fontSize: 22, fontWeight: 600, color: '#45F3FF', textAlign: 'center', padding: '0 32px' }}>
          Please rotate your device
        </p>
        <p style={{ fontSize: 14, color: 'rgba(224,230,237,0.5)', textAlign: 'center', padding: '0 48px' }}>
          PazPaz is designed for landscape mode
        </p>
      </div>
      {/* Fixed-size design canvas scaled to fit */}
      <div
        style={{
          width: DESIGN_W,
          height: DESIGN_H,
          transform: `scale(${cssScale})`,
          transformOrigin: 'center center',
          position: 'relative',
          overflow: 'hidden',
          background: 'radial-gradient(circle at 50% 50%, #12141D 0%, #0B0C10 100%)',
          fontFamily: "'Inter', sans-serif",
          color: '#E0E6ED',
          flexShrink: 0,
          willChange: 'transform',
          isolation: 'isolate',
        }}
      >
      <div className="pz-stars" />
      <div className="pz-nebula" />

      {/* ── Floating top-left: back to lobby + voice ─────────────────────── */}
      {!isScoringPhase && (
        <div className="absolute top-4 left-4 z-50 flex items-center gap-2">
          <button
            onClick={() => setConfirmExit(true)}
            className="pz-btn glass-panel flex items-center gap-3 px-5 py-2.5 rounded-xl font-medium text-sm border border-white/10 text-gray-300 hover:text-white"
          >
            ← Lobby
          </button>
          <button
            onClick={() => setConfirmForfeit(true)}
            className="pz-btn glass-panel flex items-center gap-3 px-5 py-2.5 rounded-xl font-medium text-sm border border-[#FF3366]/40 text-[#FF3366] hover:text-white"
          >
            🏳 Give Up
          </button>
          {vocal && (
            <button
              onClick={toggleMute}
              title={muted ? 'Unmute' : 'Mute'}
              className="relative glass-panel w-10 h-10 rounded-xl flex items-center justify-center border"
              style={{ border: `1px solid ${muted ? 'rgba(255,51,102,0.5)' : voiceConnected ? 'rgba(0,255,157,0.5)' : 'rgba(255,255,255,0.1)'}` }}
            >
              <span className="text-base">{muted ? '🔇' : '🎙'}</span>
              <span
                className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full border border-[#0B0C10]"
                style={{ background: voiceConnected ? '#00FF9D' : '#FF3366' }}
              />
            </button>
          )}
        </div>
      )}

      {/* ── Floating top-left during scoring: voice button ───────────────── */}
      {isScoringPhase && vocal && (
        <div className="absolute top-4 left-4 z-50">
          <button
            onClick={toggleMute}
            title={muted ? 'Unmute' : 'Mute'}
            className="relative glass-panel w-10 h-10 rounded-xl flex items-center justify-center border"
            style={{ border: `1px solid ${muted ? 'rgba(255,51,102,0.5)' : voiceConnected ? 'rgba(0,255,157,0.5)' : 'rgba(255,255,255,0.1)'}` }}
          >
            <span className="text-base">{muted ? '🔇' : '🎙'}</span>
            <span
              className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full border border-[#0B0C10]"
              style={{ background: voiceConnected ? '#00FF9D' : '#FF3366' }}
            />
          </button>
        </div>
      )}

      {/* ── Floating top-center: opponent info ────────────────────────────── */}
      <div className="absolute top-4 left-1/2 -translate-x-1/2 z-50">
        <div className="flex items-center gap-3 glass-panel px-4 py-2 rounded-full border border-white/10">
          {oppPlayer?.avatarUrl
            ? <img src={oppPlayer.avatarUrl} className="w-9 h-9 rounded-full border-2 border-[#6E56CF] object-cover" alt="" />
            : <div className="w-9 h-9 rounded-full border-2 border-[#6E56CF] bg-black/50 flex items-center justify-center text-[#8B5CF6] text-sm font-bold">{oppPlayer?.name?.[0] ?? '?'}</div>
          }
          <div>
            <div className="pz-h text-white text-sm tracking-wide">{oppPlayer?.name ?? 'Opponent'}</div>
            <div className="text-[10px] text-gray-400 font-medium tracking-widest uppercase mt-0.5">
              {oppHasSubmitted ? '✅ Ready' : '⟳ Thinking…'}
            </div>
          </div>
        </div>
      </div>

      {/* ── Floating top-right: timer / result ────────────────────────────── */}
      <div className="absolute top-4 right-4 z-50">
        {isScoringPhase && allRevealed ? (
          <div className="glass-panel px-5 py-2 rounded-2xl border text-center"
            style={{
              borderColor: isDraw ? '#FFD700' : iWon ? '#00FF9D' : '#FF3366',
              boxShadow: `0 0 25px ${isDraw ? 'rgba(255,215,0,0.25)' : iWon ? 'rgba(0,255,157,0.25)' : 'rgba(255,51,102,0.25)'}`,
            }}>
            <div className={`pz-h text-2xl leading-tight ${isDraw ? 'text-[#FFD700]' : iWon ? 'text-[#00FF9D]' : 'text-[#FF3366]'}`}>
              {isDraw ? '🤝 DRAW' : iWon ? '🏆 YOU WIN!' : '😞 YOU LOSE'}
            </div>
            {gameState.stake != null && (() => {
              const totalRake = gameState.rake ?? 0;
              // rake = fee per player; Winner: +stake-fee; Loser: -(stake+fee); Draw: -fee
              const net = isDraw
                ? -totalRake
                : iWon
                  ? gameState.stake - totalRake
                  : -(gameState.stake + totalRake);
              return (
                <div className="text-sm font-medium opacity-80">
                  {net >= 0 ? '+' : ''}{net.toLocaleString()} chips
                  {totalRake > 0 && <span className="opacity-60 text-xs ml-1">(rake: {totalRake})</span>}
                </div>
              );
            })()}
          </div>
        ) : isScoringPhase ? (
          <div className="glass-panel flex items-center gap-2 px-4 py-2 rounded-full border border-white/10">
            <span className="text-gray-400 text-sm font-medium animate-pulse">Revealing…</span>
            <button onClick={() => setRevealStep(22)} className="text-xs text-[#45F3FF] underline font-medium">Skip</button>
          </div>
        ) : timerSeconds !== null ? (
          <div className={`glass-panel flex items-center gap-3 px-6 py-3 rounded-full border
            ${timerSeconds <= 30 ? 'border-red-500/50 text-red-400 animate-pulse' : 'border-[#45F3FF]/40 text-white'}`}
            style={{ boxShadow: timerSeconds <= 30 ? undefined : '0 0 25px rgba(69,243,255,0.15)' }}>
            <span className="text-sm">⏱</span>
            <span className="pz-h text-xl tabular-nums" style={{ textShadow: timerSeconds <= 30 ? undefined : '0 0 10px rgba(69,243,255,0.5)' }}>
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
              const isRevealed = revealStep >= flopIdx * 7 + 7;
              const showTurn   = revealStep >= flopIdx * 7 + 5;
              const showRiver  = revealStep >= flopIdx * 7 + 6;
              const oppCards   = getOppScoringCards(flopIdx);
              const myFlopCards = isScoringPhase
                ? (playerIndex === 0 ? result?.player0Hole : result?.player1Hole) ?? assignmentByFlop[flopIdx]
                : assignmentByFlop[flopIdx];
              const communityCards = getCommunityCards(flopIdx);

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
                ? { cls: 'bg-[#00FF9D]/15 text-[#00FF9D] border-[#00FF9D]/40', text: '🏆 WIN' }
                : flopResult === 'LOSE'
                ? { cls: 'bg-[#FF3366]/15 text-[#FF3366] border-[#FF3366]/40', text: '😞 LOSE' }
                : flopResult === 'DRAW'
                ? { cls: 'bg-[#FFD700]/15 text-[#FFD700] border-[#FFD700]/40', text: '🤝 DRAW' }
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
                  className={`relative flex flex-col items-center gap-2 glass-panel border-2 p-3 pt-8 rounded-[2rem] transition-transform
                    ${isActive ? 'cursor-pointer scale-[1.01]' : 'hover:scale-[1.002]'}`}
                  style={{
                    boxShadow: theme.glow,
                    borderColor: theme.border,
                    width: effectivePanelW,
                    flexShrink: 0,
                  }}
                >
                  {/* Top gradient line */}
                  <div className="absolute top-0 left-0 w-full h-px pointer-events-none opacity-60"
                    style={{ background: `linear-gradient(90deg, transparent, ${theme.topLine}, transparent)` }} />
                  {/* Floating badge */}
                  <div className={`absolute -top-5 left-1/2 -translate-x-1/2 px-5 py-2 rounded-full pz-h text-sm font-bold border tracking-[0.15em] uppercase shadow-lg whitespace-nowrap z-20 ${badge.cls}`}
                    style={{ minWidth: 120, textAlign: 'center' }}>
                    {badge.text}
                  </div>

                  {/* Opponent row */}
                  <div className="w-full">
                    <p className="text-[10px] text-gray-500 font-medium uppercase tracking-widest mb-1 text-center">{oppPlayer?.name ?? 'Opponent'}</p>
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
                      <p className="pz-h text-2xl text-gray-300 text-center mt-1">
                        {(playerIndex === 0 ? result.player1Best : result.player0Best).label}
                      </p>
                    )}
                  </div>

                  {/* Community board */}
                  <div className="w-full bg-black/40 p-2 rounded-2xl border border-white/10">
                    <p className="text-[9px] text-gray-500 font-medium uppercase tracking-widest text-center mb-1.5">Board</p>
                    {/* All 5 community cards in one row */}
                    <div className="flex gap-1 justify-center">
                      {[0, 1, 2, 3, 4].map(i => {
                        const card = communityCards[i];
                        const show = card && (i < 3 || (i === 3 && showTurn) || (i === 4 && showRiver));
                        return show
                          ? <PlayingCard key={i} card={card} width={commCardW} height={commCardH} />
                          : <div key={i} className={`rounded-xl border-2 border-dashed flex-shrink-0 ${theme.commCls}`} style={{ width: commCardW, height: commCardH }} />;
                      })}
                    </div>
                  </div>

                  {/* My row */}
                  <div className="w-full">
                    <p className="text-[10px] text-[#45F3FF] font-medium uppercase tracking-widest mb-1 text-center">
                      You {!isScoringPhase ? `(${assignmentByFlop[flopIdx].length}/4)` : ''}
                    </p>
                    <div className="flex gap-1 justify-center">
                      {[0, 1, 2, 3].map(s => {
                        const card   = myFlopCards[s];
                        const isUsed = card && myUsedHole.some(c => c.rank === card.rank && c.suit === card.suit);
                        return card ? (
                          <div
                            key={s}
                            style={isUsed ? { borderRadius: 8, boxShadow: '0 0 10px 3px rgba(255,0,64,0.9)', outline: '2px solid #ff0040' } : {}}
                            onClick={!iHaveSubmitted && !isScoringPhase ? (e) => { e.stopPropagation(); handleUnassignCard(card); } : undefined}
                            className={!iHaveSubmitted && !isScoringPhase ? 'cursor-pointer hover:opacity-75 transition-opacity' : ''}
                            title={!iHaveSubmitted && !isScoringPhase ? 'Click to remove' : undefined}
                          >
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
                      <p className="pz-h text-2xl text-[#45F3FF] text-center mt-1">
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
          <p className="text-center text-gray-400 text-[11px] font-medium glass-panel px-4 py-1 rounded-full whitespace-nowrap border border-white/10">
            {selectedCardIdx !== null ? '👆 Click a hand or drag' : `YOUR HAND · ${assignment.filter(a => a !== null).length}/12 — Click or drag cards to assign`}
          </p>
          <div className="flex gap-2 justify-center">
            <button
              onClick={() => setIsSorted(s => !s)}
              className="pz-btn px-4 py-1.5 rounded-xl text-sm font-medium tracking-wide"
            >
              ↕ {isSorted ? 'Sorted' : 'Sort'}
            </button>
            {oppHasSubmitted && pressureSeconds !== null && (
              <div className={`glass-panel px-4 py-1.5 rounded-xl font-medium text-sm border ${pressureSeconds <= 30 ? 'border-red-500/50 text-red-400 animate-pulse' : 'border-[#FFD700]/40 text-[#FFD700]'}`}>
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
        <div className="flex items-center gap-4 glass-panel p-2 pr-6 rounded-full border border-white/10 shadow-lg">
          {myPlayer?.avatarUrl
            ? <img src={myPlayer.avatarUrl} className="w-12 h-12 rounded-full border-2 border-[#45F3FF] object-cover" alt="" />
            : <div className="w-12 h-12 rounded-full border-2 border-[#45F3FF] bg-black/50 flex items-center justify-center text-[#45F3FF] font-bold">{myPlayer?.name?.[0] ?? 'Y'}</div>
          }
          <div>
            <div className="pz-h text-white text-sm tracking-wide">{myPlayer?.name ?? 'You'}</div>
            <div className="text-[10px] text-[#45F3FF] uppercase tracking-widest font-medium mt-0.5">{iHaveSubmitted ? '✅ Submitted' : '🃏 Assigning…'}</div>
          </div>
        </div>
      </div>

      {/* ── Bottom-right: confirm / back ───────────────────────────────────── */}
      <div className="absolute bottom-4 right-4 z-50">
        {isScoringPhase ? (
          <button
            onClick={goToLobby}
            className="pz-btn glass-panel px-6 py-3 rounded-2xl pz-h text-lg border border-[#45F3FF]/40 text-[#45F3FF] flex items-center gap-2"
            style={{ boxShadow: '0 0 20px rgba(69,243,255,0.15)' }}
          >
            ← Back to Lobby
          </button>
        ) : iHaveSubmitted ? (
          <div className="glass-panel px-5 py-3 rounded-2xl pz-h text-lg border border-[#00FF9D]/30 text-[#00FF9D]">
            {oppHasSubmitted ? '🎯 Revealing…' : '⏳ Waiting…'}
          </div>
        ) : (
          <button
            onClick={handleSubmit}
            disabled={!allAssigned}
            className="pz-h text-base tracking-widest uppercase px-8 py-4 rounded-2xl flex items-center gap-3 transition-all border font-medium disabled:opacity-40 disabled:cursor-not-allowed hover:scale-105"
            style={{ background: '#00FF9D', color: '#000', borderColor: '#00FF9D', boxShadow: '0 0 30px rgba(0,255,157,0.3)' }}
          >
            Confirm Hand ✓
          </button>
        )}
      </div>

      {/* Error */}
      {error && error !== 'Room not found' && (
        <div className="absolute top-20 left-1/2 -translate-x-1/2 z-50 bg-red-500/90 text-white px-6 py-2 rounded-full text-sm font-semibold shadow">
          {error}
        </div>
      )}

      {/* ── Forfeit confirmation modal ──────────────────────────────────────── */}
      {confirmForfeit && (
        <div className="fixed inset-0 bg-black/70 z-[100] flex items-center justify-center p-4">
          <div className="glass-panel rounded-3xl border border-[#FF3366]/30 p-6 w-full max-w-sm shadow-2xl space-y-4">
            <div className="text-center space-y-2">
              <p className="text-3xl">🏳</p>
              <h2 className="pz-h text-2xl text-[#FF3366]">Give Up?</h2>
              <p className="text-gray-400 text-sm font-medium">
                You'll forfeit the game and lose your stake. Your opponent wins.
              </p>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setConfirmForfeit(false)}
                className="pz-btn flex-1 py-2 rounded-2xl font-medium border border-white/10"
              >
                Keep Playing
              </button>
              <button
                onClick={() => { setConfirmForfeit(false); getSocket().emit('pazpaz:forfeit', { roomId: roomId! }); }}
                className="flex-1 py-2 rounded-2xl font-medium border border-[#FF3366]/50 text-[#FF3366] transition-all hover:bg-[#FF3366]/10"
                style={{ boxShadow: '0 0 15px rgba(255,51,102,0.15)' }}
              >
                Yes, Give Up
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Exit confirmation modal ─────────────────────────────────────────── */}
      {confirmExit && (
        <div className="fixed inset-0 bg-black/70 z-[100] flex items-center justify-center p-4">
          <div className="glass-panel rounded-3xl border border-white/10 p-6 w-full max-w-sm shadow-2xl space-y-4">
            <div className="text-center space-y-2">
              <p className="text-3xl">🚪</p>
              <h2 className="pz-h text-2xl text-[#45F3FF]">Exit the Game?</h2>
              <p className="text-gray-400 text-sm font-medium">
                You'll leave the game in progress. Your partial assignment is saved.
              </p>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setConfirmExit(false)}
                className="pz-btn flex-1 py-2 rounded-2xl font-medium border border-white/10"
              >
                Stay
              </button>
              <button
                onClick={goToLobby}
                className="flex-1 py-2 rounded-2xl font-medium border border-[#45F3FF]/40 text-[#45F3FF] transition-all hover:bg-[#45F3FF]/10"
                style={{ boxShadow: '0 0 15px rgba(69,243,255,0.15)' }}
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
