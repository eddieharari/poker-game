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

      {/* Main content: grids + side panel */}
      <div className="flex-1 flex overflow-hidden">

        {/* Game table: both player grids close together */}
        <div className="flex-1 flex flex-col items-center justify-center gap-2 py-3 px-2">

          {/* Opponent grid (flipped: row 0 closest to center) */}
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

          {/* Center divider */}
          <div className="w-full max-w-lg h-px bg-white/10 mx-auto" />

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

        {/* Side panel: deck + drawn card */}
        <div
          className="flex-shrink-0 flex flex-col items-center justify-center gap-6 py-4 px-3 border-l border-white/10 bg-black/50 backdrop-blur-sm"
          style={{ width: cardW + 32 }}
        >
          {/* Deck */}
          <div className="flex flex-col items-center gap-1">
            <div
              className="rounded-lg bg-gradient-to-br from-blue-950 to-blue-900 border border-blue-800 flex items-center justify-center shadow-lg"
              style={{ width: cardW, height: cardH }}
            >
              <span className="text-white/60 font-bold text-xl">{gameState.deck.length}</span>
            </div>
            <p className="text-xs text-white/30">Deck</p>
          </div>

          {/* Drawn card */}
          <DrawnCard
            card={isMyTurn ? gameState.drawnCard : null}
            isMyTurn={isMyTurn}
            canDraw={drawAllowed}
            onDraw={handleDraw}
            cardW={cardW}
            cardH={cardH}
          />
        </div>
      </div>
    </div>
  );
}
