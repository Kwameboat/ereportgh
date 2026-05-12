const { pool } = require('../db/pool');
const { generateReportCardPdf, generateReportCardPdfFromBase64 } = require('./pdfGenerator');
const fs = require('fs');

function normalizeTermYear(term, year) {
  return {
    term: term != null ? String(term).trim() : null,
    year: year != null ? String(year).trim() : null,
  };
}

async function upsertStudentWithResults(payload, opts = {}) {
  const school = payload.school || {};
  const meta = payload.meta || {};
  const authSchool = opts.school || null;
  const requireExactPdf = opts.requireExactPdf === true;
  const { term, year } = normalizeTermYear(meta.term, meta.year);
  if (!term || !year) {
    const e = new Error('meta.term and meta.year are required (maps to REPORT!H10 and H9)');
    e.status = 400;
    throw e;
  }

  const studentsIn = Array.isArray(payload.students) ? payload.students : [];
  if (studentsIn.length === 0) {
    const e = new Error('No students in payload');
    e.status = 400;
    throw e;
  }

  const conn = await pool.getConnection();
  const out = [];
  try {
    await conn.beginTransaction();
    for (const s of studentsIn) {
      const studentId = s.studentId != null ? String(s.studentId).trim() : '';
      if (!studentId) {
        const e = new Error('Each student must have studentId');
        e.status = 400;
        throw e;
      }
      const name = (s.name || '').trim();
      if (!name) {
        const e = new Error(`Missing name for studentId ${studentId}`);
        e.status = 400;
        throw e;
      }
      if (requireExactPdf) {
        const hasExactPdf = s.reportPdfBase64 != null && String(s.reportPdfBase64).trim() !== '';
        if (!hasExactPdf) {
          const e = new Error(
            `Exact PDF is required for school-scoped ingest (missing reportPdfBase64 for studentId ${studentId})`
          );
          e.status = 400;
          throw e;
        }
      }

      const rawMeta = {
        source: 'excel-vba',
        receivedAt: new Date().toISOString(),
        schoolLogoBase64: school.logoBase64 || null,
        studentPhotoBase64: s.photoBase64 || null,
        extra: s.extra || null,
      };

      const row = {
        student_id: studentId,
        school_ref: authSchool ? authSchool.school_ref : null,
        name,
        class_name: s.className ?? null,
        term,
        year,
        school_name: authSchool?.name ?? school.name ?? null,
        school_address: school.address ?? null,
        exam_title: school.examTitle ?? meta.examTitle ?? null,
        month_reporting: s.monthReporting ?? meta.month ?? null,
        vacation_start: s.vacationStart ?? meta.vacationStart ?? null,
        vacation_end: s.vacationEnd ?? meta.vacationEnd ?? null,
        no_on_roll: s.noOnRoll ?? meta.noOnRoll ?? null,
        attendance: s.attendance ?? null,
        total_marks: s.totalMarks ?? null,
        average_mark: s.averageMark ?? null,
        overall_position: s.overallPosition ?? null,
        promotion_status: s.promotionStatus ?? null,
        interest: s.interest ?? null,
        attitude: s.attitude ?? null,
        class_teacher_remarks: s.classTeacherRemarks ?? null,
        class_teacher_name: s.classTeacherName ?? null,
        headteacher_name: s.headteacherName ?? null,
        headteacher_contact: s.headteacherContact ?? null,
        classteacher_contact: s.classTeacherContact ?? null,
        pta_levy: s.ptaLevy ?? null,
        pta_arrears: s.ptaArrears ?? null,
        pta_total: s.ptaTotal ?? null,
        raw_meta: JSON.stringify(rawMeta),
      };

      const [res] = await conn.query(
        `INSERT INTO students (
          student_id, school_ref, name, class_name, term, year, school_name, school_address, exam_title, month_reporting,
          vacation_start, vacation_end, no_on_roll, attendance, total_marks, average_mark, overall_position,
          promotion_status, interest, attitude, class_teacher_remarks, class_teacher_name, headteacher_name,
          headteacher_contact, classteacher_contact, pta_levy, pta_arrears, pta_total, raw_meta
        ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
        ON DUPLICATE KEY UPDATE
          school_ref=VALUES(school_ref), name=VALUES(name), class_name=VALUES(class_name), school_name=VALUES(school_name), school_address=VALUES(school_address),
          exam_title=VALUES(exam_title), month_reporting=VALUES(month_reporting), vacation_start=VALUES(vacation_start),
          vacation_end=VALUES(vacation_end), no_on_roll=VALUES(no_on_roll), attendance=VALUES(attendance),
          total_marks=VALUES(total_marks), average_mark=VALUES(average_mark), overall_position=VALUES(overall_position),
          promotion_status=VALUES(promotion_status), interest=VALUES(interest), attitude=VALUES(attitude),
          class_teacher_remarks=VALUES(class_teacher_remarks), class_teacher_name=VALUES(class_teacher_name),
          headteacher_name=VALUES(headteacher_name), headteacher_contact=VALUES(headteacher_contact),
          classteacher_contact=VALUES(classteacher_contact), pta_levy=VALUES(pta_levy), pta_arrears=VALUES(pta_arrears),
          pta_total=VALUES(pta_total), raw_meta=VALUES(raw_meta), updated_at=CURRENT_TIMESTAMP`,
        [
          row.student_id,
          row.school_ref,
          row.name,
          row.class_name,
          row.term,
          row.year,
          row.school_name,
          row.school_address,
          row.exam_title,
          row.month_reporting,
          row.vacation_start,
          row.vacation_end,
          row.no_on_roll,
          row.attendance,
          row.total_marks,
          row.average_mark,
          row.overall_position,
          row.promotion_status,
          row.interest,
          row.attitude,
          row.class_teacher_remarks,
          row.class_teacher_name,
          row.headteacher_name,
          row.headteacher_contact,
          row.classteacher_contact,
          row.pta_levy,
          row.pta_arrears,
          row.pta_total,
          row.raw_meta,
        ]
      );

      const insertId = res.insertId;
      let dbId = insertId;
      if (!dbId) {
        const [r2] = await conn.query(
          'SELECT id FROM students WHERE student_id = ? AND term <=> ? AND year <=> ?',
          [studentId, term, year]
        );
        dbId = r2[0].id;
      }

      await conn.query('DELETE FROM results WHERE student_db_id = ?', [dbId]);
      const subjects = Array.isArray(s.subjects) ? s.subjects : [];
      let order = 0;
      for (const sub of subjects) {
        await conn.query(
          `INSERT INTO results (student_db_id, subject_name, class_score, exam_score, total_score, position_in_subject, remark, sort_order)
           VALUES (?,?,?,?,?,?,?,?)`,
          [
            dbId,
            (sub.subjectName || '').trim(),
            sub.classScore ?? null,
            sub.examScore ?? null,
            sub.totalScore ?? null,
            sub.position != null ? String(sub.position) : null,
            sub.remark ?? null,
            order++,
          ]
        );
      }

      const [stRows] = await conn.query('SELECT * FROM students WHERE id = ?', [dbId]);
      const studentRow = stRows[0];
      const [resRows] = await conn.query(
        'SELECT subject_name, class_score, exam_score, total_score, position_in_subject, remark, sort_order FROM results WHERE student_db_id = ? ORDER BY sort_order',
        [dbId]
      );

      if (studentRow.pdf_path && fs.existsSync(studentRow.pdf_path)) {
        try {
          fs.unlinkSync(studentRow.pdf_path);
        } catch {
          /* ignore */
        }
      }

      const hasExactPdf = s.reportPdfBase64 != null && String(s.reportPdfBase64).trim() !== '';
      const { filePath, publicPath, pdfUrl } = hasExactPdf
        ? await generateReportCardPdfFromBase64(studentRow, s.reportPdfBase64)
        : await generateReportCardPdf(studentRow, resRows);
      await conn.query('UPDATE students SET pdf_path = ?, pdf_url = ? WHERE id = ?', [filePath, pdfUrl, dbId]);

      out.push({ studentId, dbId, pdfUrl, publicPath });
    }
    await conn.commit();
    return out;
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
}

async function getStudentBundleByPublicId(studentId, term, year) {
  let rows;
  if (term !== undefined && term !== null && term !== '' && year !== undefined && year !== null && year !== '') {
    [rows] = await pool.query(
      'SELECT * FROM students WHERE student_id = ? AND term <=> ? AND year <=> ?',
      [studentId, String(term).trim(), String(year).trim()]
    );
  } else {
    [rows] = await pool.query(
      'SELECT * FROM students WHERE student_id = ? ORDER BY updated_at DESC LIMIT 1',
      [studentId]
    );
  }
  if (!rows.length) return null;
  const st = rows[0];
  const [res] = await pool.query(
    'SELECT * FROM results WHERE student_db_id = ? ORDER BY sort_order',
    [st.id]
  );
  return { student: st, results: res };
}

async function regeneratePdfForDbId(dbId) {
  const conn = await pool.getConnection();
  try {
    const [stRows] = await conn.query('SELECT * FROM students WHERE id = ?', [dbId]);
    if (!stRows.length) {
      const e = new Error('Student not found');
      e.status = 404;
      throw e;
    }
    const studentRow = stRows[0];
    const [resRows] = await conn.query(
      'SELECT subject_name, class_score, exam_score, total_score, position_in_subject, remark, sort_order FROM results WHERE student_db_id = ? ORDER BY sort_order',
      [dbId]
    );
    if (studentRow.pdf_path && fs.existsSync(studentRow.pdf_path)) {
      try {
        fs.unlinkSync(studentRow.pdf_path);
      } catch {
        /* ignore */
      }
    }
    const { filePath, publicPath, pdfUrl } = await generateReportCardPdf(studentRow, resRows);
    await conn.query('UPDATE students SET pdf_path = ?, pdf_url = ? WHERE id = ?', [filePath, pdfUrl, dbId]);
    return { pdfUrl, publicPath, filePath };
  } finally {
    conn.release();
  }
}

module.exports = { upsertStudentWithResults, getStudentBundleByPublicId, regeneratePdfForDbId };
