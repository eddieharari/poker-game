import type { Card, HandEvaluation } from '@poker5o/shared';
import type { PazPazGameState, PazPazAssignment } from '@poker5o/shared';
import { evaluateOmahaHand, compareHands } from '@poker5o/shared';

// ─── Combination helpers ────────────────────────────────────────────────────

function combinations<T>(arr: T[], k: number): T[][] {
  if (k === 0) return [[]];
  if (arr.length < k) return [];
  const [first, ...rest] = arr;
  const withFirst = combinations(rest, k - 1).map(c => [first, ...c]);
  const withoutFirst = combinations(rest, k);
  return [...withFirst, ...withoutFirst];
}

// ─── Card identity helper ───────────────────────────────────────────────────

function cardKey(c: Card): string {
  return `${c.rank}${c.suit}`;
}

// ─── Monte Carlo hand strength estimation ───────────────────────────────────

/**
 * Estimate the average hand strength of 4 hole cards against a 3-card flop.
 * We simulate random turn + river cards from the remaining deck and evaluate.
 */
function estimateHandStrength(
  holeCards: Card[],
  flopCards: Card[],
  remainingDeck: Card[],
  simulations: number = 50,
): number {
  // Lower tiebreakers[0] = stronger in Cactus Kev
  let totalStrength = 0;

  for (let i = 0; i < simulations; i++) {
    // Pick 2 random cards from remaining deck for turn + river
    const deck = [...remainingDeck];
    const turnIdx = Math.floor(Math.random() * deck.length);
    const turn = deck.splice(turnIdx, 1)[0];
    const riverIdx = Math.floor(Math.random() * deck.length);
    const river = deck.splice(riverIdx, 1)[0];

    const community = [...flopCards, turn, river];
    try {
      const evaluation = evaluateOmahaHand(holeCards, community);
      // Lower tiebreaker = stronger hand; we want to maximize strength
      // Convert to a score where higher = better (invert the Cactus Kev value)
      totalStrength += (7463 - evaluation.tiebreakers[0]);
    } catch {
      // Skip invalid combos
    }
  }

  return totalStrength / simulations;
}

// ─── Assignment generation ──────────────────────────────────────────────────

/**
 * Generate all ways to split 12 cards into 3 groups of 4.
 * Total: C(12,4) × C(8,4) × C(4,4) / 3! = 5775 (but we don't divide by 3!
 * because the groups are assigned to specific flops, so order matters).
 * Total: C(12,4) × C(8,4) = 34,650 splits.
 */
function* generateSplits(cards: Card[]): Generator<[Card[], Card[], Card[]]> {
  const group0Options = combinations(cards, 4);
  for (const g0 of group0Options) {
    const g0Set = new Set(g0.map(cardKey));
    const remaining8 = cards.filter(c => !g0Set.has(cardKey(c)));
    const group1Options = combinations(remaining8, 4);
    for (const g1 of group1Options) {
      const g1Set = new Set(g1.map(cardKey));
      const g2 = remaining8.filter(c => !g1Set.has(cardKey(c)));
      yield [g0, g1, g2];
    }
  }
}

// ─── Bot Strategy ───────────────────────────────────────────────────────────

/**
 * Given a PazPaz game state and the bot's player index, compute the best
 * assignment of 12 cards to 3 flops.
 *
 * Strategy: evaluate all 34,650 possible splits using Monte Carlo simulation.
 * For each split, estimate expected hand strength per flop, then pick the
 * split that maximizes the chance of winning 2+ flops.
 *
 * To keep it fast, we use a two-phase approach:
 * 1. Quick scan: few simulations per split to find top candidates
 * 2. Deep evaluation: more simulations on top candidates
 */
export function computeBotAssignment(
  gameState: PazPazGameState,
  botPlayerIndex: 0 | 1,
): PazPazAssignment {
  const myCards = gameState.players[botPlayerIndex].dealtCards;
  const flops = gameState.flops;

  // Build the remaining deck (exclude all known cards)
  const knownCards = new Set<string>();
  for (const c of myCards) knownCards.add(cardKey(c));
  // Opponent cards are hidden, but flops are known
  for (const flop of flops) {
    for (const c of flop) knownCards.add(cardKey(c));
  }

  const allSuits: Card['suit'][] = ['hearts', 'diamonds', 'clubs', 'spades'];
  const allRanks: Card['rank'][] = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
  const remainingDeck: Card[] = [];
  for (const suit of allSuits) {
    for (const rank of allRanks) {
      if (!knownCards.has(`${rank}${suit}`)) {
        remainingDeck.push({ suit, rank });
      }
    }
  }

  // Phase 1: Quick scan — 10 simulations per flop per split
  let bestScore = -Infinity;
  let bestSplit: [Card[], Card[], Card[]] | null = null;
  const topCandidates: { split: [Card[], Card[], Card[]]; score: number }[] = [];

  let count = 0;
  for (const split of generateSplits(myCards)) {
    let totalScore = 0;
    for (let f = 0; f < 3; f++) {
      // Exclude the other assigned cards from the remaining deck for this flop
      const otherCards = new Set<string>();
      for (let g = 0; g < 3; g++) {
        if (g !== f) split[g].forEach(c => otherCards.add(cardKey(c)));
      }
      const deckForFlop = remainingDeck.filter(c => !otherCards.has(cardKey(c)));
      totalScore += estimateHandStrength(split[f], flops[f], deckForFlop, 8);
    }

    if (totalScore > bestScore) {
      bestScore = totalScore;
      bestSplit = split;
    }

    topCandidates.push({ split, score: totalScore });
    count++;

    // Safety limit — if this takes too long, stop after 5000 splits
    if (count >= 5000) break;
  }

  // Phase 2: Deep evaluation on top 50 candidates
  topCandidates.sort((a, b) => b.score - a.score);
  const top = topCandidates.slice(0, 50);

  bestScore = -Infinity;
  for (const candidate of top) {
    let totalScore = 0;
    for (let f = 0; f < 3; f++) {
      const otherCards = new Set<string>();
      for (let g = 0; g < 3; g++) {
        if (g !== f) candidate.split[g].forEach(c => otherCards.add(cardKey(c)));
      }
      const deckForFlop = remainingDeck.filter(c => !otherCards.has(cardKey(c)));
      totalScore += estimateHandStrength(candidate.split[f], flops[f], deckForFlop, 80);
    }

    if (totalScore > bestScore) {
      bestScore = totalScore;
      bestSplit = candidate.split;
    }
  }

  if (!bestSplit) {
    // Fallback: just split sequentially
    bestSplit = [myCards.slice(0, 4), myCards.slice(4, 8), myCards.slice(8, 12)];
  }

  return {
    hands: bestSplit as [Card[], Card[], Card[]],
  };
}
