import type { Server, Socket } from 'socket.io';
import { revealAndScore, shuffleDeck } from '@poker5o/shared';
import type { PazPazAssignment, PazPazGameState, Card } from '@poker5o/shared';
import { pazpazRoomService } from '../services/pazpazRoomService.js';
import { lobbyService } from '../services/lobbyService.js';
import { supabase } from '../supabase.js';
import { settingsService, calculateHouseFee } from '../services/settingsService.js';
import { log } from '../logger.js';

// assignment deadline timers: roomId → timeout handle
const assignmentTimers = new Map<string, ReturnType<typeof setTimeout>>();
// track which rooms have had their deadline timer started
const timerStarted = new Set<string>();
// pressure timers: roomId → timeout handle (90s after first player submits)
const pressureTimers = new Map<string, ReturnType<typeof setTimeout>>();

// ─── State filtering (hide opponent cards during ASSIGNING) ───────────────────

function filterStateForPlayer(state: PazPazGameState, playerIndex: 0 | 1): PazPazGameState {
  if (state.phase === 'SCORING') return state;

  const opponentIndex: 0 | 1 = playerIndex === 0 ? 1 : 0;
  const players = [...state.players] as [typeof state.players[0], typeof state.players[1]];
  players[opponentIndex] = { ...players[opponentIndex], dealtCards: [] };

  return {
    ...state,
    players,
    assignments: [null, null],
  };
}

// ─── Auto-submit with random assignment ──────────────────────────────────────

function makeRandomAssignment(dealtCards: Card[]): PazPazAssignment {
  const shuffled = shuffleDeck(dealtCards);
  return {
    hands: [
      shuffled.slice(0, 4),
      shuffled.slice(4, 8),
      shuffled.slice(8, 12),
    ],
  };
}

// ─── Build complete assignment from partial (fill missing cards randomly) ─────

function buildCompleteAssignment(partial: PazPazAssignment | null, allCards: Card[]): PazPazAssignment {
  if (partial && partial.hands) {
    const assigned = partial.hands.flat();
    const unassigned = shuffleDeck(allCards.filter(c =>
      !assigned.some(a => a.rank === c.rank && a.suit === c.suit)
    ));
    const hands: [Card[], Card[], Card[]] = partial.hands.map(h => [...h]) as [Card[], Card[], Card[]];
    let pool = [...unassigned];
    for (let f = 0; f < 3; f++) {
      while (hands[f].length < 4 && pool.length > 0) {
        hands[f].push(pool.shift()!);
      }
    }
    return { hands };
  }
  return makeRandomAssignment(allCards);
}

// ─── Chip settlement ──────────────────────────────────────────────────────────

async function handlePazPazGameOver(io: Server, roomId: string, gameState: PazPazGameState, p0Id: string, p1Id: string, stake: number): Promise<void> {
  const winner = gameState.winner; // 0 | 1 | 'draw' | null

  const winnerId = winner === 'draw' || winner === null
    ? null
    : winner === 0 ? p0Id : p1Id;
  const loserId = winner === 'draw' || winner === null
    ? null
    : winner === 0 ? p1Id : p0Id;

  const p0Flops = gameState.flopResults?.filter(r => r.winner === 0).length ?? 0;
  const p1Flops = gameState.flopResults?.filter(r => r.winner === 1).length ?? 0;

  log('PAZPAZ_GAME_END', {
    roomId,
    p0Id,
    p1Id,
    stake,
    winner: winner === 'draw' ? 'draw' : winner === 0 ? gameState.players[0].name : gameState.players[1].name,
    score: `${p0Flops}-${p1Flops}`,
  });

  // Settle chips via RPC
  const { data: gameId, error: settleError } = await supabase.rpc('settle_game', {
    p_room_id:        roomId,
    p_player0_id:     p0Id,
    p_player1_id:     p1Id,
    p_stake:          stake,
    p_winner_id:      winnerId,
    p_is_draw:        winner === 'draw',
    p_p0_columns:     p0Flops,
    p_p1_columns:     p1Flops,
    p_column_results: JSON.stringify(gameState.flopResults ?? []),
    p_final_state:    JSON.stringify(gameState),
  });
  if (settleError) {
    console.error('[handlePazPazGameOver] settle_game error:', settleError.message, settleError);
    // Fallback: manual chip transfer
    if (winnerId && loserId) {
      const { error: e1 } = await supabase.rpc('add_chips', { p_player_id: winnerId, p_amount: stake });
      const { error: e2 } = await supabase.rpc('add_chips', { p_player_id: loserId, p_amount: -stake });
      if (e1) console.error('[handlePazPazGameOver] fallback winner error:', e1.message);
      if (e2) console.error('[handlePazPazGameOver] fallback loser error:', e2.message);
    }
  }

  // House fee — split equally between both players regardless of win/draw/loss
  let fee = 0;
  try {
    const settings = await settingsService.get();
    fee = calculateHouseFee(stake * 2, settings);
    log('RAKE_CALC', { roomId, pot: stake * 2, feePercent: settings.feePercent, feeCap: settings.feeCap, fee, winnerId: winnerId ?? 'draw', housePlayerId: settings.housePlayerId || '(none)' });

    if (fee > 0) {
      const p0Rake = Math.round(fee / 2);
      const p1Rake = fee - p0Rake;

      if (winner === 'draw' || winner === null) {
        // Draw: no winner, each player pays their half directly
        const { error: feeE0 } = await supabase.rpc('add_chips', { p_amount: -p0Rake, p_player_id: p0Id });
        if (feeE0) console.error('[handlePazPazGameOver] rake p0 draw deduct error:', feeE0.message);
        const { error: feeE1 } = await supabase.rpc('add_chips', { p_amount: -p1Rake, p_player_id: p1Id });
        if (feeE1) console.error('[handlePazPazGameOver] rake p1 draw deduct error:', feeE1.message);
      } else if (winnerId) {
        // Win: full rake from winner only — loser's contribution is implicit in the stake transfer
        const { error: feeE0 } = await supabase.rpc('add_chips', { p_amount: -fee, p_player_id: winnerId });
        if (feeE0) console.error('[handlePazPazGameOver] rake winner deduct error:', feeE0.message);
      }

      // Credit house player
      if (settings.housePlayerId) {
        const { error: feeE2 } = await supabase.rpc('add_chips', { p_amount: fee, p_player_id: settings.housePlayerId });
        if (feeE2) console.error('[handlePazPazGameOver] rake house error:', feeE2.message);
      }

      if (gameId) {
        await supabase.from('games').update({ rake_amount: fee }).eq('id', gameId);
      }

      // Update each player's lifetime rake counter
      await Promise.all([
        supabase.rpc('add_player_rake', { p_player_id: p0Id, p_rake: p0Rake }),
        supabase.rpc('add_player_rake', { p_player_id: p1Id, p_rake: p1Rake }),
      ]);

      // Agent rakeback
      if (settings.housePlayerId) {
        const [{ data: p0prof }, { data: p1prof }] = await Promise.all([
          supabase.from('profiles').select('agent_id').eq('id', p0Id).single(),
          supabase.from('profiles').select('agent_id').eq('id', p1Id).single(),
        ]);
        for (const [playerRake, prof] of [[p0Rake, p0prof], [p1Rake, p1prof]] as [number, { agent_id: string | null } | null][]) {
          if (prof?.agent_id) {
            const { data: agent } = await supabase
              .from('profiles').select('rakeback_percent').eq('id', prof.agent_id).single();
            if (agent && agent.rakeback_percent > 0) {
              const cut = Math.round(playerRake * agent.rakeback_percent / 100);
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
    console.error('[handlePazPazGameOver] rake error:', rakeErr);
  }

  // Re-emit state with rake field so clients can display net chip change
  if (fee > 0) {
    const stateWithRake: PazPazGameState = { ...gameState, rake: fee };
    io.to(`pazpaz:${roomId}`).emit('pazpaz:state', stateWithRake);
  }

  // Notify players of updated chip balances
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
}

// ─── Register handlers ────────────────────────────────────────────────────────

export function registerPazPazHandlers(io: Server, socket: Socket): void {
  const { playerId, nickname } = socket.auth;

  // ─── Join room ────────────────────────────────────────────────────────────

  socket.on('pazpaz:join', async ({ roomId }: { roomId: string }) => {
    const room = await pazpazRoomService.get(roomId);
    if (!room) {
      socket.emit('pazpaz:error', { message: 'Room not found' });
      return;
    }

    // Determine player index
    let playerIndex: 0 | 1;
    if (room.player0.playerId === playerId) {
      playerIndex = 0;
    } else if (room.player1.playerId === playerId) {
      playerIndex = 1;
    } else {
      socket.emit('pazpaz:error', { message: 'You are not in this room' });
      return;
    }

    socket.join(`pazpaz:${roomId}`);

    // Send filtered state
    const filtered = filterStateForPlayer(room.gameState, playerIndex);
    socket.emit('pazpaz:state', filtered);

    // Start assignment deadline timer once both players have joined
    const socketsInRoom = await io.in(`pazpaz:${roomId}`).fetchSockets();
    if (socketsInRoom.length >= 2 && !timerStarted.has(roomId)) {
      timerStarted.add(roomId);

      const durationMs = (room.assignmentDuration ?? 180) * 1000;
      const deadline = Date.now() + durationMs;

      // Update deadline in game state
      const updatedRoom = await pazpazRoomService.get(roomId);
      if (updatedRoom) {
        updatedRoom.gameState.assignDeadline = deadline;
        await pazpazRoomService.save(updatedRoom);

        // Broadcast updated state with deadline to both players
        const allSockets = await io.in(`pazpaz:${roomId}`).fetchSockets();
        for (const s of allSockets) {
          const pid = (s as unknown as { auth: { playerId: string } }).auth?.playerId;
          const pIdx = updatedRoom.player0.playerId === pid ? 0 : 1;
          s.emit('pazpaz:state', filterStateForPlayer(updatedRoom.gameState, pIdx));
        }
      }

      // Auto-submit after deadline for any player who hasn't submitted
      const timer = setTimeout(async () => {
        assignmentTimers.delete(roomId);
        const currentRoom = await pazpazRoomService.get(roomId);
        if (!currentRoom || currentRoom.gameState.phase !== 'ASSIGNING') return;

        let updated = { ...currentRoom };
        const assignments: [PazPazAssignment | null, PazPazAssignment | null] = [...currentRoom.gameState.assignments];

        if (!assignments[0]) {
          assignments[0] = makeRandomAssignment(currentRoom.gameState.players[0].dealtCards);
          updated.gameState = {
            ...updated.gameState,
            players: [
              { ...updated.gameState.players[0], hasSubmitted: true },
              updated.gameState.players[1],
            ],
          };
          log('PAZPAZ_AUTO_SUBMIT', { roomId, playerIndex: 0 });
        }
        if (!assignments[1]) {
          assignments[1] = makeRandomAssignment(currentRoom.gameState.players[1].dealtCards);
          updated.gameState = {
            ...updated.gameState,
            players: [
              updated.gameState.players[0],
              { ...updated.gameState.players[1], hasSubmitted: true },
            ],
          };
          log('PAZPAZ_AUTO_SUBMIT', { roomId, playerIndex: 1 });
        }

        updated.gameState = { ...updated.gameState, assignments };

        // Clear any pressure timer
        const pt = pressureTimers.get(roomId);
        if (pt) { clearTimeout(pt); pressureTimers.delete(roomId); }

        // Score the game
        const scored = revealAndScore(updated.gameState);
        updated.gameState = scored;
        updated.status = 'finished';
        timerStarted.delete(roomId);
        await pazpazRoomService.save(updated);

        io.to(`pazpaz:${roomId}`).emit('pazpaz:state', scored);

        // Settle chips
        if (updated.stake) {
          await handlePazPazGameOver(io, roomId, scored, updated.player0.playerId, updated.player1.playerId, updated.stake);
        }
      }, durationMs);

      assignmentTimers.set(roomId, timer);
    }

    log('PAZPAZ_JOIN', { roomId, playerId, nickname, playerIndex });
  });

  // ─── Submit assignment ────────────────────────────────────────────────────

  socket.on('pazpaz:submit', async ({ roomId, assignment }: { roomId: string; assignment: PazPazAssignment }) => {
    const room = await pazpazRoomService.get(roomId);
    if (!room) {
      socket.emit('pazpaz:error', { message: 'Room not found' });
      return;
    }

    if (room.gameState.phase !== 'ASSIGNING') {
      socket.emit('pazpaz:error', { message: 'Game is not in assignment phase' });
      return;
    }

    // Determine player index
    let playerIndex: 0 | 1;
    if (room.player0.playerId === playerId) {
      playerIndex = 0;
    } else if (room.player1.playerId === playerId) {
      playerIndex = 1;
    } else {
      socket.emit('pazpaz:error', { message: 'You are not in this room' });
      return;
    }

    // Already submitted
    if (room.gameState.assignments[playerIndex] !== null) {
      socket.emit('pazpaz:error', { message: 'You have already submitted' });
      return;
    }

    // Validate assignment
    if (!assignment.hands || assignment.hands.length !== 3) {
      socket.emit('pazpaz:error', { message: 'Invalid assignment: must have 3 hands' });
      return;
    }

    for (let f = 0; f < 3; f++) {
      if (!assignment.hands[f] || assignment.hands[f].length !== 4) {
        socket.emit('pazpaz:error', { message: `Invalid assignment: hand ${f + 1} must have exactly 4 cards` });
        return;
      }
    }

    // Validate all 12 cards are from player's dealt hand
    const playerDealt = room.gameState.players[playerIndex].dealtCards;
    const allAssigned = assignment.hands.flat();

    if (allAssigned.length !== 12) {
      socket.emit('pazpaz:error', { message: 'Invalid assignment: must assign all 12 cards' });
      return;
    }

    const dealtSet = playerDealt.map(c => `${c.rank}:${c.suit}`);
    const assignedKeys = allAssigned.map(c => `${c.rank}:${c.suit}`);
    const sortedDealt = [...dealtSet].sort().join(',');
    const sortedAssigned = [...assignedKeys].sort().join(',');
    if (sortedDealt !== sortedAssigned) {
      socket.emit('pazpaz:error', { message: 'Invalid assignment: cards do not match your dealt hand' });
      return;
    }

    // Update state
    const newAssignments: [PazPazAssignment | null, PazPazAssignment | null] = [...room.gameState.assignments];
    newAssignments[playerIndex] = assignment;

    const newPlayers = [...room.gameState.players] as typeof room.gameState.players;
    newPlayers[playerIndex] = { ...newPlayers[playerIndex], hasSubmitted: true };

    let updatedGameState: PazPazGameState = {
      ...room.gameState,
      assignments: newAssignments,
      players: newPlayers,
    };

    // Check if both submitted
    const bothSubmitted = newAssignments[0] !== null && newAssignments[1] !== null;

    if (bothSubmitted) {
      // Clear the assignment timer
      const timer = assignmentTimers.get(roomId);
      if (timer) {
        clearTimeout(timer);
        assignmentTimers.delete(roomId);
      }
      timerStarted.delete(roomId);

      // Clear any pressure timer
      const pt = pressureTimers.get(roomId);
      if (pt) { clearTimeout(pt); pressureTimers.delete(roomId); }

      // Score the game
      updatedGameState = revealAndScore(updatedGameState);
    }

    const updatedRoom = { ...room, gameState: updatedGameState, status: bothSubmitted ? 'finished' as const : room.status };
    await pazpazRoomService.save(updatedRoom);

    log('PAZPAZ_SUBMIT', { roomId, playerId, nickname, playerIndex, bothSubmitted });

    if (bothSubmitted) {
      io.to(`pazpaz:${roomId}`).emit('pazpaz:state', updatedGameState);

      // Settle chips
      if (updatedRoom.stake) {
        await handlePazPazGameOver(io, roomId, updatedGameState, updatedRoom.player0.playerId, updatedRoom.player1.playerId, updatedRoom.stake);
      }
    } else {
      // Tell everyone about submission status (still hide cards)
      const allSockets = await io.in(`pazpaz:${roomId}`).fetchSockets();
      for (const s of allSockets) {
        const pid = (s as unknown as { auth: { playerId: string } }).auth?.playerId;
        const pIdx = updatedRoom.player0.playerId === pid ? 0 : 1;
        s.emit('pazpaz:state', filterStateForPlayer(updatedGameState, pIdx));
      }

      // Start 90s pressure timer for the other player
      const pressureMs = 90_000;
      const pressureDeadline = Date.now() + pressureMs;
      const stateWithPressure: PazPazGameState = { ...updatedGameState, pressureDeadline };
      const roomWithPressure = { ...updatedRoom, gameState: stateWithPressure };
      await pazpazRoomService.save(roomWithPressure);

      // Broadcast updated state with pressureDeadline
      const allSocketsPressure = await io.in(`pazpaz:${roomId}`).fetchSockets();
      for (const s of allSocketsPressure) {
        const pid = (s as unknown as { auth: { playerId: string } }).auth?.playerId;
        const pIdx = roomWithPressure.player0.playerId === pid ? 0 : 1;
        s.emit('pazpaz:state', filterStateForPlayer(stateWithPressure, pIdx));
      }

      // Auto-submit if other player doesn't submit in time
      const pressureTimer = setTimeout(async () => {
        pressureTimers.delete(roomId);
        const currentRoom = await pazpazRoomService.get(roomId);
        if (!currentRoom || currentRoom.gameState.phase !== 'ASSIGNING') return;

        const [ca0, ca1] = currentRoom.gameState.assignments;
        if (ca0 !== null && ca1 !== null) return; // both already submitted

        let pressureState = { ...currentRoom.gameState };
        const partials = pressureState.partialAssignments ?? [null, null];

        if (!ca0) {
          const complete = buildCompleteAssignment(partials[0], currentRoom.gameState.players[0].dealtCards);
          pressureState.assignments = [complete, ca1];
          pressureState.players = [{ ...pressureState.players[0], hasSubmitted: true }, pressureState.players[1]];
          log('PAZPAZ_PRESSURE_SUBMIT', { roomId, playerIndex: 0 });
        }
        if (!ca1) {
          const complete = buildCompleteAssignment(partials[1], currentRoom.gameState.players[1].dealtCards);
          pressureState.assignments = [pressureState.assignments[0], complete];
          pressureState.players = [pressureState.players[0], { ...pressureState.players[1], hasSubmitted: true }];
          log('PAZPAZ_PRESSURE_SUBMIT', { roomId, playerIndex: 1 });
        }

        const scored = revealAndScore(pressureState);
        const updatedRoomP = { ...currentRoom, gameState: scored, status: 'finished' as const };
        timerStarted.delete(roomId);
        await pazpazRoomService.save(updatedRoomP);

        io.to(`pazpaz:${roomId}`).emit('pazpaz:state', scored);

        if (updatedRoomP.stake) {
          await handlePazPazGameOver(io, roomId, scored, updatedRoomP.player0.playerId, updatedRoomP.player1.playerId, updatedRoomP.stake);
        }
      }, pressureMs);

      pressureTimers.set(roomId, pressureTimer);
    }
  });

  // ─── Partial save ─────────────────────────────────────────────────────────

  socket.on('pazpaz:partial_save', async ({ roomId, assignment }: { roomId: string; assignment: PazPazAssignment }) => {
    const room = await pazpazRoomService.get(roomId);
    if (!room || room.gameState.phase !== 'ASSIGNING') return;

    let playerIndex: 0 | 1;
    if (room.player0.playerId === playerId) playerIndex = 0;
    else if (room.player1.playerId === playerId) playerIndex = 1;
    else return;

    if (room.gameState.assignments[playerIndex] !== null) return; // already submitted

    const partials: [PazPazAssignment | null, PazPazAssignment | null] = [
      ...(room.gameState.partialAssignments ?? [null, null])
    ] as [PazPazAssignment | null, PazPazAssignment | null];
    partials[playerIndex] = assignment;

    const updatedState = { ...room.gameState, partialAssignments: partials };
    await pazpazRoomService.save({ ...room, gameState: updatedState });
  });

  // ─── Forfeit ──────────────────────────────────────────────────────────────

  socket.on('pazpaz:forfeit', async ({ roomId }: { roomId: string }) => {
    const room = await pazpazRoomService.get(roomId);
    if (!room) { socket.emit('pazpaz:error', { message: 'Room not found' }); return; }

    let playerIndex: 0 | 1;
    if (room.player0.playerId === playerId) playerIndex = 0;
    else if (room.player1.playerId === playerId) playerIndex = 1;
    else { socket.emit('pazpaz:error', { message: 'You are not in this room' }); return; }

    if (room.status === 'finished') return;

    // Clear assignment and pressure timers
    const at = assignmentTimers.get(roomId);
    if (at) { clearTimeout(at); assignmentTimers.delete(roomId); }
    const pt = pressureTimers.get(roomId);
    if (pt) { clearTimeout(pt); pressureTimers.delete(roomId); }
    timerStarted.delete(roomId);

    const winnerIndex: 0 | 1 = playerIndex === 0 ? 1 : 0;

    const forfeitState: PazPazGameState = {
      ...room.gameState,
      phase: 'SCORING',
      winner: winnerIndex,
      flopResults: room.gameState.flopResults ?? [],
      rake: null,
    };

    const updatedRoom = { ...room, gameState: forfeitState, status: 'finished' as const };
    await pazpazRoomService.save(updatedRoom);

    log('PAZPAZ_FORFEIT', { roomId, playerId, nickname, playerIndex, winnerIndex });

    io.to(`pazpaz:${roomId}`).emit('pazpaz:forfeited', { forfeiterIndex: playerIndex });

    if (updatedRoom.stake) {
      await handlePazPazGameOver(io, roomId, forfeitState, updatedRoom.player0.playerId, updatedRoom.player1.playerId, updatedRoom.stake);
    }
  });

  // ─── Disconnect ───────────────────────────────────────────────────────────

  socket.on('disconnect', async () => {
    // Save state on disconnect (no-op if already saved; ensures resume works)
    const room = await pazpazRoomService.findByPlayerId(playerId);
    if (room && room.status === 'active') {
      // State is already persisted; nothing extra needed
      log('PAZPAZ_DISCONNECT', { roomId: room.roomId, playerId, nickname });
    }
  });
}
