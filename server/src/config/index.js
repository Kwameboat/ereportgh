const path = require('path');
const fs = require('fs');
const dotenv = require('dotenv');

const envPath = path.join(__dirname, '..', '..', '.env');

/* Load server/.env regardless of cwd (cPanel "Run JS script" often uses repo root). */
dotenv.config({
  path: envPath,
  /* cPanel often exports MYSQL_* for root; server/.env must win on shared hosts */
  override: true,
});

/* Force MYSQL_* again from file so nothing can stomp them after dotenv (some hosts inject env late). */
try {
  if (fs.existsSync(envPath)) {
    const parsed = dotenv.parse(fs.readFileSync(envPath));
    for (const [k, v] of Object.entries(parsed)) {
      if (k.startsWith('MYSQL_')) process.env[k] = v;
    }
  }
} catch {
  /* ignore */
}

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
