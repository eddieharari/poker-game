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
  avatarUrl?: string;
  /** columns[c][r] = card at column c, row r */
  columns: Card[][];
}

// ─── Stakes ───────────────────────────────────────────────────────────────────

export const STAKE_OPTIONS = [10, 50, 100, 250, 500, 1000, 2000, 3000, 4000, 5000] as const;
export type StakeAmount = typeof STAKE_OPTIONS[number];

// ─── Game Phase ───────────────────────────────────────────────────────────────

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
  turnDeadline: number | null; // unix timestamp when current turn expires, null = no timer
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
  completeWinBonus: boolean;
  isCompleteWin: boolean;
  rake?: number; // total rake collected from both players; set by server after settlement
}

// ─── Lobby Rooms ──────────────────────────────────────────────────────────────

export type LobbyRoomStatus = 'empty' | 'waiting' | 'playing';

export interface LobbyRoomView {
  id: string;
  name: string;
  gameType: GameType;
  stake: StakeAmount;
  completeWinBonus: boolean;
  timerDuration: 30 | 45 | 60 | null;
  assignmentDuration: 60 | 180 | 300;
  vocal: boolean;
  isRecurring: boolean;
  isPrivate: boolean;
  createdBy: string | null;  // null = admin-created
  displayOrder: number;
  status: LobbyRoomStatus;
  waitingPlayerName: string | null;
  waitingPlayerAvatar: string | null;
}

export interface LobbyRoomTemplate {
  id: string;
  name: string;
  gameType: GameType;
  stake: StakeAmount;
  completeWinBonus: boolean;
  timerDuration: 30 | 45 | 60 | null;
  assignmentDuration: 60 | 180 | 300;
  vocal: boolean;
  isRecurring: boolean;
  isPrivate: boolean;
  displayOrder: number;
}

// ─── Socket.io Typed Events ───────────────────────────────────────────────────

export type GameType = 'poker5o' | 'pazpaz';

export type PlayerStatus = 'idle' | 'busy' | 'in-game' | 'invited';

export interface OnlinePlayer {
  id: string;
  nickname: string;
  avatarUrl: string;
  status: PlayerStatus;
  wins: number;
  losses: number;
  draws: number;
}

export interface ServerToClientEvents {
  // Game room
  'room:joined':          (payload: { roomId: string; playerId: string; playerIndex: 0 | 1; stake: number | null; completeWinBonus: boolean }) => void;
  'room:ready':           (payload: { gameState: GameState }) => void;
  'room:error':           (payload: { message: string }) => void;
  'game:state':           (state: GameState) => void;
  'game:over':            (score: GameScore) => void;
  'game:starting':        (payload: { firstPlayerIndex: 0 | 1; firstPlayerName: string }) => void;
  'game:forfeited':       (payload: { forfeiterIndex: 0 | 1 }) => void;
  'game:rejoin_required': (payload: { roomId: string }) => void;
  'player:disconnected':  (payload: { playerIndex: 0 | 1 }) => void;
  'player:reconnected':   (payload: { playerIndex: 0 | 1 }) => void;
  // Lobby
  'lobby:players':              (players: OnlinePlayer[]) => void;
  'lobby:player:joined':        (player: OnlinePlayer) => void;
  'lobby:player:left':          (payload: { playerId: string }) => void;
  'lobby:player:status':        (payload: { playerId: string; status: PlayerStatus }) => void;
  'lobby:challenge:incoming':   (payload: { challengeId: string; from: OnlinePlayer; stake: StakeAmount; completeWinBonus: boolean; timerDuration: 30 | 45 | 60 | null; gameType: GameType; assignmentDuration?: 60 | 180 | 300; vocal?: boolean }) => void;
  'lobby:challenge:accepted':   (payload: { challengeId: string; roomId: string; gameType?: GameType; vocal?: boolean }) => void;
  'webrtc:signal':              (payload: { fromPlayerId: string; signal: unknown }) => void;
  'lobby:challenge:declined':   (payload: { challengeId: string }) => void;
  'lobby:challenge:expired':    (payload: { challengeId: string }) => void;
  // PazPaz
  'pazpaz:state':              (state: import('./pazpaz.js').PazPazGameState) => void;
  'pazpaz:error':              (payload: { message: string }) => void;
  'pazpaz:rejoin_required':    (payload: { roomId: string }) => void;
  'pazpaz:forfeited':          (payload: { forfeiterIndex: 0 | 1 }) => void;
  // Lobby Rooms
  'lobbyRoom:list':         (rooms: LobbyRoomView[]) => void;
  'lobbyRoom:update':       (room: LobbyRoomView) => void;
  'lobbyRoom:added':        (room: LobbyRoomView) => void;
  'lobbyRoom:removed':      (payload: { roomId: string }) => void;
  'lobbyRoom:game_started': (payload: { roomId: string; gameType: GameType; vocal: boolean }) => void;
  'lobbyRoom:error':        (payload: { message: string }) => void;
  'lobbyRoom:auto_joined':  (payload: { roomId: string }) => void;
  // Rematch
  'rematch:offer':          (payload: { fromName: string }) => void;
  'rematch:declined':       () => void;
  'rematch:starting':       (payload: { roomId: string; gameType: GameType; vocal: boolean }) => void;
  // Keepalive
  'game:pong':                  (payload: { roomId: string }) => void;
  // Session
  'session:duplicate':          () => void;
  'session:kicked':             () => void;
  'session:init':               (payload: { bootId: string }) => void;
  'profile:chips_updated':      (payload: { chips: number }) => void;
}

export interface ClientToServerEvents {
  // Game room
  'room:join':    (payload: { roomId: string }) => void;
  'room:rejoin':  (payload: { roomId: string }) => void;
  'action:draw':  (payload: { roomId: string }) => void;
  'action:place':  (payload: { roomId: string; columnIndex: number }) => void;
  'game:forfeit':  (payload: { roomId: string }) => void;
  'game:ping':     (payload: { roomId: string }) => void;
  // Lobby
  'lobby:enter':            () => void;
  'lobby:leave':            () => void;
  'lobby:challenge':        (payload: { toPlayerId: string; stake: StakeAmount; completeWinBonus: boolean; timerDuration: 30 | 45 | 60 | null; gameType?: GameType; assignmentDuration?: 60 | 180 | 300; vocal?: boolean }) => void;
  'webrtc:signal':          (payload: { toPlayerId: string; signal: unknown }) => void;
  'lobby:challenge:accept': (payload: { challengeId: string }) => void;
  'lobby:challenge:decline':(payload: { challengeId: string }) => void;
  'lobby:set_status':         (payload: { status: 'idle' | 'busy' }) => void;
  // Lobby Rooms
  'lobbyRoom:list':   () => void;
  'lobbyRoom:join':   (payload: { roomId: string; password?: string }) => void;
  'lobbyRoom:leave':  (payload: { roomId: string }) => void;
  'lobbyRoom:create': (payload: { name: string; gameType: GameType; stake: StakeAmount; completeWinBonus: boolean; timerDuration: 30 | 45 | 60 | null; assignmentDuration: 60 | 180 | 300; vocal: boolean; isPrivate: boolean; password?: string }) => void;
  'lobbyRoom:delete': (payload: { roomId: string }) => void;
  // PazPaz
  'pazpaz:join':        (payload: { roomId: string }) => void;
  'pazpaz:submit':      (payload: { roomId: string; assignment: import('./pazpaz.js').PazPazAssignment }) => void;
  'pazpaz:partial_save':(payload: { roomId: string; assignment: import('./pazpaz.js').PazPazAssignment }) => void;
  'pazpaz:forfeit':     (payload: { roomId: string }) => void;
  // Rematch
  'rematch:request':    (payload: { roomId: string }) => void;
  'rematch:accept':     (payload: { roomId: string }) => void;
  'rematch:decline':    (payload: { roomId: string }) => void;
  // Session
  'session:confirm_takeover': () => void;
}
