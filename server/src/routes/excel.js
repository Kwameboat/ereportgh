const express = require('express');
const { requireExcelKey } = require('../middleware/excelAuth');
const { asyncHandler } = require('../middleware/errorHandler');
const { upsertStudentWithResults } = require('../services/studentIngest');

const router = express.Router();

/**
 * POST /api/excel/ingest
 * Header (legacy): X-API-Key: <EXCEL_API_KEY>
 * Header (school-scoped): X-API-Key: <school_api_key>, X-School-Ref: <school_ref>
 * Body: JSON built by VBA (see vba/UploadResults.bas)
 */
router.post('/ingest', requireExcelKey, asyncHandler(async (req, res) => {
  const body = req.body;
  if (!body || typeof body !== 'object') {
    const e = new Error('Invalid JSON body');
    e.status = 400;
    throw e;
  }
  const results = await upsertStudentWithResults(body, {
    school: req.school || null,
    // Safety rule: school-scoped uploads must provide Excel-rendered PDF per student.
    requireExactPdf: !!req.school,
  });
  res.json({ ok: true, processed: results.length, students: results });
}));

module.exports = router;
