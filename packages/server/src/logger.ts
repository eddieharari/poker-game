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
  | 'GAME_END'
  | 'PAZPAZ_JOIN'
  | 'PAZPAZ_SUBMIT'
  | 'PAZPAZ_AUTO_SUBMIT'
  | 'PAZPAZ_PRESSURE_SUBMIT'
  | 'PAZPAZ_GAME_END'
  | 'PAZPAZ_DISCONNECT'
  | 'PAZPAZ_FORFEIT'
  | 'RAKE_CALC';

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

// ─── Circular Log Buffer ───────────────────────────────────────────────────────

const MAX_LOG_ENTRIES = 500;
const logBuffer: Array<{ ts: string; event: string; [key: string]: unknown }> = [];

export function getLogs(): Array<{ ts: string; event: string; [key: string]: unknown }> {
  return [...logBuffer];
}

export function log(event: LogEvent, payload: LogPayload = {}): void {
  const entry = { ts: new Date().toISOString(), event, ...payload };
  logBuffer.push(entry);
  if (logBuffer.length > MAX_LOG_ENTRIES) {
    logBuffer.shift();
  }
  console.log(JSON.stringify(entry));
}
