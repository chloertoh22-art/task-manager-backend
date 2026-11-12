// Creates the database and the "tasks" table, then adds sample tasks if the table is empty.
// Used by `npm run db:init` (Lab 1) and automatically when the server starts (Lab 2).
// Safe to run many times, even by several containers at once: it never deletes data.
import { readFile } from 'node:fs/promises';
import mysql from 'mysql2/promise';
import { connectionOptions } from './db.js';

const SAMPLE_TASKS = [
  ['Create the RDS MySQL database', 'Private access only; port 3306 open only to the API.', 'done'],
  ['Deploy the API', 'Lab 1: on EC2 with PM2 and Nginx. Lab 2: in a container on Amazon ECS.', 'in_progress'],
  ['Deploy the frontend on Amplify', 'Set VITE_API_URL to the HTTPS address of the API.', 'todo'],
];

export async function setupDatabase({ log = console.log } = {}) {
  const dbName = process.env.DB_NAME || 'taskmanager';
  if (!/^[A-Za-z0-9_]+$/.test(dbName)) {
    throw new Error(`DB_NAME "${dbName}" may only contain letters, numbers and underscores.`);
  }

  const options = connectionOptions();
  log(`Connecting to MySQL at ${options.host}:${options.port} as ${options.user} ...`);
  const connection = await mysql.createConnection({ ...options, multipleStatements: true });

  try {
    // When two containers start at the same time, only one may add the sample tasks.
    const [[{ locked }]] = await connection.query("SELECT GET_LOCK('task_manager_setup', 30) AS locked");
    if (locked !== 1) throw new Error('Another copy of the API is still setting up the database. Will try again.');

    await connection.query(`CREATE DATABASE IF NOT EXISTS \`${dbName}\``);
    await connection.query(`USE \`${dbName}\``);

    const schema = await readFile(new URL('../db/schema.sql', import.meta.url), 'utf8');
    await connection.query(schema);
    log(`✅ Database "${dbName}" and table "tasks" are ready.`);

    const [[{ count }]] = await connection.query('SELECT COUNT(*) AS count FROM tasks');
    if (count === 0) {
      await connection.query('INSERT INTO tasks (title, description, status) VALUES ?', [SAMPLE_TASKS]);
      log(`✅ Added ${SAMPLE_TASKS.length} sample tasks.`);
    } else {
      log(`ℹ️  Table already has ${count} task(s); no sample data added.`);
    }
  } finally {
    await connection.query("SELECT RELEASE_LOCK('task_manager_setup')").catch(() => {});
    await connection.end().catch(() => {});
  }
}
