import { useEffect } from 'react';
import { useParams, Navigate } from 'react-router-dom';
import { useGameStore } from '../store/gameStore.js';
import { useAuthStore } from '../store/authStore.js';
import { useSocketEvents } from '../hooks/useSocketEvents.js';
import { useCardSize } from '../hooks/useCardSize.js';
import { getSocket } from '../socket.js';
import { canDrawCard } from '@poker5o/shared';
import { PlayerGrid } from '../components/game/PlayerGrid.js';
import { DrawnCard } from '../components/game/DrawnCard.js';
import { ScoreScreen } from '../components/game/ScoreScreen.js';

export function GamePage() {
  const { roomId } = useParams<{ roomId: string }>();
  const { profile } = useAuthStore();
  const { gameState, score, playerIndex, opponentDisconnected } = useGameStore();

  useSocketEvents();
  const { cardW, cardH } = useCardSize();

  useEffect(() => {
    if (!roomId) return;
    const socket = getSocket();
    socket.emit('room:join', { roomId });
    return () => { /* socket stays open across nav */ };
  }, [roomId]);

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

  if (score) return <ScoreScreen score={score} state={gameState} playerIndex={playerIndex} />;

  const myPlayer    = gameState.players[playerIndex];
  const themPlayer  = gameState.players[playerIndex === 0 ? 1 : 0];
  const isMyTurn    = gameState.currentPlayerIndex === playerIndex;
  const myPlayerId  = profile.id;
  const drawAllowed = canDrawCard(gameState, myPlayerId);
  const opponentIndex = playerIndex === 0 ? 1 : 0;

  function handleDraw() {
    if (!roomId) return;
    getSocket().emit('action:draw', { roomId });
  }

  function handlePlace(columnIndex: number) {
    if (!roomId) return;
    getSocket().emit('action:place', { roomId, columnIndex });
  }

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
      {/* Header */}
      <header className="flex-shrink-0 bg-black/60 backdrop-blur-sm border-b border-white/10 px-4 py-2 flex items-center justify-between">
        <h1 className="font-display text-lg text-gold">Poker5O</h1>
        <span className="text-xs text-white/50 bg-black/30 px-3 py-1 rounded-full">
          {phaseLabel[gameState.phase] ?? ''}
        </span>
        {opponentDisconnected && (
          <span className="text-xs text-yellow-400 animate-pulse">⚠ Opponent disconnected</span>
        )}
      </header>

      {/* Main content: full-width grids */}
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
        />

        {/* Center strip: draw controls */}
        <div className="flex-shrink-0 flex items-center justify-center gap-6 border-y border-white/10 bg-black/40" style={{ height: 120 }}>
          {/* Deck count */}
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

          {/* Draw / place indicator */}
          <DrawnCard
            card={isMyTurn ? gameState.drawnCard : null}
            isMyTurn={isMyTurn}
            canDraw={drawAllowed}
            onDraw={handleDraw}
            cardW={56}
            cardH={84}
          />
        </div>

        {/* My grid */}
        <PlayerGrid
          player={myPlayer}
          isMe={true}
          currentRow={gameState.currentRow}
          drawnCard={gameState.drawnCard}
          isMyTurn={isMyTurn}
          phase={gameState.phase}
          onPlaceCard={handlePlace}
          avatarUrl={profile.avatar_url}
          cardW={cardW}
          cardH={cardH}
        />
      </div>
    </div>
  );
}
