export interface Farmer {
  id: string;
  name: string;
  phone: string;
  defaultPrice: number; // KES per litre (buy price)
}

export interface Entry {
  id: string;
  farmerId: string;
  date: string; // YYYY-MM-DD
  litres: number;
  price: number; // KES per litre at time of entry (buy price)
  total: number; // litres * price (buy cost)
  paidStatus: 'unpaid' | string; // 'unpaid' or paymentId
}

export interface Payment {
  id: string;
  farmerId: string;
  date: string; // YYYY-MM-DD (when payment was recorded)
  amount: number;
  periodStart: string; // YYYY-MM-DD
  periodEnd: string; // YYYY-MM-DD
  notes?: string;
}

export interface Settings {
  sellingPrice: number; // KES per litre (shop sells at this price)
}

export interface AppState {
  farmers: Farmer[];
  entries: Entry[];
  payments: Payment[];
  settings: Settings;
}

export type ViewName = 'home' | 'farmers' | 'add-entry' | 'payments' | 'farmer-detail' | 'tally';

export type TallyPeriod = 'this-week' | 'last-week' | 'this-month' | 'last-month';

export interface TallySummary {
  litres: number;
  buyCost: number;       // sum of entry totals (paid to farmers)
  revenue: number;       // litres × sellingPrice
  profit: number;        // revenue - buyCost
  margin: number;        // profit / revenue * 100
  farmerBreakdown: { farmer: Farmer; litres: number; cost: number }[];
}
