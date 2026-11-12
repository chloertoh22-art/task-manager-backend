// Entry point: load settings, start the web server, then prepare the database.
import 'dotenv/config';
import app from './app.js';
import { explainDbError, pool } from './db.js';
import { setupDatabase } from './setup-db.js';
import { describeConfig, retryDelayMs } from './startup.js';

const PORT = Number(process.env.PORT) || 3000;

console.log(`Starting Task Manager API. Config: ${describeConfig()}`);

const server = app.listen(PORT, (err) => {
  if (err) {
    // e.g. EADDRINUSE: another program (or a second copy of the API) already uses this port
    console.error(`❌ Cannot listen on port ${PORT}: ${err.message}`);
    process.exit(1);
  }
  console.log(`Task Manager API listening on port ${PORT}`);
});

// Create the table and sample data automatically (set DB_AUTO_SETUP=false to skip).
// If the database isn't reachable yet (still starting, or a firewall rule is missing),
// keep retrying in the background. The API keeps running meanwhile, and
// /api/health shows the database error so you can fix it.
let stopping = false;
async function prepareDatabase(attempt = 1) {
  try {
    await setupDatabase();
  } catch (err) {
    if (stopping) return;
    const delay = retryDelayMs(attempt);
    console.error(`❌ Database setup failed (attempt ${attempt}): ${err.code || ''} ${err.message}`);
    console.error(`   Hint: ${explainDbError(err)}`);
    console.error(`   Retrying in ${delay / 1000} seconds...`);
    setTimeout(() => prepareDatabase(attempt + 1), delay).unref();
  }
}
if (String(process.env.DB_AUTO_SETUP).toLowerCase() !== 'false') prepareDatabase();

// Shut down cleanly when stopped: ECS (and `docker stop`) send SIGTERM,
// Ctrl+C sends SIGINT. Finish open requests, close DB connections, then exit.
function shutdown(signal) {
  if (stopping) return;
  stopping = true;
  console.log(`${signal} received: shutting down...`);
  setTimeout(() => process.exit(1), 10000).unref(); // give up after 10 seconds
  server.close(async () => {
    await pool.end().catch(() => {});
    console.log('Shutdown complete.');
    process.exit(0);
  });
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
