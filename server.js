require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3030;

app.use(helmet({ contentSecurityPolicy: false }));
app.use(compression());
app.use(express.json({ limit: '10kb' }));
app.use(express.static(path.join(__dirname, 'public')));

// Wide-open CORS only for the tracker endpoint (called from user's sites)
app.options('/api/track', cors());
app.use('/api/track', cors());

// Routes
app.use('/api/track', require('./routes/track'));
app.use('/api/analytics', require('./routes/analytics'));
app.use('/api/chat', require('./routes/chat'));
app.use('/api/sites', require('./routes/sites'));

// Serve tracker script
app.get('/alytics.js', (req, res) => {
  res.setHeader('Content-Type', 'application/javascript');
  res.setHeader('Cache-Control', 'public, max-age=3600');
  res.sendFile(path.join(__dirname, 'tracker', 'alytics.js'));
});

// SPA fallback
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Init DB then start
const db = require('./db/database');
db.init();

app.listen(PORT, () => {
  console.log(`\n🚀 Alytics running at http://localhost:${PORT}\n`);
});
