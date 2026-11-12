// Small helpers used when the server starts. Kept separate so they can be unit tested.

// Wait 5s, 10s, 20s, then every 30s between database setup attempts.
export function retryDelayMs(attempt) {
  return Math.min(5000 * 2 ** (attempt - 1), 30000);
}

// One line describing the configuration, for the logs (CloudWatch in Lab 2).
// It never prints the password, only whether one was provided.
export function describeConfig(env = process.env) {
  return [
    `PORT=${env.PORT || 3000}`,
    `DB_HOST=${env.DB_HOST || 'localhost'}`,
    `DB_PORT=${env.DB_PORT || 3306}`,
    `DB_USER=${env.DB_USER || 'root'}`,
    `DB_NAME=${env.DB_NAME || 'taskmanager'}`,
    `DB_SSL=${env.DB_SSL || 'false'}`,
    `DB_PASSWORD=${env.DB_PASSWORD ? '(set)' : '(NOT SET)'}`,
    `CORS_ORIGIN=${env.CORS_ORIGIN || '(any website)'}`,
  ].join('  ');
}
