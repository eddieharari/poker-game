import type { Server, Socket } from 'socket.io';
import { v4 as uuidv4 } from 'uuid';
import { stableLobbyRoomService } from '../services/stableLobbyRoomService.js';
import { roomService } from '../services/roomService.js';
import { pazpazRoomService } from '../services/pazpazRoomService.js';
import { lobbyService } from '../services/lobbyService.js';
import { supabase } from '../supabase.js';
import { STAKE_OPTIONS, dealPazPaz } from '@poker5o/shared';
import type { StakeAmount, GameType } from '@poker5o/shared';
import { log } from '../logger.js';
import { triggerBotIfNeeded, isBot } from '../services/pazpazBotRunner.js';
import { handlePazPazGameOver } from './pazpaz.js';

// Track: playerId → lobbyRoomId they are currently waiting in
const waitingIn = new Map<string, string>();

// Grace-period timers for waiting player disconnect
const waitingDisconnectTimers = new Map<string, ReturnType<typeof setTimeout>>();

function broadcastRoomUpdate(io: Server, roomId: string): void {
  stableLobbyRoomService.getView(roomId).then(view => {
    if (view) io.to('lobby').emit('lobbyRoom:update', view);
  });
}

export function registerLobbyRoomHandlers(io: Server, socket: Socket): void {
  const { playerId, nickname, avatarUrl } = socket.auth;

  // ─── List rooms ──────────────────────────────────────────────────────────────

  socket.on('lobbyRoom:list', async () => {
    const rooms = await stableLobbyRoomService.getAll();
    socket.emit('lobbyRoom:list', rooms);
  });

  // ─── Join a room ─────────────────────────────────────────────────────────────

  socket.on('lobbyRoom:join', async ({ roomId, password }: { roomId: string; password?: string }) => {
    // Cancel any existing waiting-in room for this player
    const currentRoom = waitingIn.get(playerId);
    if (currentRoom && currentRoom !== roomId) {
      await stableLobbyRoomService.leaveRoom(currentRoom, playerId);
      waitingIn.delete(playerId);
      broadcastRoomUpdate(io, currentRoom);
    }

    // Verify player has enough chips
    const def = await stableLobbyRoomService.getDef(roomId);
    if (!def) {
      socket.emit('lobbyRoom:error', { message: 'Room not found' });
      return;
    }

    if (!(STAKE_OPTIONS as readonly number[]).includes(def.stake)) {
      socket.emit('lobbyRoom:error', { message: 'Invalid stake configuration' });
      return;
    }

    // Check if the waiting player (opponent) is a bot — bot games are free
    const state = await stableLobbyRoomService.getState(roomId);
    const opponentIsBot = state?.waitingPlayerId ? await isBot(state.waitingPlayerId) : false;
    const isFreeGame = opponentIsBot;

    const required = def.completeWinBonus ? def.stake * 2 : def.stake;
    if (!isFreeGame) {
      const { data: profile } = await supabase.from('profiles').select('chips').eq('id', playerId).single();
      if (!profile || profile.chips < required) {
        socket.emit('lobbyRoom:error', { message: `You need at least ${required} chips to join this room` });
        return;
      }
    }

    const result = await stableLobbyRoomService.joinRoom(
      roomId,
      { id: playerId, name: nickname, avatar: avatarUrl, socketId: socket.id },
      password,
    );

    if (!result.ok) {
      socket.emit('lobbyRoom:error', { message: result.error });
      return;
    }

    if (result.action === 'waiting') {
      waitingIn.set(playerId, roomId);
      await lobbyService.setStatus(playerId, 'invited');
      io.to('lobby').emit('lobby:player:status', { playerId, status: 'invited' });
      broadcastRoomUpdate(io, roomId);
      log('ROOM_WAITING', { roomId, playerId, nickname });
      return;
    }

    // ── Two players — start the game ──────────────────────────────────────────

    const { opponentId, opponentName, opponentAvatar } = result;
    const gameRoomId = uuidv4().slice(0, 6).toUpperCase();

    // Verify opponent chips too (skip for bots)
    if (!isFreeGame) {
      const { data: oppProfile } = await supabase.from('profiles').select('chips').eq('id', opponentId).single();
      if (!oppProfile || oppProfile.chips < required) {
        socket.emit('lobbyRoom:error', { message: 'Opponent no longer has enough chips' });
        await stableLobbyRoomService.resetRoom(roomId);
        waitingIn.delete(opponentId);
        await lobbyService.setStatus(opponentId, 'idle');
        io.to('lobby').emit('lobby:player:status', { playerId: opponentId, status: 'idle' });
        broadcastRoomUpdate(io, roomId);
        return;
      }
    }

    if (def.gameType === 'pazpaz') {
      const gameState = dealPazPaz(opponentId, opponentName, opponentAvatar, playerId, nickname, avatarUrl);
      gameState.stake = def.stake;

      await pazpazRoomService.create({
        roomId: gameRoomId,
        player0: { playerId: opponentId, playerName: opponentName, avatarUrl: opponentAvatar, connected: true },
        player1: { playerId, playerName: nickname, avatarUrl, connected: true },
        gameState,
        status: 'active',
        stake: def.stake,
        assignmentDuration: def.assignmentDuration,
        lobbyRoomId: roomId,
        createdAt: Date.now(),
      });
    } else {
      // poker5o — opponent is player0, current player is player1
      await roomService.create(gameRoomId, {
        socketId: result.opponentSocketId,
        playerId: opponentId,
        playerName: opponentName,
        avatarUrl: opponentAvatar,
        connected: true,
      }, roomId);

      await roomService.joinAsPlayer1(gameRoomId, {
        socketId: socket.id,
        playerId,
        playerName: nickname,
        avatarUrl,
        connected: true,
      }, def.stake as StakeAmount, def.completeWinBonus, def.timerDuration);
    }

    // Mark lobby room as playing
    await stableLobbyRoomService.setPlaying(roomId, gameRoomId);

    // Update player statuses
    waitingIn.delete(opponentId);
    await lobbyService.setStatus(playerId, 'in-game');
    await lobbyService.setStatus(opponentId, 'in-game');
    io.to('lobby').emit('lobby:player:status', { playerId, status: 'in-game' });
    io.to('lobby').emit('lobby:player:status', { playerId: opponentId, status: 'in-game' });

    log('ROOM_GAME_STARTED', { lobbyRoomId: roomId, gameRoomId, player0: opponentName, player1: nickname, gameType: def.gameType, stake: def.stake });

    // Navigate both players to the game
    const payload = { roomId: gameRoomId, gameType: def.gameType as GameType, vocal: def.vocal };
    io.to(`player:${opponentId}`).emit('lobbyRoom:game_started', payload);
    io.to(`player:${playerId}`).emit('lobbyRoom:game_started', payload);

    broadcastRoomUpdate(io, roomId);

    // Trigger bot if one player is a bot
    if (def.gameType === 'pazpaz') {
      triggerBotIfNeeded(io, gameRoomId, handlePazPazGameOver).catch(err =>
        console.error('[lobbyRooms] bot trigger error:', err)
      );
    }
  });

  // ─── Leave a room ─────────────────────────────────────────────────────────────

  socket.on('lobbyRoom:leave', async ({ roomId }: { roomId: string }) => {
    const left = await stableLobbyRoomService.leaveRoom(roomId, playerId);
    if (left) {
      waitingIn.delete(playerId);
      await lobbyService.setStatus(playerId, 'idle');
      io.to('lobby').emit('lobby:player:status', { playerId, status: 'idle' });

      // If it's a user-created room, delete it on leave
      const def = await stableLobbyRoomService.getDef(roomId);
      if (def && def.createdBy) {
        await stableLobbyRoomService.deleteFromRedis(roomId);
        io.to('lobby').emit('lobbyRoom:removed', { roomId });
      } else {
        broadcastRoomUpdate(io, roomId);
      }
    }
  });

  // ─── Create private room ──────────────────────────────────────────────────────

  socket.on('lobbyRoom:create', async (settings: {
    name: string;
    gameType: GameType;
    stake: StakeAmount;
    completeWinBonus: boolean;
    timerDuration: 30 | 45 | 60 | null;
    assignmentDuration: 60 | 180 | 300;
    vocal: boolean;
    isPrivate: boolean;
    password?: string;
  }) => {
    if (!(STAKE_OPTIONS as readonly number[]).includes(settings.stake)) {
      socket.emit('lobbyRoom:error', { message: 'Invalid stake' });
      return;
    }

    const room = await stableLobbyRoomService.createPrivate(
      { id: playerId, name: nickname },
      settings,
    );

    // Auto-sit the creator in the room
    await stableLobbyRoomService.joinRoom(
      room.id,
      { id: playerId, name: nickname, avatar: avatarUrl, socketId: socket.id },
    );
    waitingIn.set(playerId, room.id);
    await lobbyService.setStatus(playerId, 'invited');
    io.to('lobby').emit('lobby:player:status', { playerId, status: 'invited' });

    // Broadcast the room (already in waiting state)
    const view = await stableLobbyRoomService.getView(room.id);
    io.to('lobby').emit('lobbyRoom:added', view ?? room);
    socket.emit('lobbyRoom:auto_joined', { roomId: room.id });
    log('ROOM_CREATED', { roomId: room.id, createdBy: nickname, gameType: room.gameType, stake: room.stake });
  });

  // ─── Delete private room ──────────────────────────────────────────────────────

  socket.on('lobbyRoom:delete', async ({ roomId }: { roomId: string }) => {
    const deleted = await stableLobbyRoomService.deletePrivate(roomId, playerId);
    if (deleted) {
      io.to('lobby').emit('lobbyRoom:removed', { roomId });
    }
  });

  // ─── Disconnect cleanup ───────────────────────────────────────────────────────

  socket.on('disconnect', async () => {
    const roomId = waitingIn.get(playerId);
    if (!roomId) return;

    // 15s grace period — if player doesn't reconnect, reset the room slot
    const timer = setTimeout(async () => {
      waitingDisconnectTimers.delete(playerId);
      const stillWaiting = waitingIn.get(playerId);
      if (stillWaiting === roomId) {
        await stableLobbyRoomService.leaveRoom(roomId, playerId);
        waitingIn.delete(playerId);
        // User-created rooms get deleted when the creator disconnects
        const def = await stableLobbyRoomService.getDef(roomId);
        if (def && def.createdBy) {
          await stableLobbyRoomService.deleteFromRedis(roomId);
          io.to('lobby').emit('lobbyRoom:removed', { roomId });
        } else {
          broadcastRoomUpdate(io, roomId);
        }
      }
    }, 15_000);
    waitingDisconnectTimers.set(playerId, timer);
  });

  // Cancel grace period if player reconnects
  const pending = waitingDisconnectTimers.get(playerId);
  if (pending) {
    clearTimeout(pending);
    waitingDisconnectTimers.delete(playerId);
  }
}

/** Called by game handlers when a game ends — resets recurring rooms, removes non-recurring ones */
export async function onGameEnd(io: Server, lobbyRoomId: string | null | undefined): Promise<void> {
  if (!lobbyRoomId) return;
  const def = await stableLobbyRoomService.getDef(lobbyRoomId);
  if (!def) return;

  // If the room was created with a bot, reset and re-seat the bot
  if (def.withBot) {
    const reseated = await reseatBot(io, lobbyRoomId);
    if (reseated) return;
  }

  if (def.isRecurring) {
    // Recurring rooms stay in lobby, just reset to empty
    await stableLobbyRoomService.resetRoom(lobbyRoomId);
    broadcastRoomUpdate(io, lobbyRoomId);
  } else {
    // Non-recurring rooms disappear after the game
    if (!def.createdBy) {
      // Admin room — delete from Supabase so it doesn't reload on restart
      await stableLobbyRoomService.adminDelete(lobbyRoomId);
    } else {
      // Private player room — only in Redis
      await stableLobbyRoomService.deleteFromRedis(lobbyRoomId);
    }
    io.to('lobby').emit('lobbyRoom:removed', { roomId: lobbyRoomId });
  }
}

/** Reset a bot room and re-seat the bot player. Returns true if successful. */
async function reseatBot(io: Server, lobbyRoomId: string): Promise<boolean> {
  const { data: botProfile } = await supabase
    .from('profiles')
    .select('id, nickname, avatar_url')
    .eq('role', 'bot')
    .limit(1)
    .maybeSingle();

  if (!botProfile) return false;

  await stableLobbyRoomService.resetRoom(lobbyRoomId);
  const joinResult = await stableLobbyRoomService.joinRoom(
    lobbyRoomId,
    { id: botProfile.id, name: botProfile.nickname, avatar: botProfile.avatar_url ?? '', socketId: '' },
  );

  if (joinResult.ok) {
    broadcastRoomUpdate(io, lobbyRoomId);
    return true;
  }

  return false;
}
