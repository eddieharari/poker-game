import type { Card, HandEvaluation } from './index.js';

export type PazPazPhase = 'ASSIGNING' | 'SCORING';

export interface PazPazPlayer {
  id: string;
  name: string;
  avatarUrl: string;
  dealtCards: Card[]; // empty for opponent in ASSIGNING phase
  hasSubmitted: boolean;
}

export interface PazPazAssignment {
  hands: [Card[], Card[], Card[]]; // hands[f] = 4 hole cards for flop f
}

export interface PazPazFlopResult {
  flopIndex: 0 | 1 | 2;
  communityCards: Card[]; // 5 cards
  player0Hole: Card[];
  player1Hole: Card[];
  player0Best: HandEvaluation;
  player1Best: HandEvaluation;
  winner: 0 | 1 | 'draw';
}

export interface PazPazGameState {
  phase: PazPazPhase;
  deck: Card[];
  players: [PazPazPlayer, PazPazPlayer];
  flops: [Card[], Card[], Card[]];
  turns: [Card | null, Card | null, Card | null];
  rivers: [Card | null, Card | null, Card | null];
  assignments: [PazPazAssignment | null, PazPazAssignment | null];
  flopResults: PazPazFlopResult[] | null;
  winner: 0 | 1 | 'draw' | null;
  assignDeadline: number | null;
  partialAssignments: [PazPazAssignment | null, PazPazAssignment | null];
  pressureDeadline: number | null;
  stake: number | null;
}
