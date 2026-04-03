import type { Server } from 'socket.io';
import { revealAndScore } from '@poker5o/shared';
import type { PazPazGameState, PazPazAssignment } from '@poker5o/shared';
import { pazpazRoomService } from './pazpazRoomService.js';
import { supabase } from '../supabase.js';
import { computeBotAssignment } from './pazpazBot.js';
import { log } from '../logger.js';

/**
 * Check if a player is a bot. Returns true if their profile has role='bot'.
 */
export async function isBot(playerId: string): Promise<boolean> {
  const { data } = await supabase.from('profiles').select('role').eq('id', playerId).single();
  return data?.role === 'bot';
}

/**
 * Called after a PazPaz game is created. If one of the players is a bot,
 * compute and submit the bot's assignment after a short delay.
 */
export async function triggerBotIfNeeded(
  io: Server,
  roomId: string,
  handleBotGameOver: (io: Server, roomId: string, gameState: PazPazGameState, p0Id: string, p1Id: string, stake: number, lobbyRoomId: string | null) => Promise<void>,
): Promise<void> {
  const room = await pazpazRoomService.get(roomId);
  if (!room || room.gameState.phase !== 'ASSIGNING') return;

  // Check both players
  const p0IsBot = await isBot(room.player0.playerId);
  const p1IsBot = await isBot(room.player1.playerId);

  if (!p0IsBot && !p1IsBot) return;

  // Delay 3-8 seconds to simulate "thinking"
  const delay = 3000 + Math.random() * 5000;

  setTimeout(async () => {
    const currentRoom = await pazpazRoomService.get(roomId);
    if (!currentRoom || currentRoom.gameState.phase !== 'ASSIGNING') return;

    for (const botIndex of [0, 1] as const) {
      const isBotPlayer = botIndex === 0 ? p0IsBot : p1IsBot;
      if (!isBotPlayer) continue;
      if (currentRoom.gameState.assignments[botIndex] !== null) continue;

      // Compute the assignment
      const assignment = computeBotAssignment(currentRoom.gameState, botIndex);

      // Apply it directly (same logic as pazpaz:submit handler)
      const newAssignments: [PazPazAssignment | null, PazPazAssignment | null] = [...currentRoom.gameState.assignments];
      newAssignments[botIndex] = assignment;

      const newPlayers = [...currentRoom.gameState.players] as typeof currentRoom.gameState.players;
      newPlayers[botIndex] = { ...newPlayers[botIndex], hasSubmitted: true };

      let updatedGameState: PazPazGameState = {
        ...currentRoom.gameState,
        assignments: newAssignments,
        players: newPlayers,
      };

      const bothSubmitted = newAssignments[0] !== null && newAssignments[1] !== null;

      if (bothSubmitted) {
        updatedGameState = revealAndScore(updatedGameState);
      }

      const updatedRoom = { ...currentRoom, gameState: updatedGameState, status: bothSubmitted ? 'finished' as const : currentRoom.status };
      await pazpazRoomService.save(updatedRoom);

      const botName = currentRoom.gameState.players[botIndex].name;
      log('PAZPAZ_SUBMIT', { roomId, playerId: currentRoom.gameState.players[botIndex].id, nickname: botName, playerIndex: botIndex, bothSubmitted, isBot: true });

      if (bothSubmitted) {
        io.to(`pazpaz:${roomId}`).emit('pazpaz:state', updatedGameState);
        await handleBotGameOver(
          io,
          roomId,
          updatedGameState,
          currentRoom.player0.playerId,
          currentRoom.player1.playerId,
          currentRoom.stake ?? 0,
          currentRoom.lobbyRoomId ?? null,
        );
      } else {
        // Emit updated state to the human player
        io.to(`pazpaz:${roomId}`).emit('pazpaz:state', {
          ...updatedGameState,
          // Hide bot's cards from opponent during ASSIGNING (same filtering as the server does)
          assignments: [null, null],
        });
      }

      break; // Only one bot per game
    }
  }, delay);
}
