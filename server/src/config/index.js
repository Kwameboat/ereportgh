const path = require('path');
const fs = require('fs');
const dotenv = require('dotenv');

/**
 * Resolve server/.env when started from cPanel/Passenger (cwd may not be server/).
 * Set ENV_FILE_PATH to an absolute path to override.
 */
function resolveEnvFilePath() {
  const explicit = process.env.ENV_FILE_PATH;
  if (explicit) {
    const p = path.resolve(explicit);
    if (fs.existsSync(p)) return { path: p, found: true };
  }
  const fromModule = path.resolve(path.join(__dirname, '..', '..', '.env'));
  if (fs.existsSync(fromModule)) return { path: fromModule, found: true };
  const cwdServer = path.resolve(path.join(process.cwd(), 'server', '.env'));
  if (fs.existsSync(cwdServer)) return { path: cwdServer, found: true };
  const cwdEnv = path.resolve(path.join(process.cwd(), '.env'));
  if (fs.existsSync(cwdEnv)) return { path: cwdEnv, found: true };
  return { path: fromModule, found: fs.existsSync(fromModule) };
}

const { path: envPath, found: envFileFound } = resolveEnvFilePath();

function applyEnvFile() {
  if (!envFileFound) return;
  try {
    const raw = fs.readFileSync(envPath, 'utf8');
    const text = raw.replace(/^\uFEFF/, '');
    const parsed = dotenv.parse(text);
    for (const [rawKey, rawVal] of Object.entries(parsed)) {
      const key = String(rawKey)
        .replace(/\uFEFF/g, '')
        .replace(/\r/g, '')
        .trim();
      if (!key || key.startsWith('#')) continue;
      process.env[key] = rawVal === undefined || rawVal === null ? '' : String(rawVal);
    }
  } catch {
    /* ignore */
  }
}

dotenv.config({ path: envPath, override: true });
applyEnvFile();

function env(name, fallback = undefined) {
  const v = process.env[name];
  if (v === undefined || v === '') return fallback;
  return v;
}

function envBool(name, fallback = false) {
  const v = env(name);
  if (v === undefined) return fallback;
  return ['1', 'true', 'yes', 'on'].includes(String(v).toLowerCase());
}

/** Comma-separated list for production CORS; empty = reflect request origin (dev-friendly). */
function corsOriginList() {
  const raw = env('CORS_ORIGINS', '');
  if (!raw.trim()) return null;
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

const nodeEnv = env('NODE_ENV', 'development');

module.exports = {
  /** Where .env was resolved (for /api/health when DB is down). */
  envResolvedPath: envPath,
  envFileFound,
  port: parseInt(env('PORT', '4000'), 10),
  host: env('HOST', '0.0.0.0'),
  nodeEnv,
  trustProxy: envBool('TRUST_PROXY', nodeEnv === 'production'),
  publicBaseUrl: env('PUBLIC_BASE_URL', 'http://localhost:4000').replace(/\/$/, ''),
  excelApiKey: env('EXCEL_API_KEY', 'dev-excel-key'),
  jwtSecret: env('JWT_SECRET', 'dev-jwt-secret-change-in-production'),
  jwtExpiresIn: env('JWT_EXPIRES_IN', '8h'),
  corsOrigins: corsOriginList(),
  mysql: {
    host: env('MYSQL_HOST', '127.0.0.1'),
    port: parseInt(env('MYSQL_PORT', '3306'), 10),
    user: env('MYSQL_USER', 'root'),
    password: env('MYSQL_PASSWORD', ''),
    database: env('MYSQL_DATABASE', 'school_results'),
    waitForConnections: true,
    connectionLimit: 10,
  },
  paystack: {
    secretKey: env('PAYSTACK_SECRET_KEY', ''),
    callbackUrl: env('PAYSTACK_CALLBACK_URL', ''),
  },
  /** Report access fee — smallest currency unit (e.g. pesewas for GHS). Ignores client-supplied amounts. */
  payment: {
    amountSubunit: parseInt(env('PAYMENT_AMOUNT_SUBUNIT', '1000'), 10),
    currency: env('PAYMENT_CURRENCY', 'GHS'),
  },
  seedAdmin: {
    username: env('SEED_ADMIN_USERNAME', 'admin'),
    password: env('SEED_ADMIN_PASSWORD', 'ChangeMe123!'),
  },
};
