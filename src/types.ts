export interface Farmer {
  id: string;
  name: string;
  phone: string;
  defaultPrice: number; // KES per litre
}

export interface Entry {
  id: string;
  farmerId: string;
  date: string; // YYYY-MM-DD
  litres: number;
  price: number; // KES per litre at time of entry
  total: number; // litres * price
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

export interface AppState {
  farmers: Farmer[];
  entries: Entry[];
  payments: Payment[];
}

export type ViewName = 'home' | 'farmers' | 'add-entry' | 'payments' | 'farmer-detail';
