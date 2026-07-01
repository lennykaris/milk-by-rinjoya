import './style.css';
import type { AppState, ViewName, TallyPeriod } from './types';
import {
  loadState, saveState,
  addFarmer, updateFarmer, deleteFarmer,
  addEntry, deleteEntry,
  addSale, deleteSale,
  recordPayment,
  updateSettings,
  getUnpaidTotalForFarmer, getTodayStats, getTodaySales, getTodayStock, getMonthlyLitresForFarmer,
  getTallySummary, getDailyBreakdown, getPeriodRange,
  exportJSON, exportCSV, importJSON,
} from './db';
import { Icons } from './icons';

// ─── App State ────────────────────────────────────────────────────────────────

let state: AppState = loadState();
let currentView: ViewName = 'home';
let detailFarmerId: string | null = null;
let editFarmerId: string | null = null;
let currentPeriod: TallyPeriod = 'this-week';
let deferredPrompt: any = null;

function persist() { saveState(state); }

// ─── Toast ────────────────────────────────────────────────────────────────────

function showToast(msg: string, type: 'success' | 'error' | '' = '') {
  const t = document.getElementById('toast')!;
  t.textContent = msg;
  t.className = `toast ${type} show`;
  setTimeout(() => { t.className = `toast ${type}`; }, 2800);
}

// ─── Navigation ───────────────────────────────────────────────────────────────

function navigate(view: ViewName, farmerId?: string) {
  try {
    currentView = view;
    if (farmerId) detailFarmerId = farmerId;

    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    const el = document.getElementById(`view-${view}`);
    if (el) el.classList.add('active');

    document.querySelectorAll('.nav-item').forEach(n => {
      n.classList.toggle('active', (n as HTMLElement).dataset.view === view);
    });

    renderView(view);
  } catch (err) {
    console.error("Navigation error:", err);
    showToast("Failed to load view", "error");
  }
}

function renderView(view: ViewName) {
  switch (view) {
    case 'home':          renderHome(); break;
    case 'farmers':       renderFarmers(); break;
    case 'add-entry':     renderAddEntry(); break;
    case 'payments':      renderPayments(); break;
    case 'tally':         renderTally(); break;
    case 'farmer-detail': if (detailFarmerId) renderFarmerDetail(detailFarmerId); break;
  }
}

// ─── Formatters ───────────────────────────────────────────────────────────────

function fmt(n: number) {
  return `KES ${n.toLocaleString('en-KE', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}
function fmtDate(d: string) {
  return new Date(d + 'T00:00:00').toLocaleDateString('en-KE', { day: '2-digit', month: 'short', year: 'numeric' });
}
function dateParts(d: string) {
  const dt = new Date(d + 'T00:00:00');
  return { day: dt.getDate(), mon: dt.toLocaleString('en', { month: 'short' }) };
}
function initials(name: string) {
  return name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
}
function shortDay(dateStr: string) {
  return new Date(dateStr + 'T00:00:00').toLocaleString('en', { weekday: 'short' }).slice(0, 2);
}
function shortDate(dateStr: string) {
  const d = new Date(dateStr + 'T00:00:00');
  return `${d.getDate()}/${d.getMonth() + 1}`;
}

// ─── Home View ────────────────────────────────────────────────────────────────

function renderHome() {
  const stock = getTodayStock(state);
  const stats = getTodayStats(state);
  const sales = getTodaySales(state);
  const totalUnpaid = state.farmers.reduce((s, f) => s + getUnpaidTotalForFarmer(state, f.id), 0);

  // Update today's stock inventory values
  document.getElementById('home-stock-incoming')!.textContent = `${stock.incoming}L`;
  document.getElementById('home-stock-sold')!.textContent = `${stock.sold}L`;
  document.getElementById('home-stock-left')!.textContent = `${stock.left}L`;

  // Update remaining stock status badge
  const badge = document.getElementById('home-stock-badge')!;
  if (stock.incoming === 0 && stock.sold === 0) {
    badge.textContent = 'No Activity';
    badge.className = 'stock-badge empty';
  } else if (stock.left > 0) {
    badge.textContent = `${stock.left}L Surplus`;
    badge.className = 'stock-badge surplus';
  } else if (stock.left === 0) {
    badge.textContent = 'Stock Cleared';
    badge.className = 'stock-badge surplus';
  } else {
    badge.textContent = `${Math.abs(stock.left)}L Deficit`;
    badge.className = 'stock-badge danger';
  }

  // Update stats grid cards
  document.getElementById('home-today-buy-cost')!.textContent = fmt(stats.amount);
  document.getElementById('home-today-sales-val')!.textContent = fmt(sales.amount);
  document.getElementById('home-total-unpaid')!.textContent = fmt(totalUnpaid);
  document.getElementById('home-total-farmers')!.textContent = `${state.farmers.length}`;

  // Render today's activity transactions list
  const activityList = document.getElementById('home-activity-list')!;
  const todayStr = new Date().toISOString().split('T')[0];

  // Get today's deliveries
  const todayEntries = state.entries.filter(e => e.date === todayStr);
  const deliveryActivity = todayEntries.map(e => {
    const farmer = state.farmers.find(f => f.id === e.farmerId);
    return {
      type: 'delivery' as const,
      id: e.id,
      title: farmer ? farmer.name : 'Unknown Farmer',
      sub: `${e.litres}L @ KES ${e.price}/L`,
      amount: e.total,
      badgeText: e.paidStatus === 'unpaid' ? 'Unpaid' : 'Paid',
      badgeClass: e.paidStatus === 'unpaid' ? 'unpaid' : 'paid',
      rawDate: e.id // for sorting
    };
  });

  // Get today's sales
  const todaySalesList = (state.sales || []).filter(s => s.date === todayStr);
  const salesActivity = todaySalesList.map(s => {
    return {
      type: 'sale' as const,
      id: s.id,
      title: 'Milk Sale',
      sub: `${s.litres}L @ KES ${s.price}/L${s.notes ? ` · ${s.notes}` : ''}`,
      amount: s.total,
      badgeText: 'Sale',
      badgeClass: 'sale',
      rawDate: s.id // for sorting
    };
  });

  // Combine and sort (newest first)
  const combined = [...deliveryActivity, ...salesActivity].sort((a, b) => b.rawDate.localeCompare(a.rawDate));

  if (!combined.length) {
    activityList.innerHTML = `<div style="text-align:center;padding:16px;font-size:13px;color:var(--text-muted)">No activity logged today</div>`;
  } else {
    activityList.innerHTML = combined.map(act => `
      <div class="activity-card ${act.type}">
        <div class="activity-card-left">
          <div class="activity-title">${act.title}</div>
          <div class="activity-sub">${act.sub}</div>
        </div>
        <div class="activity-card-right">
          <div style="display: flex; flex-direction: column; align-items: flex-end;">
            <div class="activity-amount" style="color: ${act.type === 'delivery' ? 'var(--danger)' : 'var(--mint-dark)'}">${act.type === 'delivery' ? '−' : '+'}${fmt(act.amount)}</div>
            <div class="activity-status-label ${act.badgeClass}" style="text-align:right">${act.badgeText}</div>
          </div>
          <button class="btn-icon danger delete-activity-btn" data-type="${act.type}" data-id="${act.id}" style="padding:4px; margin-left: 8px; background: none; border: none; cursor: pointer;">
            ${Icons.trash}
          </button>
        </div>
      </div>
    `).join('');

    // Attach listeners
    activityList.querySelectorAll('.delete-activity-btn').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        const type = (btn as HTMLElement).dataset.type!;
        const id = (btn as HTMLElement).dataset.id!;
        const confirmMsg = type === 'delivery' ? 'Delete this delivery entry?' : 'Delete this sale record?';
        if (confirm(confirmMsg)) {
          if (type === 'delivery') {
            state = deleteEntry(state, id);
          } else {
            state = deleteSale(state, id);
          }
          persist();
          showToast('Transaction deleted', 'success');
          renderHome();
        }
      });
    });
  }
}

// ─── Farmers View ─────────────────────────────────────────────────────────────

function renderFarmers(query = '') {
  const list = document.getElementById('farmers-list')!;
  const filtered = state.farmers.filter(f =>
    f.name.toLowerCase().includes(query.toLowerCase()) || f.phone.includes(query)
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
    card.addEventListener('click', () => navigate('farmer-detail', (card as HTMLElement).dataset.farmer!));
  });
}

// ─── Farmer Detail View ───────────────────────────────────────────────────────

function renderFarmerDetail(farmerId: string) {
  const farmer = state.farmers.find(f => f.id === farmerId);
  if (!farmer) { navigate('farmers'); return; }

  const owed    = getUnpaidTotalForFarmer(state, farmerId);
  const monthly = getMonthlyLitresForFarmer(state, farmerId);
  const allEntries = state.entries.filter(e => e.farmerId === farmerId).sort((a, b) => b.date.localeCompare(a.date));
  const totalLitres = allEntries.reduce((s, e) => s + e.litres, 0);

  document.getElementById('detail-farmer-name')!.textContent  = farmer.name;
  document.getElementById('detail-farmer-phone')!.textContent = farmer.phone;
  document.getElementById('detail-farmer-price')!.textContent = `Default: KES ${farmer.defaultPrice}/L`;
  document.getElementById('detail-monthly-litres')!.textContent = `${monthly}L`;
  document.getElementById('detail-total-litres')!.textContent   = `${totalLitres}L`;
  document.getElementById('detail-owed')!.textContent           = fmt(owed);

  document.getElementById('btn-edit-farmer')!.onclick = () => openFarmerModal(farmer.id);
  document.getElementById('btn-delete-farmer')!.onclick = () => {
    if (confirm(`Delete ${farmer.name} and all their records?`)) {
      state = deleteFarmer(state, farmer.id);
      persist();
      showToast('Farmer deleted', 'success');
      navigate('farmers');
    }
  };

  const payBtn = document.getElementById('btn-mark-paid') as HTMLButtonElement;
  payBtn.onclick = () => openPayModal(farmerId, owed);
  payBtn.disabled = owed === 0;

  const entryList = document.getElementById('detail-entries')!;
  if (!allEntries.length) {
    entryList.innerHTML = `<div class="empty-state"><div class="empty-icon">${Icons.milk}</div>
      <h3>No deliveries yet</h3><p>Log a delivery for ${farmer.name} to get started.</p></div>`;
    return;
  }
  entryList.innerHTML = allEntries.map(e => {
    const { day, mon } = dateParts(e.date);
    const isPaid = e.paidStatus !== 'unpaid';
    const revenue = e.litres * state.settings.sellingPrice;
    const profit  = revenue - e.total;
    return `<div class="entry-item">
      <div class="entry-date-badge"><div class="day">${day}</div><div class="mon">${mon}</div></div>
      <div class="entry-details">
        <div class="entry-litres">${e.litres}L · Buy KES ${e.price}/L → Sell KES ${state.settings.sellingPrice}/L</div>
        <div class="entry-price">Profit: <strong style="color:${profit >= 0 ? 'var(--mint-dark)' : 'var(--danger)'}">${fmt(profit)}</strong></div>
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

// ─── Add Entry View ───────────────────────────────────────────────────────────

function calcSaleTotal() {
  const litres = parseFloat((document.getElementById('sale-litres') as HTMLInputElement).value) || 0;
  const price  = parseFloat((document.getElementById('sale-price') as HTMLInputElement).value) || 0;
  const total  = litres * price;
  (document.getElementById('sale-total') as HTMLInputElement).value = total > 0 ? total.toFixed(2) : '';
}

function switchAddTab(tab: 'delivery' | 'sale') {
  const tabDel = document.getElementById('tab-delivery')!;
  const tabSale = document.getElementById('tab-sale')!;
  const formDel = document.getElementById('form-delivery')!;
  const formSale = document.getElementById('form-sale')!;
  const title = document.getElementById('add-view-title')!;
  const desc = document.getElementById('add-view-desc')!;

  if (tab === 'delivery') {
    tabDel.classList.add('active');
    tabSale.classList.remove('active');
    formDel.style.display = 'block';
    formSale.style.display = 'none';
    title.textContent = 'Log Delivery';
    desc.textContent = 'Record milk received from a farmer';
  } else {
    tabDel.classList.remove('active');
    tabSale.classList.add('active');
    formDel.style.display = 'none';
    formSale.style.display = 'block';
    title.textContent = 'Log Sale';
    desc.textContent = 'Record milk sold to a customer';
    // Prefill date and selling price
    const today = new Date().toISOString().split('T')[0];
    (document.getElementById('sale-date') as HTMLInputElement).value = today;
    (document.getElementById('sale-price') as HTMLInputElement).value = String(state.settings.sellingPrice);
    calcSaleTotal();
  }
}

function renderAddEntry() {
  const sel = document.getElementById('entry-farmer') as HTMLSelectElement;
  sel.innerHTML = state.farmers.length
    ? state.farmers.map(f => `<option value="${f.id}">${f.name}</option>`).join('')
    : `<option value="">— Add a farmer first —</option>`;
  if (state.farmers.length) autoFillPrice(sel.value);

  // Populate default sell price in the sale form
  const salePriceInput = document.getElementById('sale-price') as HTMLInputElement;
  if (salePriceInput) {
    salePriceInput.value = String(state.settings.sellingPrice);
    calcSaleTotal();
  }
}

function autoFillPrice(farmerId: string) {
  const farmer = state.farmers.find(f => f.id === farmerId);
  if (!farmer) return;
  (document.getElementById('entry-price') as HTMLInputElement).value = String(farmer.defaultPrice);
  calcTotal();
}

function calcTotal() {
  const litres = parseFloat((document.getElementById('entry-litres') as HTMLInputElement).value) || 0;
  const price  = parseFloat((document.getElementById('entry-price') as HTMLInputElement).value) || 0;
  const total  = litres * price;
  (document.getElementById('entry-total') as HTMLInputElement).value = total > 0 ? total.toFixed(2) : '';
  // Show live profit preview
  const revenue = litres * state.settings.sellingPrice;
  const profit  = revenue - total;
  const previewEl = document.getElementById('entry-profit-preview');
  if (previewEl) {
    if (litres > 0 && price > 0) {
      previewEl.style.display = 'block';
      previewEl.innerHTML = `
        <div style="display:flex;justify-content:space-between;font-size:12px;color:var(--text-muted);font-weight:600">
          <span>Sell Revenue (@ KES ${state.settings.sellingPrice}/L)</span>
          <span style="color:var(--mint-dark)">${fmt(revenue)}</span>
        </div>
        <div style="display:flex;justify-content:space-between;font-size:13px;font-weight:700;margin-top:4px">
          <span>Est. Profit</span>
          <span style="color:${profit >= 0 ? 'var(--mint-dark)' : 'var(--danger)'}">${fmt(profit)}</span>
        </div>`;
    } else {
      previewEl.style.display = 'none';
    }
  }
}

// ─── Payments View ────────────────────────────────────────────────────────────

function renderPayments() {
  const totalUnpaid = state.farmers.reduce((s, f) => s + getUnpaidTotalForFarmer(state, f.id), 0);
  document.getElementById('payments-total-unpaid')!.textContent = fmt(totalUnpaid);

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
        <div class="farmer-owed">${fmt(owed)}<small>unpaid</small></div>
        <button class="btn btn-ghost btn-sm" data-pay-farmer="${farmer.id}">Pay</button>
      </div>`).join('');

    unpaidList.querySelectorAll('[data-pay-farmer]').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        const id = (btn as HTMLElement).dataset.payFarmer!;
        openPayModal(id, getUnpaidTotalForFarmer(state, id));
      });
    });
  }

  const historyList = document.getElementById('payments-history')!;
  const sorted = [...state.payments].sort((a, b) => b.date.localeCompare(a.date));
  historyList.innerHTML = !sorted.length
    ? `<p style="text-align:center;color:var(--text-muted);font-size:13px;padding:20px 0">No payment history yet</p>`
    : sorted.map(p => {
        const farmer = state.farmers.find(f => f.id === p.farmerId);
        return `<div class="payment-item">
          <div class="payment-item-header">
            <div class="payment-farmer">${farmer?.name ?? 'Unknown'}</div>
            <div class="payment-amount">${fmt(p.amount)}</div>
          </div>
          <div class="payment-meta">
            Paid on ${fmtDate(p.date)} · ${fmtDate(p.periodStart)} – ${fmtDate(p.periodEnd)}
            ${p.notes ? `<br><em>${p.notes}</em>` : ''}
          </div>
        </div>`;
      }).join('');
}

// ─── Tally View ───────────────────────────────────────────────────────────────

function renderTally() {
  const { start, end, label } = getPeriodRange(currentPeriod);
  const summary = getTallySummary(state, start, end);
  const daily   = getDailyBreakdown(state, start, end);

  // Selling price chip
  document.getElementById('tally-sell-price')!.textContent = `KES ${state.settings.sellingPrice}/L (sell)`;

  // Period toggle active state
  document.querySelectorAll('.period-btn').forEach(btn => {
    btn.classList.toggle('active', (btn as HTMLElement).dataset.period === currentPeriod);
  });

  // Hero profit card
  const isPos = summary.profit >= 0;
  document.getElementById('tally-profit-amount')!.innerHTML =
    `<span class="profit-hero-amount ${isPos ? 'positive' : 'negative'}">${fmt(summary.profit)}</span>`;
  document.getElementById('tally-period-label')!.textContent =
    `${label} · ${fmtDate(start)} – ${fmtDate(end)}`;
  
  // Calculate difference
  const salesInRange = (state.sales || []).filter(s => s.date >= start && s.date <= end);
  const soldLitres = salesInRange.reduce((s, e) => s + e.litres, 0);
  const diff = +(summary.litres - soldLitres).toFixed(2);
  
  let trendHtml = `<span class="profit-hero-trend ${isPos ? 'up' : 'down'}">
      ${isPos ? Icons.trendUp : Icons.trendDown}
      ${isPos ? 'Profitable' : 'Loss'}
    </span>`;
  if (diff > 0) {
    trendHtml += `<span style="font-size:12px;color:var(--text-muted);margin-left:8px;font-weight:600">
      (${diff}L unsold)
    </span>`;
  } else if (diff < 0) {
    trendHtml += `<span style="font-size:12px;color:var(--danger);margin-left:8px;font-weight:600">
      (${Math.abs(diff)}L deficit)
    </span>`;
  } else {
    trendHtml += `<span style="font-size:12px;color:var(--mint-dark);margin-left:8px;font-weight:600">
      (100% sold)
    </span>`;
  }
  document.getElementById('tally-trend')!.innerHTML = trendHtml;

  // Metric cards
  document.getElementById('tally-buy-cost')!.textContent  = fmt(summary.buyCost);
  document.getElementById('tally-revenue')!.textContent   = fmt(summary.actualRevenue);
  document.getElementById('tally-litres')!.textContent    = `${summary.litres}L`;

  // Margin bar
  const marginPct = Math.max(0, Math.min(100, summary.margin));
  document.getElementById('tally-margin-pct')!.textContent = `${summary.margin.toFixed(1)}%`;
  (document.getElementById('tally-margin-fill') as HTMLElement).style.width = `${marginPct}%`;

  // Daily bar chart
  const maxVal = Math.max(...daily.map(d => Math.abs(d.profit)), 1);
  const chartEl = document.getElementById('tally-bar-chart')!;
  const showDayLabel = daily.length <= 7;
  chartEl.innerHTML = daily.map(d => {
    const heightPct = Math.round((Math.abs(d.profit) / maxVal) * 100);
    const cls = d.profit > 0 ? 'positive' : d.profit < 0 ? 'negative' : 'zero';
    const lbl = showDayLabel ? shortDay(d.date) : shortDate(d.date);
    return `<div class="bar-col">
      <div class="bar-fill ${cls}" style="height:${heightPct}%"></div>
      <div class="bar-day">${lbl}</div>
    </div>`;
  }).join('');

  // Farmer breakdown
  const breakdownEl = document.getElementById('tally-breakdown')!;
  if (!summary.farmerBreakdown.length) {
    breakdownEl.innerHTML = `<div class="empty-state" style="padding:24px 0">
      <div class="empty-icon">${Icons.tally}</div>
      <h3>No deliveries</h3>
      <p>No entries found for this period.</p>
    </div>`;
    return;
  }
  breakdownEl.innerHTML = summary.farmerBreakdown.map(({ farmer, litres, cost }) => {
    const revenue = litres * state.settings.sellingPrice;
    const profit  = revenue - cost;
    return `<div class="breakdown-item">
      <div class="farmer-avatar">${initials(farmer.name)}</div>
      <div class="breakdown-info">
        <div class="breakdown-name">${farmer.name}</div>
        <div class="breakdown-litres">${litres}L · Buy KES ${farmer.defaultPrice}/L</div>
      </div>
      <div class="breakdown-amounts">
        <div class="breakdown-cost">−${fmt(cost)}</div>
        <div class="breakdown-revenue">+${fmt(revenue)} revenue</div>
        <div style="font-size:11px;font-weight:700;color:${profit >= 0 ? 'var(--mint-dark)' : 'var(--danger)'}">
          ${profit >= 0 ? '+' : ''}${fmt(profit)} profit
        </div>
      </div>
    </div>`;
  }).join('');
}

// ─── Farmer Modal ─────────────────────────────────────────────────────────────

function openFarmerModal(farmerId?: string) {
  editFarmerId = farmerId ?? null;
  const modal      = document.getElementById('modal-farmer')!;
  const title      = document.getElementById('modal-farmer-title')!;
  const nameInput  = document.getElementById('farmer-name') as HTMLInputElement;
  const phoneInput = document.getElementById('farmer-phone') as HTMLInputElement;
  const priceInput = document.getElementById('farmer-price') as HTMLInputElement;

  if (farmerId) {
    const f = state.farmers.find(f => f.id === farmerId)!;
    title.textContent = 'Edit Farmer';
    nameInput.value = f.name; phoneInput.value = f.phone; priceInput.value = String(f.defaultPrice);
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

  if (!name)          { showToast('Please enter a farmer name', 'error'); return; }
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
  const modal  = document.getElementById('modal-pay')!;
  const farmer = state.farmers.find(f => f.id === farmerId)!;
  const today  = new Date().toISOString().split('T')[0];
  document.getElementById('pay-farmer-name')!.textContent  = farmer.name;
  document.getElementById('pay-owed-amount')!.textContent  = fmt(owed);
  (document.getElementById('pay-period-start') as HTMLInputElement).value = today;
  (document.getElementById('pay-period-end') as HTMLInputElement).value   = today;
  (document.getElementById('pay-notes') as HTMLInputElement).value = '';
  modal.dataset.farmerId = farmerId;
  modal.classList.add('open');
}

function closePayModal() { document.getElementById('modal-pay')!.classList.remove('open'); }

function confirmPayment() {
  const modal    = document.getElementById('modal-pay')!;
  const farmerId = modal.dataset.farmerId!;
  const start    = (document.getElementById('pay-period-start') as HTMLInputElement).value;
  const end      = (document.getElementById('pay-period-end') as HTMLInputElement).value;
  const notes    = (document.getElementById('pay-notes') as HTMLInputElement).value.trim();

  if (!start || !end)  { showToast('Select a payment period', 'error'); return; }
  if (start > end)     { showToast('Start date must be before end date', 'error'); return; }

  const prev = state;
  state = recordPayment(state, farmerId, start, end, notes);
  if (state === prev) { showToast('No unpaid entries in that period', 'error'); return; }

  persist();
  showToast('Payment recorded!', 'success');
  closePayModal();
  renderView(currentView);
}

// ─── Selling Price Modal ──────────────────────────────────────────────────────

function openSellPriceModal() {
  const modal = document.getElementById('modal-sell-price')!;
  (document.getElementById('sell-price-input') as HTMLInputElement).value = String(state.settings.sellingPrice);
  modal.classList.add('open');
}
function closeSellPriceModal() { document.getElementById('modal-sell-price')!.classList.remove('open'); }

function saveSellPrice() {
  const val = parseFloat((document.getElementById('sell-price-input') as HTMLInputElement).value);
  if (!val || val <= 0) { showToast('Enter a valid selling price', 'error'); return; }
  state = updateSettings(state, { ...state.settings, sellingPrice: val });
  persist();
  showToast(`Selling price updated to KES ${val}/L`, 'success');
  closeSellPriceModal();
  renderTally();
}

// ─── HTML Bootstrap ───────────────────────────────────────────────────────────

function buildHTML() {
  const today = new Date().toISOString().split('T')[0];

  document.querySelector<HTMLDivElement>('#app')!.innerHTML = `

  <!-- HOME -->
  <div id="view-home" class="view active">
    <div class="home-logo">
      <div class="logo-icon">${Icons.milkDrop}</div>
      <div><h1>Rinjoya</h1><span>Milk Shop Tracker</span></div>
    </div>
    
    <!-- Install Banner -->
    <div id="install-banner" class="install-banner" style="display: none;">
      <div class="install-icon">${Icons.milkDrop}</div>
      <div class="install-text">
        <h4>Install Rinjoya App</h4>
        <p>Access your milk tracker offline instantly on your home screen.</p>
      </div>
      <div class="install-actions">
        <button class="btn btn-primary btn-sm" id="btn-install-app">Install</button>
        <button class="btn-close" id="btn-close-install">&times;</button>
      </div>
    </div>

    <!-- Today's Stock Dashboard -->
    <div class="card-section">
      <div class="section-title">Today's Stock Inventory</div>
      <div class="stock-grid">
        <div class="stock-card">
          <span class="lbl">Came In Today</span>
          <span class="val" id="home-stock-incoming">0L</span>
        </div>
        <div class="stock-card">
          <span class="lbl">Sold Today</span>
          <span class="val" id="home-stock-sold">0L</span>
        </div>
        <div class="stock-card full-width">
          <div>
            <span class="lbl">Remaining Stock</span>
            <div class="val" id="home-stock-left">0L</div>
          </div>
          <span id="home-stock-badge" class="stock-badge empty">No Milk</span>
        </div>
      </div>
    </div>

    <div class="stats-grid">
      <div class="stat-card">
        <div class="stat-label">Today's Buy Cost</div>
        <div class="stat-value" id="home-today-buy-cost">KES 0</div>
        <div class="stat-sub">expenses today</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Today's Sales Value</div>
        <div class="stat-value" id="home-today-sales-val">KES 0</div>
        <div class="stat-sub">revenue today</div>
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
        <button class="btn btn-primary" id="btn-quick-add" style="flex:1.2;min-width:130px">${Icons.addEntry} Add Delivery</button>
        <button class="btn btn-outline" id="btn-quick-sale" style="flex:1;min-width:110px;border-color:#60A5FA;color:#2563EB">${Icons.milkDrop} Log Sale</button>
        <button class="btn btn-ghost" id="btn-quick-farmer" style="flex:1;min-width:110px">${Icons.farmers} New Farmer</button>
      </div>
    </div>
    <div class="card-section mt-12">
      <div class="section-title">Today's Activity</div>
      <div id="home-activity-list"></div>
    </div>
    <div class="card-section mt-12">
      <div class="section-title">Settings & Backup</div>
      <div class="export-row" style="padding:0; margin-bottom: 8px;">
        <button class="btn btn-ghost btn-sm" id="btn-export-json">${Icons.download} JSON</button>
        <button class="btn btn-ghost btn-sm" id="btn-export-csv">${Icons.download} CSV</button>
        <button class="btn btn-outline btn-sm" id="btn-import-json">${Icons.upload} Import</button>
      </div>
      <input type="file" id="import-file" accept=".json" style="display:none">
      <button class="btn btn-danger btn-sm" id="btn-reset-app" style="width:100%">${Icons.trash} Reset All Data</button>
    </div>
  </div>

  <!-- FARMERS -->
  <div id="view-farmers" class="view">
    <div class="view-header">
      <h1>Farmers</h1><p>Manage your milk suppliers</p>
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
      <div class="detail-stat"><div class="val" id="detail-monthly-litres">0L</div><div class="lbl">This Month</div></div>
      <div class="detail-stat"><div class="val" id="detail-total-litres">0L</div><div class="lbl">All Time</div></div>
      <div class="detail-stat" style="background:var(--mint-light)">
        <div class="val" id="detail-owed" style="color:var(--mint-dark)">KES 0</div>
        <div class="lbl">Owed</div>
      </div>
    </div>
    <div style="padding:0 20px 12px">
      <button class="btn btn-primary" id="btn-mark-paid">${Icons.check} Mark as Paid</button>
    </div>
    <div class="card-section"><div class="section-title">Delivery History</div></div>
    <div id="detail-entries" class="entry-list"></div>
  </div>

  <!-- ADD ENTRY -->
  <div id="view-add-entry" class="view">
    <div class="view-header">
      <h1 id="add-view-title">Log Delivery</h1><p id="add-view-desc">Record milk received from a farmer</p>
    </div>
    
    <div style="padding: 0 20px;">
      <div class="segmented-tabs">
        <button class="segment-btn active" id="tab-delivery" data-tab="delivery">Buy (Delivery)</button>
        <button class="segment-btn" id="tab-sale" data-tab="sale">Sell (Sale)</button>
      </div>
    </div>

    <!-- Delivery Form (Buy) -->
    <div class="form-card" id="form-delivery">
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
          <label class="form-label" for="entry-price">Buy Price / L</label>
          <input class="form-input" type="number" id="entry-price" placeholder="0" min="0" step="0.5">
        </div>
      </div>
      <div class="form-group">
        <label class="form-label" for="entry-total">Buy Total (KES)</label>
        <input class="form-input readonly" type="text" id="entry-total" readonly placeholder="Auto-calculated">
      </div>
      <!-- Profit preview -->
      <div id="entry-profit-preview" style="display:none;background:var(--mint-light);border-radius:var(--radius-md);padding:12px 14px;margin-bottom:12px;"></div>
      <button class="btn btn-primary mt-8" id="btn-save-entry">${Icons.milk} Save Delivery</button>
    </div>

    <!-- Sale Form (Sell) -->
    <div class="form-card" id="form-sale" style="display: none;">
      <div class="form-group">
        <label class="form-label" for="sale-date">Date</label>
        <input class="form-input" type="date" id="sale-date" value="${today}">
      </div>
      <div class="form-row">
        <div class="form-group">
          <label class="form-label" for="sale-litres">Litres Sold</label>
          <input class="form-input" type="number" id="sale-litres" placeholder="0" min="0" step="0.1">
        </div>
        <div class="form-group">
          <label class="form-label" for="sale-price">Sell Price / L</label>
          <input class="form-input" type="number" id="sale-price" placeholder="0" min="0" step="0.5">
        </div>
      </div>
      <div class="form-group">
        <label class="form-label" for="sale-total">Sell Total (KES)</label>
        <input class="form-input readonly" type="text" id="sale-total" readonly placeholder="Auto-calculated">
      </div>
      <div class="form-group">
        <label class="form-label" for="sale-notes">Notes / Payment Details</label>
        <input class="form-input" type="text" id="sale-notes" placeholder="e.g. M-Pesa, Cash, customer name" autocomplete="off">
      </div>
      <button class="btn btn-primary mt-8" id="btn-save-sale" style="background: #2563EB">${Icons.milkDrop} Save Sale</button>
    </div>
  </div>

  <!-- PAYMENTS -->
  <div id="view-payments" class="view">
    <div class="view-header"><h1>Payments</h1><p>Track outstanding balances & history</p></div>
    <div class="unpaid-banner">
      <div>
        <h3>Total Outstanding</h3>
        <div class="amount" id="payments-total-unpaid">KES 0</div>
      </div>
      <div style="opacity:0.3;font-size:48px">${Icons.milkDrop}</div>
    </div>
    <div class="card-section"><div class="section-title">Unpaid Balances</div></div>
    <div id="payments-unpaid-list" class="farmer-list" style="margin-bottom:12px"></div>
    <div class="card-section"><div class="section-title">Payment History</div></div>
    <div id="payments-history" class="payment-list"></div>
  </div>

  <!-- TALLY -->
  <div id="view-tally" class="view">
    <div class="view-header">
      <div class="flex-row">
        <div><h1>Profit Tally</h1><p>Weekly & monthly breakdown</p></div>
        <button class="sell-price-chip" id="btn-sell-price">
          ${Icons.settings} <span id="tally-sell-price">KES —/L</span>
        </button>
      </div>
    </div>

    <!-- Period toggle -->
    <div class="period-toggle">
      <button class="period-btn active" data-period="this-week">This Week</button>
      <button class="period-btn" data-period="last-week">Last Week</button>
      <button class="period-btn" data-period="this-month">This Month</button>
      <button class="period-btn" data-period="last-month">Last Month</button>
    </div>

    <!-- Profit hero -->
    <div class="profit-hero">
      <div class="profit-hero-label">Net Profit</div>
      <div id="tally-profit-amount"></div>
      <div class="profit-hero-period" id="tally-period-label"></div>
      <div id="tally-trend"></div>
    </div>

    <!-- Metric cards -->
    <div class="tally-metrics">
      <div class="tally-metric buy">
        <div class="val" id="tally-buy-cost">—</div>
        <div class="lbl">Buy Cost</div>
      </div>
      <div class="tally-metric sell">
        <div class="val" id="tally-revenue">—</div>
        <div class="lbl">Revenue</div>
      </div>
      <div class="tally-metric litr">
        <div class="val" id="tally-litres">—</div>
        <div class="lbl">Litres</div>
      </div>
    </div>

    <!-- Profit margin bar -->
    <div class="margin-bar-wrap">
      <div class="margin-bar-header">
        <span class="margin-bar-title">Profit Margin</span>
        <span class="margin-bar-pct" id="tally-margin-pct">0%</span>
      </div>
      <div class="margin-bar-track">
        <div class="margin-bar-fill" id="tally-margin-fill" style="width:0%"></div>
      </div>
    </div>

    <!-- Daily bar chart -->
    <div class="bar-chart-wrap">
      <div class="bar-chart-title">Daily Profit</div>
      <div class="bar-chart" id="tally-bar-chart"></div>
    </div>

    <!-- Farmer breakdown -->
    <div class="card-section"><div class="section-title">Per Farmer Breakdown</div></div>
    <div id="tally-breakdown" class="breakdown-list"></div>
  </div>

  <!-- ── Nav Wrapper ──────────────────────────────────────────────── -->
  <div class="nav-wrapper">
    <nav class="dynamic-island">
      <div class="nav-item active" data-view="home">${Icons.home}<span>Home</span></div>
      <div class="nav-item" data-view="farmers">${Icons.farmers}<span>Farmers</span></div>
      <div class="nav-item add-entry-nav" data-view="add-entry">${Icons.milkDrop}<span>Add</span></div>
      <div class="nav-item" data-view="payments">${Icons.payments}<span>Payments</span></div>
      <div class="nav-item" data-view="tally">${Icons.tally}<span>Tally</span></div>
    </nav>
  </div>

  <!-- ── Modals ──────────────────────────────────────────────────────── -->

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
        <label class="form-label" for="farmer-price">Default Buy Price / Litre (KES)</label>
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

  <!-- Selling Price Modal -->
  <div class="modal-overlay" id="modal-sell-price">
    <div class="modal-sheet">
      <div class="modal-handle"></div>
      <div class="modal-title">Set Selling Price</div>
      <p style="font-size:13px;color:var(--text-muted);margin-bottom:16px">
        The price per litre at which the shop <strong>sells</strong> milk to customers. Used to calculate profit in the Tally view.
      </p>
      <div class="form-group">
        <label class="form-label" for="sell-price-input">Selling Price per Litre (KES)</label>
        <input class="form-input" type="number" id="sell-price-input" placeholder="80" min="1" step="0.5">
      </div>
      <div style="display:flex;gap:10px;margin-top:8px">
        <button class="btn btn-ghost" id="btn-cancel-sell-price" style="flex:1">Cancel</button>
        <button class="btn btn-primary" id="btn-save-sell-price" style="flex:2">${Icons.check} Save Price</button>
      </div>
    </div>
  </div>

  <!-- Toast -->
  <div class="toast" id="toast"></div>
  `;
}

// ─── Event Listeners ──────────────────────────────────────────────────────────

function attachListeners() {
  // Nav
  document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', () => navigate((item as HTMLElement).dataset.view as ViewName));
  });

  // Home
  document.getElementById('btn-quick-add')!.addEventListener('click', () => { navigate('add-entry'); switchAddTab('delivery'); });
  document.getElementById('btn-quick-sale')!.addEventListener('click', () => { navigate('add-entry'); switchAddTab('sale'); });
  document.getElementById('btn-quick-farmer')!.addEventListener('click', () => openFarmerModal());
  document.getElementById('btn-export-json')!.addEventListener('click', () => { exportJSON(state); showToast('JSON exported!', 'success'); });
  document.getElementById('btn-export-csv')!.addEventListener('click', () => { exportCSV(state); showToast('CSV exported!', 'success'); });
  document.getElementById('btn-import-json')!.addEventListener('click', () => document.getElementById('import-file')!.click());
  document.getElementById('import-file')!.addEventListener('change', e => {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const imported = importJSON(state, reader.result as string);
      if (!imported) { showToast('Invalid backup file', 'error'); return; }
      state = imported; persist();
      showToast('Data imported!', 'success');
      renderView(currentView);
    };
    reader.readAsText(file);
  });

  // Reset App
  document.getElementById('btn-reset-app')!.addEventListener('click', () => {
    if (confirm('Are you absolutely sure you want to reset all data? This will permanently delete all farmers, deliveries, and payment logs.')) {
      state = { farmers: [], entries: [], payments: [], sales: [], settings: { sellingPrice: 80 } };
      persist();
      showToast('All data has been reset', 'success');
      renderView(currentView);
    }
  });

  // Farmer detail
  document.getElementById('btn-back-detail')!.addEventListener('click', () => navigate('farmers'));

  // Farmers list
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

  // Add entry
  document.getElementById('entry-farmer')!.addEventListener('change', e => autoFillPrice((e.target as HTMLSelectElement).value));
  document.getElementById('entry-litres')!.addEventListener('input', calcTotal);
  document.getElementById('entry-price')!.addEventListener('input', calcTotal);
  document.getElementById('btn-save-entry')!.addEventListener('click', () => {
    const farmerId = (document.getElementById('entry-farmer') as HTMLSelectElement).value;
    const date     = (document.getElementById('entry-date') as HTMLInputElement).value;
    const litres   = parseFloat((document.getElementById('entry-litres') as HTMLInputElement).value);
    const price    = parseFloat((document.getElementById('entry-price') as HTMLInputElement).value);
    if (!farmerId) { showToast('Select a farmer first', 'error'); return; }
    if (!date)     { showToast('Enter a date', 'error'); return; }
    if (!litres || litres <= 0) { showToast('Enter valid litres', 'error'); return; }
    if (!price || price <= 0)   { showToast('Enter a valid price', 'error'); return; }
    state = addEntry(state, { farmerId, date, litres, price });
    persist();
    showToast('Delivery saved!', 'success');
    (document.getElementById('entry-litres') as HTMLInputElement).value = '';
    (document.getElementById('entry-total') as HTMLInputElement).value  = '';
    (document.getElementById('entry-profit-preview') as HTMLElement).style.display = 'none';
    renderHome();
    navigate('home');
  });

  // Tab switcher
  document.getElementById('tab-delivery')!.addEventListener('click', () => switchAddTab('delivery'));
  document.getElementById('tab-sale')!.addEventListener('click', () => switchAddTab('sale'));

  // Add sale form listeners
  document.getElementById('sale-litres')!.addEventListener('input', calcSaleTotal);
  document.getElementById('sale-price')!.addEventListener('input', calcSaleTotal);
  document.getElementById('btn-save-sale')!.addEventListener('click', () => {
    const date     = (document.getElementById('sale-date') as HTMLInputElement).value;
    const litres   = parseFloat((document.getElementById('sale-litres') as HTMLInputElement).value);
    const price    = parseFloat((document.getElementById('sale-price') as HTMLInputElement).value);
    const notes    = (document.getElementById('sale-notes') as HTMLInputElement).value.trim();

    if (!date)     { showToast('Enter a date', 'error'); return; }
    if (!litres || litres <= 0) { showToast('Enter valid litres', 'error'); return; }
    if (!price || price <= 0)   { showToast('Enter a valid price', 'error'); return; }

    state = addSale(state, { date, litres, price, notes });
    persist();
    showToast('Sale saved!', 'success');
    
    // Clear form
    (document.getElementById('sale-litres') as HTMLInputElement).value = '';
    (document.getElementById('sale-total') as HTMLInputElement).value  = '';
    (document.getElementById('sale-notes') as HTMLInputElement).value  = '';

    renderHome();
    navigate('home');
  });

  // Pay modal
  document.getElementById('btn-confirm-pay')!.addEventListener('click', confirmPayment);
  document.getElementById('btn-cancel-pay')!.addEventListener('click', closePayModal);
  document.getElementById('modal-pay')!.addEventListener('click', e => {
    if (e.target === document.getElementById('modal-pay')) closePayModal();
  });

  // Sell price modal
  document.getElementById('btn-sell-price')!.addEventListener('click', openSellPriceModal);
  document.getElementById('btn-save-sell-price')!.addEventListener('click', saveSellPrice);
  document.getElementById('btn-cancel-sell-price')!.addEventListener('click', closeSellPriceModal);
  document.getElementById('modal-sell-price')!.addEventListener('click', e => {
    if (e.target === document.getElementById('modal-sell-price')) closeSellPriceModal();
  });

  // Tally period toggle
  document.querySelectorAll('.period-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      currentPeriod = (btn as HTMLElement).dataset.period as TallyPeriod;
      renderTally();
    });
  });

  // PWA Install Prompt Handler
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    const banner = document.getElementById('install-banner');
    if (banner && !localStorage.getItem('install-dismissed')) {
      banner.style.display = 'flex';
    }
  });

  document.getElementById('btn-install-app')!.addEventListener('click', async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      const banner = document.getElementById('install-banner');
      if (banner) banner.style.display = 'none';
    }
    deferredPrompt = null;
  });

  document.getElementById('btn-close-install')!.addEventListener('click', () => {
    const banner = document.getElementById('install-banner');
    if (banner) banner.style.display = 'none';
    localStorage.setItem('install-dismissed', 'true');
  });

  // Handle iOS Safari share instructions (since iOS doesn't support beforeinstallprompt)
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream;
  const isStandalone = window.matchMedia('(display-mode: standalone)').matches;
  if (isIOS && !isStandalone && !localStorage.getItem('install-dismissed')) {
    const banner = document.getElementById('install-banner');
    if (banner) {
      banner.style.display = 'flex';
      const textEl = banner.querySelector('.install-text p')!;
      textEl.innerHTML = 'Tap the share button in Safari, then select <strong>Add to Home Screen</strong>.';
      const installBtn = document.getElementById('btn-install-app')!;
      installBtn.style.display = 'none';
    }
  }
}

// ─── Dynamic Viewport Height Handler ──────────────────────────────────────────

function setDocHeight() {
  const vh = window.innerHeight * 0.01;
  document.documentElement.style.setProperty('--vh', `${vh}px`);
}
window.addEventListener('resize', setDocHeight);
window.addEventListener('orientationchange', setDocHeight);
setDocHeight();

// ─── Init ─────────────────────────────────────────────────────────────────────

buildHTML();
attachListeners();
navigate('home');
