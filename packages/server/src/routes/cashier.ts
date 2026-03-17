import { Router } from 'express';
import { supabase } from '../supabase.js';

export const cashierRouter = Router();

async function getPlayerId(req: any): Promise<string | null> {
  const auth = req.headers.authorization as string | undefined;
  if (!auth?.startsWith('Bearer ')) return null;
  const { data, error } = await supabase.auth.getUser(auth.slice(7));
  if (error || !data.user) return null;
  return data.user.id;
}

// GET /api/cashier/history
cashierRouter.get('/history', async (req: any, res) => {
  const playerId = await getPlayerId(req);
  if (!playerId) return res.status(401).json({ error: 'Unauthorized' });
  const { data, error } = await supabase
    .from('game_results')
    .select('*')
    .or(`player0_id.eq.${playerId},player1_id.eq.${playerId}`)
    .order('created_at', { ascending: false })
    .limit(100);
  if (error) return res.status(500).json({ error: error.message });
  res.json(data ?? []);
});

// GET /api/cashier/requests
cashierRouter.get('/requests', async (req: any, res) => {
  const playerId = await getPlayerId(req);
  if (!playerId) return res.status(401).json({ error: 'Unauthorized' });
  const { data, error } = await supabase
    .from('chip_requests')
    .select('*')
    .eq('player_id', playerId)
    .order('created_at', { ascending: false })
    .limit(50);
  if (error) return res.status(500).json({ error: error.message });
  res.json(data ?? []);
});

// POST /api/cashier/request
cashierRouter.post('/request', async (req: any, res) => {
  const playerId = await getPlayerId(req);
  if (!playerId) return res.status(401).json({ error: 'Unauthorized' });
  const { amount, note } = req.body;
  if (!amount || typeof amount !== 'number' || amount <= 0) {
    return res.status(400).json({ error: 'Amount must be a positive number' });
  }
  const { data, error } = await supabase
    .from('chip_requests')
    .insert({ player_id: playerId, amount, note: note ?? null })
    .select()
    .single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});
