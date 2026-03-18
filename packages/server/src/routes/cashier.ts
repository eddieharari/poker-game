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

// GET /api/cashier/history?from=YYYY-MM-DD&to=YYYY-MM-DD
cashierRouter.get('/history', async (req: any, res) => {
  const playerId = await getPlayerId(req);
  if (!playerId) return res.status(401).json({ error: 'Unauthorized' });

  let query = supabase
    .from('games')
    .select(`
      id, room_id, stake, winner_id, is_draw,
      player0_id, player1_id,
      player0_columns, player1_columns,
      ended_at,
      player0:profiles!player0_id(nickname),
      player1:profiles!player1_id(nickname)
    `)
    .or(`player0_id.eq.${playerId},player1_id.eq.${playerId}`)
    .not('ended_at', 'is', null)
    .order('ended_at', { ascending: false })
    .limit(200);

  const { from, to } = req.query;
  if (from) query = query.gte('ended_at', `${from}T00:00:00Z`);
  if (to)   query = query.lte('ended_at', `${to}T23:59:59Z`);

  const { data, error } = await query;
  if (error) return res.status(500).json({ error: error.message });

  const result = (data ?? []).map((g: any) => ({
    id:               g.id,
    room_id:          g.room_id,
    stake:            g.stake,
    winner_id:        g.winner_id,
    is_draw:          g.is_draw,
    player0_id:       g.player0_id,
    player1_id:       g.player1_id,
    player0_name:     g.player0?.nickname ?? 'Unknown',
    player1_name:     g.player1?.nickname ?? 'Unknown',
    player0_columns:  g.player0_columns,
    player1_columns:  g.player1_columns,
    ended_at:         g.ended_at,
  }));

  res.json(result);
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
