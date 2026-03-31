import type { Server, Socket } from 'socket.io';
import {
  rollDice,
  applyRoll,
  applyMove,
  applyOfferDouble,
  applyAcceptDouble,
  applyDropDouble,
  applyForfeit,
  checkWin,
  canOfferDouble,
  validateMove,
} from '@poker5o/shared';
import type { BackgammonGameState, BackgammonMove } from '@poker5o/shared';
import { backgammonRoomService } from '../services/backgammonRoomService.js';
import type { BackgammonRoom } from '../services/backgammonRoomService.js';
import { lobbyService } from '../services/lobbyService.js';
import { supabase } from '../supabase.js';
import { settingsService, calculateHouseFee } from '../services/settingsService.js';
import { log } from '../logger.js';

// Turn timers: roomId → timeout handle (auto-forfeit on timeout)
const turnTimers = new Map<string, ReturnType<typeof setTimeout>>();
const TURN_TIMEOUT_MS = 60_000; // 60 seconds per turn

function clearTurnTimer(roomId: string) {
  const t = turnTimers.get(roomId);
  if (t) { clearTimeout(t); turnTimers.delete(roomId); }
}

// ─── Chip settlement ──────────────────────────────────────────────────────────

async function handleBackgammonGameOver(
  io: Server,
  room: BackgammonRoom,
): Promise<void> {
  const { roomId, gameState, matchConfig } = room;
  const result = gameState.gameResult;
  if (!result) return;

  const p0Id = room.player0.playerId;
  const p1Id = room.player1.playerId;
  const winner = result.winner;
  const loser  = winner === 0 ? 1 : 0;
  const winnerId = winner === 0 ? p0Id : p1Id;
  const loserId  = loser  === 0 ? p0Id : p1Id;
  const pointValue = matchConfig.pointValue;

  // Update match score
  const updatedPlayers = gameState.players.map((p, i) => ({
    ...p,
    matchScore: i === winner ? p.matchScore + result.pointsWon : p.matchScore,
  })) as [typeof gameState.players[0], typeof gameState.players[1]];

  const matchWon = matchConfig.mode === 'match'
    && matchConfig.matchLength !== null
    && updatedPlayers[winner].matchScore >= matchConfig.matchLength;

  const isMatchEnd = matchConfig.mode === 'per-point' || matchWon;

  log('BACKGAMMON_GAME_END', {
    roomId,
    p0Id,
    p1Id,
    winner: winner === 0 ? gameState.players[0].name : gameState.players[1].name,
    winType: result.winType,
    pointsWon: result.pointsWon,
    cubeValue: result.cubeValue,
    matchMode: matchConfig.mode,
    isMatchEnd,
  });

  // Chip settlement
  const chipsWon = result.pointsWon * pointValue;
  let fee = 0;

  try {
    const settings = await settingsService.get();
    fee = calculateHouseFee(pointValue, settings); // rake on point value

    if (isMatchEnd && chipsWon > 0) {
      // Winner gains, loser loses
      await supabase.rpc('add_chips', { p_amount:  chipsWon, p_player_id: winnerId });
      await supabase.rpc('add_chips', { p_amount: -chipsWon, p_player_id: loserId });
    }

    // Rake
    if (fee > 0) {
      await supabase.rpc('add_chips', { p_amount: -fee, p_player_id: p0Id });
      await supabase.rpc('add_chips', { p_amount: -fee, p_player_id: p1Id });
      if (settings.housePlayerId) {
        await supabase.rpc('add_chips', { p_amount: fee * 2, p_player_id: settings.housePlayerId });
      }
      await supabase.rpc('add_player_rake', { p_player_id: p0Id, p_rake: fee });
      await supabase.rpc('add_player_rake', { p_player_id: p1Id, p_rake: fee });

      log('RAKE_CALC', {
        roomId,
        stakePerPlayer: pointValue,
        feePercent: settings.feePercent,
        feePerPlayer: fee,
        totalFee: fee * 2,
        winnerId,
        housePlayerId: settings.housePlayerId || '(none)',
      });

      // Agent rakeback
      if (settings.housePlayerId) {
        const [{ data: p0prof }, { data: p1prof }] = await Promise.all([
          supabase.from('profiles').select('agent_id').eq('id', p0Id).single(),
          supabase.from('profiles').select('agent_id').eq('id', p1Id).single(),
        ]);
        for (const [pid, prof] of [[p0Id, p0prof], [p1Id, p1prof]] as [string, { agent_id: string | null } | null][]) {
          if (prof?.agent_id) {
            const { data: agent } = await supabase
              .from('profiles').select('rakeback_percent').eq('id', prof.agent_id).single();
            if (agent && agent.rakeback_percent > 0) {
              const cut = Math.round(fee * agent.rakeback_percent / 100);
              if (cut > 0) {
                await supabase.rpc('add_chips', { p_amount: -cut, p_player_id: settings.housePlayerId });
                await supabase.rpc('add_agent_pool', { p_agent_id: prof.agent_id, p_amount: cut });
              }
            }
          }
        }
      }
    }

    // Record game in DB
    await supabase.from('backgammon_games').insert({
      room_id:       roomId,
      player0_id:    p0Id,
      player1_id:    p1Id,
      winner_id:     winnerId,
      win_type:      result.winType,
      cube_value:    result.cubeValue,
      points_won:    result.pointsWon,
      chips_wagered: pointValue,
      rake_amount:   fee * 2,
      match_mode:    matchConfig.mode,
      match_length:  matchConfig.matchLength ?? null,
      final_state:   gameState,
      completed_at:  new Date().toISOString(),
    });
  } catch (err) {
    console.error('[handleBackgammonGameOver] error:', err);
  }

  // Emit updated state with rake
  const finalState: BackgammonGameState = { ...gameState, rake: fee };
  io.to(`backgammon:${roomId}`).emit('backgammon:state', finalState);

  // Notify chip balance updates
  const [{ data: p0chips }, { data: p1chips }] = await Promise.all([
    supabase.from('profiles').select('chips').eq('id', p0Id).single(),
    supabase.from('profiles').select('chips').eq('id', p1Id).single(),
  ]);
  if (p0chips) io.to(`player:${p0Id}`).emit('profile:chips_updated', { chips: p0chips.chips });
  if (p1chips) io.to(`player:${p1Id}`).emit('profile:chips_updated', { chips: p1chips.chips });

  // Reset lobby status
  await lobbyService.setStatus(p0Id, 'idle');
  await lobbyService.setStatus(p1Id, 'idle');
  io.to('lobby').emit('lobby:player:status', { playerId: p0Id, status: 'idle' });
  io.to('lobby').emit('lobby:player:status', { playerId: p1Id, status: 'idle' });

  // Mark room finished
  room.status = 'finished';
  await backgammonRoomService.save(room);
}

// ─── Turn timer ───────────────────────────────────────────────────────────────

function startTurnTimer(io: Server, roomId: string, currentPlayerIndex: 0 | 1, p0Id: string, p1Id: string) {
  clearTurnTimer(roomId);
  const timer = setTimeout(async () => {
    const room = await backgammonRoomService.get(roomId);
    if (!room || room.status !== 'active') return;
    if (room.gameState.phase === 'GAME_OVER') return;
    // Auto-forfeit current player for timeout
    const newState = applyForfeit(room.gameState, room.gameState.currentPlayerIndex);
    room.gameState = newState;
    await backgammonRoomService.save(room);
    io.to(`backgammon:${roomId}`).emit('backgammon:state', newState);
    await handleBackgammonGameOver(io, room);
  }, TURN_TIMEOUT_MS);
  turnTimers.set(roomId, timer);
}

// ─── Register handlers ────────────────────────────────────────────────────────

export function registerBackgammonHandlers(io: Server, socket: Socket): void {
  const { playerId } = socket.auth;

  // ─── Join ─────────────────────────────────────────────────────────────────

  socket.on('backgammon:join', async ({ roomId }: { roomId: string }) => {
    const room = await backgammonRoomService.get(roomId);
    if (!room) {
      socket.emit('backgammon:error', { message: 'Room not found' });
      return;
    }

    let playerIndex: 0 | 1;
    if (room.player0.playerId === playerId) playerIndex = 0;
    else if (room.player1.playerId === playerId) playerIndex = 1;
    else {
      socket.emit('backgammon:error', { message: 'You are not in this room' });
      return;
    }

    socket.join(`backgammon:${roomId}`);
    socket.emit('backgammon:state', room.gameState);

    // Start turn timer once both players are in
    const sockets = await io.in(`backgammon:${roomId}`).fetchSockets();
    if (sockets.length >= 2) {
      const p0Id = room.player0.playerId;
      const p1Id = room.player1.playerId;
      if (!turnTimers.has(roomId)) {
        startTurnTimer(io, roomId, room.gameState.currentPlayerIndex, p0Id, p1Id);
      }
    }

    log('BACKGAMMON_JOIN', { roomId, playerId, playerIndex });
  });

  // ─── Roll ─────────────────────────────────────────────────────────────────

  socket.on('backgammon:roll', async ({ roomId }: { roomId: string }) => {
    const room = await backgammonRoomService.get(roomId);
    if (!room || room.status !== 'active') return;

    const pi: 0 | 1 = room.player0.playerId === playerId ? 0 : 1;
    const state = room.gameState;

    if (state.currentPlayerIndex !== pi) {
      socket.emit('backgammon:error', { message: 'Not your turn' });
      return;
    }
    if (state.phase !== 'ROLLING') {
      socket.emit('backgammon:error', { message: 'Not in rolling phase' });
      return;
    }

    const dice = rollDice();
    const newState = applyRoll(state, dice);

    room.gameState = newState;
    await backgammonRoomService.save(room);
    io.to(`backgammon:${roomId}`).emit('backgammon:state', newState);

    // Reset turn timer for the moving phase
    startTurnTimer(io, roomId, newState.currentPlayerIndex, room.player0.playerId, room.player1.playerId);
  });

  // ─── Move ─────────────────────────────────────────────────────────────────

  socket.on('backgammon:move', async ({ roomId, move }: { roomId: string; move: BackgammonMove }) => {
    const room = await backgammonRoomService.get(roomId);
    if (!room || room.status !== 'active') return;

    const pi: 0 | 1 = room.player0.playerId === playerId ? 0 : 1;
    const state = room.gameState;

    if (state.currentPlayerIndex !== pi) {
      socket.emit('backgammon:error', { message: 'Not your turn' });
      return;
    }
    if (state.phase !== 'MOVING') {
      socket.emit('backgammon:error', { message: 'Not in moving phase' });
      return;
    }

    const { valid, reason } = validateMove(state, move);
    if (!valid) {
      socket.emit('backgammon:error', { message: reason ?? 'Illegal move' });
      return;
    }

    let newState = applyMove(state, move);

    // Check for win after each move
    const win = checkWin(newState);
    if (win) {
      newState = { ...newState, phase: 'GAME_OVER', gameResult: win };
    }

    room.gameState = newState;
    await backgammonRoomService.save(room);
    io.to(`backgammon:${roomId}`).emit('backgammon:state', newState);

    if (newState.phase === 'GAME_OVER') {
      clearTurnTimer(roomId);
      await handleBackgammonGameOver(io, room);
    } else if (newState.phase === 'ROLLING' && newState.currentPlayerIndex !== pi) {
      // Turn switched — reset timer for opponent
      startTurnTimer(io, roomId, newState.currentPlayerIndex, room.player0.playerId, room.player1.playerId);
    }
  });

  // ─── Offer Double ─────────────────────────────────────────────────────────

  socket.on('backgammon:offer_double', async ({ roomId }: { roomId: string }) => {
    const room = await backgammonRoomService.get(roomId);
    if (!room || room.status !== 'active') return;

    const pi: 0 | 1 = room.player0.playerId === playerId ? 0 : 1;
    const state = room.gameState;

    if (state.currentPlayerIndex !== pi) {
      socket.emit('backgammon:error', { message: 'Not your turn' });
      return;
    }
    if (!canOfferDouble(state)) {
      socket.emit('backgammon:error', { message: 'Cannot offer double now' });
      return;
    }

    const newState = applyOfferDouble(state);
    room.gameState = newState;
    await backgammonRoomService.save(room);
    io.to(`backgammon:${roomId}`).emit('backgammon:state', newState);

    // Give opponent 30s to respond
    clearTurnTimer(roomId);
    startTurnTimer(io, roomId, pi, room.player0.playerId, room.player1.playerId);
  });

  // ─── Accept Double ────────────────────────────────────────────────────────

  socket.on('backgammon:accept_double', async ({ roomId }: { roomId: string }) => {
    const room = await backgammonRoomService.get(roomId);
    if (!room || room.status !== 'active') return;

    const pi: 0 | 1 = room.player0.playerId === playerId ? 0 : 1;
    const state = room.gameState;

    // The responder is the opponent of the current player (who offered)
    if (state.currentPlayerIndex === pi) {
      socket.emit('backgammon:error', { message: 'You offered the double — wait for opponent response' });
      return;
    }
    if (state.phase !== 'AWAITING_DOUBLE') {
      socket.emit('backgammon:error', { message: 'No double to accept' });
      return;
    }

    const newState = applyAcceptDouble(state);
    room.gameState = newState;
    await backgammonRoomService.save(room);
    io.to(`backgammon:${roomId}`).emit('backgammon:state', newState);

    startTurnTimer(io, roomId, newState.currentPlayerIndex, room.player0.playerId, room.player1.playerId);
  });

  // ─── Drop Double ──────────────────────────────────────────────────────────

  socket.on('backgammon:drop_double', async ({ roomId }: { roomId: string }) => {
    const room = await backgammonRoomService.get(roomId);
    if (!room || room.status !== 'active') return;

    const pi: 0 | 1 = room.player0.playerId === playerId ? 0 : 1;
    const state = room.gameState;

    if (state.currentPlayerIndex === pi) {
      socket.emit('backgammon:error', { message: 'You offered the double — cannot drop it' });
      return;
    }
    if (state.phase !== 'AWAITING_DOUBLE') {
      socket.emit('backgammon:error', { message: 'No double to drop' });
      return;
    }

    clearTurnTimer(roomId);
    const newState = applyDropDouble(state);
    room.gameState = newState;
    await backgammonRoomService.save(room);
    io.to(`backgammon:${roomId}`).emit('backgammon:state', newState);
    await handleBackgammonGameOver(io, room);
  });

  // ─── Forfeit ──────────────────────────────────────────────────────────────

  socket.on('backgammon:forfeit', async ({ roomId }: { roomId: string }) => {
    const room = await backgammonRoomService.get(roomId);
    if (!room || room.status !== 'active') return;

    const pi: 0 | 1 = room.player0.playerId === playerId ? 0 : 1;

    clearTurnTimer(roomId);
    log('BACKGAMMON_FORFEIT', { roomId, playerId, playerIndex: pi });

    const newState = applyForfeit(room.gameState, pi);
    room.gameState = newState;
    await backgammonRoomService.save(room);
    io.to(`backgammon:${roomId}`).emit('backgammon:forfeited', { forfeiterIndex: pi });
    io.to(`backgammon:${roomId}`).emit('backgammon:state', newState);
    await handleBackgammonGameOver(io, room);
  });

  // ─── Disconnect ───────────────────────────────────────────────────────────

  socket.on('disconnect', async () => {
    const room = await backgammonRoomService.findByPlayerId(playerId);
    if (!room || room.status !== 'active') return;
    log('BACKGAMMON_DISCONNECT', { roomId: room.roomId, playerId });
    // Player has TURN_TIMEOUT_MS to reconnect before auto-forfeit fires
  });
}
