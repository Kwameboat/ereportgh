const express = require('express');
const rateLimit = require('express-rate-limit');
const config = require('../config');
const { asyncHandler } = require('../middleware/errorHandler');
const { pool } = require('../db/pool');
const { getStudentBundleByPublicId } = require('../services/studentIngest');
const { initializeTransaction, verifyAndIssuePin } = require('../services/paystackService');

const router = express.Router();

const checkLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 30 });
const payLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 20 });

/**
 * POST /api/public/validate-pin
 * Body: { studentId, pin, term?, year? }
 * Validates PIN, returns student summary + pdfUrl; marks PIN used.
 */
router.post('/validate-pin', checkLimiter, asyncHandler(async (req, res) => {
  const { studentId, pin, term, year } = req.body || {};
  if (!studentId || !pin) {
    const e = new Error('studentId and pin are required');
    e.status = 400;
    throw e;
  }
  const sid = String(studentId).trim();
  const pcode = String(pin).trim().toUpperCase();

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [pins] = await conn.query('SELECT * FROM pins WHERE pin_code = ? FOR UPDATE', [pcode]);
    if (!pins.length) {
      const e = new Error('Invalid PIN');
      e.status = 400;
      throw e;
    }
    const p = pins[0];
    if (p.is_used) {
      const e = new Error('This PIN has already been used');
      e.status = 400;
      throw e;
    }
    if (p.student_id_bound && String(p.student_id_bound) !== sid) {
      const e = new Error('This PIN is not valid for this student ID');
      e.status = 400;
      throw e;
    }

    const bundle = await getStudentBundleByPublicId(sid, term, year);
    if (!bundle) {
      const e = new Error('No result record found for this student');
      e.status = 404;
      throw e;
    }

    await conn.query(
      'UPDATE pins SET is_used = 1, used_by_student_id = ?, used_at = CURRENT_TIMESTAMP WHERE id = ?',
      [sid, p.id]
    );
    await conn.commit();

    const { student, results } = bundle;
    res.json({
      ok: true,
      pdfUrl: student.pdf_url,
      student: {
        studentId: student.student_id,
        name: student.name,
        className: student.class_name,
        term: student.term,
        year: student.year,
        schoolName: student.school_name,
      },
      subjectCount: results.length,
    });
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
}));

/**
 * GET /api/public/payment-settings
 * Fixed fee shown on checkout (amount is never taken from the client).
 */
router.get('/payment-settings', asyncHandler(async (req, res) => {
  const { amountSubunit, currency } = config.payment;
  const main = Number(amountSubunit) / 100;
  res.json({
    ok: true,
    amountSubunit,
    currency,
    amountMain: main,
    amountLabel: `${currency} ${main.toFixed(2)}`,
  });
}));

/**
 * POST /api/public/paystack/initialize
 * Starts Paystack checkout. Fee is server-side only. Body: { email, studentId, term?, year?, callbackUrl? }
 */
router.post('/paystack/initialize', payLimiter, asyncHandler(async (req, res) => {
  const { email, studentId, term, year, callbackUrl } = req.body || {};
  const sid = studentId != null ? String(studentId).trim() : '';
  if (!sid) {
    const e = new Error('student reference is required');
    e.status = 400;
    throw e;
  }
  const emailTrim = email != null ? String(email).trim() : '';
  if (!emailTrim || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailTrim)) {
    const e = new Error('valid email is required for payment');
    e.status = 400;
    throw e;
  }

  const bundle = await getStudentBundleByPublicId(sid, term, year);
  if (!bundle) {
    const e = new Error(
      'No result record found for this student. Check the reference number and optional term/year.'
    );
    e.status = 404;
    throw e;
  }

  const amountSubunit = config.payment.amountSubunit;
  if (!amountSubunit || Number(amountSubunit) < 100) {
    const e = new Error('Payment amount is not configured on the server');
    e.status = 503;
    throw e;
  }

  const out = await initializeTransaction({
    email: emailTrim,
    amountSubunit: Number(amountSubunit),
    currency: config.payment.currency,
    studentId: sid,
    term,
    year,
    callbackUrl,
  });
  res.json({ ok: true, ...out });
}));

/**
 * GET /api/public/paystack/verify?reference=
 * After Paystack redirect, frontend calls this to verify and receive PIN.
 */
router.get('/paystack/verify', payLimiter, asyncHandler(async (req, res) => {
  const reference = req.query.reference;
  if (!reference) {
    const e = new Error('reference is required');
    e.status = 400;
    throw e;
  }
  const out = await verifyAndIssuePin(String(reference));
  const meta = out.meta || {};
  res.json({
    ok: true,
    pin: out.pin,
    alreadyProcessed: out.alreadyProcessed,
    studentId: meta.student_id != null && meta.student_id !== '' ? String(meta.student_id) : null,
    term: meta.term != null && meta.term !== '' ? String(meta.term) : null,
    year: meta.year != null && meta.year !== '' ? String(meta.year) : null,
  });
}));

module.exports = router;
