import { Router } from 'express';
import { getProgress } from '../progress.js';

export function progressRouter() {
  const router = Router();

  // Always answers 200: an unknown id just means "nothing running (yet)". This avoids
  // red 404 lines in the browser console while the UI polls.
  router.get('/:id', (req, res) => {
    res.json(getProgress(req.params.id));
  });

  return router;
}
