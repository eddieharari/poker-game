import { Router } from 'express';
import { supabase } from '../supabase.js';
import { getLogs } from '../logger.js';
import { lobbyService } from '../services/lobbyService.js';
import { settingsService } from '../services/settingsService.js';
import { getIo } from '../socket/index.js';
import { stableLobbyRoomService } from '../services/stableLobbyRoomService.js';

async function pushChipsUpdate(playerId: string): Promise<void> {
  const { data } = await supabase.from('profiles').select('chips').eq('id', playerId).single();
  if (data) getIo()?.to(`player:${playerId}`).emit('profile:chips_updated', { chips: data.chips });
}

export const adminRouter = Router();

function checkAuth(req: any, res: any): boolean {
  const password = process.env.ADMIN_PASSWORD ?? 'admin123';
  const auth = req.headers['x-admin-password'];
  if (auth !== password) {
    res.status(401).json({ error: 'Unauthorized' });
    return false;
  }
  return true;
}

// GET /api/admin/players
adminRouter.get('/players', async (req, res) => {
  if (!checkAuth(req, res)) return;
  const { data, error } = await supabase
    .from('profiles')
    .select('id, nickname, chips, wins, losses, draws, avatar_url, role, agent_id, total_rake')
    .order('chips', { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// POST /api/admin/chips — body: { playerId, amount }
adminRouter.post('/chips', async (req, res) => {
  if (!checkAuth(req, res)) return;
  const { playerId, amount } = req.body;
  if (!playerId || typeof amount !== 'number') return res.status(400).json({ error: 'Invalid params' });
  const { error } = await supabase.rpc('add_chips', { p_player_id: playerId, p_amount: amount });
  if (error) {
    // Fallback: direct update
    const { data: profile } = await supabase.from('profiles').select('chips').eq('id', playerId).single();
    if (!profile) return res.status(404).json({ error: 'Player not found' });
    const { error: e2 } = await supabase.from('profiles').update({ chips: profile.chips + amount }).eq('id', playerId);
    if (e2) return res.status(500).json({ error: e2.message });
  }
  await pushChipsUpdate(playerId);
  res.json({ ok: true });
});

// POST /api/admin/reset-player — body: { playerId }
// Removes a player from the lobby (clears stuck in-game status)
adminRouter.post('/reset-player', async (req, res) => {
  if (!checkAuth(req, res)) return;
  const { playerId } = req.body;
  if (!playerId) return res.status(400).json({ error: 'playerId required' });
  await lobbyService.removePlayer(playerId);
  res.json({ ok: true });
});

// GET /api/admin/logs
adminRouter.get('/logs', (req, res) => {
  if (!checkAuth(req, res)) return;
  res.json(getLogs());
});

// GET /api/admin/settings
adminRouter.get('/settings', async (req, res) => {
  if (!checkAuth(req, res)) return;
  const settings = await settingsService.get();
  res.json(settings);
});

// POST /api/admin/settings
adminRouter.post('/settings', async (req, res) => {
  if (!checkAuth(req, res)) return;
  const { feePercent, feeCap, housePlayerId } = req.body;
  await settingsService.save({
    ...(typeof feePercent === 'number' && { feePercent }),
    ...(typeof feeCap === 'number' && { feeCap }),
    ...(typeof housePlayerId === 'string' && { housePlayerId }),
  });
  res.json({ ok: true });
});

// GET /api/admin/requests — pending chip requests
adminRouter.get('/requests', async (req, res) => {
  if (!checkAuth(req, res)) return;
  const { data, error } = await supabase
    .from('chip_requests')
    .select('id, amount, note, status, created_at, player_id, profiles(nickname, avatar_url)')
    .eq('status', 'pending')
    .order('created_at', { ascending: true });
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// POST /api/admin/requests/:id/approve
adminRouter.post('/requests/:id/approve', async (req, res) => {
  if (!checkAuth(req, res)) return;
  const { id } = req.params;
  const { data: chipReq, error: fetchErr } = await supabase
    .from('chip_requests')
    .select('*')
    .eq('id', id)
    .eq('status', 'pending')
    .single();
  if (fetchErr || !chipReq) return res.status(404).json({ error: 'Request not found' });
  await supabase.rpc('add_chips', { p_player_id: chipReq.player_id, p_amount: chipReq.amount });
  await supabase.from('chip_requests').update({ status: 'approved', resolved_at: new Date().toISOString() }).eq('id', id);
  await pushChipsUpdate(chipReq.player_id);
  res.json({ ok: true });
});

// POST /api/admin/requests/:id/decline
adminRouter.post('/requests/:id/decline', async (req, res) => {
  if (!checkAuth(req, res)) return;
  const { id } = req.params;
  await supabase.from('chip_requests').update({ status: 'declined', resolved_at: new Date().toISOString() }).eq('id', id);
  res.json({ ok: true });
});

// GET /api/admin/agents
adminRouter.get('/agents', async (req, res) => {
  if (!checkAuth(req, res)) return;
  const { data, error } = await supabase
    .from('profiles')
    .select('id, nickname, avatar_url, chips, agent_chip_pool, wins, losses, draws, rakeback_percent')
    .eq('role', 'agent')
    .order('nickname');
  if (error) return res.status(500).json({ error: error.message });

  // Count players and sum rake per agent
  const agentsWithStats = await Promise.all((data ?? []).map(async agent => {
    const { count } = await supabase
      .from('profiles')
      .select('id', { count: 'exact', head: true })
      .eq('agent_id', agent.id);
    const { data: playerRakes } = await supabase
      .from('profiles')
      .select('total_rake')
      .eq('agent_id', agent.id);
    const total_rake = (playerRakes ?? []).reduce((sum, p) => sum + (p.total_rake ?? 0), 0);
    return { ...agent, player_count: count ?? 0, total_rake };
  }));
  res.json(agentsWithStats);
});

// POST /api/admin/set-rakeback — set agent's rakeback percent
adminRouter.post('/set-rakeback', async (req, res) => {
  if (!checkAuth(req, res)) return;
  const { agentId, rakebackPercent } = req.body;
  if (!agentId || typeof rakebackPercent !== 'number' || rakebackPercent < 0 || rakebackPercent > 100) {
    return res.status(400).json({ error: 'Invalid params' });
  }
  const { error } = await supabase
    .from('profiles').update({ rakeback_percent: rakebackPercent }).eq('id', agentId);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true });
});

// POST /api/admin/agent-pool — adjust agent chip pool (not game chips)
adminRouter.post('/agent-pool', async (req, res) => {
  if (!checkAuth(req, res)) return;
  const { agentId, amount } = req.body;
  if (!agentId || typeof amount !== 'number') {
    return res.status(400).json({ error: 'Invalid params' });
  }
  const { data: agent } = await supabase
    .from('profiles').select('agent_chip_pool, role').eq('id', agentId).single();
  if (!agent || agent.role !== 'agent') return res.status(404).json({ error: 'Agent not found' });
  const newPool = agent.agent_chip_pool + amount;
  if (newPool < 0) return res.status(400).json({ error: 'Pool cannot go negative' });
  const { error } = await supabase
    .from('profiles').update({ agent_chip_pool: newPool }).eq('id', agentId);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true, pool: newPool });
});

// POST /api/admin/set-role — change a player's role
adminRouter.post('/set-role', async (req, res) => {
  if (!checkAuth(req, res)) return;
  const { playerId, role } = req.body;
  if (!playerId || !['admin', 'agent', 'user'].includes(role)) {
    return res.status(400).json({ error: 'Invalid params' });
  }
  const { error } = await supabase.from('profiles').update({ role }).eq('id', playerId);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true });
});

// POST /api/admin/assign-agent — assign player to agent (agentId: null = unassign)
adminRouter.post('/assign-agent', async (req, res) => {
  if (!checkAuth(req, res)) return;
  const { playerId, agentId } = req.body;
  if (!playerId) return res.status(400).json({ error: 'playerId required' });
  const { error } = await supabase
    .from('profiles').update({ agent_id: agentId ?? null }).eq('id', playerId);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true });
});

// GET /api/admin/agents/:agentId/players — list players assigned to an agent
adminRouter.get('/agents/:agentId/players', async (req, res) => {
  if (!checkAuth(req, res)) return;
  const { agentId } = req.params;
  const { data, error } = await supabase
    .from('profiles')
    .select('id, nickname, avatar_url, chips, wins, losses, draws')
    .eq('agent_id', agentId)
    .order('nickname');
  if (error) return res.status(500).json({ error: error.message });
  res.json(data ?? []);
});

// ─── Lobby Rooms ──────────────────────────────────────────────────────────────

// GET /api/admin/lobby-rooms
adminRouter.get('/lobby-rooms', async (req, res) => {
  if (!checkAuth(req, res)) return;
  const rooms = await stableLobbyRoomService.getAll();
  res.json(rooms);
});

// POST /api/admin/lobby-rooms
adminRouter.post('/lobby-rooms', async (req, res) => {
  if (!checkAuth(req, res)) return;
  const room = await stableLobbyRoomService.adminCreate(req.body);
  if (!room) return res.status(500).json({ error: 'Failed to create room' });
  getIo()?.to('lobby').emit('lobbyRoom:added', room);
  res.json(room);
});

// PATCH /api/admin/lobby-rooms/:id
adminRouter.patch('/lobby-rooms/:id', async (req, res) => {
  if (!checkAuth(req, res)) return;
  const room = await stableLobbyRoomService.adminUpdate(req.params.id, req.body);
  if (!room) return res.status(404).json({ error: 'Room not found or not an admin room' });
  getIo()?.to('lobby').emit('lobbyRoom:update', room);
  res.json(room);
});

// DELETE /api/admin/lobby-rooms/:id
adminRouter.delete('/lobby-rooms/:id', async (req, res) => {
  if (!checkAuth(req, res)) return;
  const deleted = await stableLobbyRoomService.adminDelete(req.params.id);
  if (!deleted) return res.status(404).json({ error: 'Room not found' });
  getIo()?.to('lobby').emit('lobbyRoom:removed', { roomId: req.params.id });
  res.json({ ok: true });
});

// POST /api/admin/lobby-rooms/:id/reset
adminRouter.post('/lobby-rooms/:id/reset', async (req, res) => {
  if (!checkAuth(req, res)) return;
  await stableLobbyRoomService.resetRoom(req.params.id);
  const room = await stableLobbyRoomService.getView(req.params.id);
  if (room) getIo()?.to('lobby').emit('lobbyRoom:update', room);
  res.json({ ok: true });
});

// ─── Lobby Room Templates ─────────────────────────────────────────────────────

// GET /api/admin/lobby-room-templates
adminRouter.get('/lobby-room-templates', async (req, res) => {
  if (!checkAuth(req, res)) return;
  const templates = await stableLobbyRoomService.getTemplates();
  res.json(templates);
});

// POST /api/admin/lobby-room-templates
adminRouter.post('/lobby-room-templates', async (req, res) => {
  if (!checkAuth(req, res)) return;
  const template = await stableLobbyRoomService.createTemplate(req.body);
  if (!template) return res.status(500).json({ error: 'Failed to create template' });
  res.json(template);
});

// DELETE /api/admin/lobby-room-templates/:id
adminRouter.delete('/lobby-room-templates/:id', async (req, res) => {
  if (!checkAuth(req, res)) return;
  const deleted = await stableLobbyRoomService.deleteTemplate(req.params.id);
  if (!deleted) return res.status(404).json({ error: 'Template not found' });
  res.json({ ok: true });
});
