const config = require('../config');

function requestLogger(req, res, next) {
  if (config.nodeEnv !== 'production') return next();

  const start = Date.now();
  res.on('finish', () => {
    const ms = Date.now() - start;
    // eslint-disable-next-line no-console
    console.log(`${req.method} ${req.originalUrl} ${res.statusCode} ${ms}ms`);
  });
  next();
}

module.exports = { requestLogger };
