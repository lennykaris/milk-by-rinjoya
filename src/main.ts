import './style.css';
import type { AppState, ViewName } from './types';
import {
  loadState, saveState,
  addFarmer, updateFarmer, deleteFarmer,
  addEntry, deleteEntry,
  recordPayment,
  getUnpaidTotalForFarmer, getTodayStats, getMonthlyLitresForFarmer,
  exportJSON, exportCSV, importJSON,
} from './db';
import { Icons } from './icons';

// ─── App State ───────────────────────────────────────────────────────────────

let state: AppState = loadState();
let currentView: ViewName = 'home';
let detailFarmerId: string | null = null;
let editFarmerId: string | null = null;

function persist() { saveState(state); }

// ─── Toast ───────────────────────────────────────────────────────────────────

function showToast(msg: string, type: 'success' | 'error' | '' = '') {
  const t = document.getElementById('toast')!;
  t.textContent = msg;
  t.className = `toast ${type} show`;
  setTimeout(() => { t.className = `toast ${type}`; }, 2800);
}

// ─── Navigation ──────────────────────────────────────────────────────────────

function navigate(view: ViewName, farmerId?: string) {
  currentView = view;
  if (farmerId) detailFarmerId = farmerId;

  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  const el = document.getElementById(`view-${view}`);
  if (el) { el.classList.add('active'); }

  document.querySelectorAll('.nav-item').forEach(n => {
    n.classList.toggle('active', (n as HTMLElement).dataset.view === view);
  });

  renderView(view);
}

function renderView(view: ViewName) {
  switch (view) {
    case 'home':        renderHome(); break;
    case 'farmers':     renderFarmers(); break;
    case 'add-entry':   renderAddEntry(); break;
    case 'payments':    renderPayments(); break;
    case 'farmer-detail': if (detailFarmerId) renderFarmerDetail(detailFarmerId); break;
  }
}

// ─── Formatters ──────────────────────────────────────────────────────────────

function fmt(n: number) { return `KES ${n.toLocaleString('en-KE', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`; }

function fmtDate(d: string) {
  const dt = new Date(d + 'T00:00:00');
  return dt.toLocaleDateString('en-KE', { day: '2-digit', month: 'short', year: 'numeric' });
}

function dateParts(d: string) {
  const dt = new Date(d + 'T00:00:00');
  return {
    day: dt.getDate(),
    mon: dt.toLocaleString('en', { month: 'short' }),
  };
}

function initials(name: string) {
  return name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
}

// ─── Home View ───────────────────────────────────────────────────────────────

function renderHome() {
  const { litres, amount } = getTodayStats(state);
  const totalUnpaid = state.farmers.reduce((s, f) => s + getUnpaidTotalForFarmer(state, f.id), 0);
  const totalFarmers = state.farmers.length;

  document.getElementById('home-today-litres')!.textContent = `${litres}L`;
  document.getElementById('home-today-amount')!.textContent = fmt(amount);
  document.getElementById('home-total-unpaid')!.textContent = fmt(totalUnpaid);
  document.getElementById('home-total-farmers')!.textContent = `${totalFarmers}`;
}

// ─── Farmers View ────────────────────────────────────────────────────────────

function renderFarmers(query = '') {
  const list = document.getElementById('farmers-list')!;
  const filtered = state.farmers.filter(f =>
    f.name.toLowerCase().includes(query.toLowerCase()) ||
    f.phone.includes(query)
  );

  if (!filtered.length) {
    list.innerHTML = `<div class="empty-state">
      <div class="empty-icon">${Icons.farmers}</div>
      <h3>No farmers yet</h3>
      <p>Add your first farmer to start tracking milk deliveries.</p>
    </div>`;
    return;
  }

  list.innerHTML = filtered.map(f => {
    const owed = getUnpaidTotalForFarmer(state, f.id);
    return `<div class="farmer-card" data-farmer="${f.id}">
      <div class="farmer-avatar">${initials(f.name)}</div>
      <div class="farmer-info">
        <div class="farmer-name">${f.name}</div>
        <div class="farmer-phone">${f.phone}</div>
      </div>
      <div class="farmer-owed ${owed === 0 ? 'zero' : ''}">
        ${owed === 0 ? 'Settled' : fmt(owed)}
        <small>owed</small>
      </div>
      <div class="farmer-chevron">${Icons.chevronRight}</div>
    </div>`;
  }).join('');

  list.querySelectorAll('.farmer-card').forEach(card => {
    card.addEventListener('click', () => {
      const id = (card as HTMLElement).dataset.farmer!;
      navigate('farmer-detail', id);
    });
  });
}

// ─── Farmer Detail View ──────────────────────────────────────────────────────

function renderFarmerDetail(farmerId: string) {
  const farmer = state.farmers.find(f => f.id === farmerId);
  if (!farmer) { navigate('farmers'); return; }

  const owed    = getUnpaidTotalForFarmer(state, farmerId);
  const monthly = getMonthlyLitresForFarmer(state, farmerId);
  const allEntries = state.entries
    .filter(e => e.farmerId === farmerId)
    .sort((a, b) => b.date.localeCompare(a.date));
  const totalLitres = allEntries.reduce((s, e) => s + e.litres, 0);

  document.getElementById('detail-farmer-name')!.textContent = farmer.name;
  document.getElementById('detail-farmer-phone')!.textContent = farmer.phone;
  document.getElementById('detail-farmer-price')!.textContent = `Default: KES ${farmer.defaultPrice}/L`;
  document.getElementById('detail-monthly-litres')!.textContent = `${monthly}L`;
  document.getElementById('detail-total-litres')!.textContent = `${totalLitres}L`;
  document.getElementById('detail-owed')!.textContent = fmt(owed);

  // Edit / Delete buttons
  const editBtn = document.getElementById('btn-edit-farmer')!;
  const delBtn  = document.getElementById('btn-delete-farmer')!;
  editBtn.onclick = () => openFarmerModal(farmer.id);
  delBtn.onclick = () => {
    if (confirm(`Delete ${farmer.name} and all their records?`)) {
      state = deleteFarmer(state, farmer.id);
      persist();
      showToast('Farmer deleted', 'success');
      navigate('farmers');
    }
  };

  // Mark as paid button
  const payBtn = document.getElementById('btn-mark-paid')!;
  payBtn.onclick = () => openPayModal(farmerId, owed);
  payBtn.setAttribute('disabled', owed === 0 ? 'true' : '');
  (payBtn as HTMLButtonElement).disabled = owed === 0;

  // Entry list
  const entryList = document.getElementById('detail-entries')!;
  if (!allEntries.length) {
    entryList.innerHTML = `<div class="empty-state"><div class="empty-icon">${Icons.milk}</div>
      <h3>No deliveries yet</h3><p>Log a delivery for ${farmer.name} to get started.</p></div>`;
    return;
  }

  entryList.innerHTML = allEntries.map(e => {
    const { day, mon } = dateParts(e.date);
    const isPaid = e.paidStatus !== 'unpaid';
    return `<div class="entry-item">
      <div class="entry-date-badge"><div class="day">${day}</div><div class="mon">${mon}</div></div>
      <div class="entry-details">
        <div class="entry-litres">${e.litres} litres</div>
        <div class="entry-price">@ KES ${e.price}/L</div>
        <span class="entry-status ${isPaid ? 'paid' : 'unpaid'}">${isPaid ? 'Paid' : 'Unpaid'}</span>
      </div>
      <div>
        <div class="entry-total">${fmt(e.total)}</div>
        <div class="entry-actions mt-8">
          <button class="btn-icon danger" data-del-entry="${e.id}">${Icons.trash}</button>
        </div>
      </div>
    </div>`;
  }).join('');

  entryList.querySelectorAll('[data-del-entry]').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const id = (btn as HTMLElement).dataset.delEntry!;
      if (confirm('Delete this delivery entry?')) {
        state = deleteEntry(state, id);
        persist();
        showToast('Entry deleted');
        renderFarmerDetail(farmerId);
      }
    });
  });
}

// ─── Add Entry View ──────────────────────────────────────────────────────────

function renderAddEntry() {
  const sel = document.getElementById('entry-farmer') as HTMLSelectElement;
  sel.innerHTML = state.farmers.length
    ? state.farmers.map(f => `<option value="${f.id}">${f.name}</option>`).join('')
    : `<option value="">— Add a farmer first —</option>`;

  if (state.farmers.length) {
    autoFillPrice(sel.value);
  }
}

function autoFillPrice(farmerId: string) {
  const farmer = state.farmers.find(f => f.id === farmerId);
  if (!farmer) return;
  const priceInput = document.getElementById('entry-price') as HTMLInputElement;
  priceInput.value = String(farmer.defaultPrice);
  calcTotal();
}

function calcTotal() {
  const litres = parseFloat((document.getElementById('entry-litres') as HTMLInputElement).value) || 0;
  const price  = parseFloat((document.getElementById('entry-price') as HTMLInputElement).value) || 0;
  (document.getElementById('entry-total') as HTMLInputElement).value = (litres * price).toFixed(2);
}

// ─── Payments View ───────────────────────────────────────────────────────────

function renderPayments() {
  const totalUnpaid = state.farmers.reduce((s, f) => s + getUnpaidTotalForFarmer(state, f.id), 0);
  document.getElementById('payments-total-unpaid')!.textContent = fmt(totalUnpaid);

  // Unpaid per farmer
  const unpaidList = document.getElementById('payments-unpaid-list')!;
  const farmersWithDebt = state.farmers
    .map(f => ({ farmer: f, owed: getUnpaidTotalForFarmer(state, f.id) }))
    .filter(x => x.owed > 0)
    .sort((a, b) => b.owed - a.owed);

  if (!farmersWithDebt.length) {
    unpaidList.innerHTML = `<div class="empty-state">
      <div class="empty-icon">${Icons.check}</div>
      <h3>All settled!</h3>
      <p>No outstanding payments at the moment.</p>
    </div>`;
  } else {
    unpaidList.innerHTML = farmersWithDebt.map(({ farmer, owed }) => `
      <div class="farmer-card" style="cursor:default">
        <div class="farmer-avatar">${initials(farmer.name)}</div>
        <div class="farmer-info">
          <div class="farmer-name">${farmer.name}</div>
          <div class="farmer-phone">${farmer.phone}</div>
        </div>
        <div class="farmer-owed">
          ${fmt(owed)}
          <small>unpaid</small>
        </div>
        <button class="btn btn-ghost btn-sm" data-pay-farmer="${farmer.id}">Pay</button>
      </div>`).join('');

    unpaidList.querySelectorAll('[data-pay-farmer]').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        const id = (btn as HTMLElement).dataset.payFarmer!;
        const owed = getUnpaidTotalForFarmer(state, id);
        openPayModal(id, owed);
      });
    });
  }

  // Payment history
  const historyList = document.getElementById('payments-history')!;
  const sorted = [...state.payments].sort((a, b) => b.date.localeCompare(a.date));

  if (!sorted.length) {
    historyList.innerHTML = `<p style="text-align:center;color:var(--text-muted);font-size:13px;padding:20px 0">No payment history yet</p>`;
  } else {
    historyList.innerHTML = sorted.map(p => {
      const farmer = state.farmers.find(f => f.id === p.farmerId);
      return `<div class="payment-item">
        <div class="payment-item-header">
          <div class="payment-farmer">${farmer?.name ?? 'Unknown'}</div>
          <div class="payment-amount">${fmt(p.amount)}</div>
        </div>
        <div class="payment-meta">
          Paid on ${fmtDate(p.date)} &middot; Period: ${fmtDate(p.periodStart)} – ${fmtDate(p.periodEnd)}
          ${p.notes ? `<br><em>${p.notes}</em>` : ''}
        </div>
      </div>`;
    }).join('');
  }
}

// ─── Farmer Modal (Add / Edit) ───────────────────────────────────────────────

function openFarmerModal(farmerId?: string) {
  editFarmerId = farmerId ?? null;
  const modal = document.getElementById('modal-farmer')!;
  const title = document.getElementById('modal-farmer-title')!;
  const nameInput  = document.getElementById('farmer-name') as HTMLInputElement;
  const phoneInput = document.getElementById('farmer-phone') as HTMLInputElement;
  const priceInput = document.getElementById('farmer-price') as HTMLInputElement;

  if (farmerId) {
    const f = state.farmers.find(f => f.id === farmerId)!;
    title.textContent = 'Edit Farmer';
    nameInput.value  = f.name;
    phoneInput.value = f.phone;
    priceInput.value = String(f.defaultPrice);
  } else {
    title.textContent = 'Add Farmer';
    nameInput.value = phoneInput.value = priceInput.value = '';
  }

  modal.classList.add('open');
  nameInput.focus();
}

function closeFarmerModal() {
  document.getElementById('modal-farmer')!.classList.remove('open');
  editFarmerId = null;
}

function saveFarmer() {
  const name  = (document.getElementById('farmer-name') as HTMLInputElement).value.trim();
  const phone = (document.getElementById('farmer-phone') as HTMLInputElement).value.trim();
  const price = parseFloat((document.getElementById('farmer-price') as HTMLInputElement).value);

  if (!name) { showToast('Please enter a farmer name', 'error'); return; }
  if (!price || price <= 0) { showToast('Enter a valid price per litre', 'error'); return; }

  if (editFarmerId) {
    state = updateFarmer(state, editFarmerId, { name, phone, defaultPrice: price });
    showToast('Farmer updated', 'success');
  } else {
    state = addFarmer(state, { name, phone, defaultPrice: price });
    showToast('Farmer added', 'success');
  }

  persist();
  closeFarmerModal();
  if (currentView === 'farmers') renderFarmers();
  if (currentView === 'farmer-detail' && editFarmerId) renderFarmerDetail(editFarmerId);
  renderHome();
}

// ─── Pay Modal ────────────────────────────────────────────────────────────────

function openPayModal(farmerId: string, owed: number) {
  const modal = document.getElementById('modal-pay')!;
  const farmer = state.farmers.find(f => f.id === farmerId)!;
  const today = new Date().toISOString().split('T')[0];

  document.getElementById('pay-farmer-name')!.textContent = farmer.name;
  document.getElementById('pay-owed-amount')!.textContent = fmt(owed);
  (document.getElementById('pay-period-start') as HTMLInputElement).value = today;
  (document.getElementById('pay-period-end') as HTMLInputElement).value = today;
  (document.getElementById('pay-notes') as HTMLInputElement).value = '';
  modal.dataset.farmerId = farmerId;

  modal.classList.add('open');
}

function closePayModal() {
  document.getElementById('modal-pay')!.classList.remove('open');
}

function confirmPayment() {
  const modal   = document.getElementById('modal-pay')!;
  const farmerId = modal.dataset.farmerId!;
  const start    = (document.getElementById('pay-period-start') as HTMLInputElement).value;
  const end      = (document.getElementById('pay-period-end') as HTMLInputElement).value;
  const notes    = (document.getElementById('pay-notes') as HTMLInputElement).value.trim();

  if (!start || !end) { showToast('Select a payment period', 'error'); return; }
  if (start > end) { showToast('Start date must be before end date', 'error'); return; }

  const prev = state;
  state = recordPayment(state, farmerId, start, end, notes);
  if (state === prev) { showToast('No unpaid entries in that period', 'error'); return; }

  persist();
  showToast('Payment recorded!', 'success');
  closePayModal();
  renderView(currentView);
}

// ─── HTML Bootstrap ──────────────────────────────────────────────────────────

function buildHTML() {
  const today = new Date().toISOString().split('T')[0];

  document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
  <!-- ── Views ────────────────────────────────────────────── -->

  <!-- HOME -->
  <div id="view-home" class="view active">
    <div class="home-logo">
      <div class="logo-icon">${Icons.milkDrop}</div>
      <div>
        <h1>Rinjoya</h1>
        <span>Milk Shop Tracker</span>
      </div>
    </div>

    <div class="stats-grid">
      <div class="stat-card accent">
        <div class="stat-label">Today's Litres</div>
        <div class="stat-value" id="home-today-litres">0L</div>
        <div class="stat-sub">collected today</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Today's Value</div>
        <div class="stat-value" id="home-today-amount">KES 0</div>
        <div class="stat-sub">from deliveries</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Total Owed</div>
        <div class="stat-value" id="home-total-unpaid">KES 0</div>
        <div class="stat-sub">unpaid balance</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Farmers</div>
        <div class="stat-value" id="home-total-farmers">0</div>
        <div class="stat-sub">registered</div>
      </div>
    </div>

    <div class="card-section">
      <div class="section-title">Quick Actions</div>
      <div style="display:flex;gap:10px;flex-wrap:wrap">
        <button class="btn btn-primary" id="btn-quick-add" style="flex:1;min-width:140px">
          ${Icons.addEntry} Add Delivery
        </button>
        <button class="btn btn-ghost" id="btn-quick-farmer" style="flex:1;min-width:120px">
          ${Icons.farmers} New Farmer
        </button>
      </div>
    </div>

    <div class="card-section mt-12">
      <div class="section-title">Data Backup</div>
      <div class="export-row" style="padding:0">
        <button class="btn btn-ghost btn-sm" id="btn-export-json">${Icons.download} Export JSON</button>
        <button class="btn btn-ghost btn-sm" id="btn-export-csv">${Icons.download} Export CSV</button>
        <button class="btn btn-outline btn-sm" id="btn-import-json">${Icons.upload} Import</button>
      </div>
      <input type="file" id="import-file" accept=".json" style="display:none">
    </div>
  </div>

  <!-- FARMERS -->
  <div id="view-farmers" class="view">
    <div class="view-header">
      <h1>Farmers</h1>
      <p>Manage your milk suppliers</p>
    </div>
    <div class="search-wrap">
      <input class="search-input" id="farmer-search" placeholder="Search by name or phone…" autocomplete="off">
    </div>
    <div id="farmers-list" class="farmer-list"></div>
    <div style="padding:16px 20px 0">
      <button class="btn btn-primary" id="btn-add-farmer">${Icons.addEntry} Add Farmer</button>
    </div>
  </div>

  <!-- FARMER DETAIL -->
  <div id="view-farmer-detail" class="view">
    <div class="view-header">
      <button class="header-back" id="btn-back-detail">${Icons.chevronLeft} Farmers</button>
      <div class="flex-row">
        <div>
          <h1 id="detail-farmer-name">—</h1>
          <p id="detail-farmer-phone"></p>
          <p id="detail-farmer-price" style="font-size:11px;color:var(--mint-dark);font-weight:600"></p>
        </div>
        <div style="display:flex;gap:8px">
          <button class="btn-icon" id="btn-edit-farmer">${Icons.edit}</button>
          <button class="btn-icon danger" id="btn-delete-farmer">${Icons.trash}</button>
        </div>
      </div>
    </div>

    <div class="detail-stats">
      <div class="detail-stat">
        <div class="val" id="detail-monthly-litres">0L</div>
        <div class="lbl">This Month</div>
      </div>
      <div class="detail-stat">
        <div class="val" id="detail-total-litres">0L</div>
        <div class="lbl">All Time</div>
      </div>
      <div class="detail-stat" style="background:var(--mint-light)">
        <div class="val" id="detail-owed" style="color:var(--mint-dark)">KES 0</div>
        <div class="lbl">Owed</div>
      </div>
    </div>

    <div style="padding:0 20px 12px">
      <button class="btn btn-primary" id="btn-mark-paid">${Icons.check} Mark as Paid</button>
    </div>

    <div class="card-section">
      <div class="section-title">Delivery History</div>
    </div>
    <div id="detail-entries" class="entry-list"></div>
  </div>

  <!-- ADD ENTRY -->
  <div id="view-add-entry" class="view">
    <div class="view-header">
      <h1>Log Delivery</h1>
      <p>Record milk received from a farmer</p>
    </div>
    <div class="form-card">
      <div class="form-group">
        <label class="form-label" for="entry-farmer">Farmer</label>
        <select class="form-select" id="entry-farmer"></select>
      </div>
      <div class="form-group">
        <label class="form-label" for="entry-date">Date</label>
        <input class="form-input" type="date" id="entry-date" value="${today}">
      </div>
      <div class="form-row">
        <div class="form-group">
          <label class="form-label" for="entry-litres">Litres</label>
          <input class="form-input" type="number" id="entry-litres" placeholder="0" min="0" step="0.1">
        </div>
        <div class="form-group">
          <label class="form-label" for="entry-price">Price / L (KES)</label>
          <input class="form-input" type="number" id="entry-price" placeholder="0" min="0" step="0.5">
        </div>
      </div>
      <div class="form-group">
        <label class="form-label" for="entry-total">Total (KES)</label>
        <input class="form-input readonly" type="text" id="entry-total" readonly placeholder="Auto-calculated">
      </div>
      <button class="btn btn-primary mt-8" id="btn-save-entry">${Icons.milk} Save Delivery</button>
    </div>
  </div>

  <!-- PAYMENTS -->
  <div id="view-payments" class="view">
    <div class="view-header">
      <h1>Payments</h1>
      <p>Track outstanding balances & history</p>
    </div>

    <div class="unpaid-banner">
      <div>
        <h3>Total Outstanding</h3>
        <div class="amount" id="payments-total-unpaid">KES 0</div>
      </div>
      <div style="opacity:0.3;font-size:48px">${Icons.milkDrop}</div>
    </div>

    <div class="card-section">
      <div class="section-title">Unpaid Balances</div>
    </div>
    <div id="payments-unpaid-list" class="farmer-list" style="margin-bottom:12px"></div>

    <div class="card-section">
      <div class="section-title">Payment History</div>
    </div>
    <div id="payments-history" class="payment-list"></div>
  </div>

  <!-- ── Dynamic Island Nav ─────────────────────────────── -->
  <nav class="dynamic-island">
    <div class="nav-item active" data-view="home">
      ${Icons.home}
      <span>Home</span>
    </div>
    <div class="nav-item" data-view="farmers">
      ${Icons.farmers}
      <span>Farmers</span>
    </div>
    <div class="nav-item add-entry-nav" data-view="add-entry">
      ${Icons.milkDrop}
      <span>Add</span>
    </div>
    <div class="nav-item" data-view="payments">
      ${Icons.payments}
      <span>Payments</span>
    </div>
  </nav>

  <!-- ── Modals ────────────────────────────────────────────── -->

  <!-- Farmer Modal -->
  <div class="modal-overlay" id="modal-farmer">
    <div class="modal-sheet">
      <div class="modal-handle"></div>
      <div class="modal-title" id="modal-farmer-title">Add Farmer</div>
      <div class="form-group">
        <label class="form-label" for="farmer-name">Full Name</label>
        <input class="form-input" type="text" id="farmer-name" placeholder="e.g. Grace Wanjiku" autocomplete="off">
      </div>
      <div class="form-group">
        <label class="form-label" for="farmer-phone">Phone Number</label>
        <input class="form-input" type="tel" id="farmer-phone" placeholder="07XX XXX XXX" autocomplete="off">
      </div>
      <div class="form-group">
        <label class="form-label" for="farmer-price">Default Price / Litre (KES)</label>
        <input class="form-input" type="number" id="farmer-price" placeholder="55" min="1" step="0.5">
      </div>
      <div style="display:flex;gap:10px;margin-top:8px">
        <button class="btn btn-ghost" id="btn-cancel-farmer" style="flex:1">Cancel</button>
        <button class="btn btn-primary" id="btn-save-farmer" style="flex:2">${Icons.check} Save Farmer</button>
      </div>
    </div>
  </div>

  <!-- Pay Modal -->
  <div class="modal-overlay" id="modal-pay">
    <div class="modal-sheet">
      <div class="modal-handle"></div>
      <div class="modal-title">Record Payment</div>
      <p style="font-size:14px;color:var(--text-muted);margin-bottom:16px">
        Paying <strong id="pay-farmer-name"></strong> · Outstanding: <strong id="pay-owed-amount"></strong>
      </p>
      <div class="form-row">
        <div class="form-group">
          <label class="form-label" for="pay-period-start">Period Start</label>
          <input class="form-input" type="date" id="pay-period-start">
        </div>
        <div class="form-group">
          <label class="form-label" for="pay-period-end">Period End</label>
          <input class="form-input" type="date" id="pay-period-end">
        </div>
      </div>
      <div class="form-group">
        <label class="form-label" for="pay-notes">Notes (optional)</label>
        <input class="form-input" type="text" id="pay-notes" placeholder="e.g. Weekly payment" autocomplete="off">
      </div>
      <div style="display:flex;gap:10px;margin-top:8px">
        <button class="btn btn-ghost" id="btn-cancel-pay" style="flex:1">Cancel</button>
        <button class="btn btn-primary" id="btn-confirm-pay" style="flex:2">${Icons.check} Confirm Payment</button>
      </div>
    </div>
  </div>

  <!-- Toast -->
  <div class="toast" id="toast"></div>
  `;
}

// ─── Event Listeners ─────────────────────────────────────────────────────────

function attachListeners() {
  // Nav
  document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', () => {
      const view = (item as HTMLElement).dataset.view as ViewName;
      navigate(view);
    });
  });

  // Home quick actions
  document.getElementById('btn-quick-add')!.addEventListener('click', () => navigate('add-entry'));
  document.getElementById('btn-quick-farmer')!.addEventListener('click', () => openFarmerModal());

  // Export/Import
  document.getElementById('btn-export-json')!.addEventListener('click', () => { exportJSON(state); showToast('JSON exported!', 'success'); });
  document.getElementById('btn-export-csv')!.addEventListener('click', () => { exportCSV(state); showToast('CSV exported!', 'success'); });
  document.getElementById('btn-import-json')!.addEventListener('click', () => document.getElementById('import-file')!.click());
  document.getElementById('import-file')!.addEventListener('change', (e) => {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const imported = importJSON(state, reader.result as string);
      if (!imported) { showToast('Invalid backup file', 'error'); return; }
      state = imported;
      persist();
      showToast('Data imported!', 'success');
      renderView(currentView);
    };
    reader.readAsText(file);
  });

  // Back from detail
  document.getElementById('btn-back-detail')!.addEventListener('click', () => navigate('farmers'));

  // Farmers view
  document.getElementById('farmer-search')!.addEventListener('input', e => {
    renderFarmers((e.target as HTMLInputElement).value);
  });
  document.getElementById('btn-add-farmer')!.addEventListener('click', () => openFarmerModal());

  // Farmer modal
  document.getElementById('btn-save-farmer')!.addEventListener('click', saveFarmer);
  document.getElementById('btn-cancel-farmer')!.addEventListener('click', closeFarmerModal);
  document.getElementById('modal-farmer')!.addEventListener('click', e => {
    if (e.target === document.getElementById('modal-farmer')) closeFarmerModal();
  });

  // Add Entry form
  document.getElementById('entry-farmer')!.addEventListener('change', e => {
    autoFillPrice((e.target as HTMLSelectElement).value);
  });
  document.getElementById('entry-litres')!.addEventListener('input', calcTotal);
  document.getElementById('entry-price')!.addEventListener('input', calcTotal);
  document.getElementById('btn-save-entry')!.addEventListener('click', () => {
    const farmerId = (document.getElementById('entry-farmer') as HTMLSelectElement).value;
    const date     = (document.getElementById('entry-date') as HTMLInputElement).value;
    const litres   = parseFloat((document.getElementById('entry-litres') as HTMLInputElement).value);
    const price    = parseFloat((document.getElementById('entry-price') as HTMLInputElement).value);

    if (!farmerId) { showToast('Select a farmer first', 'error'); return; }
    if (!date) { showToast('Enter a date', 'error'); return; }
    if (!litres || litres <= 0) { showToast('Enter valid litres', 'error'); return; }
    if (!price || price <= 0) { showToast('Enter a valid price', 'error'); return; }

    state = addEntry(state, { farmerId, date, litres, price });
    persist();
    showToast('Delivery saved!', 'success');

    // Reset form
    (document.getElementById('entry-litres') as HTMLInputElement).value = '';
    (document.getElementById('entry-total') as HTMLInputElement).value = '';

    renderHome();
    navigate('home');
  });

  // Pay modal
  document.getElementById('btn-confirm-pay')!.addEventListener('click', confirmPayment);
  document.getElementById('btn-cancel-pay')!.addEventListener('click', closePayModal);
  document.getElementById('modal-pay')!.addEventListener('click', e => {
    if (e.target === document.getElementById('modal-pay')) closePayModal();
  });
}

// ─── Init ─────────────────────────────────────────────────────────────────────

buildHTML();
attachListeners();
navigate('home');
