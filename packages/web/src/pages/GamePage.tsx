import { useEffect } from 'react';
import { useParams, Navigate } from 'react-router-dom';
import { useGameStore } from '../store/gameStore.js';
import { useAuthStore } from '../store/authStore.js';
import { useSocketEvents } from '../hooks/useSocketEvents.js';
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

  useEffect(() => {
    if (!roomId) return;
    const socket = getSocket();

    // Try to join; server sends back room:joined + game:state
    socket.emit('room:join', { roomId });

    return () => { /* socket stays open across nav */ };
  }, [roomId]);

  if (!roomId || !profile) return <Navigate to="/lobby" replace />;

  // Still waiting for server to confirm join
  if (playerIndex === null || !gameState) {
    return (
      <div className="min-h-screen bg-felt-dark flex items-center justify-center">
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

  function handleDraw() {
    if (!roomId) return;
    getSocket().emit('action:draw', { roomId });
  }

  function handlePlace(columnIndex: number) {
    if (!roomId) return;
    getSocket().emit('action:place', { roomId, columnIndex });
  }

  const phaseLabel: Record<string, string> = {
    SETUP_PHASE: 'Setup — place one card per column',
    MAIN_PHASE:  `Row ${gameState.currentRow + 1} of 5`,
    GAME_OVER:   'Game Over',
  };

  return (
    <div className="min-h-screen bg-felt-dark flex flex-col">
      {/* Top bar */}
      <header className="bg-black/30 border-b border-white/10 px-4 py-2 flex items-center justify-between">
        <h1 className="font-display text-xl text-gold">Poker5O</h1>
        <span className="text-sm text-white/50">{phaseLabel[gameState.phase] ?? ''}</span>
        {opponentDisconnected && (
          <span className="text-xs text-yellow-400 animate-pulse">⚠ Opponent disconnected</span>
        )}
      </header>

      <div className="flex-1 flex flex-col gap-4 p-4 overflow-auto">
        {/* Opponent grid (top) */}
        <PlayerGrid
          player={themPlayer}
          isMe={false}
          currentRow={gameState.currentRow}
          drawnCard={null}
          isMyTurn={!isMyTurn}
          phase={gameState.phase}
          onPlaceCard={() => {}}
        />

        {/* Centre: deck / drawn card */}
        <div className="flex items-center justify-center py-4">
          <div className="flex items-center gap-6">
            {/* Deck size */}
            <div className="text-center">
              <div className="w-14 h-20 rounded-lg bg-gradient-to-br from-blue-950 to-blue-900
                border border-blue-800 flex items-center justify-center">
                <span className="text-white/60 font-bold text-sm">{gameState.deck.length}</span>
              </div>
              <p className="text-xs text-white/30 mt-1">Deck</p>
            </div>

            <DrawnCard
              card={isMyTurn ? gameState.drawnCard : null}
              isMyTurn={isMyTurn}
              canDraw={drawAllowed}
              onDraw={handleDraw}
            />
          </div>
        </div>

        {/* My grid (bottom) */}
        <PlayerGrid
          player={myPlayer}
          isMe={true}
          currentRow={gameState.currentRow}
          drawnCard={gameState.drawnCard}
          isMyTurn={isMyTurn}
          phase={gameState.phase}
          onPlaceCard={handlePlace}
        />
      </div>
    </div>
  );
}
