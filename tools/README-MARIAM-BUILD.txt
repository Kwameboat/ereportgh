BUILDING "MARIAM MEM (portal sync).xlsm"
========================================

Output files (same content):
  • Desktop\MARIAM MEM (portal sync).xlsm
  • Report checker\MARIAM MEM (portal sync).xlsm

Source:
  • MARIAM MEM.xlsm (your original in project folder)

What the script does:
  • Reads server\.env for PUBLIC_BASE_URL and EXCEL_API_KEY
  • Adds/replaces sheet CONFIG with labels in column A and values in B1 (full ingest URL) and B2 (API key)
  • Preserves existing Excel macros (VBA blob kept)

Rebuild after changing .env:
  From project folder run:
    npm run configure:mariam-excel
  Or:
    node tools/configure-mariam-xlsm.js

Full stack check (Excel + DB + API workflow):
    npm run health:check

Production: set PUBLIC_BASE_URL and EXCEL_API_KEY in server\.env, rebuild, then distribute the new xlsm.

SYSTEM HEALTH (Excel + DB + API workflow)
  From project root:
    npm run health:check
  Requires MySQL (e.g. docker compose up -d) and npm run migrate --prefix server for DB=OK.
