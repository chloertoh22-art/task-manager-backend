// PM2 configuration: keeps the API running in the background,
// restarts it if it crashes, and (after `pm2 startup` + `pm2 save`) after a reboot.
// Start it with:  pm2 start ecosystem.config.cjs
module.exports = {
  apps: [
    {
      name: 'task-api',
      script: 'src/server.js',
      cwd: __dirname, // so the .env file in this folder is found
      instances: 1,
      exec_mode: 'fork',
      max_memory_restart: '300M',
      env: {
        NODE_ENV: 'production',
      },
    },
  ],
};
