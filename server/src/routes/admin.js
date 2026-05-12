const express = require('express');
const rateLimit = require('express-rate-limit');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const config = require('../config');
const { pool } = require('../db/pool');
const { asyncHandler } = require('../middleware/errorHandler');
const { requireAdmin, signAdminToken } = require('../middleware/auth');
const { regeneratePdfForDbId } = require('../services/studentIngest');
const { makePinCode } = require('../services/paystackService');

const router = express.Router();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { ok: false, error: 'Too many login attempts, try again later' },
  standardHeaders: true,
  legacyHeaders: false,
});

function requireSuperadmin(req, res, next) {
  if (!req.admin || req.admin.role !== 'superadmin') {
    const e = new Error('Superadmin access required');
    e.status = 403;
    return next(e);
  }
  return next();
}

async function getSettingInt(key, fallback) {
  const [rows] = await pool.query('SELECT `value` FROM app_settings WHERE `key` = ?', [key]);
  if (!rows.length) return fallback;
  const n = parseInt(rows[0].value, 10);
  return Number.isFinite(n) ? n : fallback;
}

async function getSettingValue(key, fallback = '') {
  const [rows] = await pool.query('SELECT `value` FROM app_settings WHERE `key` = ?', [key]);
  if (!rows.length) return fallback;
  return rows[0].value != null ? String(rows[0].value) : fallback;
}

function generateSchoolRef() {
  return `SCH-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
}

function generateSchoolApiKey() {
  return `sk_${crypto.randomBytes(24).toString('hex')}`;
}

router.post('/login', loginLimiter, asyncHandler(async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) {
    const e = new Error('username and password required');
    e.status = 400;
    throw e;
  }
  let rows;
  try {
    [rows] = await pool.query('SELECT * FROM admins WHERE username = ?', [String(username)]);
  } catch (dbErr) {
    // eslint-disable-next-line no-console
    console.error('admin login DB error', dbErr.code || '', dbErr.message);
    const e = new Error(
      'Could not connect to the database. Set MYSQL_HOST, MYSQL_USER, MYSQL_PASSWORD, and MYSQL_DATABASE in cPanel (Node.js app → Environment variables) to match server/.env, quote the password if it contains @, restart the app, then open /api/health.'
    );
    e.status = 503;
    throw e;
  }
  if (!rows.length) {
    const e = new Error('Invalid credentials');
    e.status = 401;
    throw e;
  }
  const admin = rows[0];
  if (!admin.is_active) {
    const e = new Error('Account is disabled');
    e.status = 403;
    throw e;
  }
  const ok = await bcrypt.compare(String(password), admin.password_hash);
  if (!ok) {
    const e = new Error('Invalid credentials');
    e.status = 401;
    throw e;
  }
  const token = signAdminToken({ id: admin.id, username: admin.username, role: admin.role });
  res.json({ ok: true, token, admin: { id: admin.id, username: admin.username, role: admin.role } });
}));

router.get('/me', requireAdmin, asyncHandler(async (req, res) => {
  res.json({ ok: true, admin: req.admin });
}));

router.get('/analytics', requireAdmin, asyncHandler(async (req, res) => {
  const [[stu]] = await pool.query('SELECT COUNT(*) AS c FROM students');
  const [[pinsTotal]] = await pool.query('SELECT COUNT(*) AS c FROM pins');
  const [[pinsUsed]] = await pool.query('SELECT COUNT(*) AS c FROM pins WHERE is_used = 1');
  const [[payOk]] = await pool.query("SELECT COUNT(*) AS c, COALESCE(SUM(amount),0) AS revenue FROM payments WHERE status = 'success'");
  res.json({
    ok: true,
    students: stu.c,
    pins: { total: pinsTotal.c, used: pinsUsed.c, unused: pinsTotal.c - pinsUsed.c },
    payments: { successful: payOk.c, revenue: payOk.revenue },
  });
}));

router.get('/students', requireAdmin, asyncHandler(async (req, res) => {
  const q = req.query.q ? `%${String(req.query.q).trim()}%` : null;
  const page = Math.max(1, parseInt(req.query.page || '1', 10));
  const pageSize = Math.min(50, Math.max(5, parseInt(req.query.pageSize || '20', 10)));
  const offset = (page - 1) * pageSize;
  let where = '1=1';
  const params = [];
  if (q) {
    where += ' AND (student_id LIKE ? OR name LIKE ? OR class_name LIKE ?)';
    params.push(q, q, q);
  }
  const [rows] = await pool.query(
    `SELECT id, student_id, school_ref, name, class_name, term, year, school_name, pdf_url, created_at, updated_at
     FROM students WHERE ${where} ORDER BY updated_at DESC LIMIT ? OFFSET ?`,
    [...params, pageSize, offset]
  );
  const [[{ c }]] = await pool.query(`SELECT COUNT(*) AS c FROM students WHERE ${where}`, params);
  res.json({ ok: true, page, pageSize, total: c, students: rows });
}));

router.get('/students/:id', requireAdmin, asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const [rows] = await pool.query('SELECT * FROM students WHERE id = ?', [id]);
  if (!rows.length) {
    const e = new Error('Not found');
    e.status = 404;
    throw e;
  }
  const [results] = await pool.query(
    'SELECT * FROM results WHERE student_db_id = ? ORDER BY sort_order',
    [id]
  );
  res.json({ ok: true, student: rows[0], results });
}));

router.delete('/students/:id', requireAdmin, asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  await pool.query('DELETE FROM students WHERE id = ?', [id]);
  res.json({ ok: true });
}));

router.post('/students/:id/regenerate-pdf', requireAdmin, asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const out = await regeneratePdfForDbId(id);
  res.json({ ok: true, ...out });
}));

router.post('/pins/bulk', requireAdmin, asyncHandler(async (req, res) => {
  const count = parseInt(req.body?.count || '0', 10);
  const batchNote = req.body?.batchNote ? String(req.body.batchNote).slice(0, 255) : null;
  const studentIdBound = req.body?.studentIdBound != null ? String(req.body.studentIdBound).trim() : null;
  if (count < 1 || count > 500) {
    const e = new Error('count must be between 1 and 500');
    e.status = 400;
    throw e;
  }
  const codes = [];
  const conn = await pool.getConnection();
  try {
    for (let i = 0; i < count; i += 1) {
      let pinCode = makePinCode();
      for (let attempt = 0; attempt < 8; attempt += 1) {
        try {
          await conn.query(
            'INSERT INTO pins (pin_code, is_used, student_id_bound, batch_note) VALUES (?,0,?,?)',
            [pinCode, studentIdBound || null, batchNote]
          );
          codes.push(pinCode);
          break;
        } catch (err) {
          if (err.code === 'ER_DUP_ENTRY') pinCode = makePinCode();
          else throw err;
        }
      }
    }
  } finally {
    conn.release();
  }
  res.json({ ok: true, pins: codes });
}));

router.get('/pins', requireAdmin, asyncHandler(async (req, res) => {
  const used = req.query.used;
  let where = '1=1';
  const params = [];
  if (used === '1' || used === 'true') where += ' AND is_used = 1';
  if (used === '0' || used === 'false') where += ' AND is_used = 0';
  const [rows] = await pool.query(
    `SELECT id, pin_code, is_used, used_by_student_id, used_at, student_id_bound, payment_id, batch_note, created_at
     FROM pins WHERE ${where} ORDER BY id DESC LIMIT 500`,
    params
  );
  res.json({ ok: true, pins: rows });
}));

router.get('/payments', requireAdmin, asyncHandler(async (req, res) => {
  const [rows] = await pool.query(
    'SELECT id, email, amount, currency, reference, status, student_id_requested, created_at FROM payments ORDER BY id DESC LIMIT 200'
  );
  res.json({ ok: true, payments: rows });
}));

router.get('/users', requireAdmin, requireSuperadmin, asyncHandler(async (req, res) => {
  const [rows] = await pool.query(
    'SELECT id, username, role, is_active, created_at FROM admins ORDER BY created_at ASC'
  );
  res.json({ ok: true, users: rows });
}));

router.post('/users', requireAdmin, requireSuperadmin, asyncHandler(async (req, res) => {
  const username = String(req.body?.username || '').trim();
  const password = String(req.body?.password || '');
  const role = String(req.body?.role || 'admin') === 'superadmin' ? 'superadmin' : 'admin';
  const isActive = req.body?.isActive === false ? 0 : 1;

  if (!/^[a-zA-Z0-9_.-]{3,100}$/.test(username)) {
    const e = new Error('username must be 3-100 chars (letters, numbers, _, ., -)');
    e.status = 400;
    throw e;
  }
  if (password.length < 8) {
    const e = new Error('password must be at least 8 characters');
    e.status = 400;
    throw e;
  }

  const maxAdmins = await getSettingInt('max_admin_users', 5);
  const [[{ c }]] = await pool.query('SELECT COUNT(*) AS c FROM admins');
  if (c >= maxAdmins) {
    const e = new Error(`Admin user limit reached (${maxAdmins})`);
    e.status = 400;
    throw e;
  }

  const hash = await bcrypt.hash(password, 12);
  await pool.query(
    'INSERT INTO admins (username, password_hash, role, is_active) VALUES (?, ?, ?, ?)',
    [username, hash, role, isActive]
  );
  res.json({ ok: true });
}));

router.patch('/users/:id', requireAdmin, requireSuperadmin, asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isFinite(id)) {
    const e = new Error('invalid user id');
    e.status = 400;
    throw e;
  }
  const [rows] = await pool.query('SELECT id, role FROM admins WHERE id = ?', [id]);
  if (!rows.length) {
    const e = new Error('User not found');
    e.status = 404;
    throw e;
  }
  const user = rows[0];
  if (user.id === req.admin.id && req.body?.isActive === false) {
    const e = new Error('You cannot disable your own account');
    e.status = 400;
    throw e;
  }

  const fields = [];
  const values = [];
  if (req.body?.role) {
    const role = String(req.body.role) === 'superadmin' ? 'superadmin' : 'admin';
    fields.push('role = ?');
    values.push(role);
  }
  if (typeof req.body?.isActive === 'boolean') {
    fields.push('is_active = ?');
    values.push(req.body.isActive ? 1 : 0);
  }
  if (req.body?.password != null) {
    const password = String(req.body.password);
    if (password.length < 8) {
      const e = new Error('password must be at least 8 characters');
      e.status = 400;
      throw e;
    }
    const hash = await bcrypt.hash(password, 12);
    fields.push('password_hash = ?');
    values.push(hash);
  }
  if (!fields.length) {
    const e = new Error('No changes provided');
    e.status = 400;
    throw e;
  }
  values.push(id);
  await pool.query(`UPDATE admins SET ${fields.join(', ')} WHERE id = ?`, values);
  res.json({ ok: true });
}));

router.get('/settings', requireAdmin, requireSuperadmin, asyncHandler(async (req, res) => {
  const [rows] = await pool.query('SELECT `key`, `value`, updated_at FROM app_settings ORDER BY `key`');
  const out = {};
  rows.forEach((r) => {
    out[r.key] = r.value;
  });
  res.json({ ok: true, settings: out });
}));

router.put('/settings', requireAdmin, requireSuperadmin, asyncHandler(async (req, res) => {
  const maxAdminUsers = parseInt(req.body?.maxAdminUsers, 10);
  const defaultPinBatchCount = parseInt(req.body?.defaultPinBatchCount, 10);
  const dashboardAutoRefreshSec = parseInt(req.body?.dashboardAutoRefreshSec, 10);
  if (!Number.isFinite(maxAdminUsers) || maxAdminUsers < 1 || maxAdminUsers > 100) {
    const e = new Error('maxAdminUsers must be between 1 and 100');
    e.status = 400;
    throw e;
  }
  if (!Number.isFinite(defaultPinBatchCount) || defaultPinBatchCount < 1 || defaultPinBatchCount > 500) {
    const e = new Error('defaultPinBatchCount must be between 1 and 500');
    e.status = 400;
    throw e;
  }
  if (!Number.isFinite(dashboardAutoRefreshSec) || dashboardAutoRefreshSec < 0 || dashboardAutoRefreshSec > 3600) {
    const e = new Error('dashboardAutoRefreshSec must be between 0 and 3600');
    e.status = 400;
    throw e;
  }
  const updates = [
    ['max_admin_users', String(maxAdminUsers)],
    ['default_pin_batch_count', String(defaultPinBatchCount)],
    ['dashboard_auto_refresh_sec', String(dashboardAutoRefreshSec)],
  ];
  for (const [key, value] of updates) {
    await pool.query(
      'INSERT INTO app_settings (`key`, `value`) VALUES (?, ?) ON DUPLICATE KEY UPDATE `value` = VALUES(`value`)',
      [key, value]
    );
  }
  res.json({ ok: true });
}));

router.get('/settings/paystack', requireAdmin, asyncHandler(async (req, res) => {
  const secretKey = await getSettingValue('paystack_secret_key', config.paystack.secretKey || '');
  const callbackUrl = await getSettingValue('paystack_callback_url', config.paystack.callbackUrl || '');
  const maskedSecret =
    secretKey && secretKey.length > 8
      ? `${secretKey.slice(0, 4)}${'*'.repeat(Math.max(0, secretKey.length - 8))}${secretKey.slice(-4)}`
      : secretKey
        ? '********'
        : '';
  res.json({
    ok: true,
    paystack: {
      hasSecretKey: !!secretKey,
      secretKeyMasked: maskedSecret,
      callbackUrl,
    },
  });
}));

router.put('/settings/paystack', requireAdmin, asyncHandler(async (req, res) => {
  const secretKeyInput = req.body?.secretKey != null ? String(req.body.secretKey).trim() : null;
  const callbackUrlInput = req.body?.callbackUrl != null ? String(req.body.callbackUrl).trim() : null;
  const clearSecretKey = req.body?.clearSecretKey === true;
  const clearCallbackUrl = req.body?.clearCallbackUrl === true;
  const currentSecret = await getSettingValue('paystack_secret_key', config.paystack.secretKey || '');

  let secretToSave = currentSecret;
  if (clearSecretKey) {
    secretToSave = '';
  } else if (secretKeyInput != null) {
    if (secretKeyInput !== '' && secretKeyInput.length < 12) {
      const e = new Error('Paystack secret key looks too short');
      e.status = 400;
      throw e;
    }
    if (secretKeyInput !== '') {
      secretToSave = secretKeyInput;
    }
  }

  if (!clearCallbackUrl && callbackUrlInput != null && callbackUrlInput !== '') {
    const isHttp = /^https?:\/\//i.test(callbackUrlInput);
    if (!isHttp) {
      const e = new Error('callbackUrl must start with http:// or https://');
      e.status = 400;
      throw e;
    }
  }
  const callbackToSave = clearCallbackUrl
    ? ''
    : callbackUrlInput != null
      ? callbackUrlInput
      : await getSettingValue('paystack_callback_url', config.paystack.callbackUrl || '');

  await pool.query(
    'INSERT INTO app_settings (`key`, `value`) VALUES (?, ?) ON DUPLICATE KEY UPDATE `value` = VALUES(`value`)',
    ['paystack_secret_key', secretToSave]
  );
  await pool.query(
    'INSERT INTO app_settings (`key`, `value`) VALUES (?, ?) ON DUPLICATE KEY UPDATE `value` = VALUES(`value`)',
    ['paystack_callback_url', callbackToSave]
  );
  res.json({ ok: true });
}));

router.get('/schools', requireAdmin, asyncHandler(async (req, res) => {
  const [rows] = await pool.query(
    'SELECT id, school_ref, name, address, contact_email, contact_phone, is_active, created_at FROM schools ORDER BY created_at DESC'
  );
  res.json({ ok: true, schools: rows });
}));

router.post('/schools', requireAdmin, asyncHandler(async (req, res) => {
  const name = String(req.body?.name || '').trim();
  const address = req.body?.address != null ? String(req.body.address).trim() : null;
  const contactEmail = req.body?.contactEmail != null ? String(req.body.contactEmail).trim() : null;
  const contactPhone = req.body?.contactPhone != null ? String(req.body.contactPhone).trim() : null;
  if (!name) {
    const e = new Error('School name is required');
    e.status = 400;
    throw e;
  }
  let schoolRef = '';
  let apiKey = '';
  const conn = await pool.getConnection();
  try {
    for (let i = 0; i < 8; i += 1) {
      schoolRef = generateSchoolRef();
      apiKey = generateSchoolApiKey();
      try {
        await conn.query(
          `INSERT INTO schools (school_ref, name, address, contact_email, contact_phone, api_key, is_active)
           VALUES (?, ?, ?, ?, ?, ?, 1)`,
          [schoolRef, name, address, contactEmail, contactPhone, apiKey]
        );
        res.json({ ok: true, school: { schoolRef, apiKey, name } });
        return;
      } catch (err) {
        if (err.code !== 'ER_DUP_ENTRY') throw err;
      }
    }
    const e = new Error('Could not generate unique school reference, try again');
    e.status = 500;
    throw e;
  } finally {
    conn.release();
  }
}));

router.patch('/schools/:id', requireAdmin, asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isFinite(id)) {
    const e = new Error('Invalid school id');
    e.status = 400;
    throw e;
  }
  const fields = [];
  const values = [];
  if (req.body?.name != null) {
    fields.push('name = ?');
    values.push(String(req.body.name).trim());
  }
  if (req.body?.address != null) {
    fields.push('address = ?');
    values.push(String(req.body.address).trim());
  }
  if (req.body?.contactEmail != null) {
    fields.push('contact_email = ?');
    values.push(String(req.body.contactEmail).trim());
  }
  if (req.body?.contactPhone != null) {
    fields.push('contact_phone = ?');
    values.push(String(req.body.contactPhone).trim());
  }
  if (typeof req.body?.isActive === 'boolean') {
    fields.push('is_active = ?');
    values.push(req.body.isActive ? 1 : 0);
  }
  if (req.body?.regenerateApiKey === true) {
    fields.push('api_key = ?');
    values.push(generateSchoolApiKey());
  }
  if (!fields.length) {
    const e = new Error('No updates provided');
    e.status = 400;
    throw e;
  }
  values.push(id);
  await pool.query(`UPDATE schools SET ${fields.join(', ')} WHERE id = ?`, values);
  const [rows] = await pool.query(
    'SELECT id, school_ref, name, address, contact_email, contact_phone, is_active, api_key FROM schools WHERE id = ? LIMIT 1',
    [id]
  );
  if (!rows.length) {
    const e = new Error('School not found');
    e.status = 404;
    throw e;
  }
  const r = rows[0];
  res.json({
    ok: true,
    school: {
      id: r.id,
      schoolRef: r.school_ref,
      name: r.name,
      address: r.address,
      contactEmail: r.contact_email,
      contactPhone: r.contact_phone,
      isActive: !!r.is_active,
      apiKey: req.body?.regenerateApiKey === true ? r.api_key : undefined,
    },
  });
}));

module.exports = router;
