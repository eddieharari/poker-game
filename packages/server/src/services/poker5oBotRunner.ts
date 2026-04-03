import type { Server } from 'socket.io';
import { applyAction } from '@poker5o/shared';
import type { GameState } from '@poker5o/shared';
import { roomService } from './roomService.js';
import { isBot } from './pazpazBotRunner.js';
import { chooseBestColumn } from './poker5oBot.js';

/**
 * Called after each state update in a Poker5O game.
 * If the current player is a bot, auto-draw and place after a short delay.
 */
export async function triggerPoker5oBotIfNeeded(
  io: Server,
  roomId: string,
  gameState: GameState,
  emitStateToRoom: (io: Server, room: any, state: GameState) => Promise<void>,
  handleGameOver: (io: Server, room: any, state: GameState) => Promise<void>,
  startTurnTimer: (io: Server, roomId: string, state: GameState, room: any) => Promise<void>,
): Promise<void> {
  if (gameState.phase !== 'MAIN_PHASE') return;
  if (gameState.drawnCard !== null) return; // already drawn, will be handled after draw

  const currentPlayerId = gameState.players[gameState.currentPlayerIndex].id;
  const botPlayer = await isBot(currentPlayerId);
  if (!botPlayer) return;

  // Delay 1-2 seconds to simulate thinking
  const delay = 1000 + Math.random() * 1000;

  setTimeout(async () => {
    try {
      const room = await roomService.get(roomId);
      if (!room?.gameState || room.gameState.phase !== 'MAIN_PHASE') return;

      const currentId = room.gameState.players[room.gameState.currentPlayerIndex].id;
      if (currentId !== currentPlayerId) return; // turn already changed

      // Draw
      let state = applyAction(room.gameState, { type: 'DRAW_CARD', playerId: currentId });
      await roomService.updateGameState(roomId, state);
      await emitStateToRoom(io, room, state);

      // Brief pause then place
      await new Promise<void>(r => setTimeout(r, 500 + Math.random() * 500));

      const freshRoom = await roomService.get(roomId);
      if (!freshRoom?.gameState || freshRoom.gameState.drawnCard === null) return;

      const botIndex = freshRoom.gameState.currentPlayerIndex;
      const colIdx = chooseBestColumn(freshRoom.gameState, botIndex);

      state = applyAction(freshRoom.gameState, {
        type: 'PLACE_CARD',
        playerId: currentId,
        columnIndex: colIdx,
      });

      await roomService.updateGameState(roomId, state);
      await emitStateToRoom(io, freshRoom, state);

      if (state.phase === 'GAME_OVER') {
        await handleGameOver(io, freshRoom, state);
      } else {
        // If it's still the bot's turn (same player), recurse
        const nextId = state.players[state.currentPlayerIndex].id;
        const nextIsBot = await isBot(nextId);
        if (nextIsBot) {
          triggerPoker5oBotIfNeeded(io, roomId, state, emitStateToRoom, handleGameOver, startTurnTimer);
        } else {
          await startTurnTimer(io, roomId, state, freshRoom);
        }
      }
    } catch (err) {
      console.error('[poker5oBot] error:', err);
    }
  }, delay);
}
