// ─── State ───────────────────────────────────────────────────────────────────
const pointValues = { MNQ: 2, NQ: 20, ES: 50, MES: 5 };

let account = JSON.parse(localStorage.getItem('account')) || {
  name: 'Default',
  size: 50000,
  dailyDD: 5,
  maxTrailingDD: 10,
  profitTarget: 3000,
  balance: 50000,
  highWaterMark: 50000,
  todayLoss: 0
};
let trades     = JSON.parse(localStorage.getItem('trades'))     || [];
let equityData = JSON.parse(localStorage.getItem('equityData')) || [account.balance];

// ─── Persist ─────────────────────────────────────────────────────────────────
function save() {
  localStorage.setItem('account',    JSON.stringify(account));
  localStorage.setItem('trades',     JSON.stringify(trades));
  localStorage.setItem('equityData', JSON.stringify(equityData));
}

// ─── Confirm Dialog ───────────────────────────────────────────────────────────
function showConfirm(message) {
  return new Promise(resolve => {
    document.getElementById('confirmMsg').textContent = message;
    document.getElementById('confirmOverlay').classList.add('show');

    document.getElementById('confirmYes').onclick = () => {
      document.getElementById('confirmOverlay').classList.remove('show');
      resolve(true);
    };
    document.getElementById('confirmNo').onclick = () => {
      document.getElementById('confirmOverlay').classList.remove('show');
      resolve(false);
    };
  });
}

// ─── Breach Alert ─────────────────────────────────────────────────────────────
function checkBreach() {
  const limit  = account.size * account.dailyDD / 100;
  const pct    = account.todayLoss / limit;
  const label  = document.getElementById('remainingLabel');
  const banner = document.getElementById('breachAlert');

  banner.classList.toggle('show', pct >= 1);

  label.className = 'highlight';
  if      (pct >= 1)   label.classList.add('danger');
  else if (pct >= 0.8) label.classList.add('warning');
}

// ─── Trade History Table ──────────────────────────────────────────────────────
function renderTradeTable() {
  const tbody    = document.getElementById('tradeTableBody');
  const table    = document.getElementById('tradeTable');
  const emptyMsg = document.getElementById('emptyMsg');

  tbody.innerHTML = '';

  if (trades.length === 0) {
    table.style.display    = 'none';
    emptyMsg.style.display = 'block';
    return;
  }

  table.style.display    = 'table';
  emptyMsg.style.display = 'none';

  // Newest first
  [...trades].reverse().forEach((t, reversedIdx) => {
    const realIdx  = trades.length - 1 - reversedIdx;
    const pnlClass = t.pnl >= 0 ? 'pnl-pos' : 'pnl-neg';
    const pnlStr   = (t.pnl >= 0 ? '+' : '') + '$' + t.pnl.toFixed(2);
    const dir      = t.dir.charAt(0).toUpperCase() + t.dir.slice(1);

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${realIdx + 1}</td>
      <td>${t.instr}</td>
      <td>${dir}</td>
      <td>${t.entry}</td>
      <td>${t.exit}</td>
      <td>${t.contracts}</td>
      <td class="${pnlClass}">${pnlStr}</td>
      <td>${t.notes || '—'}</td>
      <td>
        <button class="btn-delete" onclick="deleteTrade(${realIdx})">Delete</button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

// ─── Delete Trade ─────────────────────────────────────────────────────────────
async function deleteTrade(idx) {
  const confirmed = await showConfirm('Delete this trade? This will reverse its P&L.');
  if (!confirmed) return;

  const pnl = trades[idx].pnl;
  account.balance -= pnl;
  if (pnl < 0) account.todayLoss += pnl; // undo the loss that was added
  equityData.splice(idx + 1, 1);
  trades.splice(idx, 1);

  save();
  updateDashboard();
}

// ─── Main Update ─────────────────────────────────────────────────────────────
function updateDashboard() {
  const ddLimit   = account.size * account.dailyDD / 100;
  const remaining = Math.max(0, ddLimit - account.todayLoss);
  const profit    = account.balance - account.size;
  const progPct   = Math.max(0, Math.min(100, (profit / account.profitTarget) * 100));

  document.getElementById('balance').textContent        = account.balance.toLocaleString();
  document.getElementById('dailyLossLimit').textContent = ddLimit.toLocaleString();
  document.getElementById('lossToday').textContent      = account.todayLoss.toLocaleString();
  document.getElementById('remainingRisk').textContent  = remaining.toLocaleString();
  document.getElementById('target').textContent         = account.profitTarget.toLocaleString();
  document.getElementById('currentProfit').textContent  = profit.toLocaleString();
  document.getElementById('progress').style.width       = progPct + '%';

  // Stats
  if (trades.length > 0) {
    const wins        = trades.filter(t => t.pnl > 0);
    const losses      = trades.filter(t => t.pnl < 0);
    const grossProfit = wins.reduce((s, t) => s + t.pnl, 0);
    const grossLoss   = Math.abs(losses.reduce((s, t) => s + t.pnl, 0));
    const avgWin      = wins.length   > 0 ? grossProfit / wins.length   : 0;
    const avgLoss     = losses.length > 0 ? grossLoss   / losses.length : 1;

    document.getElementById('totalTrades').textContent  = trades.length;
    document.getElementById('winRate').textContent      = (wins.length / trades.length * 100).toFixed(1) + '%';
    document.getElementById('profitFactor').textContent = grossLoss > 0 ? (grossProfit / grossLoss).toFixed(2) : '∞';
    document.getElementById('avgR').textContent         = (avgWin / avgLoss).toFixed(2);
  }

  // Chart
  chart.data.labels           = equityData.map((_, i) => i === 0 ? 'Start' : 'T' + i);
  chart.data.datasets[0].data = equityData;
  chart.update();

  checkBreach();
  renderTradeTable();
  save();
}

// ─── Account Form ─────────────────────────────────────────────────────────────
document.getElementById('accountForm').addEventListener('submit', async e => {
  e.preventDefault();

  if (trades.length > 0) {
    const ok = await showConfirm('Updating the account will reset all trades and P&L. Continue?');
    if (!ok) return;
  }

  const f = new FormData(e.target);
  const size = parseFloat(f.get('accountSize'));

  account = {
    name:          f.get('accountName'),
    size,
    dailyDD:       parseFloat(f.get('dailyDrawdown')),
    maxTrailingDD: parseFloat(f.get('maxTrailingDrawdown')),
    profitTarget:  parseFloat(f.get('profitTarget')),
    balance:       size,
    highWaterMark: size,
    todayLoss:     0
  };
  trades     = [];
  equityData = [size];

  document.getElementById('accountError').textContent = '';
  updateDashboard();
});

// ─── Risk Calculator ──────────────────────────────────────────────────────────
document.getElementById('riskForm').addEventListener('submit', e => {
  e.preventDefault();

  const f          = new FormData(e.target);
  const instr      = f.get('instrument');
  const entry      = parseFloat(f.get('entryPrice'));
  const stop       = parseFloat(f.get('stopLoss'));
  const riskPct    = parseFloat(f.get('riskPercent'));
  const pointValue = pointValues[instr];

  if (!pointValue || isNaN(entry) || isNaN(stop) || entry === stop) return;

  const distance        = Math.abs(entry - stop);
  const riskAmount      = account.balance * (riskPct / 100);
  const riskPerContract = distance * pointValue;
  const positionSize    = Math.floor(riskAmount / riskPerContract);

  document.getElementById('posSize').textContent     = positionSize;
  document.getElementById('riskDollars').textContent = '$' + riskAmount.toFixed(2);
});

// ─── Trade Logger ─────────────────────────────────────────────────────────────
document.getElementById('tradeForm').addEventListener('submit', e => {
  e.preventDefault();

  const errorEl = document.getElementById('tradeError');

  // Block if breached
  if (account.todayLoss >= account.size * account.dailyDD / 100) {
    errorEl.textContent = '⛔ Daily drawdown limit reached. No more trades allowed today.';
    return;
  }

  const f          = new FormData(e.target);
  const instr      = f.get('tradeInstrument');
  const dir        = f.get('direction');
  const entry      = parseFloat(f.get('entry'));
  const exit       = parseFloat(f.get('exit'));
  const contracts  = parseInt(f.get('contracts'));
  const notes      = f.get('notes');
  const pointValue = pointValues[instr];

  if (!pointValue || isNaN(entry) || isNaN(exit) || isNaN(contracts)) {
    errorEl.textContent = 'Please fill in all fields correctly.';
    return;
  }

  const distance = dir === 'long' ? (exit - entry) : (entry - exit);
  const pnl      = distance * contracts * pointValue;

  if (pnl < 0) account.todayLoss += Math.abs(pnl);
  account.balance      += pnl;
  account.highWaterMark = Math.max(account.highWaterMark, account.balance);
  equityData.push(account.balance);
  trades.push({ instr, dir, entry, exit, contracts, notes, pnl });

  errorEl.textContent = '';
  e.target.reset();
  updateDashboard();
});

// ─── Chart ────────────────────────────────────────────────────────────────────
const ctx   = document.getElementById('equityChart').getContext('2d');
const chart = new Chart(ctx, {
  type: 'line',
  data: {
    labels:   equityData.map((_, i) => i === 0 ? 'Start' : 'T' + i),
    datasets: [{
      label:           'Equity',
      data:            equityData,
      borderColor:     '#cc66ff',
      backgroundColor: 'rgba(160, 32, 240, 0.15)',
      fill:            true,
      tension:         0.3,
      pointRadius:     4,
      pointBackgroundColor: '#ff9cff'
    }]
  },
  options: {
    responsive: true,
    plugins: {
      legend: { labels: { color: '#caa6ff' } }
    },
    scales: {
      x: { ticks: { color: '#9a6abf' }, grid: { color: '#1e003a' } },
      y: { ticks: { color: '#9a6abf' }, grid: { color: '#1e003a' }, beginAtZero: false }
    }
  }
});

// ─── Init ─────────────────────────────────────────────────────────────────────
updateDashboard();