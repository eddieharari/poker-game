import { Router } from 'express';
import { roomService } from '../services/roomService.js';

const router = Router();

// Check if a room exists and its status — used by clients before opening a socket
router.get('/:id', async (req, res) => {
  const room = await roomService.get(req.params.id);
  if (!room) {
    res.status(404).json({ error: 'Room not found' });
    return;
  }
  res.json({
    roomId: room.roomId,
    status: room.status,
    playerCount: room.player1 ? 2 : 1,
  });
});

export { router as roomRouter };
