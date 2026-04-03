import type { Server, Socket } from 'socket.io';
import { roomService } from '../services/roomService.js';
import { lobbyService } from '../services/lobbyService.js';
import { onGameEnd } from './lobbyRooms.js';
import { supabase } from '../supabase.js';
import { redis } from '../redis.js';
import { applyAction, canDrawCard, canPlaceCard, getGameScore } from '@poker5o/shared';
import type { GameState, Player } from '@poker5o/shared';
import type { Room } from '../types.js';
import { config } from '../config.js';
import { log } from '../logger.js';
import { settingsService, calculateHouseFee } from '../services/settingsService.js';

// ─── Turn Timers ──────────────────────────────────────────────────────────────

const turnTimers = new Map<string, NodeJS.Timeout>();

function clearTurnTimer(roomId: string): void {
  const existing = turnTimers.get(roomId);
  if (existing) {
    clearTimeout(existing);
    turnTimers.delete(roomId);
  }
}

async function handleGameOver(io: Server, room: Room, newState: GameState): Promise<void> {
  const rawScore = getGameScore(newState);
  if (rawScore && room.player1 && room.stake) {
    const isCompleteWin = rawScore.winner !== 'draw' &&
      (rawScore.winner === 0 ? rawScore.player0Wins : rawScore.player1Wins) === 5;
    const score = { ...rawScore, completeWinBonus: room.completeWinBonus, isCompleteWin };
    const effectiveStake = (room.completeWinBonus && isCompleteWin) ? room.stake * 2 : room.stake;

    const winnerName =
      score.winner === 'draw' ? 'draw'
      : score.winner === 0    ? room.player0.playerName
                              : room.player1.playerName;
    log('GAME_END', {
      roomId: room.roomId,
      player0: room.player0.playerName,
      player1: room.player1.playerName,
      stake: effectiveStake,
      winner: winnerName,
      score: `${score.player0Wins}-${score.player1Wins}` + (score.draws > 0 ? ` (${score.draws} tied)` : ''),
      durationMs: Date.now() - room.createdAt,
    });

    const winnerId = score.winner === 'draw'
      ? null
      : newState.players[score.winner].id;

    // Calculate per-player rake before emitting game:over so the client receives net amounts.
    // fee = feePercent% of each player's stake (e.g. 5% of 100 = 5 per player).
    let fee = 0;
    try {
      const rakeSettings = await settingsService.get();
      fee = calculateHouseFee(effectiveStake, rakeSettings);
    } catch (e) {
      console.error('[handleGameOver] rake settings error:', e);
    }
    const scoreWithRake = { ...score, rake: fee };
    io.to(`player:${room.player0.playerId}`).to(`player:${room.player1.playerId}`).emit('game:over', scoreWithRake);
    await roomService.save({ ...room, gameState: newState, status: 'finished' });

    const { data: gameId, error: settleError } = await supabase.rpc('settle_game', {
      p_room_id:        room.roomId,
      p_player0_id:     room.player0.playerId,
      p_player1_id:     room.player1.playerId,
      p_stake:          effectiveStake,
      p_winner_id:      winnerId,
      p_is_draw:        score.winner === 'draw',
      p_p0_columns:     score.player0Wins,
      p_p1_columns:     score.player1Wins,
      p_column_results: JSON.stringify(score.columnResults),
      p_final_state:    JSON.stringify(newState),
    });
    if (settleError) {
      console.error('[handleGameOver] settle_game error:', settleError.message, settleError);
      // Fallback: do direct chip transfer if RPC failed
      if (winnerId) {
        const loserId = newState.players[score.winner === 0 ? 1 : 0].id;
        const { error: e1 } = await supabase.rpc('add_chips', { p_player_id: winnerId, p_amount: effectiveStake });
        const { error: e2 } = await supabase.rpc('add_chips', { p_player_id: loserId, p_amount: -effectiveStake });
        if (e1) console.error('[handleGameOver] fallback winner add_chips error:', e1.message);
        if (e2) console.error('[handleGameOver] fallback loser add_chips error:', e2.message);
      }
    }

    // Rake: each player pays `fee` (feePercent% of their own stake) unconditionally.
    // House receives fee × 2 (both players' contributions).
    try {
      const settings = await settingsService.get();
      const p0Id = room.player0.playerId;
      const p1Id = room.player1.playerId;
      log('RAKE_CALC', { roomId: room.roomId, stakePerPlayer: effectiveStake, feePercent: settings.feePercent, feeCap: settings.feeCap, feePerPlayer: fee, totalFee: fee * 2, housePlayerId: settings.housePlayerId || '(none)' });

      if (fee > 0) {
        // Deduct fee from each player
        const { error: rakeE0 } = await supabase.rpc('add_chips', { p_amount: -fee, p_player_id: p0Id });
        if (rakeE0) console.error('[handleGameOver] rake p0 deduct error:', rakeE0.message);
        const { error: rakeE1 } = await supabase.rpc('add_chips', { p_amount: -fee, p_player_id: p1Id });
        if (rakeE1) console.error('[handleGameOver] rake p1 deduct error:', rakeE1.message);

        // Credit house with total rake (both players combined)
        if (settings.housePlayerId) {
          const { error: rakeE2 } = await supabase.rpc('add_chips', { p_amount: fee * 2, p_player_id: settings.housePlayerId });
          if (rakeE2) console.error('[handleGameOver] rake house credit error:', rakeE2.message);
        } else {
          console.warn('[handleGameOver] rake collected but housePlayerId not configured — chips burned');
        }

        // Record total rake in game row
        if (gameId) {
          await supabase.from('games').update({ rake_amount: fee * 2 }).eq('id', gameId);
        }

        // Each player's lifetime rake counter: the full fee they paid
        const [rakeR0, rakeR1] = await Promise.all([
          supabase.rpc('add_player_rake', { p_player_id: p0Id, p_rake: fee }),
          supabase.rpc('add_player_rake', { p_player_id: p1Id, p_rake: fee }),
        ]);
        if (rakeR0.error) console.error('[handleGameOver] add_player_rake p0 error:', rakeR0.error.message);
        if (rakeR1.error) console.error('[handleGameOver] add_player_rake p1 error:', rakeR1.error.message);

        // Agent rakeback: based on each player's individual fee paid
        if (settings.housePlayerId) {
          const [{ data: p0prof }, { data: p1prof }] = await Promise.all([
            supabase.from('profiles').select('agent_id').eq('id', p0Id).single(),
            supabase.from('profiles').select('agent_id').eq('id', p1Id).single(),
          ]);
          for (const [playerId, prof] of [[p0Id, p0prof], [p1Id, p1prof]] as [string, { agent_id: string | null } | null][]) {
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
    } catch (rakeErr) {
      console.error('[handleGameOver] rake error:', rakeErr);
    }

    // Notify both players of their updated chip balances
    const [{ data: p0chips }, { data: p1chips }] = await Promise.all([
      supabase.from('profiles').select('chips').eq('id', room.player0.playerId).single(),
      supabase.from('profiles').select('chips').eq('id', room.player1.playerId).single(),
    ]);
    if (p0chips) io.to(`player:${room.player0.playerId}`).emit('profile:chips_updated', { chips: p0chips.chips });
    if (p1chips) io.to(`player:${room.player1.playerId}`).emit('profile:chips_updated', { chips: p1chips.chips });

    await lobbyService.setStatus(room.player0.playerId, 'idle');
    await lobbyService.setStatus(room.player1.playerId, 'idle');
    io.to('lobby').emit('lobby:player:status', { playerId: room.player0.playerId, status: 'idle' });
    io.to('lobby').emit('lobby:player:status', { playerId: room.player1.playerId, status: 'idle' });

    await onGameEnd(io, room.lobbyRoomId);
  }
}

async function startTurnTimer(io: Server, roomId: string, state: GameState, room: Room): Promise<void> {
  if (!room.timerDuration) return;
  await startTurnTimerWithMs(io, roomId, state, room, room.timerDuration * 1000);
}

async function startTurnTimerWithMs(io: Server, roomId: string, state: GameState, room: Room, durationMs: number): Promise<void> {
  clearTurnTimer(roomId);

  if (!room.timerDuration || state.phase === 'GAME_OVER') return;

  const deadline = Date.now() + durationMs;
  const stateWithDeadline: GameState = { ...state, turnDeadline: deadline };
  await roomService.updateGameState(roomId, stateWithDeadline);
  await emitStateToRoom(io, room, stateWithDeadline);

  const timer = setTimeout(async () => {
    turnTimers.delete(roomId);

    const currentRoom = await roomService.get(roomId);
    if (!currentRoom?.gameState || currentRoom.status !== 'active') return;

    // Do not auto-play if a player is disconnected — timer should have been cleared on disconnect
    const bothConnected = currentRoom.player0.connected && (currentRoom.player1?.connected ?? false);
    if (!bothConnected) return;

    let autoState = currentRoom.gameState;
    const currentPlayerId = autoState.players[autoState.currentPlayerIndex].id;

    // Auto-draw if no card drawn yet
    if (autoState.drawnCard === null && canDrawCard(autoState, currentPlayerId)) {
      autoState = applyAction(autoState, { type: 'DRAW_CARD', playerId: currentPlayerId });
    }

    if (autoState.drawnCard === null) return; // couldn't draw, bail

    // Find a valid column to place in
    let validColIdx = -1;
    if (autoState.phase === 'SETUP_PHASE') {
      validColIdx = autoState.players[autoState.currentPlayerIndex].columns.findIndex(
        col => col.length === 0,
      );
    } else {
      // MAIN_PHASE: find column where col.length === currentRow
      validColIdx = autoState.players[autoState.currentPlayerIndex].columns.findIndex(
        col => col.length === autoState.currentRow,
      );
    }

    if (validColIdx === -1) return;

    autoState = applyAction(autoState, { type: 'PLACE_CARD', playerId: currentPlayerId, columnIndex: validColIdx });
    // Clear deadline after auto-play
    autoState = { ...autoState, turnDeadline: null };

    await roomService.updateGameState(roomId, autoState);
    await emitStateToRoom(io, currentRoom, autoState);

    if (autoState.phase === 'GAME_OVER') {
      await handleGameOver(io, currentRoom, autoState);
    } else {
      await startTurnTimer(io, roomId, autoState, currentRoom);
    }
  }, durationMs);

  turnTimers.set(roomId, timer);
}

// ─── State Filtering ──────────────────────────────────────────────────────────

/** Send each player a version of state appropriate for their perspective:
 *  - Opponent's last row (rowIdx 4) is face-down
 *  - Drawn card is hidden if it's not the viewer's turn
 */
function filterStateForPlayer(state: GameState, viewerIdx: 0 | 1): GameState {
  const opponentIdx: 0 | 1 = viewerIdx === 0 ? 1 : 0;

  const players = state.players.map((p, i) => {
    if (i !== opponentIdx) return p;
    return {
      ...p,
      columns: p.columns.map(col =>
        col.map((card, rowIdx) =>
          rowIdx === 4 ? { ...card, faceDown: true } : card,
        ),
      ),
    };
  }) as [Player, Player];

  // Hide drawn card when it's not the viewer's turn
  const drawnCard = state.currentPlayerIndex === viewerIdx ? state.drawnCard : null;

  return { ...state, players, drawnCard };
}

async function emitStateToRoom(io: Server, room: Room, state: GameState): Promise<void> {
  const p0Id = room.player0.playerId;
  const p1Id = room.player1?.playerId;

  for (const [, socket] of io.sockets.sockets) {
    const pid = socket.auth.playerId;
    if (pid === p0Id) {
      socket.emit('game:state', filterStateForPlayer(state, 0));
    } else if (p1Id && pid === p1Id) {
      socket.emit('game:state', filterStateForPlayer(state, 1));
    }
  }
}

// ─── Auto Setup Phase ─────────────────────────────────────────────────────────

async function runSetupPhase(io: Server, roomId: string): Promise<void> {
  for (let i = 0; i < 10; i++) {
    await new Promise<void>(r => setTimeout(r, 200));

    const room = await roomService.get(roomId);
    if (!room?.gameState || room.gameState.phase !== 'SETUP_PHASE') return;

    let state = room.gameState;
    const playerId = state.players[state.currentPlayerIndex].id;

    // Draw card
    state = applyAction(state, { type: 'DRAW_CARD', playerId });
    await roomService.updateGameState(roomId, state);
    await emitStateToRoom(io, room, state);

    // Brief pause so drawn card is visible before it lands
    await new Promise<void>(r => setTimeout(r, 100));

    // Place in first empty column
    const colIdx = state.players[state.currentPlayerIndex].columns.findIndex(
      col => col.length === 0,
    );
    if (colIdx === -1) return;

    state = applyAction(state, { type: 'PLACE_CARD', playerId, columnIndex: colIdx });
    await roomService.updateGameState(roomId, state);
    await emitStateToRoom(io, room, state);
  }

  // After setup, show "who goes first" banner for 2 seconds then start timer
  const roomAfterSetup = await roomService.get(roomId);
  if (roomAfterSetup?.gameState && roomAfterSetup.gameState.phase === 'MAIN_PHASE') {
    const firstIdx = roomAfterSetup.gameState.currentPlayerIndex;
    const firstName = roomAfterSetup.gameState.players[firstIdx].name;
    io.to(roomId).emit('game:starting', { firstPlayerIndex: firstIdx, firstPlayerName: firstName });
    await new Promise<void>(r => setTimeout(r, 2000));
    await startTurnTimer(io, roomId, roomAfterSetup.gameState, roomAfterSetup);
  }
}

// ─── Handlers ─────────────────────────────────────────────────────────────────

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
    socket.emit('room:joined', { roomId, playerId, playerIndex, stake: room.stake, completeWinBonus: room.completeWinBonus });

    // If game state is ready, send personalized state
    if (room.gameState) {
      socket.emit('game:state', filterStateForPlayer(room.gameState, playerIndex));

      // If the game is already over (player reconnected after it ended), send the score too
      // so they can see results without needing to have been in the room when game:over was emitted
      if (room.gameState.phase === 'GAME_OVER' && room.status === 'finished') {
        const rawScore = getGameScore(room.gameState);
        if (rawScore && room.player1) {
          const isCompleteWin = rawScore.winner !== 'draw' &&
            (rawScore.winner === 0 ? rawScore.player0Wins : rawScore.player1Wins) === 5;
          socket.emit('game:over', { ...rawScore, completeWinBonus: room.completeWinBonus, isCompleteWin });
        }
      }
    }

    // ── Reconnect detection ─────────────────────────────────────────────────────
    // If the player's connected flag was false (they dropped and are coming back),
    // mark them connected and tell the opponent — no manual "Wait" click needed.
    const wasDisconnected = isPlayer0 ? !room.player0.connected : !(room.player1?.connected ?? true);
    if (wasDisconnected && room.status === 'active' && room.gameState?.phase !== 'GAME_OVER') {
      const updatedRoom = await roomService.setPlayerConnected(roomId, playerId, true);
      if (updatedRoom) {
        socket.to(roomId).emit('player:reconnected', { playerIndex });

        // Resume a paused turn timer if both players are now connected
        const bothConnected = updatedRoom.player0.connected && (updatedRoom.player1?.connected ?? false);
        if (bothConnected && updatedRoom.timerDuration && updatedRoom.pausedTimerRemainingMs != null) {
          const remainingMs = updatedRoom.pausedTimerRemainingMs;
          await roomService.save({ ...updatedRoom, pausedTimerRemainingMs: null });
          const freshRoom = (await roomService.get(roomId)) ?? updatedRoom;
          if (freshRoom.gameState) {
            await startTurnTimerWithMs(io, roomId, freshRoom.gameState, freshRoom, remainingMs);
          }
        }
      }
    }

    // If both players are now in the socket room, notify them the game is ready
    const socketsInRoom = await io.in(roomId).fetchSockets();
    if (socketsInRoom.length === 2 && room.gameState) {
      io.to(roomId).emit('room:ready', { gameState: room.gameState });

      // Auto-deal setup phase if not yet started (Redis lock prevents double-start)
      if (room.gameState.phase === 'SETUP_PHASE' && room.gameState.setupDrawCount === 0) {
        const lockKey = `setup:lock:${roomId}`;
        const locked = await redis.set(lockKey, '1', 'EX', 120, 'NX');
        if (locked === 'OK') {
          log('GAME_START', {
            roomId,
            player0: room.player0.playerName,
            player1: room.player1?.playerName,
            stake: room.stake ?? undefined,
          });
          runSetupPhase(io, roomId);
        }
      }
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
    socket.emit('room:joined', { roomId, playerId, playerIndex, stake: room.stake, completeWinBonus: room.completeWinBonus });

    if (room.gameState) {
      socket.emit('game:state', filterStateForPlayer(room.gameState, playerIndex));
    }

    socket.to(roomId).emit('player:reconnected', { playerIndex });

    // Resume the paused timer if both players are now connected and a pause was saved
    const bothConnected = room.player0.connected && (room.player1?.connected ?? false);
    if (bothConnected && room.timerDuration && room.pausedTimerRemainingMs != null && room.gameState?.phase !== 'GAME_OVER') {
      const remainingMs = room.pausedTimerRemainingMs;
      // Clear the saved pause and restart with remaining time
      await roomService.save({ ...room, pausedTimerRemainingMs: null });
      const freshRoom = (await roomService.get(roomId)) ?? room;
      if (freshRoom.gameState) {
        await startTurnTimerWithMs(io, roomId, freshRoom.gameState, freshRoom, remainingMs);
      }
    }
  });

  // ─── Draw Card ───────────────────────────────────────────────────────────────

  socket.on('action:draw', async ({ roomId }: { roomId: string }) => {
    clearTurnTimer(roomId);

    const room = await roomService.get(roomId);
    if (!room?.gameState) {
      socket.emit('room:error', { message: 'Game not found' });
      return;
    }

    if (room.gameState.phase === 'SETUP_PHASE') return; // Setup is server-controlled

    if (!canDrawCard(room.gameState, playerId)) {
      socket.emit('room:error', { message: 'Cannot draw card right now' });
      return;
    }

    const newState = applyAction(room.gameState, { type: 'DRAW_CARD', playerId });
    await roomService.updateGameState(roomId, newState);
    await emitStateToRoom(io, room, newState);
    await startTurnTimer(io, roomId, newState, room);
  });

  // ─── Place Card ──────────────────────────────────────────────────────────────

  socket.on(
    'action:place',
    async ({ roomId, columnIndex }: { roomId: string; columnIndex: number }) => {
      clearTurnTimer(roomId);

      const room = await roomService.get(roomId);
      if (!room?.gameState) {
        socket.emit('room:error', { message: 'Game not found' });
        return;
      }

      if (room.gameState.phase === 'SETUP_PHASE') return; // Setup is server-controlled

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
      await emitStateToRoom(io, room, newState);

      if (newState.phase === 'GAME_OVER') {
        await handleGameOver(io, room, newState);
      } else {
        await startTurnTimer(io, roomId, newState, room);
      }
    },
  );

  // ─── Forfeit ─────────────────────────────────────────────────────────────────

  socket.on('game:forfeit', async ({ roomId }: { roomId: string }) => {
    clearTurnTimer(roomId);

    const room = await roomService.get(roomId);
    if (!room || room.status !== 'active' || !room.player1 || !room.stake) return;

    const forfeiterIndex: 0 | 1 = room.player0.playerId === playerId ? 0 : 1;
    const winnerId = forfeiterIndex === 0 ? room.player1.playerId : room.player0.playerId;

    await roomService.save({ ...room, status: 'finished' });
    io.to(roomId).emit('game:forfeited', { forfeiterIndex });

    const { data: gameId } = await supabase.rpc('settle_game', {
      p_room_id:        roomId,
      p_player0_id:     room.player0.playerId,
      p_player1_id:     room.player1.playerId,
      p_stake:          room.stake,
      p_winner_id:      winnerId,
      p_is_draw:        false,
      p_p0_columns:     forfeiterIndex === 0 ? 0 : 5,
      p_p1_columns:     forfeiterIndex === 1 ? 0 : 5,
      p_column_results: JSON.stringify([]),
      p_final_state:    JSON.stringify(room.gameState),
    });

    // House rake on forfeit
    const settings = await settingsService.get();
    const fee = calculateHouseFee(room.stake * 2, settings);
    if (fee > 0) {
      const { error: feeE1 } = await supabase.rpc('add_chips', { p_player_id: winnerId, p_amount: -fee });
      if (feeE1) console.error('[game:forfeit] rake deduct error:', feeE1.message);

      if (settings.housePlayerId) {
        const { error: feeE2 } = await supabase.rpc('add_chips', { p_player_id: settings.housePlayerId, p_amount: fee });
        if (feeE2) console.error('[game:forfeit] rake house error:', feeE2.message);
      }

      if (gameId) {
        await supabase.from('games').update({ rake_amount: fee }).eq('id', gameId);
      }
    }

    // Notify both players of their updated chip balances
    const [{ data: p0chips }, { data: p1chips }] = await Promise.all([
      supabase.from('profiles').select('chips').eq('id', room.player0.playerId).single(),
      supabase.from('profiles').select('chips').eq('id', room.player1.playerId).single(),
    ]);
    if (p0chips) io.to(`player:${room.player0.playerId}`).emit('profile:chips_updated', { chips: p0chips.chips });
    if (p1chips) io.to(`player:${room.player1.playerId}`).emit('profile:chips_updated', { chips: p1chips.chips });

    await lobbyService.setStatus(room.player0.playerId, 'idle');
    await lobbyService.setStatus(room.player1.playerId, 'idle');
    io.to('lobby').emit('lobby:player:status', { playerId: room.player0.playerId, status: 'idle' });
    io.to('lobby').emit('lobby:player:status', { playerId: room.player1.playerId, status: 'idle' });

    log('GAME_END', {
      roomId,
      player0: room.player0.playerName,
      player1: room.player1.playerName,
      stake: room.stake,
      winner: forfeiterIndex === 0 ? room.player1.playerName : room.player0.playerName,
      score: forfeiterIndex === 0 ? '0-5' : '5-0',
      rake: fee,
    });

    await onGameEnd(io, room.lobbyRoomId);
  });

  // ─── Ping (keepalive) ────────────────────────────────────────────────────────

  socket.on('game:ping', ({ roomId }: { roomId: string }) => {
    socket.emit('game:pong', { roomId });
  });

  // ─── Disconnect ──────────────────────────────────────────────────────────────

  socket.on('disconnect', async () => {
    // Find any active room this player is in
    const room = await roomService.findByPlayerId(playerId);
    if (!room || room.status !== 'active') return;

    // ── Pause the turn timer ──────────────────────────────────────────────────
    let pausedMs: number | null = null;
    if (room.timerDuration && room.gameState?.turnDeadline) {
      pausedMs = Math.max(0, room.gameState.turnDeadline - Date.now());
      clearTurnTimer(room.roomId);
      // Null out the deadline so clients hide the timer while paused
      const pausedState = { ...room.gameState, turnDeadline: null };
      await roomService.save({ ...room, gameState: pausedState, pausedTimerRemainingMs: pausedMs });
      await emitStateToRoom(io, room, pausedState);
    } else {
      clearTurnTimer(room.roomId);
      const updated = await roomService.setPlayerConnected(room.roomId, playerId, false);
      if (!updated) return;
    }

    // Mark player disconnected (if we saved above, re-mark connected=false)
    const roomAfterPause = await roomService.get(room.roomId);
    if (roomAfterPause) {
      const p0 = roomAfterPause.player0.playerId === playerId
        ? { ...roomAfterPause.player0, connected: false }
        : roomAfterPause.player0;
      const p1 = roomAfterPause.player1?.playerId === playerId
        ? { ...roomAfterPause.player1, connected: false }
        : roomAfterPause.player1;
      await roomService.save({ ...roomAfterPause, player0: p0, player1: p1 ?? roomAfterPause.player1! });
    }

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
        await lobbyService.setStatus(current.player0.playerId, 'idle');
        if (current.player1) await lobbyService.setStatus(current.player1.playerId, 'idle');
        io.to('lobby').emit('lobby:player:status', { playerId: current.player0.playerId, status: 'idle' });
        if (current.player1) io.to('lobby').emit('lobby:player:status', { playerId: current.player1.playerId, status: 'idle' });
        await onGameEnd(io, current.lobbyRoomId);
      }
    }, config.disconnectTtl * 1000);
  });
}
