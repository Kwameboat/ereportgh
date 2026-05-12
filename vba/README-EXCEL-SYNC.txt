SCHOOL RESULTS — EXCEL ↔ PORTAL SYNC
=====================================

READ FIRST (plain language)
  • Schools / teachers → CONFIGURE-WITHOUT-CODE.txt  (only cells B1 + B2)
  • You shipping the file → FOR-DISTRIBUTOR-pre-fill-before-sending.txt

WHAT THIS DOES
  The macro posts the same data your report card uses to the school server
  (API: POST /api/excel/ingest). The server updates the database and PDFs parents see online.

OPTION A — NEW WORKBOOK FROM THIS PROJECT
  1. Use your usual .xlsm template if sheet names/layout match (NAMES, REPORT).
  2. In Excel: Alt+F11 → File → Import File → select vba\UploadResults.bas
  3. Insert → Module is NOT needed if you Imported (module name: UploadResults).
  4. Add worksheet CONFIG (see below). Hide it if you like (Format → Hide Sheet).

OPTION B — ALREADY USING AN OLD MACRO FILE
  1. Alt+F11 open VBA Editor.
  2. If an old module named UploadResults exists: right-click it → Remove Module
     → Do NOT export unless you want a backup → Yes.
  3. File → Import File → UploadResults.bas from this folder.
     OR double-click old UploadResults module, Select All, paste new code over it.
  4. Add CONFIG sheet if missing (below).
  5. If your button pointed to UploadResults_Click — it still works.
     You can also assign SyncToResultsPortal (same behaviour).

CONFIG SHEET (recommended — keeps secrets out of code)
  Create sheet name exactly: CONFIG
    Cell B1 = full URL, example:
      https://your-school-domain.com/api/excel/ingest
    Cell B2 = API key (your tech admin gives this; matches server EXCEL_API_KEY)
    Optional labels in A1/A2 for humans (ignored by macro).

  If CONFIG is missing or B1/B2 empty, the macro uses the defaults at the top of
  UploadResults.bas (localhost + placeholder key) — change those only for testing.

UPLOAD_LOG
  First successful/failed sync may create sheet UPLOAD_LOG with a history row each run.

REQUIREMENTS BEFORE EACH SYNC
  • REPORT cells H9 (year) and H10 (term) must be filled — required by the server.
  • NAMES sheet must list student REF numbers column A from row 2 downward.
  • Macros must be enabled; PC needs internet access to your API URL.

SECURITY
  Treat B2 API key like a password. Restrict who can edit CONFIG sheet.

HELP
  Backend must be running with MySQL and EXCEL_API_KEY set in server .env.
