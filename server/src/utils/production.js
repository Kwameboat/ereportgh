const config = require('../config');

const DEV_JWT = 'dev-jwt-secret-change-in-production';
const DEV_EXCEL = 'dev-excel-key';

function assertProductionSafeToStart() {
  if (config.nodeEnv !== 'production') return;

  const errors = [];
  if (!config.jwtSecret || config.jwtSecret.length < 32 || config.jwtSecret === DEV_JWT) {
    errors.push('Set a strong JWT_SECRET (32+ chars, not the dev default).');
  }
  if (!config.excelApiKey || config.excelApiKey.length < 16 || config.excelApiKey === DEV_EXCEL) {
    errors.push('Set a strong EXCEL_API_KEY (16+ chars, not the dev default).');
  }
  if (!config.mysql.password && config.mysql.user !== 'root') {
    errors.push('MYSQL_PASSWORD is required for production.');
  }
  if (config.publicBaseUrl.startsWith('http://') && !config.publicBaseUrl.includes('localhost')) {
    errors.push('PUBLIC_BASE_URL should use https:// in production (not plain http).');
  }

  if (errors.length) {
    const msg = `Refusing to start in production:\n- ${errors.join('\n- ')}`;
    // eslint-disable-next-line no-console
    console.error(msg);
    process.exit(1);
  }
}

module.exports = { assertProductionSafeToStart };
