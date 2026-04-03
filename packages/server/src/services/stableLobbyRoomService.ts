import { redis } from '../redis.js';
import { supabase } from '../supabase.js';
import type { LobbyRoomView, LobbyRoomStatus, LobbyRoomTemplate, GameType, StakeAmount } from '@poker5o/shared';
import { v4 as uuidv4 } from 'uuid';

// ─── Internal Types ────────────────────────────────────────────────────────────

interface RoomDef {
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
  password: string | null;
  createdBy: string | null; // null = admin-created (persistent)
  displayOrder: number;
  withBot: boolean;
}

export interface RoomState {
  status: LobbyRoomStatus;
  waitingPlayerId: string | null;
  waitingPlayerName: string | null;
  waitingPlayerAvatar: string | null;
  waitingPlayerSocketId: string | null;
  gameRoomId: string | null; // active poker5o game room when status='playing'
}

// ─── Redis Keys ────────────────────────────────────────────────────────────────

const DEF   = (id: string) => `lobbyroom:def:${id}`;
const STATE = (id: string) => `lobbyroom:state:${id}`;
const ALL_IDS_KEY = 'lobbyroom:ids';
const PRIVATE_TTL = 7200; // 2 hours

// ─── Service ───────────────────────────────────────────────────────────────────

export const stableLobbyRoomService = {

  // Called at server startup — loads admin rooms from Supabase into Redis
  async loadFromSupabase(): Promise<void> {
    const { data: rows, error } = await supabase
      .from('lobby_rooms')
      .select('*')
      .order('display_order');

    if (error) { console.error('[lobbyRooms] load error:', error.message); return; }
    if (!rows) return;

    for (const row of rows) {
      const def: RoomDef = {
        id:                row.id,
        name:              row.name,
        gameType:          row.game_type as GameType,
        stake:             row.stake as StakeAmount,
        completeWinBonus:  row.complete_win_bonus,
        timerDuration:     row.timer_duration ?? null,
        assignmentDuration: row.assignment_duration ?? 180,
        vocal:             row.vocal,
        isRecurring:       row.is_recurring,
        isPrivate:         row.is_private,
        password:          row.password_hash ?? null,
        createdBy:         null,
        displayOrder:      row.display_order,
        withBot:           row.with_bot ?? false,
      };
      await redis.set(DEF(row.id), JSON.stringify(def));
      await redis.sadd(ALL_IDS_KEY, row.id);

      // Preserve existing state (e.g. player waiting) across restarts; init if absent
      const existing = await redis.get(STATE(row.id));
      if (!existing) {
        await redis.set(STATE(row.id), JSON.stringify(emptyState()));
      }
    }
  },

  // ── Read ─────────────────────────────────────────────────────────────────────

  async getAll(): Promise<LobbyRoomView[]> {
    const ids = await redis.smembers(ALL_IDS_KEY);
    const views = (await Promise.all(ids.map(id => this.getView(id)))).filter(Boolean) as LobbyRoomView[];
    return views.sort((a, b) => a.displayOrder - b.displayOrder);
  },

  async getView(id: string): Promise<LobbyRoomView | null> {
    const [defStr, stateStr] = await Promise.all([redis.get(DEF(id)), redis.get(STATE(id))]);
    if (!defStr || !stateStr) return null;
    const def: RoomDef    = JSON.parse(defStr);
    const state: RoomState = JSON.parse(stateStr);
    return toView(def, state);
  },

  async getDef(id: string): Promise<RoomDef | null> {
    const s = await redis.get(DEF(id));
    return s ? JSON.parse(s) : null;
  },

  async getState(id: string): Promise<RoomState | null> {
    const s = await redis.get(STATE(id));
    return s ? JSON.parse(s) : null;
  },

  async setState(id: string, state: RoomState, ttl?: number): Promise<void> {
    if (ttl) {
      await redis.set(STATE(id), JSON.stringify(state), 'EX', ttl);
    } else {
      await redis.set(STATE(id), JSON.stringify(state));
    }
  },

  // ── Player Actions ────────────────────────────────────────────────────────────

  /**
   * Player enters a lobby room.
   * Returns:
   *   { action: 'waiting' }  — room was empty; player is now waiting
   *   { action: 'start', opponent: { id, name, avatar, socketId } }  — room had a waiter; game can start
   *   { ok: false, error }  — cannot join
   */
  async joinRoom(
    roomId: string,
    player: { id: string; name: string; avatar: string; socketId: string },
    password?: string,
  ): Promise<
    | { ok: true;  action: 'waiting' }
    | { ok: true;  action: 'start'; opponentId: string; opponentName: string; opponentAvatar: string; opponentSocketId: string }
    | { ok: false; error: string }
  > {
    const def = await this.getDef(roomId);
    if (!def) return { ok: false, error: 'Room not found' };

    if (def.isPrivate && def.password && def.password !== (password ?? '')) {
      return { ok: false, error: 'Incorrect password' };
    }

    const state = await this.getState(roomId);
    if (!state) return { ok: false, error: 'Room not found' };

    if (state.status === 'playing') return { ok: false, error: 'A game is already in progress in this room' };

    if (state.status === 'waiting') {
      if (state.waitingPlayerId === player.id) return { ok: false, error: 'You are already waiting in this room' };
      return {
        ok: true,
        action: 'start',
        opponentId:       state.waitingPlayerId!,
        opponentName:     state.waitingPlayerName!,
        opponentAvatar:   state.waitingPlayerAvatar!,
        opponentSocketId: state.waitingPlayerSocketId!,
      };
    }

    // status === 'empty' → set to waiting
    const def2 = def.createdBy ? PRIVATE_TTL : undefined;
    await this.setState(roomId, {
      status: 'waiting',
      waitingPlayerId:    player.id,
      waitingPlayerName:  player.name,
      waitingPlayerAvatar: player.avatar,
      waitingPlayerSocketId: player.socketId,
      gameRoomId: null,
    }, def2);

    return { ok: true, action: 'waiting' };
  },

  async leaveRoom(roomId: string, playerId: string): Promise<boolean> {
    const state = await this.getState(roomId);
    if (!state || state.status !== 'waiting' || state.waitingPlayerId !== playerId) return false;
    const def = await this.getDef(roomId);
    const ttl = def?.createdBy ? PRIVATE_TTL : undefined;
    await this.setState(roomId, emptyState(), ttl);
    return true;
  },

  async setPlaying(roomId: string, gameRoomId: string): Promise<void> {
    const state = await this.getState(roomId);
    if (!state) return;
    const def = await this.getDef(roomId);
    const ttl = def?.createdBy ? PRIVATE_TTL : undefined;
    await this.setState(roomId, { ...state, status: 'playing', gameRoomId }, ttl);
  },

  async resetRoom(roomId: string): Promise<void> {
    const def = await this.getDef(roomId);
    if (!def) return;
    const ttl = def.createdBy ? PRIVATE_TTL : undefined;
    await this.setState(roomId, emptyState(), ttl);
  },

  // ── Private Room CRUD ─────────────────────────────────────────────────────────

  async createPrivate(
    creator: { id: string; name: string },
    settings: {
      name: string;
      gameType: GameType;
      stake: StakeAmount;
      completeWinBonus: boolean;
      timerDuration: 30 | 45 | 60 | null;
      assignmentDuration: 60 | 180 | 300;
      vocal: boolean;
      isPrivate: boolean;
      password?: string;
    },
  ): Promise<LobbyRoomView> {
    const id = uuidv4();
    const def: RoomDef = {
      id,
      name:              settings.name || `${creator.name}'s Room`,
      gameType:          settings.gameType,
      stake:             settings.stake,
      completeWinBonus:  settings.completeWinBonus,
      timerDuration:     settings.timerDuration,
      assignmentDuration: settings.assignmentDuration,
      vocal:             settings.vocal,
      isRecurring:       false,
      isPrivate:         settings.isPrivate,
      password:          settings.password ?? null,
      createdBy:         creator.id,
      displayOrder:      9999,
      withBot:           false,
    };
    await redis.set(DEF(id), JSON.stringify(def), 'EX', PRIVATE_TTL);
    await redis.set(STATE(id), JSON.stringify(emptyState()), 'EX', PRIVATE_TTL);
    await redis.sadd(ALL_IDS_KEY, id);
    return toView(def, emptyState());
  },

  async deletePrivate(roomId: string, requesterId: string): Promise<boolean> {
    const def = await this.getDef(roomId);
    if (!def || def.createdBy !== requesterId) return false;
    await this.deleteFromRedis(roomId);
    return true;
  },

  // ── Admin CRUD ────────────────────────────────────────────────────────────────

  async adminCreate(settings: {
    name: string;
    gameType: GameType;
    stake: StakeAmount;
    completeWinBonus: boolean;
    timerDuration: 30 | 45 | 60 | null;
    assignmentDuration: 60 | 180 | 300;
    vocal: boolean;
    isRecurring: boolean;
    isPrivate: boolean;
    password?: string;
    displayOrder?: number;
    withBot?: boolean;
  }): Promise<LobbyRoomView | null> {
    const { data, error } = await supabase
      .from('lobby_rooms')
      .insert({
        name:               settings.name,
        game_type:          settings.gameType,
        stake:              settings.stake,
        complete_win_bonus: settings.completeWinBonus,
        timer_duration:     settings.timerDuration,
        assignment_duration: settings.assignmentDuration,
        vocal:              settings.vocal,
        is_recurring:       settings.isRecurring,
        is_private:         settings.isPrivate,
        password_hash:      settings.password ?? null,
        display_order:      settings.displayOrder ?? 0,
      })
      .select()
      .single();

    if (error || !data) { console.error('[lobbyRooms] adminCreate error:', error?.message); return null; }

    const def: RoomDef = {
      id:                data.id,
      name:              data.name,
      gameType:          data.game_type as GameType,
      stake:             data.stake as StakeAmount,
      completeWinBonus:  data.complete_win_bonus,
      timerDuration:     data.timer_duration ?? null,
      assignmentDuration: data.assignment_duration ?? 180,
      vocal:             data.vocal,
      isRecurring:       data.is_recurring,
      isPrivate:         data.is_private,
      password:          data.password_hash ?? null,
      createdBy:         null,
      displayOrder:      data.display_order,
      withBot:           settings.withBot ?? false,
    };
    await redis.set(DEF(data.id), JSON.stringify(def));
    await redis.set(STATE(data.id), JSON.stringify(emptyState()));
    await redis.sadd(ALL_IDS_KEY, data.id);
    return toView(def, emptyState());
  },

  async adminUpdate(roomId: string, updates: Partial<{
    name: string;
    gameType: GameType;
    stake: StakeAmount;
    completeWinBonus: boolean;
    timerDuration: 30 | 45 | 60 | null;
    assignmentDuration: 60 | 180 | 300;
    vocal: boolean;
    isRecurring: boolean;
    isPrivate: boolean;
    password: string | null;
    displayOrder: number;
  }>): Promise<LobbyRoomView | null> {
    const def = await this.getDef(roomId);
    if (!def || def.createdBy !== null) return null; // only admin rooms

    const dbUpdates: Record<string, unknown> = {};
    if (updates.name              !== undefined) dbUpdates.name = updates.name;
    if (updates.gameType          !== undefined) dbUpdates.game_type = updates.gameType;
    if (updates.stake             !== undefined) dbUpdates.stake = updates.stake;
    if (updates.completeWinBonus  !== undefined) dbUpdates.complete_win_bonus = updates.completeWinBonus;
    if (updates.timerDuration     !== undefined) dbUpdates.timer_duration = updates.timerDuration;
    if (updates.assignmentDuration !== undefined) dbUpdates.assignment_duration = updates.assignmentDuration;
    if (updates.vocal             !== undefined) dbUpdates.vocal = updates.vocal;
    if (updates.isRecurring       !== undefined) dbUpdates.is_recurring = updates.isRecurring;
    if (updates.isPrivate         !== undefined) dbUpdates.is_private = updates.isPrivate;
    if (updates.password          !== undefined) dbUpdates.password_hash = updates.password;
    if (updates.displayOrder      !== undefined) dbUpdates.display_order = updates.displayOrder;

    const { error } = await supabase.from('lobby_rooms').update(dbUpdates).eq('id', roomId);
    if (error) return null;

    const updated: RoomDef = { ...def, ...updates, password: updates.password !== undefined ? updates.password : def.password };
    await redis.set(DEF(roomId), JSON.stringify(updated));
    const state = await this.getState(roomId);
    return toView(updated, state ?? emptyState());
  },

  async adminDelete(roomId: string): Promise<boolean> {
    const { error } = await supabase.from('lobby_rooms').delete().eq('id', roomId);
    if (error) return false;
    await this.deleteFromRedis(roomId);
    return true;
  },

  // ── Template CRUD ─────────────────────────────────────────────────────────────

  async getTemplates(): Promise<LobbyRoomTemplate[]> {
    const { data, error } = await supabase
      .from('lobby_room_templates')
      .select('*')
      .order('display_order');
    if (error || !data) return [];
    return data.map(row => ({
      id:                row.id,
      name:              row.name,
      gameType:          row.game_type as GameType,
      stake:             row.stake as StakeAmount,
      completeWinBonus:  row.complete_win_bonus,
      timerDuration:     row.timer_duration ?? null,
      assignmentDuration: row.assignment_duration ?? 180,
      vocal:             row.vocal,
      isRecurring:       row.is_recurring,
      isPrivate:         row.is_private,
      displayOrder:      row.display_order,
    }));
  },

  async createTemplate(settings: Omit<LobbyRoomTemplate, 'id'>): Promise<LobbyRoomTemplate | null> {
    const { data, error } = await supabase
      .from('lobby_room_templates')
      .insert({
        name:               settings.name,
        game_type:          settings.gameType,
        stake:              settings.stake,
        complete_win_bonus: settings.completeWinBonus,
        timer_duration:     settings.timerDuration,
        assignment_duration: settings.assignmentDuration,
        vocal:              settings.vocal,
        is_recurring:       settings.isRecurring,
        is_private:         settings.isPrivate,
        display_order:      settings.displayOrder,
      })
      .select()
      .single();
    if (error || !data) return null;
    return { ...settings, id: data.id };
  },

  async deleteTemplate(id: string): Promise<boolean> {
    const { error } = await supabase.from('lobby_room_templates').delete().eq('id', id);
    return !error;
  },

  // ── Helpers ───────────────────────────────────────────────────────────────────

  async deleteFromRedis(roomId: string): Promise<void> {
    await Promise.all([
      redis.del(DEF(roomId)),
      redis.del(STATE(roomId)),
      redis.srem(ALL_IDS_KEY, roomId),
    ]);
  },
};

function emptyState(): RoomState {
  return {
    status: 'empty',
    waitingPlayerId: null,
    waitingPlayerName: null,
    waitingPlayerAvatar: null,
    waitingPlayerSocketId: null,
    gameRoomId: null,
  };
}

function toView(def: RoomDef, state: RoomState): LobbyRoomView {
  return {
    id:                def.id,
    name:              def.name,
    gameType:          def.gameType,
    stake:             def.stake,
    completeWinBonus:  def.completeWinBonus,
    timerDuration:     def.timerDuration,
    assignmentDuration: def.assignmentDuration,
    vocal:             def.vocal,
    isRecurring:       def.isRecurring,
    isPrivate:         def.isPrivate,
    createdBy:         def.createdBy,
    displayOrder:      def.displayOrder,
    status:            state.status,
    waitingPlayerName: state.waitingPlayerName,
    waitingPlayerAvatar: state.waitingPlayerAvatar,
  };
}
