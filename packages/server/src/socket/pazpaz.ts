import type { Server, Socket } from 'socket.io';
import { revealAndScore, shuffleDeck } from '@poker5o/shared';
import type { PazPazAssignment, PazPazGameState, Card } from '@poker5o/shared';
import { pazpazRoomService } from '../services/pazpazRoomService.js';
import { log } from '../logger.js';

// assignment deadline timers: roomId → timeout handle
const assignmentTimers = new Map<string, ReturnType<typeof setTimeout>>();
// track which rooms have had their deadline timer started
const timerStarted = new Set<string>();

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

      const deadline = Date.now() + 120_000;

      // Update deadline in game state
      const updatedRoom = await pazpazRoomService.get(roomId);
      if (updatedRoom) {
        updatedRoom.gameState.assignDeadline = deadline;
        await pazpazRoomService.save(updatedRoom);

        // Broadcast updated state with deadline to both players
        const p0State = filterStateForPlayer(updatedRoom.gameState, 0);
        const p1State = filterStateForPlayer(updatedRoom.gameState, 1);

        // Send to each player individually with their own filtered view
        const allSockets = await io.in(`pazpaz:${roomId}`).fetchSockets();
        for (const s of allSockets) {
          const pid = (s as unknown as { auth: { playerId: string } }).auth?.playerId;
          const pIdx = updatedRoom.player0.playerId === pid ? 0 : 1;
          s.emit('pazpaz:state', filterStateForPlayer(updatedRoom.gameState, pIdx));
        }
      }

      // Auto-submit after 120s for any player who hasn't submitted
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

        // Score the game
        const scored = revealAndScore(updated.gameState);
        updated.gameState = scored;
        updated.status = 'finished';
        await pazpazRoomService.save(updated);

        io.to(`pazpaz:${roomId}`).emit('pazpaz:state', scored);
      }, 120_000);

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

    // Check all assigned cards are valid dealt cards
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

      // Score the game
      updatedGameState = revealAndScore(updatedGameState);
    }

    const updatedRoom = { ...room, gameState: updatedGameState, status: bothSubmitted ? 'finished' as const : room.status };
    await pazpazRoomService.save(updatedRoom);

    log('PAZPAZ_SUBMIT', { roomId, playerId, nickname, playerIndex, bothSubmitted });

    if (bothSubmitted) {
      // Send full scored state to all players
      io.to(`pazpaz:${roomId}`).emit('pazpaz:state', updatedGameState);
    } else {
      // Tell everyone about submission status (still hide cards)
      const allSockets = await io.in(`pazpaz:${roomId}`).fetchSockets();
      for (const s of allSockets) {
        const pid = (s as unknown as { auth: { playerId: string } }).auth?.playerId;
        const pIdx = updatedRoom.player0.playerId === pid ? 0 : 1;
        s.emit('pazpaz:state', filterStateForPlayer(updatedGameState, pIdx));
      }
    }
  });

  // ─── Disconnect ───────────────────────────────────────────────────────────

  socket.on('disconnect', async () => {
    // Grace period — if reconnected before 30s, nothing happens
    // If the game is already in SCORING, no action needed
    // We don't auto-forfeit in ASSIGNING here — the assignment timer handles it
  });
}
