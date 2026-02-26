/* ─── State ─────────────────────────────────────────────── */
let sites = [];
let currentSite = null;
let currentPeriod = '7d';
let trafficChart = null;
let chatHistory = [];
let realtimeTimer = null;

/* ─── API helpers ───────────────────────────────────────── */
async function api(path, opts = {}) {
  const res = await fetch(path, {
    headers: { 'Content-Type': 'application/json' },
    ...opts
  });
  if (!res.ok) throw new Error(await res.text());
  if (res.status === 204) return null;
  return res.json();
}

/* ─── Format helpers ────────────────────────────────────── */
function fmt(n) {
  if (n === null || n === undefined) return '—';
  if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
  if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
  return n.toLocaleString();
}

function truncate(str, len = 35) {
  return str.length > len ? str.slice(0, len) + '…' : str;
}

/* ─── Init ──────────────────────────────────────────────── */
async function init() {
  await loadSites();

  document.getElementById('periodSelect').addEventListener('change', e => {
    currentPeriod = e.target.value;
    loadDashboard();
  });

  document.getElementById('siteSelect').addEventListener('change', e => {
    currentSite = sites.find(s => s.id === e.target.value) || null;
    chatHistory = [];
    loadDashboard();
  });

  document.getElementById('addSiteBtn').addEventListener('click', () => showModal('addSiteModal'));
  document.getElementById('emptyAddSite').addEventListener('click', () => {
    hideModal('emptyState');
    showModal('addSiteModal');
  });
  document.getElementById('cancelSiteBtn').addEventListener('click', () => hideModal('addSiteModal'));
  document.getElementById('createSiteBtn').addEventListener('click', createSite);
  document.getElementById('closeSnippet').addEventListener('click', () => hideModal('snippetModal'));
  document.getElementById('copySnippet').addEventListener('click', copySnippet);

  setupChat();
}

/* ─── Sites ─────────────────────────────────────────────── */
async function loadSites() {
  sites = await api('/api/sites');
  const sel = document.getElementById('siteSelect');
  sel.innerHTML = '';

  if (!sites.length) {
    showModal('emptyState');
    return;
  }

  sites.forEach(s => {
    const opt = document.createElement('option');
    opt.value = s.id;
    opt.textContent = s.name + ' (' + s.domain + ')';
    sel.appendChild(opt);
  });

  currentSite = sites[0];
  sel.value = currentSite.id;
  loadDashboard();
}

async function createSite() {
  const name = document.getElementById('newSiteName').value.trim();
  const domain = document.getElementById('newSiteDomain').value.trim();
  if (!name || !domain) return alert('Please fill in both fields.');

  const btn = document.getElementById('createSiteBtn');
  btn.textContent = 'Creating…'; btn.disabled = true;

  try {
    const site = await api('/api/sites', {
      method: 'POST',
      body: JSON.stringify({ name, domain })
    });

    hideModal('addSiteModal');
    document.getElementById('newSiteName').value = '';
    document.getElementById('newSiteDomain').value = '';

    const origin = location.origin;
    const snippet = `<!-- Alytics Tracker -->\n<script>\n  window._alytics = { key: '${site.api_key}', host: '${origin}' };\n<\/script>\n<script src="${origin}/alytics.js" async><\/script>`;
    document.getElementById('snippetCode').textContent = snippet;
    showModal('snippetModal');

    await loadSites();
  } catch (err) {
    alert('Error: ' + err.message);
  } finally {
    btn.textContent = 'Create Site'; btn.disabled = false;
  }
}

function copySnippet() {
  const text = document.getElementById('snippetCode').textContent;
  navigator.clipboard.writeText(text).then(() => {
    const btn = document.getElementById('copySnippet');
    btn.textContent = 'Copied!';
    setTimeout(() => btn.textContent = 'Copy', 2000);
  });
}

/* ─── Dashboard ─────────────────────────────────────────── */
async function loadDashboard() {
  if (!currentSite) return;

  clearInterval(realtimeTimer);

  const [overview, timeseries, pages, referrers, devices] = await Promise.all([
    api(`/api/analytics/overview?site=${currentSite.id}&period=${currentPeriod}`),
    api(`/api/analytics/timeseries?site=${currentSite.id}&period=${currentPeriod}`),
    api(`/api/analytics/pages?site=${currentSite.id}&period=${currentPeriod}`),
    api(`/api/analytics/referrers?site=${currentSite.id}&period=${currentPeriod}`),
    api(`/api/analytics/devices?site=${currentSite.id}&period=${currentPeriod}`)
  ]);

  renderOverview(overview);
  renderChart(timeseries);
  renderPages(pages);
  renderSources(referrers);
  renderDevices(devices);

  // Realtime polling
  updateRealtime();
  realtimeTimer = setInterval(updateRealtime, 30000);
}

function renderOverview(d) {
  document.getElementById('statVisitors').textContent = fmt(d.unique_visitors);
  document.getElementById('statPageviews').textContent = fmt(d.total_pageviews);
  document.getElementById('statSessions').textContent = fmt(d.unique_sessions);
  document.getElementById('statBounce').textContent = d.bounce_rate + '%';

  const changeEl = document.getElementById('statVisitorChange');
  if (d.visitor_change !== null) {
    const dir = d.visitor_change >= 0 ? 'up' : 'down';
    const sign = d.visitor_change >= 0 ? '▲' : '▼';
    changeEl.className = 'card-change ' + dir;
    changeEl.textContent = sign + ' ' + Math.abs(d.visitor_change) + '% vs prev period';
  } else {
    changeEl.textContent = '';
  }
}

function renderChart(rows) {
  const labels = rows.map(r => {
    // Format date nicely
    const d = new Date(r.date);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  });
  const visitors = rows.map(r => r.visitors);
  const pageviews = rows.map(r => r.pageviews);

  const ctx = document.getElementById('trafficChart').getContext('2d');

  const gradientVisitors = ctx.createLinearGradient(0, 0, 0, 320);
  gradientVisitors.addColorStop(0, 'rgba(99, 102, 241, 0.25)');
  gradientVisitors.addColorStop(0.5, 'rgba(99, 102, 241, 0.08)');
  gradientVisitors.addColorStop(1, 'rgba(99, 102, 241, 0)');

  const gradientViews = ctx.createLinearGradient(0, 0, 0, 320);
  gradientViews.addColorStop(0, 'rgba(34, 211, 238, 0.15)');
  gradientViews.addColorStop(0.5, 'rgba(34, 211, 238, 0.05)');
  gradientViews.addColorStop(1, 'rgba(34, 211, 238, 0)');

  if (trafficChart) trafficChart.destroy();

  trafficChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: 'Visitors',
          data: visitors,
          borderColor: '#818cf8',
          backgroundColor: gradientVisitors,
          borderWidth: 2.5,
          pointRadius: rows.length > 14 ? 0 : 4,
          pointHoverRadius: 6,
          pointBackgroundColor: '#818cf8',
          pointBorderColor: '#0a0a12',
          pointBorderWidth: 2,
          tension: 0.4,
          fill: true
        },
        {
          label: 'Pageviews',
          data: pageviews,
          borderColor: '#22d3ee',
          backgroundColor: gradientViews,
          borderWidth: 2,
          pointRadius: rows.length > 14 ? 0 : 4,
          pointHoverRadius: 6,
          pointBackgroundColor: '#22d3ee',
          pointBorderColor: '#0a0a12',
          pointBorderWidth: 2,
          tension: 0.4,
          fill: true
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: 'rgba(20, 20, 42, 0.95)',
          borderColor: 'rgba(38, 38, 74, 0.8)',
          borderWidth: 1,
          titleColor: '#94a3b8',
          bodyColor: '#f1f5f9',
          padding: 14,
          cornerRadius: 10,
          displayColors: true,
          boxPadding: 6,
          titleFont: { weight: '600', size: 12 },
          bodyFont: { size: 13 },
          callbacks: {
            label: function(context) {
              return ' ' + context.dataset.label + ': ' + context.parsed.y.toLocaleString();
            }
          }
        }
      },
      scales: {
        x: {
          grid: { 
            color: 'rgba(30, 30, 53, 0.5)',
            drawBorder: false
          },
          ticks: { 
            color: '#64748b', 
            maxRotation: 0,
            font: { size: 11, weight: '500' },
            padding: 8
          },
          border: { display: false }
        },
        y: {
          grid: { 
            color: 'rgba(30, 30, 53, 0.5)',
            drawBorder: false
          },
          ticks: { 
            color: '#64748b',
            font: { size: 11, weight: '500' },
            padding: 12,
            callback: function(value) {
              if (value >= 1000) return (value / 1000).toFixed(0) + 'K';
              return value;
            }
          },
          border: { display: false },
          beginAtZero: true
        }
      }
    }
  });
}

function renderTable(tableId, rows, cols) {
  const tbody = document.querySelector(`#${tableId} tbody`);
  if (!rows || !rows.length) {
    tbody.innerHTML = '<tr><td colspan="3" style="padding:28px;color:var(--muted);text-align:center;font-size:13px;">No data yet</td></tr>';
    return;
  }

  const maxVal = Math.max(...rows.map(r => r[cols[1]]), 1);
  tbody.innerHTML = rows.map((row, i) => `
    <tr class="bar-row" style="animation: fadeInUp 0.3s ease ${0.05 * i}s backwards;">
      <td style="position:relative;">
        <div class="bar-bg" style="width:${(row[cols[1]] / maxVal * 100).toFixed(0)}%"></div>
        <span class="path-cell" title="${row[cols[0]]}">${truncate(row[cols[0]], 40)}</span>
      </td>
      <td>${fmt(row[cols[1]])}</td>
      <td>${fmt(row[cols[2]])}</td>
    </tr>
  `).join('');
}

function renderPages(rows) {
  renderTable('pagesTable', rows, ['path', 'visitors', 'pageviews']);
}

function renderSources(rows) {
  renderTable('sourcesTable', rows, ['source', 'visitors', 'pageviews']);
}

function renderDevices(data) {
  renderBreakdown('devicesPanel', data.devices, '#6366f1', '#22d3ee', '#10b981');
  renderBreakdown('browsersPanel', [...data.browsers.slice(0, 4), ...data.os.slice(0, 4)], '#818cf8', '#a78bfa', '#c4b5fd');
}

function renderBreakdown(panelId, items, ...colors) {
  if (!items || !items.length) {
    document.getElementById(panelId).innerHTML = '<div class="empty" style="padding:20px;color:var(--muted);text-align:center;">No data yet</div>';
    return;
  }
  const total = items.reduce((s, i) => s + i.visitors, 0) || 1;
  // Premium gradient palette
  const palette = [
    'linear-gradient(90deg, #818cf8, #6366f1)',
    'linear-gradient(90deg, #22d3ee, #0891b2)',
    'linear-gradient(90deg, #34d399, #10b981)',
    'linear-gradient(90deg, #fbbf24, #f59e0b)',
    'linear-gradient(90deg, #f87171, #ef4444)',
    'linear-gradient(90deg, #a78bfa, #8b5cf6)',
    'linear-gradient(90deg, #f472b6, #ec4899)',
    'linear-gradient(90deg, #2dd4bf, #14b8a6)'
  ];

  document.getElementById(panelId).innerHTML = items.map((item, i) => `
    <div class="device-row">
      <div class="device-label">${item.device || item.browser || item.os || '?'}</div>
      <div class="device-bar-wrap">
        <div class="device-bar" style="width:${(item.visitors / total * 100).toFixed(0)}%; background:${palette[i % palette.length]}"></div>
      </div>
      <div class="device-pct">${Math.round(item.visitors / total * 100)}%</div>
    </div>
  `).join('');
}

async function updateRealtime() {
  if (!currentSite) return;
  try {
    const data = await api(`/api/analytics/realtime?site=${currentSite.id}`);
    const badge = document.getElementById('realtimeBadge');
    badge.textContent = data.active_visitors + (data.active_visitors === 1 ? ' online' : ' online');
  } catch (e) {}
}

/* ─── Chat ──────────────────────────────────────────────── */
function setupChat() {
  const fab = document.getElementById('chatFab');
  const drawer = document.getElementById('chatDrawer');
  const closeBtn = document.getElementById('chatClose');
  const input = document.getElementById('chatInput');
  const sendBtn = document.getElementById('chatSend');

  fab.addEventListener('click', () => {
    drawer.classList.add('open');
    fab.classList.add('hidden');
    input.focus();
  });

  closeBtn.addEventListener('click', () => {
    drawer.classList.remove('open');
    fab.classList.remove('hidden');
  });

  sendBtn.addEventListener('click', sendChat);
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendChat(); }
  });

  // Auto-resize textarea
  input.addEventListener('input', () => {
    input.style.height = 'auto';
    input.style.height = Math.min(input.scrollHeight, 120) + 'px';
  });

  // Hint chips
  document.querySelectorAll('.chat-hint').forEach(hint => {
    hint.addEventListener('click', () => {
      input.value = hint.textContent;
      sendChat();
    });
  });
}

async function sendChat() {
  if (!currentSite) return alert('Select a site first.');
  const input = document.getElementById('chatInput');
  const message = input.value.trim();
  if (!message) return;

  input.value = '';
  input.style.height = 'auto';

  document.getElementById('chatHints').classList.add('hidden');

  appendMessage('user', message);
  const thinking = appendThinking();
  document.getElementById('chatSend').disabled = true;

  try {
    const res = await api('/api/chat', {
      method: 'POST',
      body: JSON.stringify({ message, history: chatHistory, site_id: currentSite.id })
    });

    thinking.remove();
    appendMessage('assistant', res.reply);
    chatHistory = res.history;
  } catch (err) {
    thinking.remove();
    appendMessage('assistant', 'Error: ' + err.message);
  } finally {
    document.getElementById('chatSend').disabled = false;
  }
}

function appendMessage(role, text) {
  const msgs = document.getElementById('chatMessages');
  const div = document.createElement('div');
  div.className = 'msg ' + role;
  div.innerHTML = `<div class="bubble">${escapeHtml(text)}</div>`;
  msgs.appendChild(div);
  msgs.scrollTop = msgs.scrollHeight;
  return div;
}

function appendThinking() {
  const msgs = document.getElementById('chatMessages');
  const div = document.createElement('div');
  div.className = 'msg assistant msg-thinking';
  div.innerHTML = `<div class="bubble"><div class="thinking-dots"><span></span><span></span><span></span></div></div>`;
  msgs.appendChild(div);
  msgs.scrollTop = msgs.scrollHeight;
  return div;
}

function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\n/g, '<br>');
}

/* ─── Modal helpers ─────────────────────────────────────── */
function showModal(id) { document.getElementById(id).classList.remove('hidden'); }
function hideModal(id) { document.getElementById(id).classList.add('hidden'); }

/* ─── Bootstrap ─────────────────────────────────────────── */
init();
