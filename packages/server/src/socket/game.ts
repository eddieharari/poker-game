import type { Server, Socket } from 'socket.io';
import { roomService } from '../services/roomService.js';
import { lobbyService } from '../services/lobbyService.js';
import { supabase } from '../supabase.js';
import { applyAction, canDrawCard, canPlaceCard, getGameScore } from '@poker5o/shared';
import { config } from '../config.js';

export function registerGameHandlers(io: Server, socket: Socket): void {
  const { playerId } = socket.auth;

  // ─── Join Room ───────────────────────────────────────────────────────────────

  socket.on('room:join', async ({ roomId }: { roomId: string }) => {
    const room = await roomService.get(roomId);
    if (!room) {
      socket.emit('room:error', { message: 'Room not found' });
      return;
    }

    const isPlayer0 = room.player0.playerId === playerId;
    const isPlayer1 = room.player1?.playerId === playerId;

    if (!isPlayer0 && !isPlayer1) {
      socket.emit('room:error', { message: 'You are not a member of this room' });
      return;
    }

    socket.join(roomId);

    const playerIndex: 0 | 1 = isPlayer0 ? 0 : 1;
    socket.emit('room:joined', { roomId, playerId, playerIndex });

    // If game state is ready, send it immediately (handles page refresh / late join)
    if (room.gameState) {
      socket.emit('game:state', room.gameState);
    }

    // If both players are now in the socket room, notify them the game is ready
    const socketsInRoom = await io.in(roomId).fetchSockets();
    if (socketsInRoom.length === 2 && room.gameState) {
      io.to(roomId).emit('room:ready', { gameState: room.gameState });
    }
  });

  // ─── Reconnect ───────────────────────────────────────────────────────────────

  socket.on('room:rejoin', async ({ roomId }: { roomId: string }) => {
    const room = await roomService.setPlayerConnected(roomId, playerId, true);
    if (!room) {
      socket.emit('room:error', { message: 'Room not found or you are not a member' });
      return;
    }

    socket.join(roomId);

    const playerIndex: 0 | 1 = room.player0.playerId === playerId ? 0 : 1;
    socket.emit('room:joined', { roomId, playerId, playerIndex });

    if (room.gameState) {
      socket.emit('game:state', room.gameState);
    }

    socket.to(roomId).emit('player:reconnected', { playerIndex });
  });

  // ─── Draw Card ───────────────────────────────────────────────────────────────

  socket.on('action:draw', async ({ roomId }: { roomId: string }) => {
    const room = await roomService.get(roomId);
    if (!room?.gameState) {
      socket.emit('room:error', { message: 'Game not found' });
      return;
    }

    if (!canDrawCard(room.gameState, playerId)) {
      socket.emit('room:error', { message: 'Cannot draw card right now' });
      return;
    }

    const newState = applyAction(room.gameState, { type: 'DRAW_CARD', playerId });
    await roomService.updateGameState(roomId, newState);
    io.to(roomId).emit('game:state', newState);
  });

  // ─── Place Card ──────────────────────────────────────────────────────────────

  socket.on(
    'action:place',
    async ({ roomId, columnIndex }: { roomId: string; columnIndex: number }) => {
      const room = await roomService.get(roomId);
      if (!room?.gameState) {
        socket.emit('room:error', { message: 'Game not found' });
        return;
      }

      if (!canPlaceCard(room.gameState, playerId, columnIndex)) {
        socket.emit('room:error', { message: 'Cannot place card there' });
        return;
      }

      const newState = applyAction(room.gameState, {
        type: 'PLACE_CARD',
        playerId,
        columnIndex,
      });

      await roomService.updateGameState(roomId, newState);
      io.to(roomId).emit('game:state', newState);

      if (newState.phase === 'GAME_OVER') {
        const score = getGameScore(newState);
        if (score && room.player1 && room.stake) {
          io.to(roomId).emit('game:over', score);
          await roomService.save({ ...room, gameState: newState, status: 'finished' });

          // Settle chips and log game via Supabase stored procedure
          const winnerId = score.winner === 'draw'
            ? null
            : newState.players[score.winner].id;

          await supabase.rpc('settle_game', {
            p_room_id:        roomId,
            p_player0_id:     room.player0.playerId,
            p_player1_id:     room.player1.playerId,
            p_stake:          room.stake,
            p_winner_id:      winnerId,
            p_is_draw:        score.winner === 'draw',
            p_p0_columns:     score.player0Wins,
            p_p1_columns:     score.player1Wins,
            p_column_results: JSON.stringify(score.columnResults),
            p_final_state:    JSON.stringify(newState),
          });

          // Return players to idle in lobby
          await lobbyService.setStatus(room.player0.playerId, 'idle');
          await lobbyService.setStatus(room.player1.playerId, 'idle');
          io.to('lobby').emit('lobby:player:status', { playerId: room.player0.playerId, status: 'idle' });
          io.to('lobby').emit('lobby:player:status', { playerId: room.player1.playerId, status: 'idle' });
        }
      }
    },
  );

  // ─── Disconnect ──────────────────────────────────────────────────────────────

  socket.on('disconnect', async () => {
    // Find any active room this player is in
    const room = await roomService.findByPlayerId(playerId);
    if (!room || room.status !== 'active') return;

    const updated = await roomService.setPlayerConnected(room.roomId, playerId, false);
    if (!updated) return;

    const playerIndex: 0 | 1 = room.player0.playerId === playerId ? 0 : 1;
    socket.to(room.roomId).emit('player:disconnected', { playerIndex });

    // Auto-abandon after grace period
    setTimeout(async () => {
      const current = await roomService.get(room.roomId);
      if (!current) return;
      const p = playerIndex === 0 ? current.player0 : current.player1;
      if (p && !p.connected && current.status === 'active') {
        await roomService.save({ ...current, status: 'finished' });
        io.to(room.roomId).emit('room:error', { message: 'Opponent abandoned the game' });
      }
    }, config.disconnectTtl * 1000);
  });
}
