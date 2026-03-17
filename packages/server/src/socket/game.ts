import type { Server, Socket } from 'socket.io';
import { roomService } from '../services/roomService.js';
import { lobbyService } from '../services/lobbyService.js';
import { supabase } from '../supabase.js';
import { applyAction, canDrawCard, canPlaceCard, getGameScore } from '@poker5o/shared';
import type { GameState, Player } from '@poker5o/shared';
import type { Room } from '../types.js';
import { config } from '../config.js';
import { log } from '../logger.js';

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
    io.to(room.roomId).emit('game:over', score);
    await roomService.save({ ...room, gameState: newState, status: 'finished' });

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

    await supabase.rpc('settle_game', {
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

    await lobbyService.setStatus(room.player0.playerId, 'idle');
    await lobbyService.setStatus(room.player1.playerId, 'idle');
    io.to('lobby').emit('lobby:player:status', { playerId: room.player0.playerId, status: 'idle' });
    io.to('lobby').emit('lobby:player:status', { playerId: room.player1.playerId, status: 'idle' });
  }
}

async function startTurnTimer(io: Server, roomId: string, state: GameState, room: Room): Promise<void> {
  clearTurnTimer(roomId);

  if (!room.useTimer || state.phase === 'GAME_OVER') return;

  const deadline = Date.now() + 45000;
  const stateWithDeadline: GameState = { ...state, turnDeadline: deadline };
  await roomService.updateGameState(roomId, stateWithDeadline);
  await emitStateToRoom(io, room, stateWithDeadline);

  const timer = setTimeout(async () => {
    turnTimers.delete(roomId);

    const currentRoom = await roomService.get(roomId);
    if (!currentRoom?.gameState || currentRoom.status !== 'active') return;

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
  }, 45000);

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
    // Delay between each card so players can see them appear one by one
    await new Promise<void>(r => setTimeout(r, 700));

    const room = await roomService.get(roomId);
    if (!room?.gameState || room.gameState.phase !== 'SETUP_PHASE') return;

    let state = room.gameState;
    const playerId = state.players[state.currentPlayerIndex].id;

    // Draw card
    state = applyAction(state, { type: 'DRAW_CARD', playerId });
    await roomService.updateGameState(roomId, state);
    await emitStateToRoom(io, room, state);

    // Brief pause so drawn card is visible
    await new Promise<void>(r => setTimeout(r, 350));

    // Place in first empty column
    const colIdx = state.players[state.currentPlayerIndex].columns.findIndex(
      col => col.length === 0,
    );
    if (colIdx === -1) return;

    state = applyAction(state, { type: 'PLACE_CARD', playerId, columnIndex: colIdx });
    await roomService.updateGameState(roomId, state);
    await emitStateToRoom(io, room, state);
  }

  // After setup phase completes, start timer for main phase
  const roomAfterSetup = await roomService.get(roomId);
  if (roomAfterSetup?.gameState && roomAfterSetup.gameState.phase === 'MAIN_PHASE') {
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
    socket.emit('room:joined', { roomId, playerId, playerIndex });

    // If game state is ready, send personalized state
    if (room.gameState) {
      socket.emit('game:state', filterStateForPlayer(room.gameState, playerIndex));
    }

    // If both players are now in the socket room, notify them the game is ready
    const socketsInRoom = await io.in(roomId).fetchSockets();
    if (socketsInRoom.length === 2 && room.gameState) {
      io.to(roomId).emit('room:ready', { gameState: room.gameState });

      // Auto-deal setup phase if not yet started
      if (room.gameState.phase === 'SETUP_PHASE' && room.gameState.setupDrawCount === 0) {
        log('GAME_START', {
          roomId,
          player0: room.player0.playerName,
          player1: room.player1?.playerName,
          stake: room.stake ?? undefined,
        });
        runSetupPhase(io, roomId);
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
    socket.emit('room:joined', { roomId, playerId, playerIndex });

    if (room.gameState) {
      socket.emit('game:state', filterStateForPlayer(room.gameState, playerIndex));
    }

    socket.to(roomId).emit('player:reconnected', { playerIndex });
  });

  // ─── Draw Card ───────────────────────────────────────────────────────────────

  socket.on('action:draw', async ({ roomId }: { roomId: string }) => {
    clearTurnTimer(roomId);

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

    await supabase.rpc('settle_game', {
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
    });
  });

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
        // Reset both players back to idle in lobby
        await lobbyService.setStatus(current.player0.playerId, 'idle');
        if (current.player1) await lobbyService.setStatus(current.player1.playerId, 'idle');
        io.to('lobby').emit('lobby:player:status', { playerId: current.player0.playerId, status: 'idle' });
        if (current.player1) io.to('lobby').emit('lobby:player:status', { playerId: current.player1.playerId, status: 'idle' });
      }
    }, config.disconnectTtl * 1000);
  });
}
