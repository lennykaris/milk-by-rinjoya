import type { AppState, Farmer, Entry, Payment, Sale, Settings, TallySummary, TallyPeriod } from './types';

const STORAGE_KEY = 'rinjoya_data';

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function today(): string {
  return new Date().toISOString().split('T')[0];
}

// ─── Date Range Helpers ───────────────────────────────────────────────────────

function addDays(dateStr: string, n: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  date.setUTCDate(date.getUTCDate() + n);
  return date.toISOString().split('T')[0];
}

export function getPeriodRange(period: TallyPeriod): { start: string; end: string; label: string } {
  const t = today();
  const [y, m, d] = t.split('-').map(Number);
  const now = new Date(Date.UTC(y, m - 1, d));
  const dayOfWeek = now.getUTCDay(); // 0 = Sun
  const startOfWeek = addDays(t, -dayOfWeek);

  switch (period) {
    case 'this-week':
      return { start: startOfWeek, end: t, label: 'This Week' };
    case 'last-week': {
      const s = addDays(startOfWeek, -7);
      return { start: s, end: addDays(s, 6), label: 'Last Week' };
    }
    case 'this-month': {
      const s = t.slice(0, 8) + '01';
      return { start: s, end: t, label: 'This Month' };
    }
    case 'last-month': {
      const prevMonth = new Date(Date.UTC(y, m - 2, 1));
      const s = prevMonth.toISOString().split('T')[0];
      const last = new Date(Date.UTC(y, m - 1, 0));
      return { start: s, end: last.toISOString().split('T')[0], label: 'Last Month' };
    }
  }
  return { start: t, end: t, label: 'Today' };
}

// ─── Load / Save ──────────────────────────────────────────────────────────────

export function loadState(): AppState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as AppState;
      // Guarantee all properties exist to handle migrations cleanly
      if (!parsed.farmers) parsed.farmers = [];
      if (!parsed.entries) parsed.entries = [];
      if (!parsed.payments) parsed.payments = [];
      if (!parsed.sales) parsed.sales = [];
      if (!parsed.settings) parsed.settings = { sellingPrice: 80 };
      return parsed;
    }
  } catch { /* ignore */ }
  const defaultState: AppState = {
    farmers: [],
    entries: [],
    payments: [],
    sales: [],
    settings: { sellingPrice: 80 }
  };
  saveState(defaultState);
  return defaultState;
}

export function saveState(state: AppState): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

// ─── Settings ─────────────────────────────────────────────────────────────────

export function updateSettings(state: AppState, settings: Settings): AppState {
  return { ...state, settings };
}

// ─── Farmers ──────────────────────────────────────────────────────────────────

export function addFarmer(state: AppState, data: Omit<Farmer, 'id'>): AppState {
  const farmer: Farmer = { id: generateId(), ...data };
  return { ...state, farmers: [...state.farmers, farmer] };
}

export function updateFarmer(state: AppState, id: string, data: Omit<Farmer, 'id'>): AppState {
  return { ...state, farmers: state.farmers.map(f => f.id === id ? { ...f, ...data } : f) };
}

export function deleteFarmer(state: AppState, id: string): AppState {
  return {
    ...state,
    farmers: state.farmers.filter(f => f.id !== id),
    entries: state.entries.filter(e => e.farmerId !== id),
    payments: state.payments.filter(p => p.farmerId !== id),
  };
}

// ─── Entries ──────────────────────────────────────────────────────────────────

export function addEntry(state: AppState, data: Omit<Entry, 'id' | 'total' | 'paidStatus'>): AppState {
  const entry: Entry = {
    id: generateId(),
    ...data,
    total: +(data.litres * data.price).toFixed(2),
    paidStatus: 'unpaid',
  };
  return { ...state, entries: [...state.entries, entry] };
}

export function deleteEntry(state: AppState, id: string): AppState {
  return { ...state, entries: state.entries.filter(e => e.id !== id) };
}

// ─── Sales ────────────────────────────────────────────────────────────────────

export function addSale(state: AppState, data: Omit<Sale, 'id' | 'total'>): AppState {
  const sale: Sale = {
    id: generateId(),
    ...data,
    total: +(data.litres * data.price).toFixed(2),
  };
  return { ...state, sales: [...(state.sales || []), sale] };
}

export function deleteSale(state: AppState, id: string): AppState {
  return { ...state, sales: (state.sales || []).filter(s => s.id !== id) };
}

// ─── Payments ─────────────────────────────────────────────────────────────────

export function recordPayment(
  state: AppState,
  farmerId: string,
  periodStart: string,
  periodEnd: string,
  notes: string,
): AppState {
  const unpaid = state.entries.filter(
    e => e.farmerId === farmerId && e.paidStatus === 'unpaid' && e.date >= periodStart && e.date <= periodEnd,
  );
  if (!unpaid.length) return state;

  const amount = unpaid.reduce((s, e) => s + e.total, 0);
  const payment: Payment = { id: generateId(), farmerId, date: today(), amount, periodStart, periodEnd, notes };
  const entries = state.entries.map(e => unpaid.find(u => u.id === e.id) ? { ...e, paidStatus: payment.id } : e);
  return { ...state, entries, payments: [...state.payments, payment] };
}

// ─── Tally / Profit Queries ───────────────────────────────────────────────────

export function getTallySummary(state: AppState, start: string, end: string): TallySummary {
  const inRange = state.entries.filter(e => e.date >= start && e.date <= end);
  const litres   = inRange.reduce((s, e) => s + e.litres, 0);
  const buyCost  = inRange.reduce((s, e) => s + e.total, 0);
  const revenue  = +(litres * state.settings.sellingPrice).toFixed(2);

  // Calculate actual revenue from recorded sales in date range
  const salesInRange = (state.sales || []).filter(s => s.date >= start && s.date <= end);
  const actualRevenue = +salesInRange.reduce((s, e) => s + e.total, 0).toFixed(2);

  // Actual profit is actual revenue minus buy cost
  const profit   = +(actualRevenue - buyCost).toFixed(2);
  const margin   = actualRevenue > 0 ? +((profit / actualRevenue) * 100).toFixed(1) : 0;

  const farmerBreakdown = state.farmers.map(farmer => {
    const fe = inRange.filter(e => e.farmerId === farmer.id);
    return {
      farmer,
      litres: fe.reduce((s, e) => s + e.litres, 0),
      cost: fe.reduce((s, e) => s + e.total, 0),
    };
  }).filter(f => f.litres > 0).sort((a, b) => b.litres - a.litres);

  return { litres, buyCost, revenue, actualRevenue, profit, margin, farmerBreakdown };
}

// Get daily breakdown for a period (for mini bar chart)
export function getDailyBreakdown(state: AppState, start: string, end: string): { date: string; litres: number; profit: number }[] {
  const days: { date: string; litres: number; profit: number }[] = [];
  let cur = start;
  while (cur <= end) {
    const dayEntries = state.entries.filter(e => e.date === cur);
    const daySales   = (state.sales || []).filter(s => s.date === cur);
    const litres     = dayEntries.reduce((s, e) => s + e.litres, 0);
    const buyCost    = dayEntries.reduce((s, e) => s + e.total, 0);
    const actualRev  = daySales.reduce((s, sld) => s + sld.total, 0);
    days.push({ date: cur, litres, profit: +(actualRev - buyCost).toFixed(2) });
    // advance by one day timezone-safely
    cur = addDays(cur, 1);
  }
  return days;
}

// ─── Simple Queries ───────────────────────────────────────────────────────────

export function getUnpaidTotalForFarmer(state: AppState, farmerId: string): number {
  return state.entries.filter(e => e.farmerId === farmerId && (e.paidStatus || 'unpaid') === 'unpaid').reduce((s, e) => s + e.total, 0);
}

export function getTodayStats(state: AppState): { litres: number; amount: number } {
  const t = today();
  const todayEntries = state.entries.filter(e => e.date === t);
  return { litres: todayEntries.reduce((s, e) => s + e.litres, 0), amount: todayEntries.reduce((s, e) => s + e.total, 0) };
}

export function getTodaySales(state: AppState): { litres: number; amount: number } {
  const t = today();
  const todaySales = (state.sales || []).filter(s => s.date === t);
  return { litres: todaySales.reduce((s, e) => s + e.litres, 0), amount: todaySales.reduce((s, e) => s + e.total, 0) };
}

export function getTodayStock(state: AppState): { incoming: number; sold: number; left: number } {
  const incoming = getTodayStats(state).litres;
  const sold     = getTodaySales(state).litres;
  const left     = +(incoming - sold).toFixed(2);
  return { incoming, sold, left };
}

export function getMonthlyLitresForFarmer(state: AppState, farmerId: string): number {
  const monthStart = today().slice(0, 7);
  return state.entries.filter(e => e.farmerId === farmerId && e.date.startsWith(monthStart)).reduce((s, e) => s + e.litres, 0);
}

// ─── Export / Import ──────────────────────────────────────────────────────────

export function exportJSON(state: AppState): void {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `rinjoya-backup-${today()}.json`; a.click();
  URL.revokeObjectURL(url);
}

export function exportCSV(state: AppState): void {
  const header = 'Date,Farmer,Litres,Buy Price (KES/L),Buy Total (KES),Sell Price (KES/L),Revenue (KES),Profit (KES),Status';
  const rows = state.entries.map(e => {
    const farmer  = state.farmers.find(f => f.id === e.farmerId);
    const revenue = +(e.litres * state.settings.sellingPrice).toFixed(2);
    const profit  = +(revenue - e.total).toFixed(2);
    const status  = e.paidStatus === 'unpaid' ? 'Unpaid' : 'Paid';
    return `${e.date},"${farmer?.name ?? 'Unknown'}",${e.litres},${e.price},${e.total},${state.settings.sellingPrice},${revenue},${profit},${status}`;
  });
  const csv = [header, ...rows].join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `rinjoya-entries-${today()}.csv`; a.click();
  URL.revokeObjectURL(url);
}

export function importJSON(state: AppState, json: string): AppState | null {
  try {
    const parsed = JSON.parse(json) as AppState;
    if (!Array.isArray(parsed.farmers) || !Array.isArray(parsed.entries) || !Array.isArray(parsed.payments)) return null;
    if (!parsed.sales) parsed.sales = [];
    if (!parsed.settings) parsed.settings = { sellingPrice: state.settings.sellingPrice };
    return parsed;
  } catch { return null; }
}
