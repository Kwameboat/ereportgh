const jwt = require('jsonwebtoken');
const config = require('../config');

function requireAdmin(req, res, next) {
  const h = req.headers.authorization;
  if (!h || !h.startsWith('Bearer ')) {
    const e = new Error('Unauthorized');
    e.status = 401;
    return next(e);
  }
  const token = h.slice(7);
  try {
    req.admin = jwt.verify(token, config.jwtSecret);
    return next();
  } catch {
    const e = new Error('Invalid or expired token');
    e.status = 401;
    return next(e);
  }
}

function signAdminToken(payload) {
  return jwt.sign(payload, config.jwtSecret, { expiresIn: config.jwtExpiresIn });
}

module.exports = { requireAdmin, signAdminToken };
