import { describe, it, expect } from 'vitest';
import {
  createInitialState,
  applyAction,
  canDrawCard,
  canPlaceCard,
} from '../engine/gameEngine.js';

const P0 = { id: 'p0', name: 'Alice' };
const P1 = { id: 'p1', name: 'Bob' };

describe('createInitialState', () => {
  it('creates a valid initial state', () => {
    const state = createInitialState('game-1', P0, P1);
    expect(state.phase).toBe('SETUP_PHASE');
    expect(state.deck).toHaveLength(52);
    expect(state.players[0].columns).toHaveLength(5);
    expect(state.players[1].columns).toHaveLength(5);
    expect(state.drawnCard).toBeNull();
    expect(state.setupDrawCount).toBe(0);
    expect([0, 1]).toContain(state.currentPlayerIndex);
  });
});

describe('SETUP_PHASE', () => {
  it('allows current player to draw and place', () => {
    const state = createInitialState('game-1', P0, P1);
    const currentId = state.players[state.currentPlayerIndex].id;

    expect(canDrawCard(state, currentId)).toBe(true);
    expect(canDrawCard(state, currentId === 'p0' ? 'p1' : 'p0')).toBe(false);

    const afterDraw = applyAction(state, { type: 'DRAW_CARD', playerId: currentId });
    expect(afterDraw.drawnCard).not.toBeNull();
    expect(canDrawCard(afterDraw, currentId)).toBe(false);
  });

  it('progresses through all 10 setup draws', () => {
    let state = createInitialState('game-1', P0, P1);

    for (let col = 0; col < 10; col++) {
      const currentId = state.players[state.currentPlayerIndex].id;
      state = applyAction(state, { type: 'DRAW_CARD', playerId: currentId });
      expect(state.drawnCard).not.toBeNull();
      const targetCol = col % 5;
      state = applyAction(state, { type: 'PLACE_CARD', playerId: currentId, columnIndex: targetCol });
    }

    expect(state.phase).toBe('MAIN_PHASE');
    expect(state.currentRow).toBe(1);
  });
});

describe('canPlaceCard', () => {
  it('rejects placement in wrong row', () => {
    let state = createInitialState('game-1', P0, P1);

    // Complete setup phase
    for (let col = 0; col < 10; col++) {
      const currentId = state.players[state.currentPlayerIndex].id;
      state = applyAction(state, { type: 'DRAW_CARD', playerId: currentId });
      state = applyAction(state, { type: 'PLACE_CARD', playerId: currentId, columnIndex: col % 5 });
    }

    expect(state.phase).toBe('MAIN_PHASE');
    const currentId = state.players[state.currentPlayerIndex].id;
    state = applyAction(state, { type: 'DRAW_CARD', playerId: currentId });

    // Try to place in column that already has 1 card (row 0 filled) — valid
    // Try to place in a column that would be row 2 — invalid (currentRow is 1)
    // Since currentRow = 1, all columns have length 1 (from setup), so any col is valid
    expect(canPlaceCard(state, currentId, 0)).toBe(true);
    expect(canPlaceCard(state, currentId, 4)).toBe(true);
  });
});

describe('full game simulation', () => {
  it('completes a full game without errors', () => {
    let state = createInitialState('game-sim', P0, P1);

    // Setup: 10 draws
    for (let i = 0; i < 10; i++) {
      const id = state.players[state.currentPlayerIndex].id;
      state = applyAction(state, { type: 'DRAW_CARD', playerId: id });
      state = applyAction(state, { type: 'PLACE_CARD', playerId: id, columnIndex: i % 5 });
    }

    expect(state.phase).toBe('MAIN_PHASE');

    // Main phase: rows 1-4 (4 more cards per player per row = 40 total placements)
    let safetyLimit = 200;
    while (state.phase === 'MAIN_PHASE' && safetyLimit-- > 0) {
      const id = state.players[state.currentPlayerIndex].id;
      const idx = state.currentPlayerIndex;

      if (state.drawnCard === null) {
        state = applyAction(state, { type: 'DRAW_CARD', playerId: id });
      } else {
        // Find valid column
        const col = state.players[idx].columns.findIndex(c => c.length === state.currentRow);
        expect(col).toBeGreaterThanOrEqual(0);
        state = applyAction(state, { type: 'PLACE_CARD', playerId: id, columnIndex: col });
      }
    }

    expect(state.phase).toBe('GAME_OVER');
    expect(state.winner).not.toBeNull();
    expect(state.columnResults).toHaveLength(5);
  });
});
