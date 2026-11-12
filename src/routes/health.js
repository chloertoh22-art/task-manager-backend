// GET /api/health
// Tells you whether the API is running AND whether it can reach the database.
// This is the first URL to check after every deployment step.
import { hostname } from 'node:os';
import { Router } from 'express';
import { explainDbError, pool } from '../db.js';

const router = Router();

router.get('/', async (req, res) => {
  try {
    await pool.query('SELECT 1 FROM tasks LIMIT 1'); // database reachable AND table exists
    // "server" shows which server/container answered: useful when there are several.
    res.json({ status: 'ok', database: 'ok', server: hostname(), time: new Date().toISOString() });
  } catch (err) {
    console.error('Health check: database error:', err.code || err.message);
    // The error code (e.g. ETIMEDOUT, ER_ACCESS_DENIED_ERROR) helps you debug.
    // See the Troubleshooting section of DEPLOYMENT-GUIDE.md.
    res.status(503).json({
      status: 'error',
      database: 'unreachable',
      code: err.code || 'UNKNOWN',
      hint: explainDbError(err),
      server: hostname(),
    });
  }
});

export default router;
