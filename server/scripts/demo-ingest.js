/**
 * Optional: load one sample student for local testing (no Excel needed).
 * Run from server/: node scripts/demo-ingest.js
 * Requires: npm run migrate completed, same .env as the API.
 */
require('dotenv').config();
const { pool } = require('../src/db/pool');
const { upsertStudentWithResults } = require('../src/services/studentIngest');

const sample = {
  school: {
    name: 'Demo Memorial International School',
    address: 'P.O. Box 1, Demo City',
    examTitle: 'END OF SECOND TERM EXAMINATION-2026',
  },
  meta: { term: 'TWO', year: '2026', month: 'APRIL' },
  students: [
    {
      studentId: '1001',
      name: 'Ada Demo',
      className: '5',
      monthReporting: 'APRIL',
      vacationStart: '2026-08-01',
      vacationEnd: '2026-09-01',
      noOnRoll: 30,
      attendance: '48/50',
      totalMarks: 650,
      averageMark: 86.5,
      overallPosition: '2nd',
      promotionStatus: 'Promoted',
      interest: 'Reading',
      attitude: 'Dependable',
      classTeacherRemarks: 'Good term. Keep it up.',
      classTeacherName: 'Mr. Smith',
      headteacherName: 'Mrs. Jones',
      headteacherContact: '0200000000',
      classTeacherContact: '0200000001',
      ptaLevy: 10,
      ptaArrears: 0,
      ptaTotal: 10,
      subjects: [
        { subjectName: 'ENGLISH LANGUAGE', classScore: 40, examScore: 45, totalScore: 85, position: '2', remark: 'PROFICIENT' },
        { subjectName: 'MATHEMATICS', classScore: 42, examScore: 40, totalScore: 82, position: '3', remark: 'PROFICIENT' },
        { subjectName: 'SCIENCE', classScore: 45, examScore: 44, totalScore: 89, position: '1', remark: 'HIGHLY PROFICIENT' },
      ],
    },
  ],
};

upsertStudentWithResults(sample)
  .then(async (out) => {
    // eslint-disable-next-line no-console
    console.log('Demo ingest OK:', out);
    await pool.end();
    process.exit(0);
  })
  .catch(async (e) => {
    // eslint-disable-next-line no-console
    console.error(e);
    try {
      await pool.end();
    } catch {
      /* ignore */
    }
    process.exit(1);
  });
