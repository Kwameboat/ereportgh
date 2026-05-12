const config = require('../config');

function errorHandler(err, req, res, next) {
  // eslint-disable-next-line no-console
  console.error(err);
  const status = err.status || 500;
  let message = err.message || 'Internal server error';
  if (config.nodeEnv === 'production' && status >= 500) {
    message = 'Internal server error';
  }
  const body = { ok: false, error: message };
  if (config.nodeEnv !== 'production' && err.details) {
    body.details = err.details;
  }
  if (config.nodeEnv !== 'production' && status >= 500) {
    body.stack = err.stack;
  }
  res.status(status).json(body);
}

function asyncHandler(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

module.exports = { errorHandler, asyncHandler };
