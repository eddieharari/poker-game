import type {
  BackgammonBoard,
  BackgammonColor,
  BackgammonDice,
  BackgammonGameResult,
  BackgammonGameState,
  BackgammonMatchConfig,
  BackgammonMove,
  BackgammonMoveDest,
  BackgammonMoveSource,
  BackgammonPlayer,
  BackgammonPoint,
  BackgammonWinType,
  DoublingCube,
  DoublingCubeValue,
} from '../types/backgammon.js';

// ─── Board helpers ────────────────────────────────────────────────────────────

/** White (player 0) moves 24→1; Black (player 1) moves 1→24 */
function direction(pi: 0 | 1): -1 | 1 { return pi === 0 ? -1 : 1; }
function opponentOf(pi: 0 | 1): 0 | 1 { return pi === 0 ? 1 : 0; }
function colorOf(pi: 0 | 1): BackgammonColor { return pi === 0 ? 'white' : 'black'; }

/** Where a checker enters the board from the bar for player pi with die d */
function barEntryPoint(pi: 0 | 1, die: number): number {
  return pi === 0 ? 25 - die : die;
}

/** Distance from bearing-off for player pi at point p (1-6 for white, 1-6 for black mapped via 25-p) */
function bearOffDistance(pi: 0 | 1, point: number): number {
  return pi === 0 ? point : 25 - point;
}

/** Home board range for player pi (inclusive) */
function homeRange(pi: 0 | 1): [number, number] {
  return pi === 0 ? [1, 6] : [19, 24];
}

function emptyPoint(): BackgammonPoint { return { color: null, count: 0 }; }

/** Create a board by cloning (all 25 slots) */
function cloneBoard(board: BackgammonBoard): BackgammonBoard {
  return [null, ...board.slice(1).map(p => ({ ...p }))] as BackgammonBoard;
}

// ─── Standard starting position ───────────────────────────────────────────────

export function initBoard(): BackgammonBoard {
  const b: BackgammonBoard = [null, ...Array(24).fill(null).map(() => emptyPoint())] as BackgammonBoard;

  const set = (point: number, color: BackgammonColor, count: number) => {
    (b[point] as BackgammonPoint).color = color;
    (b[point] as BackgammonPoint).count = count;
  };

  // Standard backgammon starting position
  set(24, 'white', 2);
  set(13, 'white', 5);
  set(8,  'white', 3);
  set(6,  'white', 5);

  set(1,  'black', 2);
  set(12, 'black', 5);
  set(17, 'black', 3);
  set(19, 'black', 5);

  return b;
}

// ─── Game creation ────────────────────────────────────────────────────────────

export function createBackgammonGame(
  p0Id: string, p0Name: string, p0Avatar: string,
  p1Id: string, p1Name: string, p1Avatar: string,
  matchConfig: BackgammonMatchConfig,
): BackgammonGameState {
  // Coin flip for who goes first
  const first = (Math.random() < 0.5 ? 0 : 1) as 0 | 1;

  const players: [BackgammonPlayer, BackgammonPlayer] = [
    { id: p0Id, name: p0Name, avatarUrl: p0Avatar, color: 'white', bar: 0, off: 0, matchScore: 0 },
    { id: p1Id, name: p1Name, avatarUrl: p1Avatar, color: 'black', bar: 0, off: 0, matchScore: 0 },
  ];

  return {
    board: initBoard(),
    players,
    currentPlayerIndex: first,
    phase: 'ROLLING',
    dice: null,
    cube: { value: 1, owner: null },
    matchConfig,
    gameResult: null,
    turnDeadline: null,
    rake: null,
  };
}

// ─── Dice ─────────────────────────────────────────────────────────────────────

export function rollDice(): BackgammonDice {
  const d1 = Math.ceil(Math.random() * 6);
  const d2 = Math.ceil(Math.random() * 6);
  const remaining = d1 === d2 ? [d1, d1, d1, d1] : [d1, d2];
  return { values: [d1, d2], remaining };
}

// ─── Move validation helpers ──────────────────────────────────────────────────

function allInHome(state: BackgammonGameState, pi: 0 | 1): boolean {
  const color = colorOf(pi);
  const [lo, hi] = homeRange(pi);
  const player = state.players[pi];
  // All 15 checkers must be off the board or in home board
  for (let p = 1; p <= 24; p++) {
    const pt = state.board[p] as BackgammonPoint;
    if (pt.color === color && pt.count > 0) {
      if (p < lo || p > hi) return false;
    }
  }
  return true; // bar checkers would have been checked earlier
}

/** Highest distance-from-bearing-off among all checkers for player pi (0 if none in home) */
function maxDistInHome(state: BackgammonGameState, pi: 0 | 1): number {
  const color = colorOf(pi);
  let max = 0;
  for (let p = 1; p <= 24; p++) {
    const pt = state.board[p] as BackgammonPoint;
    if (pt.color === color && pt.count > 0) {
      const d = bearOffDistance(pi, p);
      if (d > max) max = d;
    }
  }
  return max;
}

// ─── Candidate move generation (no max-dice filtering) ────────────────────────

function getCandidatesForDie(state: BackgammonGameState, die: number): BackgammonMove[] {
  const pi = state.currentPlayerIndex;
  const color = colorOf(pi);
  const oppColor = colorOf(opponentOf(pi));
  const dir = direction(pi);
  const player = state.players[pi];
  const moves: BackgammonMove[] = [];

  // Bar entries must happen first
  if (player.bar > 0) {
    const dest = barEntryPoint(pi, die);
    if (dest < 1 || dest > 24) return [];
    const destPt = state.board[dest] as BackgammonPoint;
    if (destPt.color === oppColor && destPt.count >= 2) return []; // blocked
    moves.push({
      from: 'bar',
      to: dest,
      dieUsed: die,
      hitOpponent: destPt.color === oppColor && destPt.count === 1,
    });
    return moves;
  }

  const canBearOff = allInHome(state, pi);
  const maxDist = canBearOff ? maxDistInHome(state, pi) : 0;

  for (let p = 1; p <= 24; p++) {
    const pt = state.board[p] as BackgammonPoint;
    if (pt.color !== color || pt.count === 0) continue;

    const rawDest = p + dir * die;

    if (canBearOff) {
      const dist = bearOffDistance(pi, p);
      // Exact bear-off
      if (dist === die) {
        moves.push({ from: p, to: 'off', dieUsed: die, hitOpponent: false });
        continue;
      }
      // Overshoot bear-off: only if no checker farther from off than this die
      if (dist < die && maxDist <= die) {
        moves.push({ from: p, to: 'off', dieUsed: die, hitOpponent: false });
        continue;
      }
    }

    // Regular move on the board
    if (rawDest >= 1 && rawDest <= 24) {
      const destPt = state.board[rawDest] as BackgammonPoint;
      if (destPt.color === oppColor && destPt.count >= 2) continue; // blocked
      moves.push({
        from: p,
        to: rawDest,
        dieUsed: die,
        hitOpponent: destPt.color === oppColor && destPt.count === 1,
      });
    }
  }

  return moves;
}

// ─── Apply a single move (no phase transition) ────────────────────────────────

function applyMoveToBoard(state: BackgammonGameState, move: BackgammonMove): BackgammonGameState {
  const pi = state.currentPlayerIndex;
  const color = colorOf(pi);
  const oppColor = colorOf(opponentOf(pi));
  const oppIdx = opponentOf(pi);

  const board = cloneBoard(state.board);
  const players = state.players.map(p => ({ ...p })) as [BackgammonPlayer, BackgammonPlayer];

  // Remove checker from source
  if (move.from === 'bar') {
    players[pi].bar -= 1;
  } else {
    const src = board[move.from] as BackgammonPoint;
    src.count -= 1;
    if (src.count === 0) src.color = null;
  }

  // Handle hit
  if (move.hitOpponent && move.to !== 'off') {
    const dest = board[move.to as number] as BackgammonPoint;
    dest.color = null;
    dest.count = 0;
    players[oppIdx].bar += 1;
  }

  // Place checker at destination
  if (move.to === 'off') {
    players[pi].off += 1;
  } else {
    const dest = board[move.to as number] as BackgammonPoint;
    if (move.hitOpponent) {
      dest.color = color;
      dest.count = 1;
    } else {
      dest.count += 1;
      if (dest.count === 1) dest.color = color;
    }
  }

  // Remove used die from remaining
  const remaining = [...(state.dice?.remaining ?? [])];
  const idx = remaining.indexOf(move.dieUsed);
  if (idx !== -1) remaining.splice(idx, 1);

  return {
    ...state,
    board,
    players,
    dice: state.dice ? { ...state.dice, remaining } : null,
  };
}

// ─── Max dice usable (recursive) ─────────────────────────────────────────────

function maxDiceUsable(state: BackgammonGameState, remaining: number[]): number {
  if (remaining.length === 0) return 0;

  const uniqueDice = [...new Set(remaining)];
  let best = 0;

  for (const die of uniqueDice) {
    const cands = getCandidatesForDie(state, die);
    if (cands.length === 0) continue;

    const newRemaining = [...remaining];
    newRemaining.splice(newRemaining.indexOf(die), 1);

    for (const move of cands.slice(0, 3)) { // sample up to 3 to limit recursion
      const nextState = applyMoveToBoard(state, move);
      const depth = 1 + maxDiceUsable(nextState, newRemaining);
      if (depth > best) best = depth;
      if (best === remaining.length) return best; // can't do better
    }
  }

  return best;
}

// ─── Public: get legal moves ──────────────────────────────────────────────────

export function getLegalMoves(state: BackgammonGameState): BackgammonMove[] {
  if (!state.dice || state.dice.remaining.length === 0) return [];

  const remaining = state.dice.remaining;
  const uniqueDice = [...new Set(remaining)];

  // Build all candidates across all remaining die values
  const allCandidates: BackgammonMove[] = [];
  for (const die of uniqueDice) {
    allCandidates.push(...getCandidatesForDie(state, die));
  }

  if (allCandidates.length === 0) return [];

  // Determine the max number of dice we could possibly use from here
  const maxUsable = maxDiceUsable(state, remaining);

  if (maxUsable === 0) return []; // shouldn't happen since we have candidates

  // Filter: only keep moves that can lead to using maxUsable dice total
  const filtered: BackgammonMove[] = [];
  for (const move of allCandidates) {
    const newRemaining = [...remaining];
    newRemaining.splice(newRemaining.indexOf(move.dieUsed), 1);
    const nextState = applyMoveToBoard(state, move);
    const afterUsable = 1 + maxDiceUsable(nextState, newRemaining);
    if (afterUsable >= maxUsable) filtered.push(move);
  }

  // If filtered is empty (shouldn't happen), fall back to higher-die preference
  if (filtered.length === 0 && remaining.length === 2) {
    const higher = Math.max(...remaining);
    const highCandidates = allCandidates.filter(m => m.dieUsed === higher);
    return highCandidates.length > 0 ? highCandidates : allCandidates;
  }

  return filtered;
}

// ─── Public: apply a move with turn transition ────────────────────────────────

export function applyMove(state: BackgammonGameState, move: BackgammonMove): BackgammonGameState {
  let next = applyMoveToBoard(state, move);

  const remaining = next.dice?.remaining ?? [];

  // Check if the turn is over (no dice left, or no legal moves with remaining dice)
  const noMoreMoves = remaining.length === 0 || getLegalMoves(next).length === 0;

  if (noMoreMoves) {
    const nextPlayer = opponentOf(next.currentPlayerIndex);
    next = {
      ...next,
      currentPlayerIndex: nextPlayer,
      phase: 'ROLLING',
      dice: null,
    };
  }

  return next;
}

// ─── Public: apply dice roll ──────────────────────────────────────────────────

export function applyRoll(state: BackgammonGameState, dice: BackgammonDice): BackgammonGameState {
  let next: BackgammonGameState = { ...state, dice, phase: 'MOVING' };

  // If no legal moves exist immediately, skip the turn
  if (getLegalMoves(next).length === 0) {
    next = {
      ...next,
      currentPlayerIndex: opponentOf(next.currentPlayerIndex),
      phase: 'ROLLING',
      dice: null,
    };
  }

  return next;
}

// ─── Public: doubling cube ────────────────────────────────────────────────────

/** Returns true if the current player is allowed to offer a double */
export function canOfferDouble(state: BackgammonGameState): boolean {
  if (state.phase !== 'ROLLING') return false;
  const pi = state.currentPlayerIndex;
  // May double if cube is centered (owner null) or they own the cube
  return state.cube.owner === null || state.cube.owner === pi;
}

export function applyOfferDouble(state: BackgammonGameState): BackgammonGameState {
  return { ...state, phase: 'AWAITING_DOUBLE' };
}

export function applyAcceptDouble(state: BackgammonGameState): BackgammonGameState {
  const newValue = (state.cube.value * 2) as DoublingCubeValue;
  const acceptor = opponentOf(state.currentPlayerIndex);
  return {
    ...state,
    phase: 'ROLLING',
    cube: { value: newValue, owner: acceptor },
  };
}

/** Drop = the offering player wins at the CURRENT cube value (not doubled) */
export function applyDropDouble(state: BackgammonGameState): BackgammonGameState {
  const offerer = state.currentPlayerIndex;
  const result: BackgammonGameResult = {
    winner: offerer,
    winType: 'normal',
    cubeValue: state.cube.value,
    pointsWon: state.cube.value,
  };
  return { ...state, phase: 'GAME_OVER', gameResult: result };
}

// ─── Check win condition ──────────────────────────────────────────────────────

export function checkWin(state: BackgammonGameState): BackgammonGameResult | null {
  for (let pi = 0; pi <= 1; pi++) {
    const player = state.players[pi as 0 | 1];
    if (player.off < 15) continue;

    const winner = pi as 0 | 1;
    const loser  = opponentOf(winner);
    const loserPlayer = state.players[loser];

    let winType: BackgammonWinType = 'normal';

    if (loserPlayer.off === 0) {
      // Gammon or backgammon
      const [lo, hi] = homeRange(winner);
      let loserInDanger = loserPlayer.bar > 0;
      if (!loserInDanger) {
        for (let p = lo; p <= hi; p++) {
          const pt = state.board[p] as BackgammonPoint;
          if (pt.color === colorOf(loser) && pt.count > 0) { loserInDanger = true; break; }
        }
      }
      winType = loserInDanger ? 'backgammon' : 'gammon';
    }

    const multiplier = winType === 'backgammon' ? 3 : winType === 'gammon' ? 2 : 1;
    const pointsWon = state.cube.value * multiplier;

    return { winner, winType, cubeValue: state.cube.value, pointsWon };
  }
  return null;
}

// ─── Forfeit ──────────────────────────────────────────────────────────────────

export function applyForfeit(state: BackgammonGameState, forfeiterIndex: 0 | 1): BackgammonGameState {
  const winner = opponentOf(forfeiterIndex);
  const result: BackgammonGameResult = {
    winner,
    winType: 'forfeit',
    cubeValue: state.cube.value,
    pointsWon: state.cube.value,
  };
  return { ...state, phase: 'GAME_OVER', gameResult: result };
}

// ─── Validate a proposed move ─────────────────────────────────────────────────

export function validateMove(
  state: BackgammonGameState,
  move: BackgammonMove,
): { valid: boolean; reason?: string } {
  const legal = getLegalMoves(state);
  const found = legal.some(
    m => m.from === move.from && m.to === move.to && m.dieUsed === move.dieUsed,
  );
  if (!found) return { valid: false, reason: 'Move not in legal moves list' };
  return { valid: true };
}
