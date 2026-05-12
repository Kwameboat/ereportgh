const express = require('express');
const { pool } = require('../db/pool');
const config = require('../config');
const { asyncHandler } = require('../middleware/errorHandler');

const router = express.Router();

router.get(
  '/health',
  asyncHandler(async (req, res) => {
    try {
      await pool.query('SELECT 1 AS ok');
      res.json({
        ok: true,
        env: config.nodeEnv,
        db: true,
        time: new Date().toISOString(),
        mysqlUser: config.mysql.user,
        mysqlDatabase: config.mysql.database,
      });
    } catch (err) {
      res.status(503).json({
        ok: false,
        env: config.nodeEnv,
        db: false,
        error: 'Database unavailable',
        mysqlUser: config.mysql.user,
        mysqlDatabase: config.mysql.database,
      });
    }
  })
);

module.exports = router;
