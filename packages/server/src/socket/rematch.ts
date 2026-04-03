import type { Server, Socket } from 'socket.io';
import { v4 as uuidv4 } from 'uuid';
import { roomService } from '../services/roomService.js';
import { pazpazRoomService } from '../services/pazpazRoomService.js';
import { lobbyService } from '../services/lobbyService.js';
import { supabase } from '../supabase.js';
import { STAKE_OPTIONS, dealPazPaz } from '@poker5o/shared';
import type { StakeAmount } from '@poker5o/shared';
import { log } from '../logger.js';

// Track pending rematch offers: gameRoomId → { requesterId, gameType, stake, ... }
interface RematchInfo {
  requesterId: string;
  requesterName: string;
  requesterAvatar: string;
  requesterSocketId: string;
  opponentId: string;
  opponentName: string;
  opponentAvatar: string;
  opponentSocketId: string;
  gameType: 'poker5o' | 'pazpaz';
  stake: number;
  completeWinBonus: boolean;
  timerDuration: 30 | 45 | 60 | null;
  assignmentDuration: 60 | 180 | 300;
  vocal: boolean;
}

const pendingRematches = new Map<string, RematchInfo>();

// Auto-expire after 30s
function scheduleExpiry(roomId: string, io: Server) {
  setTimeout(() => {
    const info = pendingRematches.get(roomId);
    if (info) {
      pendingRematches.delete(roomId);
      io.to(`player:${info.opponentId}`).emit('rematch:declined');
      io.to(`player:${info.requesterId}`).emit('rematch:declined');
    }
  }, 30_000);
}

export function registerRematchHandlers(io: Server, socket: Socket): void {
  const { playerId, nickname, avatarUrl } = socket.auth;

  socket.on('rematch:request', async ({ roomId }: { roomId: string }) => {
    // Look up the finished game room (poker5o or pazpaz)
    const pokerRoom = await roomService.get(roomId);
    const pazpazRoom = pokerRoom ? null : await pazpazRoomService.get(roomId);

    if (!pokerRoom && !pazpazRoom) return;

    let info: RematchInfo;

    if (pokerRoom && pokerRoom.player1) {
      const isP0 = pokerRoom.player0.playerId === playerId;
      const opp = isP0 ? pokerRoom.player1 : pokerRoom.player0;
      info = {
        requesterId: playerId,
        requesterName: nickname,
        requesterAvatar: avatarUrl,
        requesterSocketId: socket.id,
        opponentId: opp.playerId,
        opponentName: opp.playerName,
        opponentAvatar: opp.avatarUrl,
        opponentSocketId: opp.socketId,
        gameType: 'poker5o',
        stake: pokerRoom.stake ?? 100,
        completeWinBonus: pokerRoom.completeWinBonus ?? false,
        timerDuration: pokerRoom.timerDuration ?? null,
        assignmentDuration: 180,
        vocal: false,
      };
    } else if (pazpazRoom) {
      const isP0 = pazpazRoom.player0.playerId === playerId;
      const opp = isP0 ? pazpazRoom.player1 : pazpazRoom.player0;
      info = {
        requesterId: playerId,
        requesterName: nickname,
        requesterAvatar: avatarUrl,
        requesterSocketId: socket.id,
        opponentId: opp.playerId,
        opponentName: opp.playerName,
        opponentAvatar: opp.avatarUrl,
        opponentSocketId: opp.socketId,
        gameType: 'pazpaz',
        stake: pazpazRoom.stake ?? 100,
        completeWinBonus: false,
        timerDuration: null,
        assignmentDuration: pazpazRoom.assignmentDuration ?? 180,
        vocal: false,
      };
    } else {
      return;
    }

    // Check both players have enough chips
    const required = info.completeWinBonus ? info.stake * 2 : info.stake;
    const [{ data: myProfile }, { data: oppProfile }] = await Promise.all([
      supabase.from('profiles').select('chips').eq('id', playerId).single(),
      supabase.from('profiles').select('chips').eq('id', info.opponentId).single(),
    ]);

    if (!myProfile || myProfile.chips < required) {
      socket.emit('lobbyRoom:error', { message: 'You don\'t have enough chips for a rematch' });
      return;
    }
    if (!oppProfile || oppProfile.chips < required) {
      socket.emit('lobbyRoom:error', { message: 'Opponent doesn\'t have enough chips for a rematch' });
      return;
    }

    pendingRematches.set(roomId, info);
    io.to(`player:${info.opponentId}`).emit('rematch:offer', { fromName: nickname });
    scheduleExpiry(roomId, io);
  });

  socket.on('rematch:accept', async ({ roomId }: { roomId: string }) => {
    const info = pendingRematches.get(roomId);
    if (!info || info.opponentId !== playerId) return;
    pendingRematches.delete(roomId);

    // Re-verify chips
    const required = info.completeWinBonus ? info.stake * 2 : info.stake;
    const [{ data: p0 }, { data: p1 }] = await Promise.all([
      supabase.from('profiles').select('chips').eq('id', info.requesterId).single(),
      supabase.from('profiles').select('chips').eq('id', info.opponentId).single(),
    ]);

    if (!p0 || p0.chips < required || !p1 || p1.chips < required) {
      io.to(`player:${info.requesterId}`).emit('lobbyRoom:error', { message: 'Not enough chips for rematch' });
      io.to(`player:${info.opponentId}`).emit('lobbyRoom:error', { message: 'Not enough chips for rematch' });
      return;
    }

    const newRoomId = uuidv4().slice(0, 6).toUpperCase();

    if (info.gameType === 'pazpaz') {
      const gameState = dealPazPaz(
        info.requesterId, info.requesterName, info.requesterAvatar,
        info.opponentId, info.opponentName, info.opponentAvatar,
      );
      gameState.stake = info.stake;

      await pazpazRoomService.create({
        roomId: newRoomId,
        player0: { playerId: info.requesterId, playerName: info.requesterName, avatarUrl: info.requesterAvatar, connected: true },
        player1: { playerId: info.opponentId, playerName: info.opponentName, avatarUrl: info.opponentAvatar, connected: true },
        gameState,
        status: 'active',
        stake: info.stake as StakeAmount,
        assignmentDuration: info.assignmentDuration,
        lobbyRoomId: null,
        createdAt: Date.now(),
      });
    } else {
      await roomService.create(newRoomId, {
        socketId: info.requesterSocketId,
        playerId: info.requesterId,
        playerName: info.requesterName,
        avatarUrl: info.requesterAvatar,
        connected: true,
      }, null);

      await roomService.joinAsPlayer1(newRoomId, {
        socketId: socket.id,
        playerId: info.opponentId,
        playerName: info.opponentName,
        avatarUrl: info.opponentAvatar,
        connected: true,
      }, info.stake as StakeAmount, info.completeWinBonus, info.timerDuration);
    }

    // Update lobby statuses
    await lobbyService.setStatus(info.requesterId, 'in-game');
    await lobbyService.setStatus(info.opponentId, 'in-game');
    io.to('lobby').emit('lobby:player:status', { playerId: info.requesterId, status: 'in-game' });
    io.to('lobby').emit('lobby:player:status', { playerId: info.opponentId, status: 'in-game' });

    const payload = { roomId: newRoomId, gameType: info.gameType, vocal: info.vocal };
    io.to(`player:${info.requesterId}`).emit('rematch:starting', payload);
    io.to(`player:${info.opponentId}`).emit('rematch:starting', payload);

    log('GAME_END', { note: 'rematch_started', oldRoomId: roomId, newRoomId, gameType: info.gameType });
  });

  socket.on('rematch:decline', async ({ roomId }: { roomId: string }) => {
    const info = pendingRematches.get(roomId);
    if (!info || info.opponentId !== playerId) return;
    pendingRematches.delete(roomId);
    io.to(`player:${info.requesterId}`).emit('rematch:declined');
  });
}
