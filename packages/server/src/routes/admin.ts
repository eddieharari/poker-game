import { Router } from 'express';
import { supabase } from '../supabase.js';
import { getLogs } from '../logger.js';
import { lobbyService } from '../services/lobbyService.js';
import { settingsService } from '../services/settingsService.js';

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
    .select('id, nickname, chips, wins, losses, draws, avatar_url')
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
  res.json({ ok: true });
});

// POST /api/admin/requests/:id/decline
adminRouter.post('/requests/:id/decline', async (req, res) => {
  if (!checkAuth(req, res)) return;
  const { id } = req.params;
  await supabase.from('chip_requests').update({ status: 'declined', resolved_at: new Date().toISOString() }).eq('id', id);
  res.json({ ok: true });
});
