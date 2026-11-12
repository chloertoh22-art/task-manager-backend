// /api/tasks routes: Create, Read, Update, Delete (CRUD).
// All SQL uses "?" placeholders so user input can never break the query
// (this is how you prevent SQL injection).
import { Router } from 'express';
import { pool } from '../db.js';
import { validateTask, STATUSES } from '../validation.js';

const router = Router();

function parseId(value) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

async function findTask(id) {
  const [rows] = await pool.query('SELECT * FROM tasks WHERE id = ?', [id]);
  return rows[0] || null;
}

// GET /api/tasks            -> all tasks
// GET /api/tasks?status=done -> only tasks with that status
router.get('/', async (req, res) => {
  const status = req.query.status || undefined; // "?status=" means all tasks
  if (status !== undefined && !STATUSES.includes(status)) {
    return res.status(400).json({ error: `Status must be one of: ${STATUSES.join(', ')}.` });
  }

  const [rows] = status
    ? await pool.query('SELECT * FROM tasks WHERE status = ? ORDER BY id DESC', [status])
    : await pool.query('SELECT * FROM tasks ORDER BY id DESC');
  res.json(rows);
});

// GET /api/tasks/:id -> one task
router.get('/:id', async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ error: 'Task id must be a positive number.' });

  const task = await findTask(id);
  if (!task) return res.status(404).json({ error: `Task ${id} not found.` });
  res.json(task);
});

// POST /api/tasks -> create a task
router.post('/', async (req, res) => {
  const { errors, data } = validateTask(req.body);
  if (errors.length) return res.status(400).json({ error: 'Validation failed.', details: errors });

  const [result] = await pool.query(
    'INSERT INTO tasks (title, description, status, due_date) VALUES (?, ?, ?, ?)',
    [data.title, data.description, data.status, data.due_date],
  );
  res.status(201).json(await findTask(result.insertId));
});

// PUT /api/tasks/:id -> replace a task's fields
router.put('/:id', async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ error: 'Task id must be a positive number.' });

  const { errors, data } = validateTask(req.body);
  if (errors.length) return res.status(400).json({ error: 'Validation failed.', details: errors });

  const [result] = await pool.query(
    'UPDATE tasks SET title = ?, description = ?, status = ?, due_date = ? WHERE id = ?',
    [data.title, data.description, data.status, data.due_date, id],
  );
  if (result.affectedRows === 0) return res.status(404).json({ error: `Task ${id} not found.` });
  res.json(await findTask(id));
});

// DELETE /api/tasks/:id -> delete a task
router.delete('/:id', async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ error: 'Task id must be a positive number.' });

  const [result] = await pool.query('DELETE FROM tasks WHERE id = ?', [id]);
  if (result.affectedRows === 0) return res.status(404).json({ error: `Task ${id} not found.` });
  res.status(204).end();
});

export default router;
