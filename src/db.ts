import type { AppState, Farmer, Entry, Payment } from './types';

const STORAGE_KEY = 'rinjoya_data';

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function today(): string {
  return new Date().toISOString().split('T')[0];
}

// ─── Seed Data ────────────────────────────────────────────────────────────────

function getSeedData(): AppState {
  const f1 = generateId();
  const f2 = generateId();
  const f3 = generateId();
  const e1 = generateId();
  const e2 = generateId();
  const e3 = generateId();
  const e4 = generateId();
  const e5 = generateId();
  const p1 = generateId();

  const d = (offset: number) => {
    const d = new Date();
    d.setDate(d.getDate() - offset);
    return d.toISOString().split('T')[0];
  };

  const farmers: Farmer[] = [
    { id: f1, name: 'Grace Wanjiku', phone: '0712 345 678', defaultPrice: 55 },
    { id: f2, name: 'James Mwangi', phone: '0723 456 789', defaultPrice: 52 },
    { id: f3, name: 'Esther Akinyi', phone: '0734 567 890', defaultPrice: 58 },
  ];

  const entries: Entry[] = [
    { id: e1, farmerId: f1, date: d(3), litres: 12, price: 55, total: 660, paidStatus: p1 },
    { id: e2, farmerId: f2, date: d(3), litres: 8,  price: 52, total: 416, paidStatus: p1 },
    { id: e3, farmerId: f1, date: d(1), litres: 14, price: 55, total: 770, paidStatus: 'unpaid' },
    { id: e4, farmerId: f2, date: d(1), litres: 10, price: 52, total: 520, paidStatus: 'unpaid' },
    { id: e5, farmerId: f3, date: today(), litres: 9, price: 58, total: 522, paidStatus: 'unpaid' },
  ];

  const payments: Payment[] = [
    {
      id: p1,
      farmerId: f1,
      date: d(2),
      amount: 660 + 416,
      periodStart: d(5),
      periodEnd: d(3),
      notes: 'Weekly payment',
    },
  ];

  return { farmers, entries, payments };
}

// ─── Load / Save ─────────────────────────────────────────────────────────────

export function loadState(): AppState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as AppState;
  } catch { /* ignore */ }
  const seed = getSeedData();
  saveState(seed);
  return seed;
}

export function saveState(state: AppState): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

// ─── Farmers ─────────────────────────────────────────────────────────────────

export function addFarmer(state: AppState, data: Omit<Farmer, 'id'>): AppState {
  const farmer: Farmer = { id: generateId(), ...data };
  return { ...state, farmers: [...state.farmers, farmer] };
}

export function updateFarmer(state: AppState, id: string, data: Omit<Farmer, 'id'>): AppState {
  return {
    ...state,
    farmers: state.farmers.map(f => f.id === id ? { ...f, ...data } : f),
  };
}

export function deleteFarmer(state: AppState, id: string): AppState {
  return {
    ...state,
    farmers: state.farmers.filter(f => f.id !== id),
    entries: state.entries.filter(e => e.farmerId !== id),
    payments: state.payments.filter(p => p.farmerId !== id),
  };
}

// ─── Entries ─────────────────────────────────────────────────────────────────

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

// ─── Payments ─────────────────────────────────────────────────────────────────

export function recordPayment(
  state: AppState,
  farmerId: string,
  periodStart: string,
  periodEnd: string,
  notes: string,
): AppState {
  const unpaid = state.entries.filter(
    e => e.farmerId === farmerId &&
    e.paidStatus === 'unpaid' &&
    e.date >= periodStart &&
    e.date <= periodEnd,
  );
  if (!unpaid.length) return state;

  const amount = unpaid.reduce((s, e) => s + e.total, 0);
  const payment: Payment = {
    id: generateId(),
    farmerId,
    date: today(),
    amount,
    periodStart,
    periodEnd,
    notes,
  };

  const entries = state.entries.map(e =>
    unpaid.find(u => u.id === e.id) ? { ...e, paidStatus: payment.id } : e,
  );

  return { ...state, entries, payments: [...state.payments, payment] };
}

// ─── Queries ──────────────────────────────────────────────────────────────────

export function getUnpaidTotalForFarmer(state: AppState, farmerId: string): number {
  return state.entries
    .filter(e => e.farmerId === farmerId && e.paidStatus === 'unpaid')
    .reduce((s, e) => s + e.total, 0);
}

export function getTodayStats(state: AppState): { litres: number; amount: number } {
  const t = today();
  const todayEntries = state.entries.filter(e => e.date === t);
  return {
    litres: todayEntries.reduce((s, e) => s + e.litres, 0),
    amount: todayEntries.reduce((s, e) => s + e.total, 0),
  };
}

export function getMonthlyLitresForFarmer(state: AppState, farmerId: string): number {
  const monthStart = today().slice(0, 7); // YYYY-MM
  return state.entries
    .filter(e => e.farmerId === farmerId && e.date.startsWith(monthStart))
    .reduce((s, e) => s + e.litres, 0);
}

// ─── Export / Import ──────────────────────────────────────────────────────────

export function exportJSON(state: AppState): void {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `rinjoya-backup-${today()}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

export function exportCSV(state: AppState): void {
  const header = 'Date,Farmer,Litres,Price (KES),Total (KES),Status';
  const rows = state.entries.map(e => {
    const farmer = state.farmers.find(f => f.id === e.farmerId);
    const status = e.paidStatus === 'unpaid' ? 'Unpaid' : 'Paid';
    return `${e.date},"${farmer?.name ?? 'Unknown'}",${e.litres},${e.price},${e.total},${status}`;
  });
  const csv = [header, ...rows].join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `rinjoya-entries-${today()}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export function importJSON(state: AppState, json: string): AppState | null {
  try {
    const parsed = JSON.parse(json) as AppState;
    if (!Array.isArray(parsed.farmers) || !Array.isArray(parsed.entries) || !Array.isArray(parsed.payments)) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}
