/**
 * Pure game engine — no side effects, no I/O.
 * All functions take state and return new state (immutable updates).
 */

import type {
  GameState,
  GameAction,
  Player,
  GameScore,
  ColumnResult,
} from '../types/index.js';
import { createDeck, shuffleDeck, drawCard } from '../utils/deck.js';
import { evaluateHand, compareHands, evaluatePartialHand } from './handEvaluator.js';

// ─── Factory ──────────────────────────────────────────────────────────────────

export function createInitialState(
  gameId: string,
  player0: { id: string; name: string; avatarUrl?: string },
  player1: { id: string; name: string; avatarUrl?: string },
): GameState {
  const deck = shuffleDeck(createDeck());

  const makePlayer = (p: { id: string; name: string; avatarUrl?: string }): Player => ({
    id: p.id,
    name: p.name,
    avatarUrl: p.avatarUrl,
    columns: [[], [], [], [], []],
  });

  // Random first player
  const firstPlayer: 0 | 1 = Math.random() < 0.5 ? 0 : 1;

  return {
    gameId,
    phase: 'SETUP_PHASE',
    deck,
    players: [makePlayer(player0), makePlayer(player1)],
    currentPlayerIndex: firstPlayer,
    currentRow: 0,
    drawnCard: null,
    setupDrawCount: 0,
    winner: null,
    columnResults: null,
  };
}

// ─── Validation ───────────────────────────────────────────────────────────────

export function canDrawCard(state: GameState, playerId: string): boolean {
  if (state.phase !== 'SETUP_PHASE' && state.phase !== 'MAIN_PHASE') return false;
  const player = state.players[state.currentPlayerIndex];
  if (player.id !== playerId) return false;
  return state.drawnCard === null;
}

export function canPlaceCard(
  state: GameState,
  playerId: string,
  columnIndex: number,
): boolean {
  if (state.phase !== 'SETUP_PHASE' && state.phase !== 'MAIN_PHASE') return false;
  if (state.drawnCard === null) return false;
  const player = state.players[state.currentPlayerIndex];
  if (player.id !== playerId) return false;
  if (columnIndex < 0 || columnIndex > 4) return false;

  const col = player.columns[columnIndex];

  if (state.phase === 'SETUP_PHASE') {
    // Each column gets exactly one card; drawn card goes in that column
    // During setup, each draw is tied to a column (columnIndex === setupDrawCount % 5)
    return col.length === 0;
  }

  // MAIN_PHASE: enforce "fill row by row" rule
  // Current row must equal col.length (place exactly into current row)
  if (col.length !== state.currentRow) return false;

  return true;
}

// ─── State Machine ────────────────────────────────────────────────────────────

export function applyAction(state: GameState, action: GameAction): GameState {
  switch (action.type) {
    case 'DRAW_CARD':  return applyDraw(state, action.playerId);
    case 'PLACE_CARD': return applyPlace(state, action.playerId, action.columnIndex);
    default: return state;
  }
}

function applyDraw(state: GameState, playerId: string): GameState {
  if (!canDrawCard(state, playerId)) return state;

  const [card, remainingDeck] = drawCard(state.deck);

  return {
    ...state,
    deck: remainingDeck,
    drawnCard: card,
  };
}

function applyPlace(state: GameState, playerId: string, columnIndex: number): GameState {
  if (!canPlaceCard(state, playerId, columnIndex)) return state;
  if (!state.drawnCard) return state;

  const playerIdx = state.currentPlayerIndex;
  const card = state.drawnCard;

  // Place card into the column
  const updatedColumns = state.players[playerIdx].columns.map((col, i) =>
    i === columnIndex ? [...col, card] : col,
  );

  const updatedPlayer: Player = {
    ...state.players[playerIdx],
    columns: updatedColumns,
  };

  const updatedPlayers: [Player, Player] =
    playerIdx === 0
      ? [updatedPlayer, state.players[1]]
      : [state.players[0], updatedPlayer];

  const nextState: GameState = {
    ...state,
    players: updatedPlayers,
    drawnCard: null,
  };

  if (state.phase === 'SETUP_PHASE') {
    return advanceSetup(nextState);
  } else {
    return advanceMain(nextState, playerIdx);
  }
}

// ─── Setup Phase Advancement ──────────────────────────────────────────────────

function advanceSetup(state: GameState): GameState {
  const newDrawCount = state.setupDrawCount + 1;

  // Setup: 10 draws total (5 columns × 2 players)
  // After all 10 setup draws, transition to MAIN_PHASE
  if (newDrawCount === 10) {
    // Determine turn order for main phase row 1 based on row 0 hands
    const nextPlayer = determineTurnOrder(state.players, 0);
    return {
      ...state,
      setupDrawCount: newDrawCount,
      phase: 'MAIN_PHASE',
      currentRow: 1,
      currentPlayerIndex: nextPlayer,
    };
  }

  // Alternate players each draw; toggle after each card placed
  const nextPlayer: 0 | 1 = state.currentPlayerIndex === 0 ? 1 : 0;

  return {
    ...state,
    setupDrawCount: newDrawCount,
    currentPlayerIndex: nextPlayer,
  };
}

// ─── Main Phase Advancement ───────────────────────────────────────────────────

function advanceMain(state: GameState, justPlacedIdx: 0 | 1): GameState {
  const otherIdx: 0 | 1 = justPlacedIdx === 0 ? 1 : 0;
  const justPlaced = state.players[justPlacedIdx];
  const other      = state.players[otherIdx];

  // Count how many cards each player has in the current row
  const justPlacedRowCount = justPlaced.columns.filter(
    col => col.length === state.currentRow + 1,
  ).length;

  const otherRowCount = other.columns.filter(
    col => col.length === state.currentRow + 1,
  ).length;

  // Both players have filled current row → advance to next row
  if (justPlacedRowCount === 5 && otherRowCount === 5) {
    const nextRow = state.currentRow + 1;

    if (nextRow > 4) {
      // All 5 rows filled → scoring
      return scoreGame(state);
    }

    // Determine turn order for next row
    const nextPlayer = determineTurnOrder(state.players, 0); // compare row 0 always
    return {
      ...state,
      currentRow: nextRow,
      currentPlayerIndex: nextPlayer,
    };
  }

  // If other player already filled all 5 columns for this row, current player continues
  if (otherRowCount === 5) {
    return state;
  }

  // Normal case: alternate to other player after each placement
  return { ...state, currentPlayerIndex: otherIdx };
}

// ─── Turn Order ───────────────────────────────────────────────────────────────

/**
 * Compare players' row-0 hands; the player with the stronger hand goes first.
 * Falls back to player 0 on tie.
 */
function determineTurnOrder(players: [Player, Player], row: number): 0 | 1 {
  const hand0 = players[0].columns.map(col => col[row]).filter(Boolean);
  const hand1 = players[1].columns.map(col => col[row]).filter(Boolean);

  if (hand0.length < 5 || hand1.length < 5) {
    // Partial hands — use heuristic
    const s0 = evaluatePartialHand(hand0);
    const s1 = evaluatePartialHand(hand1);
    return s0 >= s1 ? 0 : 1;
  }

  const eval0 = evaluateHand(hand0);
  const eval1 = evaluateHand(hand1);
  const cmp = compareHands(eval0, eval1);
  return cmp >= 0 ? 0 : 1;
}

// ─── Scoring ──────────────────────────────────────────────────────────────────

function scoreGame(state: GameState): GameState {
  const score = getGameScore(state);
  if (!score) return state;

  return {
    ...state,
    phase: 'GAME_OVER',
    winner:
      score.winner === 'draw'
        ? 'draw'
        : state.players[score.winner].id,
    columnResults: score.columnResults,
  };
}

export function getGameScore(state: GameState): GameScore | null {
  // Reveal all face-down cards before scoring
  const players = state.players.map(p => ({
    ...p,
    columns: p.columns.map(col =>
      col.map(card => ({ ...card, faceDown: false })),
    ),
  })) as [Player, Player];

  const columnResults: ColumnResult[] = [];
  let p0Wins = 0, p1Wins = 0, draws = 0;

  for (let c = 0; c < 5; c++) {
    const col0 = players[0].columns[c];
    const col1 = players[1].columns[c];

    if (col0.length < 5 || col1.length < 5) return null;

    const hand0 = evaluateHand(col0);
    const hand1 = evaluateHand(col1);
    const cmp   = compareHands(hand0, hand1);

    let winner: 0 | 1 | 'draw';
    if (cmp > 0)      { winner = 0; p0Wins++; }
    else if (cmp < 0) { winner = 1; p1Wins++; }
    else              { winner = 'draw'; draws++; }

    columnResults.push({ columnIndex: c, player0Hand: hand0, player1Hand: hand1, winner });
  }

  const winner: 0 | 1 | 'draw' =
    p0Wins > p1Wins ? 0 : p1Wins > p0Wins ? 1 : 'draw';

  return { player0Wins: p0Wins, player1Wins: p1Wins, draws, winner, columnResults, completeWinBonus: false, isCompleteWin: false };
}
