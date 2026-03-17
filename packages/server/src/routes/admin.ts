import { Router } from 'express';
import { supabase } from '../supabase.js';
import { getLogs } from '../logger.js';

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

// GET /api/admin/logs
adminRouter.get('/logs', (req, res) => {
  if (!checkAuth(req, res)) return;
  res.json(getLogs());
});
