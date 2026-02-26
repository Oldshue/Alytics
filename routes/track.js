const express = require('express');
const router = express.Router();
const { getDb } = require('../db/database');
const { parseUA } = require('../lib/ua-parser');

router.post('/', (req, res) => {
  try {
    const { key, type, visitor_id, session_id, path, url, referrer, title, name, props } = req.body;

    if (!key || !visitor_id || !session_id) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const db = getDb();
    const site = db.prepare('SELECT id FROM sites WHERE api_key = ?').get(key);

    if (!site) {
      return res.status(401).json({ error: 'Invalid API key' });
    }

    const ua = req.headers['user-agent'] || '';
    const { browser, os, device } = parseUA(ua);
    const now = Math.floor(Date.now() / 1000);

    if (type === 'pageview') {
      db.prepare(`
        INSERT INTO pageviews (site_id, session_id, visitor_id, path, url, referrer, title, browser, os, device, timestamp)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        site.id, session_id, visitor_id,
        path || '/', url || '', referrer || '', title || '',
        browser, os, device, now
      );
    } else if (type === 'event') {
      db.prepare(`
        INSERT INTO events (site_id, session_id, visitor_id, name, props, timestamp)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(
        site.id, session_id, visitor_id,
        name || 'unknown', JSON.stringify(props || {}), now
      );
    }

    res.status(204).end();
  } catch (err) {
    console.error('Track error:', err.message);
    res.status(500).json({ error: 'Internal error' });
  }
});

module.exports = router;
