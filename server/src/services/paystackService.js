const { randomUUID } = require('crypto');
const config = require('../config');
const { pool } = require('../db/pool');

async function getRuntimePaystackConfig() {
  const [rows] = await pool.query(
    "SELECT `key`, `value` FROM app_settings WHERE `key` IN ('paystack_secret_key', 'paystack_callback_url')"
  );
  const map = {};
  rows.forEach((r) => {
    map[r.key] = r.value != null ? String(r.value) : '';
  });
  return {
    secretKey: map.paystack_secret_key || config.paystack.secretKey || '',
    callbackUrl: map.paystack_callback_url || config.paystack.callbackUrl || '',
  };
}

function extractMetadataFromPaymentRow(pay) {
  try {
    const raw = pay.paystack_data;
    if (!raw) return {};
    const d = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return d.metadata && typeof d.metadata === 'object' ? d.metadata : {};
  } catch {
    return {};
  }
}

function makeReference() {
  return `PAY_${randomUUID().replace(/-/g, '').slice(0, 20)}`;
}

function makePinCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = 'SR-';
  for (let i = 0; i < 10; i += 1) {
    s += chars[Math.floor(Math.random() * chars.length)];
  }
  return s;
}

/**
 * amountSubunit: Paystack expects smallest currency unit (e.g. pesewas for GHS, kobo for NGN).
 */
async function initializeTransaction({
  email,
  amountSubunit,
  currency,
  studentId,
  term,
  year,
  callbackUrl,
}) {
  const paystackCfg = await getRuntimePaystackConfig();
  if (!paystackCfg.secretKey) {
    const e = new Error('Paystack is not configured');
    e.status = 503;
    throw e;
  }
  const reference = makeReference();
  const meta = {
    student_id: studentId != null && studentId !== '' ? String(studentId) : '',
    term: term != null && term !== '' ? String(term).trim() : '',
    year: year != null && year !== '' ? String(year).trim() : '',
  };
  const body = {
    email: email || 'customer@example.com',
    amount: amountSubunit,
    currency: currency || 'GHS',
    reference,
    metadata: meta,
  };
  const cb = callbackUrl || paystackCfg.callbackUrl;
  if (cb) body.callback_url = cb;

  const res = await fetch('https://api.paystack.co/transaction/initialize', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${paystackCfg.secretKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!data.status) {
    const e = new Error(data.message || 'Paystack initialize failed');
    e.status = 400;
    e.details = data;
    throw e;
  }

  const amountMain = Number(amountSubunit) / 100;
  await pool.query(
    `INSERT INTO payments (email, amount, currency, reference, status, student_id_requested)
     VALUES (?,?,?,?, 'pending', ?)`,
    [email, amountMain, currency || 'GHS', reference, studentId || null]
  );

  return {
    reference,
    authorizationUrl: data.data.authorization_url,
    accessCode: data.data.access_code,
  };
}

async function verifyAndIssuePin(reference) {
  const paystackCfg = await getRuntimePaystackConfig();
  if (!paystackCfg.secretKey) {
    const e = new Error('Paystack is not configured');
    e.status = 503;
    throw e;
  }
  const res = await fetch(`https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`, {
    headers: { Authorization: `Bearer ${paystackCfg.secretKey}` },
  });
  const data = await res.json();
  if (!data.status || !data.data) {
    const e = new Error(data.message || 'Verification failed');
    e.status = 400;
    throw e;
  }
  const d = data.data;
  if (d.status !== 'success') {
    const e = new Error('Payment not successful');
    e.status = 400;
    throw e;
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [payRows] = await conn.query('SELECT * FROM payments WHERE reference = ? FOR UPDATE', [reference]);
    if (!payRows.length) {
      const e = new Error('Payment record not found');
      e.status = 404;
      throw e;
    }
    const pay = payRows[0];
    if (pay.status === 'success') {
      const [existingPins] = await conn.query('SELECT pin_code FROM pins WHERE payment_id = ?', [pay.id]);
      await conn.commit();
      const metaStored = extractMetadataFromPaymentRow(pay);
      return {
        alreadyProcessed: true,
        pin: existingPins[0]?.pin_code || null,
        payment: pay,
        meta: metaStored,
      };
    }

    const meta = d.metadata || {};
    let studentBound =
      meta.student_id != null && String(meta.student_id).trim() !== ''
        ? String(meta.student_id).trim()
        : null;
    if (!studentBound && pay.student_id_requested) {
      studentBound = String(pay.student_id_requested).trim();
    }

    let pinCode = makePinCode();
    for (let attempt = 0; attempt < 5; attempt += 1) {
      try {
        await conn.query(
          `INSERT INTO pins (pin_code, is_used, student_id_bound, payment_id) VALUES (?, 0, ?, ?)`,
          [pinCode, studentBound || null, pay.id]
        );
        break;
      } catch (err) {
        if (err.code === 'ER_DUP_ENTRY') {
          pinCode = makePinCode();
        } else {
          throw err;
        }
      }
    }

    await conn.query(
      'UPDATE payments SET status = ?, paystack_data = ? WHERE id = ?',
      ['success', JSON.stringify(d), pay.id]
    );
    await conn.commit();
    const metaNew = d.metadata && typeof d.metadata === 'object' ? d.metadata : {};
    return {
      alreadyProcessed: false,
      pin: pinCode,
      payment: { ...pay, status: 'success' },
      paystack: d,
      meta: metaNew,
    };
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
}

module.exports = {
  initializeTransaction,
  verifyAndIssuePin,
  makePinCode,
  extractMetadataFromPaymentRow,
};
