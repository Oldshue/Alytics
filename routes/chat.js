const express = require('express');
const router = express.Router();
const Anthropic = require('@anthropic-ai/sdk');
const { getDb } = require('../db/database');

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const SYSTEM_PROMPT = `You are Alytics AI, an analytics expert assistant embedded in an AI-powered web analytics platform.

You have access to a SQLite database with the following schema:

TABLE pageviews:
  id INTEGER, site_id TEXT, session_id TEXT, visitor_id TEXT,
  path TEXT (e.g. "/blog/my-post"), url TEXT, referrer TEXT (empty = direct),
  title TEXT, browser TEXT, os TEXT, device TEXT (Desktop/Mobile/Tablet),
  duration INTEGER (seconds), timestamp INTEGER (unix)

TABLE events:
  id INTEGER, site_id TEXT, session_id TEXT, visitor_id TEXT,
  name TEXT (event name), props TEXT (JSON), timestamp INTEGER (unix)

TABLE sites:
  id TEXT, name TEXT, domain TEXT, api_key TEXT, created_at INTEGER

Current site_id: {{SITE_ID}}
Current time: {{NOW}}

Rules:
- Always filter by the correct site_id in WHERE clauses
- Use date(timestamp, 'unixepoch') for readable dates
- Use COUNT(DISTINCT visitor_id) for unique visitors
- Use COUNT(DISTINCT session_id) for sessions
- Bounce rate = sessions with only 1 pageview / total sessions * 100
- Only use SELECT queries — never INSERT, UPDATE, DELETE, or DROP
- Give direct, actionable answers — builders want insights, not summaries of data
- When you find interesting patterns, call them out proactively
- Format numbers clearly (e.g., "1,234 visitors" not "1234")`;

const tools = [
  {
    name: 'run_query',
    description: 'Execute a SQL SELECT query against the analytics database',
    input_schema: {
      type: 'object',
      properties: {
        sql: {
          type: 'string',
          description: 'A valid SQLite SELECT statement. Only SELECT is allowed.'
        }
      },
      required: ['sql']
    }
  }
];

function safeQuery(sql) {
  const clean = sql.trim().toLowerCase();

  if (!clean.startsWith('select')) {
    return { error: 'Only SELECT queries are allowed.' };
  }

  const blocked = ['drop ', 'delete ', 'update ', 'insert ', 'alter ', 'create ', 'attach '];
  for (const b of blocked) {
    if (clean.includes(b)) {
      return { error: `Blocked keyword: ${b.trim()}` };
    }
  }

  try {
    const db = getDb();
    const rows = db.prepare(sql).all();
    return { rows: rows.slice(0, 200), count: rows.length };
  } catch (err) {
    return { error: err.message };
  }
}

router.post('/', async (req, res) => {
  try {
    const { message, history, site_id } = req.body;

    if (!message || !site_id) {
      return res.status(400).json({ error: 'Missing message or site_id' });
    }

    const db = getDb();
    const site = db.prepare('SELECT id, name, domain FROM sites WHERE id = ?').get(site_id);
    if (!site) return res.status(400).json({ error: 'Invalid site' });

    const systemPrompt = SYSTEM_PROMPT
      .replace('{{SITE_ID}}', site_id)
      .replace('{{NOW}}', new Date().toISOString());

    const messages = [
      ...(history || []),
      { role: 'user', content: message }
    ];

    let currentMessages = [...messages];
    let response;

    // Agentic tool-use loop
    while (true) {
      response = await client.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 2048,
        system: systemPrompt,
        tools,
        messages: currentMessages
      });

      if (response.stop_reason !== 'tool_use') break;

      const toolBlock = response.content.find(b => b.type === 'tool_use');
      if (!toolBlock) break;

      const result = safeQuery(toolBlock.input.sql);

      currentMessages = [
        ...currentMessages,
        { role: 'assistant', content: response.content },
        {
          role: 'user',
          content: [{
            type: 'tool_result',
            tool_use_id: toolBlock.id,
            content: JSON.stringify(result)
          }]
        }
      ];
    }

    const textBlock = response.content.find(b => b.type === 'text');
    const reply = textBlock ? textBlock.text : 'No response generated.';

    res.json({
      reply,
      history: [
        ...messages,
        { role: 'assistant', content: reply }
      ]
    });

  } catch (err) {
    console.error('Chat error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
