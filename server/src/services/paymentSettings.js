const config = require('../config');
const { pool } = require('../db/pool');

async function getSettingValue(key, fallback = '') {
  const [rows] = await pool.query('SELECT `value` FROM app_settings WHERE `key` = ?', [key]);
  if (!rows.length) return fallback;
  return rows[0].value != null ? String(rows[0].value) : fallback;
}

/** Smallest currency unit (e.g. pesewas). DB overrides PAYMENT_AMOUNT_SUBUNIT in .env. */
async function getPaymentAmountSubunit() {
  const raw = await getSettingValue('payment_amount_subunit', '');
  const n = parseInt(raw, 10);
  if (Number.isFinite(n) && n >= 100) return n;
  const env = config.payment.amountSubunit;
  return Number.isFinite(env) && env >= 100 ? env : 1000;
}

async function getPaymentCurrency() {
  const raw = await getSettingValue('payment_currency', '').trim();
  return raw || config.payment.currency || 'GHS';
}

module.exports = { getPaymentAmountSubunit, getPaymentCurrency };
