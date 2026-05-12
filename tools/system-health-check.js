/**
 * Thorough local health report: Excel build, DB, API, ingest + PIN workflow.
 * Run from project root: node tools/system-health-check.js
 * Exit 0 only if DB + API checks pass (Excel alone does not imply DB is up).
 */
const fs = require('fs');
const path = require('path');
const http = require('http');
const { spawnSync } = require('child_process');

const root = path.join(__dirname, '..');
const serverDir = path.join(root, 'server');

function loadServerEnv() {
  const dotenv = require(path.join(serverDir, 'node_modules', 'dotenv'));
  dotenv.config({
    path: path.join(serverDir, '.env'),
    override: process.env.NODE_ENV !== 'production',
  });
}

function log(msg) {
  process.stdout.write(`${msg}\n`);
}

function section(title) {
  log(`\n=== ${title} ===`);
}

function runExcelBuild() {
  section('Excel — MARIAM MEM (portal sync)');
  const r = spawnSync(process.execPath, [path.join(root, 'tools', 'configure-mariam-xlsm.js')], {
    cwd: root,
    encoding: 'utf8',
  });
  if (r.stdout) log(r.stdout.trimEnd());
  if (r.stderr) log(r.stderr.trimEnd());
  const desk = path.join(process.env.USERPROFILE || '', 'Desktop', 'MARIAM MEM (portal sync).xlsm');
  const proj = path.join(root, 'MARIAM MEM (portal sync).xlsm');
  const orig = path.join(root, 'MARIAM MEM.xlsm');
  for (const p of [orig, proj, desk]) {
    const ok = fs.existsSync(p);
    log(`${ok ? 'OK' : 'MISS'} ${p}${ok ? ` (${fs.statSync(p).size} bytes)` : ''}`);
  }
  return r.status === 0 && fs.existsSync(proj);
}

async function dbPing() {
  section('Database');
  process.chdir(serverDir);
  loadServerEnv();
  delete require.cache[require.resolve(path.join(serverDir, 'src', 'config', 'index.js'))];
  delete require.cache[require.resolve(path.join(serverDir, 'src', 'db', 'pool.js'))];
  const { pool } = require(path.join(serverDir, 'src', 'db', 'pool'));
  try {
    const [rows] = await pool.query('SELECT 1 AS ok');
    log(`OK  ${JSON.stringify(rows[0])}`);
    return pool;
  } catch (e) {
    log(`FAIL ${e.message}`);
    log('Tip: Start Docker Desktop → docker compose up -d (project root)');
    log('     Then: npm run migrate --prefix server');
    try {
      await pool.end();
    } catch {
      /* ignore */
    }
    return null;
  }
}

function httpGet(url) {
  return new Promise((resolve, reject) => {
    http
      .get(url, (res) => {
        let body = '';
        res.on('data', (c) => {
          body += c;
        });
        res.on('end', () => resolve({ status: res.statusCode, body }));
      })
      .on('error', reject);
  });
}

function httpPostJson(url, json, headers = {}) {
  const u = new URL(url);
  const data = Buffer.from(JSON.stringify(json), 'utf8');
  const opts = {
    hostname: u.hostname,
    port: u.port || 80,
    path: u.pathname + u.search,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': data.length,
      ...headers,
    },
  };
  return new Promise((resolve, reject) => {
    const req = http.request(opts, (res) => {
      let body = '';
      res.on('data', (c) => {
        body += c;
      });
      res.on('end', () => resolve({ status: res.statusCode, body }));
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

async function workflowApi(pool, excelOk) {
  section('API + workflow (needs running server on PORT)');
  loadServerEnv();
  const port = String(process.env.PORT || '4000');
  const base = `http://127.0.0.1:${port}`;
  let health;
  try {
    health = await httpGet(`${base}/api/health`);
  } catch (e) {
    log(`FAIL  Cannot reach ${base}/api/health — ${e.message}`);
    log('Tip: npm start --prefix server   (in another terminal)');
    return false;
  }
  log(`GET /api/health → HTTP ${health.status}`);
  log(health.body.slice(0, 500));

  if (!pool) return false;
  if (health.status !== 200) return false;

  const { upsertStudentWithResults } = require(path.join(serverDir, 'src', 'services', 'studentIngest'));
  const sample = {
    school: {
      name: 'Healthcheck Memorial School',
      address: 'Test',
      examTitle: 'HEALTH CHECK TERM',
    },
    meta: { term: 'HEALTH', year: '2099', month: 'APRIL' },
    students: [
      {
        studentId: 'HC-9999',
        name: 'Health Check Student',
        className: '1',
        subjects: [{ subjectName: 'TEST', classScore: 10, examScore: 10, totalScore: 20, position: '1', remark: 'OK' }],
      },
    ],
  };

  section('In-memory ingest (same as /api/excel/ingest)');
  let ingestOut;
  try {
    ingestOut = await upsertStudentWithResults(sample);
    log(`OK  processed: ${JSON.stringify(ingestOut)}`);
  } catch (e) {
    log(`FAIL ${e.message}`);
    return false;
  }

  const pin = 'SR-HEALTHCHK01';
  await pool.query('DELETE FROM pins WHERE pin_code = ?', [pin]);
  await pool.query(
    'INSERT INTO pins (pin_code, is_used, student_id_bound, payment_id, batch_note) VALUES (?, 0, ?, NULL, ?)',
    [pin, 'HC-9999', 'health-check']
  );

  section('Public validate-pin (HTTP)');
  const val = await httpPostJson(`${base}/api/public/validate-pin`, {
    studentId: 'HC-9999',
    pin,
    term: 'HEALTH',
    year: '2099',
  });
  log(`POST /api/public/validate-pin → HTTP ${val.status}`);
  log(val.body.slice(0, 600));

  const ok = val.status === 200 && val.body.includes('"pdfUrl"');
  if (ok) {
    log('\nWorkflow OK: ingest → PIN → validate-pin returned PDF URL.');
  } else {
    log('\nWorkflow incomplete: check response above.');
  }
  return ok;
}

async function main() {
  log('School Results — system health check');
  log(`Time: ${new Date().toISOString()}`);

  const excelOk = runExcelBuild();

  const pool = await dbPing();
  if (!pool) {
    loadServerEnv();
    const port = String(process.env.PORT || '4000');
    section('API (process may still be running without DB)');
    try {
      const health = await httpGet(`http://127.0.0.1:${port}/api/health`);
      log(`GET /api/health → HTTP ${health.status}`);
      log(health.body);
    } catch (e) {
      log(`Unreachable: ${e.message} (start server: npm start --prefix server)`);
    }
    log(`\nSummary: Excel=${excelOk ? 'OK' : 'FAIL'}  DB=FAIL  API=see above`);
    log('Fix DB: start Docker Desktop → docker compose up -d → npm run migrate --prefix server');
    process.exit(1);
  }

  let apiOk = false;
  try {
    apiOk = await workflowApi(pool, excelOk);
  } finally {
    try {
      await pool.end();
    } catch {
      /* ignore */
    }
  }

  log(`\nSummary: Excel=${excelOk ? 'OK' : 'FAIL'}  DB=OK  API/workflow=${apiOk ? 'OK' : 'FAIL'}`);
  process.exit(apiOk ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
