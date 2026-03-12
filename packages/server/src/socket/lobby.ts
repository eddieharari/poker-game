import type { Server, Socket } from 'socket.io';
import { v4 as uuidv4 } from 'uuid';
import { lobbyService } from '../services/lobbyService.js';
import { challengeService } from '../services/challengeService.js';
import { roomService } from '../services/roomService.js';
import { supabase } from '../supabase.js';
import { STAKE_OPTIONS } from '@poker5o/shared';
import type { StakeAmount } from '@poker5o/shared';
import type { Challenge } from '../types.js';

export function registerLobbyHandlers(io: Server, socket: Socket): void {
  const { playerId, nickname, avatarUrl } = socket.auth;

  // ─── Enter Lobby ────────────────────────────────────────────────────────────

  socket.on('lobby:enter', async () => {
    const player = { id: playerId, nickname, avatarUrl, status: 'idle' as const };
    await lobbyService.addPlayer(player);
    socket.join('lobby');

    const allPlayers = await lobbyService.getAllPlayers();
    socket.emit('lobby:players', allPlayers.filter(p => p.id !== playerId));
    socket.to('lobby').emit('lobby:player:joined', player);
  });

  // ─── Leave Lobby ────────────────────────────────────────────────────────────

  socket.on('lobby:leave', async () => {
    await lobbyService.removePlayer(playerId);
    socket.leave('lobby');
    io.to('lobby').emit('lobby:player:left', { playerId });
  });

  // ─── Send Challenge ──────────────────────────────────────────────────────────

  socket.on('lobby:challenge', async ({ toPlayerId, stake }: { toPlayerId: string; stake: StakeAmount }) => {
    if (toPlayerId === playerId) {
      socket.emit('room:error', { message: 'Cannot challenge yourself' });
      return;
    }

    // Validate stake is a legal option
    if (!(STAKE_OPTIONS as readonly number[]).includes(stake)) {
      socket.emit('room:error', { message: 'Invalid stake amount' });
      return;
    }

    const isOnline = await lobbyService.isOnline(toPlayerId);
    if (!isOnline) {
      socket.emit('room:error', { message: 'Player is no longer online' });
      return;
    }

    // Verify both players have sufficient chips
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, chips')
      .in('id', [playerId, toPlayerId]);

    const challenger = profiles?.find(p => p.id === playerId);
    const opponent   = profiles?.find(p => p.id === toPlayerId);

    if (!challenger || challenger.chips < stake) {
      socket.emit('room:error', { message: `You need at least ${stake} chips to set this stake` });
      return;
    }
    if (!opponent || opponent.chips < stake) {
      socket.emit('room:error', { message: 'Opponent does not have enough chips for this stake' });
      return;
    }

    // Pre-create the room so roomId is ready on accept
    const roomId = uuidv4().slice(0, 6).toUpperCase();
    await roomService.create(roomId, {
      socketId: socket.id,
      playerId,
      playerName: nickname,
      connected: true,
    });

    const challengeId = uuidv4();
    const challenge: Challenge = {
      challengeId,
      fromId: playerId,
      fromNickname: nickname,
      fromAvatarUrl: avatarUrl,
      toId: toPlayerId,
      roomId,
      stake,
      createdAt: Date.now(),
    };

    await challengeService.create(challenge);
    await lobbyService.setStatus(playerId, 'invited');
    await lobbyService.setStatus(toPlayerId, 'invited');

    io.to('lobby').emit('lobby:player:status', { playerId, status: 'invited' });
    io.to('lobby').emit('lobby:player:status', { playerId: toPlayerId, status: 'invited' });

    const fromPlayer = await lobbyService.getPlayer(playerId);
    const targetSockets = await io.in('lobby').fetchSockets();
    const targetSocket = targetSockets.find(s => (s as unknown as Socket).auth?.playerId === toPlayerId);

    if (targetSocket) {
      targetSocket.emit('lobby:challenge:incoming', {
        challengeId,
        from: fromPlayer ?? { id: playerId, nickname, avatarUrl, status: 'invited' as const },
        stake,
      });
    }

    // Auto-expire after 30s
    setTimeout(async () => {
      const still = await challengeService.exists(challengeId);
      if (still) {
        await challengeService.delete(challengeId);
        await roomService.delete(roomId);
        await lobbyService.setStatus(playerId, 'idle');
        await lobbyService.setStatus(toPlayerId, 'idle');
        socket.emit('lobby:challenge:expired', { challengeId });
        io.to('lobby').emit('lobby:player:status', { playerId, status: 'idle' });
        io.to('lobby').emit('lobby:player:status', { playerId: toPlayerId, status: 'idle' });
      }
    }, 30_000);
  });

  // ─── Accept Challenge ────────────────────────────────────────────────────────

  socket.on('lobby:challenge:accept', async ({ challengeId }: { challengeId: string }) => {
    const challenge = await challengeService.get(challengeId);
    if (!challenge || challenge.toId !== playerId) {
      socket.emit('room:error', { message: 'Challenge not found or expired' });
      return;
    }

    // Re-verify chips at accept time (balances may have changed)
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, chips')
      .in('id', [challenge.fromId, playerId]);

    const challenger = profiles?.find(p => p.id === challenge.fromId);
    const acceptor   = profiles?.find(p => p.id === playerId);

    if (!challenger || challenger.chips < challenge.stake) {
      socket.emit('room:error', { message: 'Challenger no longer has enough chips' });
      await challengeService.delete(challengeId);
      await roomService.delete(challenge.roomId);
      return;
    }
    if (!acceptor || acceptor.chips < challenge.stake) {
      socket.emit('room:error', { message: `You need at least ${challenge.stake} chips to accept` });
      return;
    }

    await challengeService.delete(challengeId);

    const room = await roomService.joinAsPlayer1(challenge.roomId, {
      socketId: socket.id,
      playerId,
      playerName: nickname,
      connected: true,
    }, challenge.stake);

    if (!room) {
      socket.emit('room:error', { message: 'Room no longer available' });
      return;
    }

    await lobbyService.setStatus(playerId, 'in-game');
    await lobbyService.setStatus(challenge.fromId, 'in-game');
    io.to('lobby').emit('lobby:player:status', { playerId, status: 'in-game' });
    io.to('lobby').emit('lobby:player:status', { playerId: challenge.fromId, status: 'in-game' });

    socket.emit('lobby:challenge:accepted', { challengeId, roomId: room.roomId });

    const allSockets = await io.in('lobby').fetchSockets();
    const challengerSocket = allSockets.find(
      s => (s as unknown as Socket).auth?.playerId === challenge.fromId,
    );
    if (challengerSocket) {
      challengerSocket.emit('lobby:challenge:accepted', { challengeId, roomId: room.roomId });
    }
  });

  // ─── Decline Challenge ───────────────────────────────────────────────────────

  socket.on('lobby:challenge:decline', async ({ challengeId }: { challengeId: string }) => {
    const challenge = await challengeService.get(challengeId);
    if (!challenge || challenge.toId !== playerId) return;

    await challengeService.delete(challengeId);
    await roomService.delete(challenge.roomId);
    await lobbyService.setStatus(playerId, 'idle');
    await lobbyService.setStatus(challenge.fromId, 'idle');

    io.to('lobby').emit('lobby:player:status', { playerId, status: 'idle' });
    io.to('lobby').emit('lobby:player:status', { playerId: challenge.fromId, status: 'idle' });

    const allSockets = await io.in('lobby').fetchSockets();
    const challengerSocket = allSockets.find(
      s => (s as unknown as Socket).auth?.playerId === challenge.fromId,
    );
    if (challengerSocket) {
      challengerSocket.emit('lobby:challenge:declined', { challengeId });
    }
  });

  // ─── Disconnect cleanup ──────────────────────────────────────────────────────

  socket.on('disconnect', async () => {
    await lobbyService.removePlayer(playerId);
    io.to('lobby').emit('lobby:player:left', { playerId });
  });
}
