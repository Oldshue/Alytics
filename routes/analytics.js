const express = require('express');
const router = express.Router();
const { getDb } = require('../db/database');

const PERIODS = { '1d': 86400, '7d': 604800, '30d': 2592000, '90d': 7776000 };

function periodStart(period) {
  return Math.floor(Date.now() / 1000) - (PERIODS[period] || PERIODS['7d']);
}

function resolveSiteId(key) {
  if (!key) return null;
  const db = getDb();
  const site = db.prepare('SELECT id FROM sites WHERE id = ? OR api_key = ?').get(key, key);
  return site ? site.id : null;
}

// GET /api/analytics/overview?site=<id>&period=7d
router.get('/overview', (req, res) => {
  try {
    const siteId = resolveSiteId(req.query.site);
    if (!siteId) return res.status(400).json({ error: 'Invalid site' });

    const db = getDb();
    const since = periodStart(req.query.period);
    const prevSince = since - (Math.floor(Date.now() / 1000) - since);

    const total_pageviews = db.prepare(
      'SELECT COUNT(*) as n FROM pageviews WHERE site_id = ? AND timestamp >= ?'
    ).get(siteId, since).n;

    const unique_visitors = db.prepare(
      'SELECT COUNT(DISTINCT visitor_id) as n FROM pageviews WHERE site_id = ? AND timestamp >= ?'
    ).get(siteId, since).n;

    const unique_sessions = db.prepare(
      'SELECT COUNT(DISTINCT session_id) as n FROM pageviews WHERE site_id = ? AND timestamp >= ?'
    ).get(siteId, since).n;

    const single_page_sessions = db.prepare(`
      SELECT COUNT(*) as n FROM (
        SELECT session_id FROM pageviews
        WHERE site_id = ? AND timestamp >= ?
        GROUP BY session_id HAVING COUNT(*) = 1
      )
    `).get(siteId, since).n;

    const bounce_rate = unique_sessions > 0
      ? Math.round((single_page_sessions / unique_sessions) * 100)
      : 0;

    const prev_visitors = db.prepare(
      'SELECT COUNT(DISTINCT visitor_id) as n FROM pageviews WHERE site_id = ? AND timestamp >= ? AND timestamp < ?'
    ).get(siteId, prevSince, since).n;

    const visitor_change = prev_visitors > 0
      ? Math.round(((unique_visitors - prev_visitors) / prev_visitors) * 1000) / 10
      : null;

    res.json({ total_pageviews, unique_visitors, unique_sessions, bounce_rate, visitor_change });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal error' });
  }
});

// GET /api/analytics/timeseries?site=<id>&period=7d
router.get('/timeseries', (req, res) => {
  try {
    const siteId = resolveSiteId(req.query.site);
    if (!siteId) return res.status(400).json({ error: 'Invalid site' });

    const db = getDb();
    const since = periodStart(req.query.period);

    const rows = db.prepare(`
      SELECT
        date(timestamp, 'unixepoch') as date,
        COUNT(*) as pageviews,
        COUNT(DISTINCT visitor_id) as visitors,
        COUNT(DISTINCT session_id) as sessions
      FROM pageviews
      WHERE site_id = ? AND timestamp >= ?
      GROUP BY date
      ORDER BY date ASC
    `).all(siteId, since);

    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Internal error' });
  }
});

// GET /api/analytics/pages?site=<id>&period=7d&limit=10
router.get('/pages', (req, res) => {
  try {
    const siteId = resolveSiteId(req.query.site);
    if (!siteId) return res.status(400).json({ error: 'Invalid site' });

    const db = getDb();
    const since = periodStart(req.query.period);
    const limit = Math.min(parseInt(req.query.limit) || 10, 50);

    const rows = db.prepare(`
      SELECT
        path,
        COUNT(*) as pageviews,
        COUNT(DISTINCT visitor_id) as visitors,
        COUNT(DISTINCT session_id) as sessions
      FROM pageviews
      WHERE site_id = ? AND timestamp >= ?
      GROUP BY path
      ORDER BY pageviews DESC
      LIMIT ?
    `).all(siteId, since, limit);

    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Internal error' });
  }
});

// GET /api/analytics/referrers?site=<id>&period=7d
router.get('/referrers', (req, res) => {
  try {
    const siteId = resolveSiteId(req.query.site);
    if (!siteId) return res.status(400).json({ error: 'Invalid site' });

    const db = getDb();
    const since = periodStart(req.query.period);
    const limit = Math.min(parseInt(req.query.limit) || 10, 50);

    const rows = db.prepare(`
      SELECT
        CASE
          WHEN referrer = '' OR referrer IS NULL THEN 'Direct / None'
          ELSE referrer
        END as source,
        COUNT(*) as pageviews,
        COUNT(DISTINCT visitor_id) as visitors
      FROM pageviews
      WHERE site_id = ? AND timestamp >= ?
      GROUP BY source
      ORDER BY visitors DESC
      LIMIT ?
    `).all(siteId, since, limit);

    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Internal error' });
  }
});

// GET /api/analytics/devices?site=<id>&period=7d
router.get('/devices', (req, res) => {
  try {
    const siteId = resolveSiteId(req.query.site);
    if (!siteId) return res.status(400).json({ error: 'Invalid site' });

    const db = getDb();
    const since = periodStart(req.query.period);

    const devices = db.prepare(`
      SELECT device, COUNT(DISTINCT visitor_id) as visitors
      FROM pageviews WHERE site_id = ? AND timestamp >= ?
      GROUP BY device ORDER BY visitors DESC
    `).all(siteId, since);

    const browsers = db.prepare(`
      SELECT browser, COUNT(DISTINCT visitor_id) as visitors
      FROM pageviews WHERE site_id = ? AND timestamp >= ?
      GROUP BY browser ORDER BY visitors DESC LIMIT 8
    `).all(siteId, since);

    const os_list = db.prepare(`
      SELECT os, COUNT(DISTINCT visitor_id) as visitors
      FROM pageviews WHERE site_id = ? AND timestamp >= ?
      GROUP BY os ORDER BY visitors DESC LIMIT 8
    `).all(siteId, since);

    res.json({ devices, browsers, os: os_list });
  } catch (err) {
    res.status(500).json({ error: 'Internal error' });
  }
});

// GET /api/analytics/realtime?site=<id>
router.get('/realtime', (req, res) => {
  try {
    const siteId = resolveSiteId(req.query.site);
    if (!siteId) return res.status(400).json({ error: 'Invalid site' });

    const db = getDb();
    const since = Math.floor(Date.now() / 1000) - 300; // last 5 min

    const active_visitors = db.prepare(
      'SELECT COUNT(DISTINCT session_id) as n FROM pageviews WHERE site_id = ? AND timestamp >= ?'
    ).get(siteId, since).n;

    const recent_pages = db.prepare(`
      SELECT path, title, MAX(timestamp) as last_seen
      FROM pageviews WHERE site_id = ? AND timestamp >= ?
      GROUP BY path ORDER BY last_seen DESC LIMIT 5
    `).all(siteId, since);

    res.json({ active_visitors, recent_pages });
  } catch (err) {
    res.status(500).json({ error: 'Internal error' });
  }
});

module.exports = router;
