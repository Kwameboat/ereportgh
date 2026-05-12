const fs = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit');
const config = require('../config');

const REPORTS_DIR = path.join(__dirname, '../../uploads/reports');

function ensureDir() {
  if (!fs.existsSync(REPORTS_DIR)) {
    fs.mkdirSync(REPORTS_DIR, { recursive: true });
  }
}

function formatDate(d) {
  if (!d) return '';
  if (typeof d === 'string') return d;
  try {
    return d.toISOString().slice(0, 10);
  } catch {
    return String(d);
  }
}

function parseRawMeta(raw) {
  if (!raw) return {};
  try {
    if (typeof raw === 'string') return JSON.parse(raw);
    return raw;
  } catch {
    return {};
  }
}

function base64ToImageBuffer(value) {
  if (!value || typeof value !== 'string') return null;
  const trimmed = value.trim();
  const m = trimmed.match(/^data:image\/[a-zA-Z0-9.+-]+;base64,(.+)$/);
  try {
    return Buffer.from(m ? m[1] : trimmed, 'base64');
  } catch {
    return null;
  }
}

/**
 * Generates a portrait A4 report card inspired by the sample (Jacob.pdf):
 * header, learner info, subject grid, totals, conduct, remarks, contacts, PTA.
 */
async function generateReportCardPdf(student, results) {
  ensureDir();
  const safeId = String(student.student_id).replace(/[^a-zA-Z0-9_-]/g, '_');
  const fileName = `${safeId}_${student.year || 'y'}_${student.term || 't'}_${Date.now()}.pdf`;
  const filePath = path.join(REPORTS_DIR, fileName);

  const doc = new PDFDocument({ size: 'A4', margin: 36 });
  const stream = fs.createWriteStream(filePath);
  doc.pipe(stream);

  const pageWidth = doc.page.width - 72;
  const left = 36;
  const right = left + pageWidth;
  const brandBlue = '#143a63';
  const softLine = '#9aa7b7';
  const rawMeta = parseRawMeta(student.raw_meta);
  const schoolLogo = base64ToImageBuffer(rawMeta.schoolLogoBase64);
  const studentPhoto = base64ToImageBuffer(rawMeta.studentPhotoBase64);
  let y = doc.y;

  // Header band
  doc.rect(left, y, pageWidth, 70).fill('#f3f7fb');
  doc.strokeColor(softLine).lineWidth(0.8).rect(left, y, pageWidth, 70).stroke();
  if (schoolLogo) {
    try {
      doc.image(schoolLogo, left + 6, y + 6, { fit: [58, 58], align: 'center', valign: 'center' });
    } catch {
      /* ignore malformed image */
    }
  }
  doc.fillColor(brandBlue).font('Helvetica-Bold').fontSize(13).text(
    (student.school_name || 'SCHOOL NAME').toUpperCase(),
    left + 70,
    y + 10,
    { width: pageWidth - 140, align: 'center' }
  );
  doc.fillColor('#334155').font('Helvetica').fontSize(8.8).text(student.school_address || '', left + 70, y + 27, {
    width: pageWidth - 140,
    align: 'center',
  });
  doc.fillColor('#0f172a').font('Helvetica-Bold').fontSize(10.5).text(
    student.exam_title || 'END OF TERM EXAMINATION',
    left + 70,
    y + 43,
    { width: pageWidth - 140, align: 'center' }
  );
  if (studentPhoto) {
    try {
      doc.image(studentPhoto, right - 64, y + 6, { fit: [58, 58], align: 'center', valign: 'center' });
    } catch {
      /* ignore malformed image */
    }
  }
  y += 76;

  doc.fillColor('#0f172a').font('Helvetica-Bold').fontSize(10).text('PRIMARY LEARNER\'S REPORT CARD', left, y, {
    width: pageWidth,
    align: 'center',
  });
  y = doc.y + 6;

  // Student information block
  doc.strokeColor(softLine).lineWidth(0.8).rect(left, y, pageWidth, 64).stroke();
  doc.moveTo(left + pageWidth * 0.5, y).lineTo(left + pageWidth * 0.5, y + 64).stroke();
  doc.font('Helvetica').fillColor('#0f172a').fontSize(8.6);
  const leftInfo = [
    `NAME: ${student.name || '-'}`,
    `CLASS: ${student.class_name || '-'}`,
    `MONTH: ${student.month_reporting || '-'}`,
    `VACATION: ${formatDate(student.vacation_start)}  -  ${formatDate(student.vacation_end)}`,
  ];
  const rightInfo = [
    `YEAR: ${student.year || '-'}`,
    `TERM: ${student.term || '-'}`,
    `REF NO: ${student.student_id || '-'}`,
    `SCHOOL REF: ${student.school_ref || '-'}`,
  ];
  doc.text(leftInfo.join('\n'), left + 8, y + 7, { width: pageWidth * 0.5 - 16 });
  doc.text(rightInfo.join('\n'), left + pageWidth * 0.5 + 8, y + 7, { width: pageWidth * 0.5 - 16 });
  y += 72;

  // Subjects table
  doc.strokeColor('#5b6878').lineWidth(0.9);
  doc.font('Helvetica-Bold').fontSize(8);
  const cols = {
    subject: 0.39,
    cls: 0.13,
    ex: 0.13,
    tot: 0.13,
    pos: 0.10,
    rem: 0.12,
  };
  const wSub = pageWidth * cols.subject;
  const wCls = pageWidth * cols.cls;
  const wEx = pageWidth * cols.ex;
  const wTot = pageWidth * cols.tot;
  const wPos = pageWidth * cols.pos;
  const wRem = pageWidth * cols.rem;
  const headH = 18;

  let x = left;
  doc.rect(left, y, pageWidth, headH).stroke();
  doc.text('SUBJECT', x + 2, y + 5, { width: wSub - 4 });
  x += wSub;
  doc.moveTo(x, y).lineTo(x, y + headH).stroke();
  doc.text('CLASS', x, y + 5, { width: wCls, align: 'center' });
  x += wCls;
  doc.moveTo(x, y).lineTo(x, y + headH).stroke();
  doc.text('EXAM', x, y + 5, { width: wEx, align: 'center' });
  x += wEx;
  doc.moveTo(x, y).lineTo(x, y + headH).stroke();
  doc.text('TOTAL', x, y + 5, { width: wTot, align: 'center' });
  x += wTot;
  doc.moveTo(x, y).lineTo(x, y + headH).stroke();
  doc.text('POS', x, y + 5, { width: wPos, align: 'center' });
  x += wPos;
  doc.moveTo(x, y).lineTo(x, y + headH).stroke();
  doc.text('REMARK', x, y + 5, { width: wRem, align: 'center' });
  y += headH;

  doc.font('Helvetica').fontSize(8);
  (results || []).forEach((r) => {
    if (y > doc.page.height - 210) {
      doc.addPage();
      y = 36;
    }
    const rowH = 16;
    doc.rect(left, y, pageWidth, rowH).stroke('#8fa0b3');
    x = left;
    const subj = r.subject_name || '-';
    doc.text(subj, x + 2, y + 4, { width: wSub - 4 });
    x += wSub;
    doc.moveTo(x, y).lineTo(x, y + rowH).stroke('#8fa0b3');
    doc.text(r.class_score != null ? String(r.class_score) : '-', x, y + 4, { width: wCls, align: 'center' });
    x += wCls;
    doc.moveTo(x, y).lineTo(x, y + rowH).stroke('#8fa0b3');
    doc.text(r.exam_score != null ? String(r.exam_score) : '-', x, y + 4, { width: wEx, align: 'center' });
    x += wEx;
    doc.moveTo(x, y).lineTo(x, y + rowH).stroke('#8fa0b3');
    doc.text(r.total_score != null ? String(r.total_score) : '-', x, y + 4, { width: wTot, align: 'center' });
    x += wTot;
    doc.moveTo(x, y).lineTo(x, y + rowH).stroke('#8fa0b3');
    doc.text(r.position_in_subject || '-', x, y + 4, { width: wPos, align: 'center' });
    x += wPos;
    doc.moveTo(x, y).lineTo(x, y + rowH).stroke('#8fa0b3');
    doc.text(r.remark || '-', x + 2, y + 4, { width: wRem - 4, align: 'center' });
    y += rowH;
  });

  y += 6;
  doc.strokeColor(softLine).lineWidth(0.8).rect(left, y, pageWidth, 52).stroke();
  doc.fontSize(8.5).font('Helvetica').fillColor('#0f172a');
  const summary = `NO. ON ROLL: ${student.no_on_roll ?? '-'}   TOTAL MARKS: ${student.total_marks ?? '-'}   AVERAGE MARK: ${
    student.average_mark != null ? Number(student.average_mark).toFixed(2) : '-'
  }   POSITION IN CLASS: ${student.overall_position || '-'}\nATTENDANCE: ${student.attendance || '-'}   PROMOTION STATUS: ${
    student.promotion_status || '-'
  }`;
  doc.text(summary, left + 8, y + 8, { width: pageWidth - 16 });
  y += 60;

  doc.strokeColor(softLine).lineWidth(0.8).rect(left, y, pageWidth, 42).stroke();
  doc.font('Helvetica-Bold').fontSize(8.7).text('INTEREST:', left + 8, y + 8);
  doc.font('Helvetica').fontSize(8.5).text(String(student.interest || '-'), left + 68, y + 8, { width: pageWidth - 76 });
  doc.font('Helvetica-Bold').fontSize(8.7).text('ATTITUDE:', left + 8, y + 23);
  doc.font('Helvetica').fontSize(8.5).text(String(student.attitude || '-'), left + 68, y + 23, { width: pageWidth - 76 });
  y += 48;

  doc.strokeColor(softLine).lineWidth(0.8).rect(left, y, pageWidth, 58).stroke();
  doc.font('Helvetica-Bold').fontSize(8.7).text('CLASS TR\'S REMARKS:', left + 8, y + 8);
  doc.font('Helvetica').fontSize(8.4).text(student.class_teacher_remarks || '-', left + 110, y + 8, { width: pageWidth - 118 });
  doc.font('Helvetica').fontSize(8.4).text(`NAME OF CLASS TEACHER: ${student.class_teacher_name || '-'}`, left + 8, y + 32, { width: pageWidth * 0.53 });
  doc.text(`NAME OF HEADTEACHER: ${student.headteacher_name || '-'}`, left + pageWidth * 0.53, y + 32, { width: pageWidth * 0.47 - 8 });
  y += 66;

  doc.font('Helvetica').fontSize(8.3).fillColor('#1f2937');
  doc.text(`HEADTEACHER'S CONTACT: ${student.headteacher_contact || '-'}`, left, y);
  y += 12;
  doc.text(`CLASS TR'S CONTACT: ${student.classteacher_contact || '-'}`, left, y);
  y += 14;

  if (student.pta_total != null || student.pta_levy != null || student.pta_arrears != null) {
    doc.font('Helvetica-Bold').fontSize(8.5).text(
      `PTA DUES FOR NEXT TERM: ${student.pta_levy ?? '-'}   PTA ARREARS: ${student.pta_arrears ?? '-'}   TOTAL: ${
        student.pta_total ?? '-'
      }`,
      left,
      y,
      { width: pageWidth }
    );
    y = doc.y + 8;
  }

  doc.fontSize(7.2).fillColor('#4b5563');
  doc.text(
    'Grading: 80–100% Highly Proficient | 68–79% Proficient | 54–67% Approaching Proficiency | 40–53% Developing | 0–39% Emerging',
    left,
    y,
    { align: 'center', width: pageWidth }
  );

  doc.end();

  await new Promise((resolve, reject) => {
    stream.on('finish', resolve);
    stream.on('error', reject);
  });

  const publicPath = `/uploads/reports/${fileName}`;
  const pdfUrl = `${config.publicBaseUrl}${publicPath}`;
  return { filePath, publicPath, pdfUrl };
}

async function generateReportCardPdfFromBase64(student, reportPdfBase64) {
  ensureDir();
  const safeId = String(student.student_id).replace(/[^a-zA-Z0-9_-]/g, '_');
  const fileName = `${safeId}_${student.year || 'y'}_${student.term || 't'}_${Date.now()}.pdf`;
  const filePath = path.join(REPORTS_DIR, fileName);
  const b64 = String(reportPdfBase64 || '').trim();
  if (!b64) {
    const e = new Error('Empty reportPdfBase64');
    e.status = 400;
    throw e;
  }
  const m = b64.match(/^data:application\/pdf;base64,(.+)$/i);
  const payload = m ? m[1] : b64;
  const buf = Buffer.from(payload, 'base64');
  await fs.promises.writeFile(filePath, buf);
  const publicPath = `/uploads/reports/${fileName}`;
  const pdfUrl = `${config.publicBaseUrl}${publicPath}`;
  return { filePath, publicPath, pdfUrl };
}

module.exports = { generateReportCardPdf, generateReportCardPdfFromBase64, REPORTS_DIR };
