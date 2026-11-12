// MySQL connection pool.
// A pool keeps a few connections open and reuses them, which is much faster
// than opening a new connection for every request.
import { readFileSync } from 'node:fs';
import mysql from 'mysql2/promise';

// AWS's public certificate bundle for RDS (all regions), downloaded from
// https://truststore.pki.rds.amazonaws.com/global/global-bundle.pem
// With it, the app can check that it is really talking to your RDS database.
const RDS_CA_BUNDLE = new URL('../certs/rds-global-bundle.pem', import.meta.url);

function sslOptions() {
  // On AWS RDS set DB_SSL=true so traffic between EC2 and RDS is encrypted.
  // Locally (MySQL on your own computer) keep DB_SSL=false.
  if (String(process.env.DB_SSL).trim().toLowerCase() !== 'true') return undefined;
  return { ca: readFileSync(RDS_CA_BUNDLE, 'utf8'), rejectUnauthorized: true };
}

// Settings shared by the API and the db:init script.
export function connectionOptions() {
  return {
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    ssl: sslOptions(),
    // Return DATE/DATETIME columns as plain strings (e.g. "2026-11-30").
    // This avoids time-zone surprises where a due date shifts by one day.
    dateStrings: true,
    connectTimeout: 10000,
  };
}

export const pool = mysql.createPool({
  ...connectionOptions(),
  database: process.env.DB_NAME || 'taskmanager',
  waitForConnections: true,
  connectionLimit: 10,
});

// Explains the most common database errors in plain words.
export function explainDbError(err) {
  const hints = {
    ETIMEDOUT: 'No answer from the database. Check that the RDS security group (task-db-sg) allows port 3306 from the API\'s security group (task-api-sg), and that RDS and the API are in the same region and VPC.',
    ECONNREFUSED: 'Nothing is listening at DB_HOST:DB_PORT. Locally: is MySQL running? On AWS: check DB_HOST is the RDS endpoint.',
    ENOTFOUND: 'DB_HOST is not a known host name. Copy the endpoint again from the RDS console.',
    ER_ACCESS_DENIED_ERROR: 'Wrong DB_USER or DB_PASSWORD.',
    ER_BAD_DB_ERROR: 'The database in DB_NAME does not exist yet. The API creates it at startup (check the logs), or run: npm run db:init',
    ER_DBACCESS_DENIED_ERROR: 'DB_USER may not use the database in DB_NAME (or it does not exist). Check DB_NAME, then run: npm run db:init',
    ER_NO_SUCH_TABLE: 'The tasks table does not exist yet. The API creates it within 30 seconds of the database becoming reachable (check the logs), or run: npm run db:init',
    HANDSHAKE_SSL_ERROR: 'SSL problem. Use DB_SSL=true only for AWS RDS and DB_SSL=false for a local MySQL.',
    HANDSHAKE_NO_SSL_SUPPORT: 'The server does not support SSL. Set DB_SSL=false for a local MySQL.',
    ER_SECURE_TRANSPORT_REQUIRED: 'The database only accepts encrypted connections. Set DB_SSL=true.',
  };
  return hints[err.code] || 'Check DB_HOST, DB_USER, DB_PASSWORD, DB_NAME and DB_SSL (in .env, or in the ECS service\'s environment variables).';
}
