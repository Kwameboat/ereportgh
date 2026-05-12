const config = require('../config');
const { pool } = require('../db/pool');

async function requireExcelKey(req, res, next) {
  const key = req.headers['x-api-key'];
  const schoolRef = req.headers['x-school-ref'] ? String(req.headers['x-school-ref']).trim().toUpperCase() : '';

  if (key && key === config.excelApiKey) {
    req.school = null; // Backward-compatible global key.
    return next();
  }

  if (!key || !schoolRef) {
    const e = new Error('Invalid or missing X-API-Key');
    e.status = 401;
    return next(e);
  }

  try {
    const [rows] = await pool.query(
      'SELECT id, school_ref, name, is_active FROM schools WHERE school_ref = ? AND api_key = ? LIMIT 1',
      [schoolRef, String(key).trim()]
    );
    if (!rows.length || !rows[0].is_active) {
      const e = new Error('Invalid school credentials or inactive school');
      e.status = 401;
      return next(e);
    }
    req.school = rows[0];
    return next();
  } catch (err) {
    return next(err);
  }
}

module.exports = { requireExcelKey };
