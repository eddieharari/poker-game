/**
 * Structured server logger — writes JSON lines to stdout.
 * Each line: { ts, event, ...payload }
 */

type LogEvent =
  | 'PLAYER_LOGIN'
  | 'PLAYER_LOGOUT'
  | 'INVITE_SENT'
  | 'INVITE_ACCEPTED'
  | 'INVITE_DECLINED'
  | 'INVITE_EXPIRED'
  | 'GAME_START'
  | 'GAME_END';

interface LogPayload {
  playerId?:   string;
  nickname?:   string;
  fromId?:     string;
  fromNick?:   string;
  toId?:       string;
  toNick?:     string;
  challengeId?: string;
  roomId?:     string;
  stake?:      number;
  player0?:    string;  // nickname
  player1?:    string;  // nickname
  winner?:     string;  // nickname or 'draw'
  score?:      string;  // e.g. "3-2"
  durationMs?: number;
  [key: string]: unknown;
}

export function log(event: LogEvent, payload: LogPayload = {}): void {
  const entry = { ts: new Date().toISOString(), event, ...payload };
  console.log(JSON.stringify(entry));
}
