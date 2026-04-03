// ─── Backgammon Types ─────────────────────────────────────────────────────────

export type BackgammonColor = 'white' | 'black'; // white = player 0, black = player 1

export interface BackgammonPoint {
  color: BackgammonColor | null;
  count: number;
}

// 1-indexed: index 0 is null (unused), indices 1-24 are real points
export type BackgammonBoard = [null, ...BackgammonPoint[]]; // length 25

// ─── Doubling Cube ────────────────────────────────────────────────────────────

export type DoublingCubeValue = 1 | 2 | 4 | 8 | 16 | 32 | 64;

export interface DoublingCube {
  value: DoublingCubeValue;
  // null = centered (either player may double), 0 = owned by player 0, 1 = owned by player 1
  owner: 0 | 1 | null;
}

// ─── Dice ─────────────────────────────────────────────────────────────────────

export interface BackgammonDice {
  values: [number, number];
  // Remaining die values to use this turn. Doubles give 4 copies.
  remaining: number[];
}

// ─── Phases ───────────────────────────────────────────────────────────────────

export type BackgammonPhase =
  | 'ROLLING'           // current player must roll
  | 'MOVING'            // current player must move checkers
  | 'AWAITING_DOUBLE'   // opponent must accept or drop the offered double
  | 'GAME_OVER';

// ─── Match / Scoring Config ───────────────────────────────────────────────────

export type BackgammonMatchLength = 1 | 3 | 5 | 7 | 9 | 11;
export type BackgammonPointValue  = 10 | 25 | 50 | 100 | 200 | 500;
export type BackgammonGameMode    = 'match' | 'per-point';

export interface BackgammonMatchConfig {
  mode: BackgammonGameMode;
  matchLength: BackgammonMatchLength | null; // null when mode === 'per-point'
  pointValue: BackgammonPointValue;          // chips per point (per-point mode)
  matchStake: number | null;                 // total chips wagered on match outcome (match mode)
}

// ─── Win ──────────────────────────────────────────────────────────────────────

export type BackgammonWinType = 'normal' | 'gammon' | 'backgammon' | 'forfeit';

export interface BackgammonGameResult {
  winner: 0 | 1;
  winType: BackgammonWinType;
  cubeValue: DoublingCubeValue;
  /** Points won this game (cubeValue × win multiplier) */
  pointsWon: number;
}

// ─── Player ───────────────────────────────────────────────────────────────────

export interface BackgammonPlayer {
  id: string;
  name: string;
  avatarUrl: string;
  color: BackgammonColor;
  bar: number;   // checkers on the bar
  off: number;   // checkers borne off
  matchScore: number; // cumulative match points (games won weighted by points)
}

// ─── Move ─────────────────────────────────────────────────────────────────────

export type BackgammonMoveSource = number | 'bar';
export type BackgammonMoveDest   = number | 'off';

export interface BackgammonMove {
  from: BackgammonMoveSource;
  to: BackgammonMoveDest;
  dieUsed: number;
  hitOpponent: boolean;
}

// ─── Game State ───────────────────────────────────────────────────────────────

export interface BackgammonGameState {
  board: BackgammonBoard;
  players: [BackgammonPlayer, BackgammonPlayer];
  currentPlayerIndex: 0 | 1;
  phase: BackgammonPhase;
  dice: BackgammonDice | null;
  cube: DoublingCube;
  matchConfig: BackgammonMatchConfig;
  gameResult: BackgammonGameResult | null;
  turnDeadline: number | null;
  rake: number | null;
}

// ─── Room ─────────────────────────────────────────────────────────────────────

export interface BackgammonRoom {
  roomId: string;
  player0: { playerId: string; playerName: string; avatarUrl: string; connected: boolean };
  player1: { playerId: string; playerName: string; avatarUrl: string; connected: boolean };
  gameState: BackgammonGameState;
  status: 'active' | 'finished';
  matchConfig: BackgammonMatchConfig;
  createdAt: number;
}
