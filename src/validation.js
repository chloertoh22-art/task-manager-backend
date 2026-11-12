// Input validation for tasks.
// Keeping it in its own file means we can unit test it without a database.

export const STATUSES = ['todo', 'in_progress', 'done'];

const TITLE_MAX = 255;
const DESCRIPTION_MAX = 5000;

function isValidDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  // Rejects impossible dates like 2026-02-31 (JS would roll them over to March)
  return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(value);
}

/**
 * Validates a task from a request body.
 * Returns { errors: string[], data: { title, description, status, due_date } }.
 * If errors is empty, `data` is clean and safe to save.
 */
export function validateTask(body) {
  const errors = [];
  const input = body && typeof body === 'object' ? body : {};

  // title: required, 1-255 characters
  const title = typeof input.title === 'string' ? input.title.trim() : '';
  if (!title) {
    errors.push('Title is required.');
  } else if (title.length > TITLE_MAX) {
    errors.push(`Title must be at most ${TITLE_MAX} characters.`);
  }

  // description: optional text
  let description = null;
  if (input.description !== undefined && input.description !== null) {
    if (typeof input.description !== 'string') {
      errors.push('Description must be text.');
    } else if (input.description.length > DESCRIPTION_MAX) {
      errors.push(`Description must be at most ${DESCRIPTION_MAX} characters.`);
    } else {
      description = input.description.trim() || null;
    }
  }

  // status: optional, defaults to "todo"
  const status = input.status ?? 'todo';
  if (!STATUSES.includes(status)) {
    errors.push(`Status must be one of: ${STATUSES.join(', ')}.`);
  }

  // due_date: optional, format YYYY-MM-DD
  let dueDate = null;
  if (input.due_date !== undefined && input.due_date !== null && input.due_date !== '') {
    if (typeof input.due_date !== 'string' || !isValidDate(input.due_date)) {
      errors.push('Due date must be a valid date in the format YYYY-MM-DD.');
    } else {
      dueDate = input.due_date;
    }
  }

  return { errors, data: { title, description, status, due_date: dueDate } };
}
