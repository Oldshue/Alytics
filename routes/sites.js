const express = require('express');
const router = express.Router();
const { getDb } = require('../db/database');
const { v4: uuidv4 } = require('uuid');

// GET /api/sites
router.get('/', (req, res) => {
  const db = getDb();
  const sites = db.prepare('SELECT * FROM sites ORDER BY created_at DESC').all();
  res.json(sites);
});

// POST /api/sites
router.post('/', (req, res) => {
  try {
    const { name, domain } = req.body;
    if (!name || !domain) {
      return res.status(400).json({ error: 'Name and domain are required' });
    }

    const db = getDb();
    const id = uuidv4();
    const api_key = 'aly_' + uuidv4().replace(/-/g, '');

    db.prepare('INSERT INTO sites (id, name, domain, api_key) VALUES (?, ?, ?, ?)')
      .run(id, name.trim(), domain.trim().replace(/^https?:\/\//, ''), api_key);

    const site = db.prepare('SELECT * FROM sites WHERE id = ?').get(id);
    res.json(site);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/sites/:id
router.delete('/:id', (req, res) => {
  try {
    const db = getDb();
    db.prepare('DELETE FROM pageviews WHERE site_id = ?').run(req.params.id);
    db.prepare('DELETE FROM events WHERE site_id = ?').run(req.params.id);
    db.prepare('DELETE FROM sites WHERE id = ?').run(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
