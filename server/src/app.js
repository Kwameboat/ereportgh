const path = require('path');
const express = require('express');
const compression = require('compression');
const cors = require('cors');
const helmet = require('helmet');
const config = require('./config');
const { errorHandler } = require('./middleware/errorHandler');
const { requestLogger } = require('./middleware/requestLogger');
const healthRoutes = require('./routes/health');
const excelRoutes = require('./routes/excel');
const publicRoutes = require('./routes/public');
const adminRoutes = require('./routes/admin');

const clientDir = path.join(__dirname, '../../client');
const uploadsDir = path.join(__dirname, '../uploads');

function buildHelmet() {
  const isProd = config.nodeEnv === 'production';
  return helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    contentSecurityPolicy: {
      useDefaults: false,
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: [
          "'self'",
          'https://cdn.tailwindcss.com',
          ...(isProd ? [] : ["'unsafe-eval'"]),
        ],
        styleSrc: ["'self'", "'unsafe-inline'", 'https:'],
        /* Allow HTTPS images (Unsplash & redirects) for hero stock photos */
        imgSrc: ["'self'", 'data:', 'blob:', 'https:'],
        fontSrc: ["'self'", 'https://fonts.gstatic.com'],
        connectSrc: ["'self'"],
        frameSrc: ["'self'"],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
        ...(isProd && config.publicBaseUrl.startsWith('https://') ? { upgradeInsecureRequests: [] } : {}),
      },
    },
  });
}

function buildCors() {
  const list = config.corsOrigins;
  if (!list || list.length === 0) {
    return cors({ origin: true, credentials: true });
  }
  return cors({
    origin(origin, cb) {
      if (!origin) return cb(null, true);
      if (list.includes(origin)) return cb(null, true);
      return cb(null, false);
    },
    credentials: true,
  });
}

function createApp() {
  const app = express();
  if (config.trustProxy) {
    app.set('trust proxy', 1);
  }

  app.use(buildHelmet());
  app.use(buildCors());
  if (config.nodeEnv === 'production') {
    app.use(compression());
  }
  app.use(requestLogger);
  app.use(express.json({ limit: '15mb' }));

  app.use('/uploads', express.static(uploadsDir));
  app.use(express.static(clientDir));

  app.use('/api', healthRoutes);
  app.use('/api/excel', excelRoutes);
  app.use('/api/public', publicRoutes);
  app.use('/api/admin', adminRoutes);

  app.use(errorHandler);
  return app;
}

module.exports = { createApp };
