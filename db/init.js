// Creates the database, the "tasks" table and 3 sample tasks.
// Usage:  npm run db:init
// Safe to run more than once: it never deletes existing data.
// (In a container the server does this by itself at startup; see src/server.js.)
import 'dotenv/config';
import { explainDbError } from '../src/db.js';
import { setupDatabase } from '../src/setup-db.js';

setupDatabase().catch((err) => {
  console.error(`❌ Database setup failed: ${err.code || ''} ${err.message}`);
  console.error(`   Hint: ${explainDbError(err)}`);
  process.exit(1);
});
