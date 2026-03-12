import { Router } from 'express';
import { lobbyService } from '../services/lobbyService.js';

const router = Router();

// HTTP fallback — list of currently online players
router.get('/players', async (_req, res) => {
  const players = await lobbyService.getAllPlayers();
  res.json(players);
});

export { router as lobbyRouter };
