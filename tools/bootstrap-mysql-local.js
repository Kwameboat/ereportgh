/**
 * One-time: connect as MySQL root and create school_results DB + schoolresults user
 * matching server/.env. Requires MYSQL_BOOTSTRAP_ROOT_PASSWORD in server/.env (or env var).
 *
 * Run: node tools/bootstrap-mysql-local.js
 */
const fs = require('fs');
const path = require('path');
const mysql = require(path.join(__dirname, '..', 'server', 'node_modules', 'mysql2', 'promise'));

const serverDir = path.join(__dirname, '..', 'server');
require(path.join(serverDir, 'node_modules', 'dotenv')).config({
  path: path.join(serverDir, '.env'),
  override: process.env.NODE_ENV !== 'production',
});

const rootPwd = process.env.MYSQL_BOOTSTRAP_ROOT_PASSWORD || '';
const host = process.env.MYSQL_HOST || '127.0.0.1';
const port = parseInt(process.env.MYSQL_PORT || '3306', 10);
const dbName = process.env.MYSQL_DATABASE || 'school_results';
const user = process.env.MYSQL_USER || 'schoolresults';
const pass = process.env.MYSQL_PASSWORD || 'schoolresults';

async function main() {
  if (!rootPwd) {
    console.error(
      'Set MYSQL_BOOTSTRAP_ROOT_PASSWORD in server/.env to your MySQL root password (one-time), then run again.'
    );
    console.error('Remove that line after bootstrap succeeds.');
    process.exit(1);
  }

  let conn;
  try {
    conn = await mysql.createConnection({
      host,
      port,
      user: 'root',
      password: rootPwd,
      multipleStatements: true,
    });
  } catch (e) {
    console.error('Cannot connect as root:', e.message);
    process.exit(1);
  }

  try {
    await conn.query(`CREATE DATABASE IF NOT EXISTS \`${dbName.replace(/`/g, '')}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    await conn.query(
      `CREATE USER IF NOT EXISTS ?@'%' IDENTIFIED BY ?`,
      [user, pass]
    );
    await conn.query(`GRANT ALL PRIVILEGES ON \`${dbName.replace(/`/g, '')}\`.* TO ?@'%'`, [user]);
    await conn.query(`CREATE USER IF NOT EXISTS ?@'localhost' IDENTIFIED BY ?`, [user, pass]);
    await conn.query(`GRANT ALL PRIVILEGES ON \`${dbName.replace(/`/g, '')}\`.* TO ?@'localhost'`, [user]);
    await conn.query('FLUSH PRIVILEGES');
    console.log('Bootstrap OK:', dbName, 'user', user);
  } finally {
    await conn.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
