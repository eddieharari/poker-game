// ─── Card Primitives ───────────────────────────────────────────────────────────

export type Suit = 'spades' | 'hearts' | 'diamonds' | 'clubs';

export type Rank =
  | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10'
  | 'J' | 'Q' | 'K' | 'A';

export interface Card {
  suit: Suit;
  rank: Rank;
  faceDown?: boolean;
}

// ─── Hand Evaluation ──────────────────────────────────────────────────────────

export enum HandRank {
  HIGH_CARD       = 1,
  ONE_PAIR        = 2,
  TWO_PAIR        = 3,
  THREE_OF_A_KIND = 4,
  STRAIGHT        = 5,
  FLUSH           = 6,
  FULL_HOUSE      = 7,
  FOUR_OF_A_KIND  = 8,
  STRAIGHT_FLUSH  = 9,
  ROYAL_FLUSH     = 10,
}

export const HAND_RANK_LABEL: Record<HandRank, string> = {
  [HandRank.HIGH_CARD]:       'High Card',
  [HandRank.ONE_PAIR]:        'One Pair',
  [HandRank.TWO_PAIR]:        'Two Pair',
  [HandRank.THREE_OF_A_KIND]: 'Three of a Kind',
  [HandRank.STRAIGHT]:        'Straight',
  [HandRank.FLUSH]:           'Flush',
  [HandRank.FULL_HOUSE]:      'Full House',
  [HandRank.FOUR_OF_A_KIND]:  'Four of a Kind',
  [HandRank.STRAIGHT_FLUSH]:  'Straight Flush',
  [HandRank.ROYAL_FLUSH]:     'Royal Flush',
};

export interface HandEvaluation {
  rank: HandRank;
  label: string;
  /** Lower = stronger (Cactus Kev strength value) */
  tiebreakers: number[];
}

// ─── Player / Game State ──────────────────────────────────────────────────────

export interface Player {
  id: string;
  name: string;
  /** columns[c][r] = card at column c, row r */
  columns: Card[][];
}

export type GamePhase =
  | 'WAITING_FOR_PLAYERS'
  | 'SETUP_PHASE'
  | 'MAIN_PHASE'
  | 'SCORING_PHASE'
  | 'GAME_OVER';

export interface GameState {
  gameId: string;
  phase: GamePhase;
  deck: Card[];
  players: [Player, Player];
  currentPlayerIndex: 0 | 1;
  currentRow: number;       // 0-based, which row is being filled
  drawnCard: Card | null;   // card in current player's hand, awaiting placement
  setupDrawCount: number;   // how many setup draws have happened (0-10)
  winner: string | null;    // player id or 'draw'
  columnResults: ColumnResult[] | null;
}

// ─── Actions ──────────────────────────────────────────────────────────────────

export type GameAction =
  | { type: 'DRAW_CARD'; playerId: string }
  | { type: 'PLACE_CARD'; playerId: string; columnIndex: number };

// ─── Scoring ──────────────────────────────────────────────────────────────────

export interface ColumnResult {
  columnIndex: number;
  player0Hand: HandEvaluation;
  player1Hand: HandEvaluation;
  winner: 0 | 1 | 'draw';
}

export interface GameScore {
  player0Wins: number;
  player1Wins: number;
  draws: number;
  winner: 0 | 1 | 'draw';
  columnResults: ColumnResult[];
}

// ─── Socket.io Typed Events ───────────────────────────────────────────────────

export interface ServerToClientEvents {
  'game:state': (state: GameState) => void;
  'room:joined': (payload: { roomId: string; playerId: string; playerIndex: 0 | 1 }) => void;
  'room:error': (payload: { message: string }) => void;
  'game:over': (score: GameScore) => void;
}

export interface ClientToServerEvents {
  'room:create': (payload: { playerName: string }, callback: (roomId: string) => void) => void;
  'room:join': (payload: { roomId: string; playerName: string }, callback: (err: string | null) => void) => void;
  'action:draw': (payload: { gameId: string; playerId: string }) => void;
  'action:place': (payload: { gameId: string; playerId: string; columnIndex: number }) => void;
}
