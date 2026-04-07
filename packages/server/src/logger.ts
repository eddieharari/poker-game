/**
 * Structured server logger — keeps a circular buffer for the admin panel
 * and writes JSON lines to stdout.
 */

export type LogEvent =
  | 'USER_LOGIN'
  | 'USER_DISCONNECT'
  | 'ROOM_CREATED'
  | 'GAME_START'
  | 'GAME_END'
  | 'CHIPS_REQUESTED'
  | 'CHIPS_ADDED'
  | 'CHIPS_REQUEST_APPROVED'
  | 'CHIPS_REQUEST_DECLINED';

export interface LogEntry {
  ts: string;
  event: LogEvent;
  [key: string]: unknown;
}

// ─── Circular Log Buffer ───────────────────────────────────────────────────────

const MAX_LOG_ENTRIES = 500;
const logBuffer: LogEntry[] = [];

export function getLogs(): LogEntry[] {
  return [...logBuffer];
}

export function clearLogs(): void {
  logBuffer.length = 0;
}

export function log(event: LogEvent, payload: Record<string, unknown> = {}): void {
  const entry: LogEntry = { ts: new Date().toISOString(), event, ...payload };
  logBuffer.push(entry);
  if (logBuffer.length > MAX_LOG_ENTRIES) {
    logBuffer.shift();
  }
  console.log(JSON.stringify(entry));
}
