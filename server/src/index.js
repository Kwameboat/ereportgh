/**
 * School Results API — Express + MySQL
 *
 * --- Local quick start (Docker MySQL) ---
 * 1. From project root: docker compose up -d
 * 2. Copy server/.env.example → server/.env and set MYSQL_* from the "Docker (local)" section.
 * 3. npm install --prefix server && npm run migrate --prefix server && npm run dev --prefix server
 * 4. Open http://localhost:4000/  (admin: see SEED_ADMIN_* in .env)
 *
 * --- Production ---
 * Set NODE_ENV=production, strong JWT_SECRET / EXCEL_API_KEY, https PUBLIC_BASE_URL, TRUST_PROXY=1 behind nginx.
 * pm2 start ecosystem.config.cjs --env production
 */
const fs = require('fs');
const path = require('path');
const { createApp } = require('./app');
const config = require('./config');
const { pool } = require('./db/pool');
const { assertProductionSafeToStart } = require('./utils/production');

assertProductionSafeToStart();

const uploadsRoot = path.join(__dirname, '../uploads');
const reportsDir = path.join(uploadsRoot, 'reports');
if (!fs.existsSync(reportsDir)) {
  fs.mkdirSync(reportsDir, { recursive: true });
}

const app = createApp();
const server = app.listen(config.port, config.host, () => {
  // eslint-disable-next-line no-console
  console.log(`Server listening on http://${config.host}:${config.port} (${config.nodeEnv})`);
});

function shutdown(signal) {
  // eslint-disable-next-line no-console
  console.log(`${signal} received, closing...`);
  server.close(async () => {
    try {
      await pool.end();
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error(e);
    }
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
