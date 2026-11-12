// The Express application: middleware + routes + error handling.
// server.js imports this and starts listening; tests import it directly.
import express from 'express';
import cors from 'cors';
import healthRouter from './routes/health.js';
import tasksRouter from './routes/tasks.js';

const app = express();

// CORS: which websites may call this API from the browser.
// CORS_ORIGIN can hold one or more URLs separated by commas, e.g.
//   CORS_ORIGIN=https://main.d1234abcd.amplifyapp.com
// If it's empty, every website is allowed (handy for local development only).
const allowedOrigins = (process.env.CORS_ORIGIN || '')
  .split(',')
  .map((origin) => origin.trim().replace(/\/+$/, '')) // ignore trailing slashes
  .filter(Boolean);

app.use(cors({ origin: allowedOrigins.length ? allowedOrigins : true }));
app.use(express.json());

app.get('/', (req, res) => {
  res.json({
    name: 'Task Manager API',
    version: 1,
    endpoints: ['GET /api/health', 'GET /api/tasks', 'POST /api/tasks', 'PUT /api/tasks/:id', 'DELETE /api/tasks/:id'],
  });
});

app.use('/api/health', healthRouter);
app.use('/api/tasks', tasksRouter);

// Unknown URL
app.use((req, res) => {
  res.status(404).json({ error: `Route ${req.method} ${req.path} not found.` });
});

// Error handler: Express sends any thrown error here.
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'Request body is not valid JSON.' });
  }
  console.error(err);
  res.status(500).json({ error: 'Something went wrong on the server.' });
});

export default app;
