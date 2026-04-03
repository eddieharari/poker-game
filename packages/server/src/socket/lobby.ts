import type { Server, Socket } from 'socket.io';
import { v4 as uuidv4 } from 'uuid';
import { lobbyService } from '../services/lobbyService.js';
import { challengeService } from '../services/challengeService.js';
import { roomService } from '../services/roomService.js';
import { pazpazRoomService } from '../services/pazpazRoomService.js';
import { backgammonRoomService } from '../services/backgammonRoomService.js';
import { supabase } from '../supabase.js';
import { STAKE_OPTIONS, dealPazPaz, createBackgammonGame } from '@poker5o/shared';
import type { StakeAmount, GameType, BackgammonMatchConfig } from '@poker5o/shared';
import type { Challenge } from '../types.js';
import { log } from '../logger.js';

const BG_POINT_VALUES = [10, 25, 50, 100, 200, 500] as const;

// Grace-period timers: playerId → timeout handle
const disconnectTimers = new Map<string, ReturnType<typeof setTimeout>>();

export function registerLobbyHandlers(io: Server, socket: Socket): void {
  const { playerId, nickname, avatarUrl } = socket.auth;

  // ─── Enter Lobby ────────────────────────────────────────────────────────────

  socket.on('lobby:enter', async () => {
    // Cancel any pending removal from a previous disconnect
    const pending = disconnectTimers.get(playerId);
    if (pending) { clearTimeout(pending); disconnectTimers.delete(playerId); }

    try {
      const { data: stats, error: statsError } = await supabase
        .from('profiles')
        .select('wins, losses, draws')
        .eq('id', playerId)
        .maybeSingle();

      if (statsError) console.error('[lobby:enter] supabase error:', statsError.message);

      const player = {
        id: playerId,
        nickname,
        avatarUrl,
        status: 'idle' as const,
        wins: stats?.wins ?? 0,
        losses: stats?.losses ?? 0,
        draws: stats?.draws ?? 0,
      };
      await lobbyService.addPlayer(player);
      socket.join('lobby');

      const allPlayers = await lobbyService.getAllPlayers();
      console.log(JSON.stringify({ ts: new Date().toISOString(), event: 'LOBBY_ENTER', playerId, nickname, totalPlayers: allPlayers.length }));
      socket.emit('lobby:players', allPlayers.filter(p => p.id !== playerId));
      socket.to('lobby').emit('lobby:player:joined', player);
    } catch (err) {
      console.error('[lobby:enter] unexpected error:', err);
    }
  });

  // ─── Leave Lobby ────────────────────────────────────────────────────────────

  socket.on('lobby:leave', async () => {
    const player = await lobbyService.getPlayer(playerId);
    if (player && player.status !== 'in-game') {
      await lobbyService.removePlayer(playerId);
      io.to('lobby').emit('lobby:player:left', { playerId });
    }
    socket.leave('lobby');
  });

  // ─── Send Challenge ──────────────────────────────────────────────────────────

  socket.on('lobby:challenge', async ({ toPlayerId, stake, completeWinBonus, timerDuration, assignmentDuration: rawAssignDur, gameType: rawGameType, vocal: rawVocal, matchConfig: rawMatchConfig }: { toPlayerId: string; stake: StakeAmount; completeWinBonus: boolean; timerDuration: 30 | 45 | 60 | null; assignmentDuration?: 60 | 180 | 300; gameType?: GameType; vocal?: boolean; matchConfig?: BackgammonMatchConfig }) => {
    const gameType: GameType = rawGameType === 'pazpaz' ? 'pazpaz' : rawGameType === 'backgammon' ? 'backgammon' : 'poker5o';
    const assignmentDuration: 60 | 180 | 300 = ([60, 180, 300] as const).includes(rawAssignDur as 60 | 180 | 300) ? (rawAssignDur as 60 | 180 | 300) : 180;
    const vocal = !!rawVocal;
    if (toPlayerId === playerId) {
      socket.emit('room:error', { message: 'Cannot challenge yourself' });
      return;
    }

    // Validate backgammon-specific config
    let matchConfig: BackgammonMatchConfig | null = null;
    if (gameType === 'backgammon') {
      if (!rawMatchConfig) {
        socket.emit('room:error', { message: 'Backgammon requires match config' });
        return;
      }
      if (!(BG_POINT_VALUES as readonly number[]).includes(rawMatchConfig.pointValue)) {
        socket.emit('room:error', { message: 'Invalid point value' });
        return;
      }
      if (rawMatchConfig.mode === 'match' && (rawMatchConfig.matchLength === null || ![1,3,5,7,9,11].includes(rawMatchConfig.matchLength))) {
        socket.emit('room:error', { message: 'Invalid match length' });
        return;
      }
      matchConfig = rawMatchConfig;
    }

    // Validate stake is a legal option (skip for backgammon — uses pointValue instead)
    if (gameType !== 'backgammon' && !(STAKE_OPTIONS as readonly number[]).includes(stake)) {
      socket.emit('room:error', { message: 'Invalid stake amount' });
      return;
    }

    const isOnline = await lobbyService.isOnline(toPlayerId);
    if (!isOnline) {
      socket.emit('room:error', { message: 'Player is no longer online' });
      return;
    }

    const targetPlayer = await lobbyService.getPlayer(toPlayerId);
    if (targetPlayer?.status === 'busy') {
      socket.emit('room:error', { message: 'Player is busy and cannot be challenged' });
      return;
    }

    // Verify both players have sufficient chips
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, chips')
      .in('id', [playerId, toPlayerId]);

    const challenger = profiles?.find(p => p.id === playerId);
    const opponent   = profiles?.find(p => p.id === toPlayerId);

    const required = gameType === 'backgammon'
      ? (matchConfig?.mode === 'match' ? (matchConfig?.matchStake ?? 0) : (matchConfig?.pointValue ?? 0))
      : (completeWinBonus ? stake * 2 : stake);
    if (!challenger || challenger.chips < required) {
      socket.emit('room:error', { message: gameType === 'backgammon'
        ? `You need at least ${required} chips to play at this point value`
        : completeWinBonus
          ? `You need at least ${required} chips for a complete-win bonus game`
          : `You need at least ${stake} chips to set this stake` });
      return;
    }
    if (!opponent || opponent.chips < required) {
      socket.emit('room:error', { message: gameType === 'backgammon'
        ? `Opponent needs at least ${required} chips for this point value`
        : completeWinBonus
          ? `Opponent needs at least ${required} chips for a complete-win bonus game`
          : 'Opponent does not have enough chips for this stake' });
      return;
    }

    // Pre-create the room so roomId is ready on accept (only for poker5o)
    const roomId = uuidv4().slice(0, 6).toUpperCase();
    if (gameType !== 'pazpaz' && gameType !== 'backgammon') {
      await roomService.create(roomId, {
        socketId: socket.id,
        playerId,
        playerName: nickname,
        avatarUrl,
        connected: true,
      });
    }

    const challengeId = uuidv4();
    const challenge: Challenge = {
      challengeId,
      fromId: playerId,
      fromNickname: nickname,
      fromAvatarUrl: avatarUrl,
      toId: toPlayerId,
      roomId,
      stake,
      completeWinBonus,
      timerDuration: (gameType === 'pazpaz' || gameType === 'backgammon') ? null : timerDuration,
      assignmentDuration,
      gameType,
      vocal,
      matchConfig,
      createdAt: Date.now(),
    };

    await challengeService.create(challenge);
    await lobbyService.setStatus(playerId, 'invited');
    await lobbyService.setStatus(toPlayerId, 'invited');

    const toPlayer = await lobbyService.getPlayer(toPlayerId);
    log('INVITE_SENT', {
      challengeId,
      roomId,
      fromId: playerId,
      fromNick: nickname,
      toId: toPlayerId,
      toNick: toPlayer?.nickname ?? toPlayerId,
      stake,
    });

    io.to('lobby').emit('lobby:player:status', { playerId, status: 'invited' });
    io.to('lobby').emit('lobby:player:status', { playerId: toPlayerId, status: 'invited' });

    const fromPlayer = await lobbyService.getPlayer(playerId);
    io.to(`player:${toPlayerId}`).emit('lobby:challenge:incoming', {
      challengeId,
      from: fromPlayer ?? { id: playerId, nickname, avatarUrl, status: 'invited' as const, wins: 0, losses: 0, draws: 0 },
      stake,
      completeWinBonus,
      timerDuration: (gameType === 'pazpaz' || gameType === 'backgammon') ? null : timerDuration,
      gameType,
      assignmentDuration,
      vocal,
      matchConfig: matchConfig ?? undefined,
    });

    // Auto-expire after 25s
    setTimeout(async () => {
      const still = await challengeService.exists(challengeId);
      if (still) {
        await challengeService.delete(challengeId);
        if (gameType !== 'pazpaz' && gameType !== 'backgammon') await roomService.delete(roomId);
        await lobbyService.setStatus(playerId, 'idle');
        await lobbyService.setStatus(toPlayerId, 'idle');
        socket.emit('lobby:challenge:expired', { challengeId });
        io.to('lobby').emit('lobby:player:status', { playerId, status: 'idle' });
        io.to('lobby').emit('lobby:player:status', { playerId: toPlayerId, status: 'idle' });
        log('INVITE_EXPIRED', { challengeId, fromId: playerId, fromNick: nickname, toId: toPlayerId, stake });
      }
    }, 25_000);
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

    const requiredChips = challenge.completeWinBonus ? challenge.stake * 2 : challenge.stake;
    if (!challenger || challenger.chips < requiredChips) {
      socket.emit('room:error', { message: 'Challenger no longer has enough chips' });
      await challengeService.delete(challengeId);
      if (challenge.gameType !== 'pazpaz') await roomService.delete(challenge.roomId);
      return;
    }
    if (!acceptor || acceptor.chips < requiredChips) {
      socket.emit('room:error', { message: `You need at least ${requiredChips} chips to accept` });
      return;
    }

    await challengeService.delete(challengeId);

    const roomId = challenge.roomId;

    if (challenge.gameType === 'backgammon') {
      if (!challenge.matchConfig) {
        socket.emit('room:error', { message: 'Missing backgammon config' });
        return;
      }
      const fromPlayer = await lobbyService.getPlayer(challenge.fromId);
      const gameState = createBackgammonGame(
        challenge.fromId, challenge.fromNickname, challenge.fromAvatarUrl,
        playerId, nickname, avatarUrl,
        challenge.matchConfig,
      );
      await backgammonRoomService.create({
        roomId,
        player0: { playerId: challenge.fromId, playerName: challenge.fromNickname, avatarUrl: challenge.fromAvatarUrl, connected: true },
        player1: { playerId, playerName: nickname, avatarUrl, connected: true },
        gameState,
        status: 'active',
        matchConfig: challenge.matchConfig,
        createdAt: Date.now(),
      });
      await lobbyService.setStatus(playerId, 'in-game');
      await lobbyService.setStatus(challenge.fromId, 'in-game');
      io.to('lobby').emit('lobby:player:status', { playerId, status: 'in-game' });
      io.to('lobby').emit('lobby:player:status', { playerId: challenge.fromId, status: 'in-game' });
      log('INVITE_ACCEPTED', {
        challengeId,
        roomId,
        fromId: challenge.fromId,
        fromNick: challenge.fromNickname,
        toId: playerId,
        toNick: nickname,
        stake: challenge.matchConfig.pointValue,
        gameType: 'backgammon',
      });
      socket.emit('lobby:challenge:accepted', { challengeId, roomId, gameType: 'backgammon' as const, vocal: challenge.vocal });
      io.to(`player:${challenge.fromId}`).emit('lobby:challenge:accepted', { challengeId, roomId, gameType: 'backgammon' as const, vocal: challenge.vocal });
    } else if (challenge.gameType === 'pazpaz') {
      // Find the challenger's socket auth info from lobbyService
      const fromPlayer = await lobbyService.getPlayer(challenge.fromId);

      const gameState = dealPazPaz(
        challenge.fromId,
        challenge.fromNickname,
        challenge.fromAvatarUrl,
        playerId,
        nickname,
        avatarUrl,
      );
      gameState.stake = challenge.stake;

      await pazpazRoomService.create({
        roomId,
        player0: { playerId: challenge.fromId, playerName: challenge.fromNickname, avatarUrl: challenge.fromAvatarUrl, connected: true },
        player1: { playerId, playerName: nickname, avatarUrl, connected: true },
        gameState,
        status: 'active',
        stake: challenge.stake,
        assignmentDuration: challenge.assignmentDuration,
        createdAt: Date.now(),
      });

      await lobbyService.setStatus(playerId, 'in-game');
      await lobbyService.setStatus(challenge.fromId, 'in-game');
      io.to('lobby').emit('lobby:player:status', { playerId, status: 'in-game' });
      io.to('lobby').emit('lobby:player:status', { playerId: challenge.fromId, status: 'in-game' });

      log('INVITE_ACCEPTED', {
        challengeId,
        roomId,
        fromId: challenge.fromId,
        fromNick: challenge.fromNickname,
        toId: playerId,
        toNick: nickname,
        stake: challenge.stake,
        gameType: 'pazpaz',
      });

      socket.emit('lobby:challenge:accepted', { challengeId, roomId, gameType: 'pazpaz' as const, vocal: challenge.vocal });
      io.to(`player:${challenge.fromId}`).emit('lobby:challenge:accepted', { challengeId, roomId, gameType: 'pazpaz' as const, vocal: challenge.vocal });
    } else {
      // poker5o (existing flow)
      const room = await roomService.joinAsPlayer1(challenge.roomId, {
        socketId: socket.id,
        playerId,
        playerName: nickname,
        avatarUrl,
        connected: true,
      }, challenge.stake, challenge.completeWinBonus, challenge.timerDuration);

      if (!room) {
        socket.emit('room:error', { message: 'Room no longer available' });
        return;
      }

      await lobbyService.setStatus(playerId, 'in-game');
      await lobbyService.setStatus(challenge.fromId, 'in-game');
      io.to('lobby').emit('lobby:player:status', { playerId, status: 'in-game' });
      io.to('lobby').emit('lobby:player:status', { playerId: challenge.fromId, status: 'in-game' });

      log('INVITE_ACCEPTED', {
        challengeId,
        roomId: room.roomId,
        fromId: challenge.fromId,
        fromNick: challenge.fromNickname,
        toId: playerId,
        toNick: nickname,
        stake: challenge.stake,
        gameType: 'poker5o',
      });

      socket.emit('lobby:challenge:accepted', { challengeId, roomId: room.roomId, gameType: 'poker5o' as const, vocal: challenge.vocal });
      io.to(`player:${challenge.fromId}`).emit('lobby:challenge:accepted', { challengeId, roomId: room.roomId, gameType: 'poker5o' as const, vocal: challenge.vocal });
    }
  });

  // ─── Decline Challenge ───────────────────────────────────────────────────────

  socket.on('lobby:challenge:decline', async ({ challengeId }: { challengeId: string }) => {
    const challenge = await challengeService.get(challengeId);
    if (!challenge || challenge.toId !== playerId) return;

    await challengeService.delete(challengeId);
    if (challenge.gameType !== 'pazpaz' && challenge.gameType !== 'backgammon') await roomService.delete(challenge.roomId);
    await lobbyService.setStatus(playerId, 'idle');
    await lobbyService.setStatus(challenge.fromId, 'idle');

    io.to('lobby').emit('lobby:player:status', { playerId, status: 'idle' });
    io.to('lobby').emit('lobby:player:status', { playerId: challenge.fromId, status: 'idle' });

    log('INVITE_DECLINED', {
      challengeId,
      fromId: challenge.fromId,
      fromNick: challenge.fromNickname,
      toId: playerId,
      toNick: nickname,
      stake: challenge.stake,
    });

    io.to(`player:${challenge.fromId}`).emit('lobby:challenge:declined', { challengeId });
  });

  // ─── Set Status (busy / idle) ────────────────────────────────────────────────

  socket.on('lobby:set_status', async ({ status }: { status: 'idle' | 'busy' }) => {
    const player = await lobbyService.getPlayer(playerId);
    if (!player || player.status === 'in-game' || player.status === 'invited') return;

    await lobbyService.setStatus(playerId, status);
    io.to('lobby').emit('lobby:player:status', { playerId, status });
  });

  // ─── Disconnect cleanup ──────────────────────────────────────────────────────

  socket.on('disconnect', async () => {
    const player = await lobbyService.getPlayer(playerId);
    if (player && player.status !== 'in-game') {
      // 30s grace period — remove only if still disconnected
      const timer = setTimeout(async () => {
        disconnectTimers.delete(playerId);
        const current = await lobbyService.getPlayer(playerId);
        if (current && current.status !== 'in-game') {
          await lobbyService.removePlayer(playerId);
          io.to('lobby').emit('lobby:player:left', { playerId });
        }
      }, 3_000);
      disconnectTimers.set(playerId, timer);
    }
  });
}
