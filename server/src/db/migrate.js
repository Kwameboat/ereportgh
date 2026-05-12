/**
 * Run: npm run migrate
 * Requires MySQL running and MYSQL_* vars in .env (see .env.example).
 * Retries on connection errors so Docker MySQL can finish starting.
 */
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const { pool } = require('./pool');
const config = require('../config');

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function migrate() {
  const sqlPath = path.join(__dirname, 'schema.sql');
  const sql = fs.readFileSync(sqlPath, 'utf8');
  const statements = sql
    .split(';')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  const maxAttempts = 25;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    let conn;
    try {
      conn = await pool.getConnection();
      try {
        for (const st of statements) {
          await conn.query(st);
        }
        // Backfill schema changes for existing databases.
        try {
          await conn.query('ALTER TABLE admins ADD COLUMN is_active TINYINT(1) NOT NULL DEFAULT 1');
        } catch (e) {
          if (e.code !== 'ER_DUP_FIELDNAME') throw e;
        }
        try {
          await conn.query('ALTER TABLE students ADD COLUMN school_ref VARCHAR(32) NULL AFTER student_id');
        } catch (e) {
          if (e.code !== 'ER_DUP_FIELDNAME') throw e;
        }
        try {
          await conn.query('ALTER TABLE students ADD INDEX idx_students_school_ref (school_ref)');
        } catch (e) {
          if (e.code !== 'ER_DUP_KEYNAME') throw e;
        }
        await conn.query(
          `INSERT INTO app_settings (\`key\`, \`value\`) VALUES
            ('max_admin_users', '5'),
            ('default_pin_batch_count', '10'),
            ('dashboard_auto_refresh_sec', '60')
          ON DUPLICATE KEY UPDATE \`value\` = \`value\``
        );
        const [rows] = await conn.query('SELECT COUNT(*) AS c FROM admins');
        if (rows[0].c === 0) {
          const hash = await bcrypt.hash(config.seedAdmin.password, 12);
          await conn.query(
            'INSERT INTO admins (username, password_hash, role) VALUES (?, ?, ?)',
            [config.seedAdmin.username, hash, 'superadmin']
          );
          // eslint-disable-next-line no-console
          console.log('Seeded default admin:', config.seedAdmin.username);
        }
      } finally {
        conn.release();
      }
      await pool.end();
      // eslint-disable-next-line no-console
      console.log('Migration complete.');
      return;
    } catch (err) {
      if (conn) {
        try {
          conn.release();
        } catch {
          /* ignore */
        }
      }
      const retryable =
        err.code === 'ECONNREFUSED' ||
        err.code === 'ETIMEDOUT' ||
        err.code === 'PROTOCOL_CONNECTION_LOST' ||
        err.errno === -4078;
      if (retryable && attempt < maxAttempts - 1) {
        // eslint-disable-next-line no-console
        console.log(`Waiting for MySQL (${attempt + 1}/${maxAttempts})...`);
        await sleep(2000);
      } else {
        try {
          await pool.end();
        } catch {
          /* ignore */
        }
        throw err;
      }
    }
  }
}

migrate().catch((e) => {
  // eslint-disable-next-line no-console
  console.error(e);
  process.exit(1);
});
