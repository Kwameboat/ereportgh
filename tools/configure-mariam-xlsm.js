/**
 * Adds CONFIG sheet + B1/B2 values to MARIAM MEM.xlsm while preserving VBA (SheetJS).
 * Reads URL/key from env or uses dev defaults matching server/.env
 */
const fs = require('fs');
const path = require('path');
const XLSX = require(path.join(__dirname, '..', 'server', 'node_modules', 'xlsx'));

const root = path.join(__dirname, '..');
const src = path.join(root, 'MARIAM MEM.xlsm');
const OUT_NAME = 'MARIAM MEM (portal sync).xlsm';
const destProj = path.join(root, OUT_NAME);
const destDesk = path.join(process.env.USERPROFILE || '', 'Desktop', OUT_NAME);

function loadEnv() {
  const p = path.join(root, 'server', '.env');
  let url = 'http://localhost:4000/api/excel/ingest';
  let key = 'local-dev-excel-key-16chars';
  if (!fs.existsSync(p)) return { url, key };
  const raw = fs.readFileSync(p, 'utf8');
  for (const line of raw.split(/\r?\n/)) {
    const m = line.match(/^PUBLIC_BASE_URL=(.+)$/);
    if (m) {
      const base = m[1].trim().replace(/\/$/, '');
      url = `${base}/api/excel/ingest`;
    }
    const k = line.match(/^EXCEL_API_KEY=(.+)$/);
    if (k) key = k[1].trim();
  }
  return { url, key };
}

function main() {
  if (!fs.existsSync(src)) {
    console.error('Missing:', src);
    process.exit(1);
  }
  const { url, key } = loadEnv();

  const wb = XLSX.readFile(src, { bookVBA: true, cellDates: true });

  const configData = [
    ['Portal link (full URL)', url],
    ['Secret key (same as EXCEL_API_KEY)', key],
  ];
  const wsNew = XLSX.utils.aoa_to_sheet(configData);

  const idx = wb.SheetNames.indexOf('CONFIG');
  if (idx >= 0) {
    wb.SheetNames.splice(idx, 1);
    delete wb.Sheets.CONFIG;
  }
  XLSX.utils.book_append_sheet(wb, wsNew, 'CONFIG');

  const opt = { bookType: 'xlsm', bookVBA: true };
  const tmp = path.join(require('os').tmpdir(), `mariam-portal-${Date.now()}.xlsm`);
  XLSX.writeFile(wb, tmp, opt);

  // Guardrail: some SheetJS writes can strip macro workbook parts.
  // If generated archive is much smaller than source, keep source workbook intact.
  const srcSize = fs.statSync(src).size;
  const tmpSize = fs.statSync(tmp).size;
  const minSafeRatio = 0.9;
  const generatedLooksUnsafe = tmpSize < srcSize * minSafeRatio;
  if (generatedLooksUnsafe) {
    console.warn(
      `Generated workbook looks incomplete (${tmpSize} bytes vs source ${srcSize} bytes). ` +
        'Falling back to source workbook copy to avoid Excel open errors.'
    );
    try {
      fs.unlinkSync(tmp);
    } catch {
      /* ignore */
    }
    fs.copyFileSync(src, tmp);
  }
  try {
    fs.copyFileSync(tmp, destProj);
  } catch (e) {
    console.error('Could not write project copy:', destProj, e.message);
  }
  try {
    fs.copyFileSync(tmp, destDesk);
  } catch (e) {
    console.error('Could not write Desktop copy:', destDesk, e.message);
  }
  try {
    fs.unlinkSync(tmp);
  } catch {
    /* ignore */
  }

  console.log('Configured workbook written to:');
  console.log(' ', destProj);
  console.log(' ', destDesk);
  console.log('Portal URL:', url);
}

main();
