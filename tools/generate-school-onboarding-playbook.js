const fs = require('fs');
const path = require('path');
const PDFDocument = require(path.join(__dirname, '../server/node_modules/pdfkit'));

const outDir = path.join(__dirname, '../docs');
const outPath = path.join(outDir, 'School-Onboarding-Playbook.pdf');

if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

const doc = new PDFDocument({ margin: 48, size: 'A4' });
doc.pipe(fs.createWriteStream(outPath));

function h1(text) {
  doc.moveDown(0.2).font('Helvetica-Bold').fontSize(20).fillColor('#0b1324').text(text);
  doc.moveDown(0.2);
}

function h2(text) {
  doc.moveDown(0.8).font('Helvetica-Bold').fontSize(13).fillColor('#102a43').text(text);
  doc.moveDown(0.25);
}

function p(text) {
  doc.font('Helvetica').fontSize(10.5).fillColor('#1f2937').text(text, { lineGap: 2 });
  doc.moveDown(0.35);
}

function bullet(text) {
  doc.font('Helvetica-Bold').fontSize(10.5).text('• ', { continued: true });
  doc.font('Helvetica').fontSize(10.5).text(text, { lineGap: 2 });
}

function code(text) {
  doc.font('Courier').fontSize(9.5).fillColor('#111827').text(text);
  doc.moveDown(0.2);
}

h1('School Onboarding Playbook');
p(`Generated: ${new Date().toLocaleString()}`);
p('This playbook documents the working onboarding flow in the School Results system, including school reference generation, API key handling, and Excel upload credentials.');

h2('1) Prerequisites');
bullet('Admin account with access to the dashboard.');
bullet('Backend running at http://localhost:4000 or your deployed domain.');
bullet('Excel workbook with UploadResults VBA module and CONFIG sheet.');
doc.moveDown(0.3);

h2('2) Create School and Generate Reference');
bullet('Open Admin Dashboard: /admin/dashboard.html');
bullet('Go to "Schools Onboarding".');
bullet('Enter school name and optional contact details.');
bullet('Click "Add school + generate ref".');
bullet('System generates: School Reference (SCH-XXXXXX) and School API Key (sk_...).');
p('Important: Store the generated API key securely. It is shown at creation/regeneration time and used by the school workbook.');

h2('3) Configure Workbook Credentials');
p('In workbook CONFIG sheet:');
bullet('B1 = ingest URL (example: http://localhost:4000/api/excel/ingest)');
bullet('B2 = school API key');
bullet('B3 = school reference');
bullet('B4 = school logo range on REPORT sheet (optional, e.g. A1:C6)');
bullet('B5 = student photo range on REPORT sheet (optional, e.g. I3:K10)');
p('The VBA module sends these request headers:');
code('X-API-Key: <school_api_key>');
code('X-School-Ref: <school_ref>');

h2('4) Upload Flow');
bullet('Fill REPORT term/year and student data.');
bullet('Run SyncToResultsPortal / UploadResults_Click.');
bullet('Server authenticates school credentials and accepts payload.');
bullet('System upserts students/results, generates report PDFs, and links records to school_ref.');

h2('5) School Lifecycle Operations');
bullet('Copy school reference from dashboard when onboarding staff.');
bullet('Disable school to block further ingest from that school credentials.');
bullet('Regenerate API key to revoke old workbook credentials immediately.');

h2('6) Functional Validation (Executed)');
p('The following end-to-end validation was executed in this environment:');
bullet('Created school via admin API and received generated school_ref/api_key.');
bullet('Submitted ingest payload using X-School-Ref + X-API-Key.');
bullet('Upload succeeded and produced a PDF URL.');
bullet('Verified student record contains matching school_ref.');

h2('7) Troubleshooting');
bullet('401 Invalid school credentials: check B2/B3 values and active school status.');
bullet('400 meta.term/year required: ensure REPORT H10/H9 are filled before sync.');
bullet('No PDF generated: inspect ingest response and server logs, then regenerate PDF from dashboard.');

h2('8) Security Notes');
bullet('Treat school API keys as secrets; rotate if exposed.');
bullet('Use HTTPS in production.');
bullet('Keep school records active only for authorized institutions.');

p('End of playbook.');
doc.end();

process.stdout.write(`${outPath}\n`);
