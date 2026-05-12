/**
 * PM2 (production): pm2 start ecosystem.config.cjs
 * Set env in server/.env or use pm2 ecosystem env block.
 */
module.exports = {
  apps: [
    {
      name: 'school-results',
      cwd: __dirname,
      script: 'src/index.js',
      instances: 1,
      autorestart: true,
      max_memory_restart: '400M',
      env_production: {
        NODE_ENV: 'production',
      },
    },
  ],
};
