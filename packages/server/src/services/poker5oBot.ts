import type { GameState, Card } from '@poker5o/shared';
import { evaluateHand, compareHands } from '@poker5o/shared';

// ─── Combination helper ─────────────────────────────────────────────────────

function combinations<T>(arr: T[], k: number): T[][] {
  if (k === 0) return [[]];
  if (arr.length < k) return [];
  const [first, ...rest] = arr;
  return [...combinations(rest, k - 1).map(c => [first, ...c]), ...combinations(rest, k)];
}

// ─── Hand strength estimation ───────────────────────────────────────────────

/**
 * Estimate how strong a partial column will be once completed.
 * For columns with < 5 cards, we score based on current potential.
 */
function evaluateColumnPotential(column: Card[], drawnCard: Card): number {
  const cards = [...column, drawnCard];

  if (cards.length === 5) {
    // Full hand — evaluate directly
    const evaluation = evaluateHand(cards);
    return 7463 - evaluation.tiebreakers[0]; // Higher = better
  }

  if (cards.length >= 2) {
    // Partial — evaluate all subsets of 5 with padding from a hypothetical perspective
    // Simple heuristic: check for pairs, suited cards, connectors
    let score = 0;

    // Count pairs/trips
    const rankCounts = new Map<string, number>();
    for (const c of cards) {
      rankCounts.set(c.rank, (rankCounts.get(c.rank) ?? 0) + 1);
    }
    for (const count of rankCounts.values()) {
      if (count === 2) score += 2000;
      if (count === 3) score += 4000;
      if (count === 4) score += 6000;
    }

    // Count suited cards
    const suitCounts = new Map<string, number>();
    for (const c of cards) {
      suitCounts.set(c.suit, (suitCounts.get(c.suit) ?? 0) + 1);
    }
    const maxSuited = Math.max(...suitCounts.values());
    if (maxSuited >= 3) score += 1500;
    if (maxSuited >= 4) score += 2000;

    // Connectors / straight potential
    const rankValues = cards.map(c => {
      const rv: Record<string, number> = { '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9, '10': 10, 'J': 11, 'Q': 12, 'K': 13, 'A': 14 };
      return rv[c.rank] ?? 0;
    }).sort((a, b) => a - b);

    let connectors = 0;
    for (let i = 1; i < rankValues.length; i++) {
      if (rankValues[i] - rankValues[i - 1] === 1) connectors++;
    }
    if (connectors >= 2) score += 800;
    if (connectors >= 3) score += 1200;

    // High card bonus
    for (const c of cards) {
      const rv: Record<string, number> = { 'J': 100, 'Q': 150, 'K': 200, 'A': 300 };
      score += rv[c.rank] ?? 0;
    }

    return score;
  }

  return 0;
}

// ─── Bot column choice ──────────────────────────────────────────────────────

/**
 * Given the current game state and the bot's player index, choose the best
 * column to place the drawn card in.
 */
export function chooseBestColumn(
  gameState: GameState,
  botIndex: 0 | 1,
): number {
  const player = gameState.players[botIndex];
  const drawnCard = gameState.drawnCard;

  if (!drawnCard) return 0;

  // Find valid columns
  const validColumns: number[] = [];
  for (let c = 0; c < 5; c++) {
    if (gameState.phase === 'SETUP_PHASE') {
      if (player.columns[c].length === 0) validColumns.push(c);
    } else {
      if (player.columns[c].length === gameState.currentRow) validColumns.push(c);
    }
  }

  if (validColumns.length === 0) return 0;
  if (validColumns.length === 1) return validColumns[0];

  // Evaluate each valid column placement
  let bestCol = validColumns[0];
  let bestScore = -Infinity;

  for (const colIdx of validColumns) {
    const score = evaluateColumnPotential(player.columns[colIdx], drawnCard);
    if (score > bestScore) {
      bestScore = score;
      bestCol = colIdx;
    }
  }

  return bestCol;
}
