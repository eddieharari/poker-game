import type { Card, HandEvaluation } from '../types/index.js';
import type { PazPazGameState, PazPazAssignment, PazPazFlopResult } from '../types/pazpaz.js';
import { createDeck, shuffleDeck, drawCard } from '../utils/deck.js';
import { evaluateHand, compareHands } from './handEvaluator.js';

// ─── Combination helpers ──────────────────────────────────────────────────────

function combinations<T>(arr: T[], k: number): T[][] {
  if (k === 0) return [[]];
  if (arr.length < k) return [];
  const [first, ...rest] = arr;
  const withFirst = combinations(rest, k - 1).map(c => [first, ...c]);
  const withoutFirst = combinations(rest, k);
  return [...withFirst, ...withoutFirst];
}

// ─── Omaha evaluation ─────────────────────────────────────────────────────────

/**
 * Evaluate the best Omaha hand:
 * - Exactly 2 of 4 hole cards
 * - Exactly 3 of 5 community cards
 * C(4,2) × C(5,3) = 6 × 10 = 60 combinations
 */
export function evaluateOmahaHand(holeCards: Card[], communityCards: Card[]): HandEvaluation {
  if (holeCards.length !== 4) throw new Error('Omaha requires exactly 4 hole cards');
  if (communityCards.length !== 5) throw new Error('Omaha requires exactly 5 community cards');

  const holePairs = combinations(holeCards, 2);
  const communityTriples = combinations(communityCards, 3);

  let best: HandEvaluation | null = null;

  for (const holePair of holePairs) {
    for (const communityTriple of communityTriples) {
      const fiveCards = [...holePair, ...communityTriple];
      const eval5 = evaluateHand(fiveCards);
      if (best === null || compareHands(eval5, best) > 0) {
        best = eval5;
      }
    }
  }

  if (!best) throw new Error('No valid Omaha combination found');
  return best;
}

function evaluateOmahaHandFull(holeCards: Card[], communityCards: Card[]): { evaluation: HandEvaluation; usedHole: Card[] } {
  if (holeCards.length !== 4) throw new Error('Omaha requires exactly 4 hole cards');
  if (communityCards.length !== 5) throw new Error('Omaha requires exactly 5 community cards');

  const holePairs = combinations(holeCards, 2);
  const communityTriples = combinations(communityCards, 3);

  let best: HandEvaluation | null = null;
  let bestHole: Card[] = [];

  for (const holePair of holePairs) {
    for (const communityTriple of communityTriples) {
      const fiveCards = [...holePair, ...communityTriple];
      const eval5 = evaluateHand(fiveCards);
      if (best === null || compareHands(eval5, best) > 0) {
        best = eval5;
        bestHole = holePair;
      }
    }
  }

  if (!best) throw new Error('No valid Omaha combination found');
  return { evaluation: best, usedHole: bestHole };
}

// ─── Deal ─────────────────────────────────────────────────────────────────────

export function dealPazPaz(
  p0Id: string,
  p0Name: string,
  p0AvatarUrl: string,
  p1Id: string,
  p1Name: string,
  p1AvatarUrl: string,
): PazPazGameState {
  let deck = shuffleDeck(createDeck());

  // Deal 12 cards to each player
  const p0Cards: Card[] = [];
  const p1Cards: Card[] = [];

  for (let i = 0; i < 12; i++) {
    let card: Card;
    [card, deck] = drawCard(deck);
    p0Cards.push(card);
  }
  for (let i = 0; i < 12; i++) {
    let card: Card;
    [card, deck] = drawCard(deck);
    p1Cards.push(card);
  }

  // Deal 3 flops (3 cards each)
  const flops: [Card[], Card[], Card[]] = [[], [], []];
  for (let f = 0; f < 3; f++) {
    for (let c = 0; c < 3; c++) {
      let card: Card;
      [card, deck] = drawCard(deck);
      flops[f].push(card);
    }
  }

  return {
    phase: 'ASSIGNING',
    deck,
    players: [
      { id: p0Id, name: p0Name, avatarUrl: p0AvatarUrl, dealtCards: p0Cards, hasSubmitted: false },
      { id: p1Id, name: p1Name, avatarUrl: p1AvatarUrl, dealtCards: p1Cards, hasSubmitted: false },
    ],
    flops,
    turns: [null, null, null],
    rivers: [null, null, null],
    assignments: [null, null],
    flopResults: null,
    winner: null,
    assignDeadline: null,
    partialAssignments: [null, null],
    pressureDeadline: null,
    stake: null,
    rake: null,
  };
}

// ─── Reveal and Score ─────────────────────────────────────────────────────────

export function revealAndScore(state: PazPazGameState): PazPazGameState {
  const [assignment0, assignment1] = state.assignments;
  if (!assignment0 || !assignment1) {
    throw new Error('Both assignments must be present before scoring');
  }

  let deck = [...state.deck];

  // Deal turn + river for each flop
  const turns: [Card, Card, Card] = [null!, null!, null!];
  const rivers: [Card, Card, Card] = [null!, null!, null!];

  for (let f = 0; f < 3; f++) {
    let turn: Card;
    let river: Card;
    [turn, deck] = drawCard(deck);
    [river, deck] = drawCard(deck);
    turns[f] = turn;
    rivers[f] = river;
  }

  // Evaluate each flop
  const flopResults: PazPazFlopResult[] = [];
  const flopWins = [0, 0]; // wins per player index

  for (let f = 0; f < 3; f++) {
    const communityCards: Card[] = [...state.flops[f], turns[f], rivers[f]];
    const p0Hole = assignment0.hands[f];
    const p1Hole = assignment1.hands[f];

    const p0Full = evaluateOmahaHandFull(p0Hole, communityCards);
    const p1Full = evaluateOmahaHandFull(p1Hole, communityCards);
    const cmp = compareHands(p0Full.evaluation, p1Full.evaluation);

    const winner: 0 | 1 | 'draw' = cmp > 0 ? 0 : cmp < 0 ? 1 : 'draw';
    if (winner !== 'draw') flopWins[winner]++;

    flopResults.push({
      flopIndex: (f as 0 | 1 | 2),
      communityCards,
      player0Hole: p0Hole,
      player1Hole: p1Hole,
      player0Best: p0Full.evaluation,
      player1Best: p1Full.evaluation,
      player0UsedHole: p0Full.usedHole,
      player1UsedHole: p1Full.usedHole,
      winner,
    });
  }

  // Determine overall winner
  let overallWinner: 0 | 1 | 'draw';
  if (flopWins[0] >= 2) overallWinner = 0;
  else if (flopWins[1] >= 2) overallWinner = 1;
  else overallWinner = 'draw';

  return {
    ...state,
    phase: 'SCORING',
    deck,
    turns,
    rivers,
    flopResults,
    winner: overallWinner,
    players: [
      { ...state.players[0], hasSubmitted: true },
      { ...state.players[1], hasSubmitted: true },
    ],
  };
}
