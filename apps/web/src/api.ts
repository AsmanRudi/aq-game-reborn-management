export interface StationItem {
  id: string;
  code: string;
  consoleType: string;
  deviceType: 'CONSOLE' | 'PS_BOX';
  type: string;
  status: 'Tersedia' | 'Aktif' | 'Dipesan' | 'Maintenance';
  className: 'available' | 'active' | 'booked' | 'maintenance';
  setupConfirmed: boolean;
  canStartRental: boolean;
  customer?: string | null;
  elapsed?: string | null;
  active: boolean;
  maintenanceReason?: string | null;
  currentSessionId?: string | null;
  currentBookingNumber?: string | null;
  currentBookingId?: string | null;
}

export interface DashboardMetrics {
  totalStations: number;
  availableStations: number;
  activeSessionsCount: number;
  todayBookingsCount: number;
  todayRevenue: number;
}

export interface ActiveRowItem {
  id: string;
  stationCode: string;
  customerName: string;
  startedAtTime: string;
  elapsed: string;
}

export interface DashboardData {
  metrics: DashboardMetrics;
  stations: StationItem[];
  activeRows: ActiveRowItem[];
}

export interface RateItem {
  id: string;
  key: string;
  version: number;
  name: string;
  consoleType: string | null;
  deviceType: 'CONSOLE' | 'PS_BOX';
  billingMode: 'HOURLY' | 'PACKAGE';
  amount: number;
  durationMinutes: number | null;
  minimumMinutes: number;
  roundingMinutes: number;
  active: boolean;
  effectiveFrom: string;
  effectiveTo: string | null;
}

const API_BASE = import.meta.env.VITE_API_URL || '/api/v1';
const AUTH_TOKEN_KEY = 'aq-game-staff-session';

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: 'ADMIN' | 'CASHIER';
}

interface ApiError {
  error?: { message?: string };
}

export function hasAuthToken(): boolean {
  return typeof window !== 'undefined' && Boolean(window.sessionStorage.getItem(AUTH_TOKEN_KEY));
}

function setAuthToken(token: string | null): void {
  if (typeof window === 'undefined') return;
  if (token) window.sessionStorage.setItem(AUTH_TOKEN_KEY, token);
  else window.sessionStorage.removeItem(AUTH_TOKEN_KEY);
}

async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  const token = typeof window === 'undefined' ? null : window.sessionStorage.getItem(AUTH_TOKEN_KEY);
  if (token) headers.set('Authorization', `Bearer ${token}`);
  const response = await fetch(API_BASE + path, { ...init, headers });
  if (response.status === 401 && path !== '/auth/login') {
    setAuthToken(null);
    if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('aq-auth-expired'));
  }
  return response;
}

export async function login(email: string, password: string): Promise<AuthUser> {
  const response = await apiFetch('/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const json = await response.json() as {
    data?: { token: string; user: AuthUser };
    error?: ApiError['error'];
  };
  if (!response.ok || !json.data) {
    throw new Error(json.error?.message || 'Login gagal. Periksa email dan kata sandi.');
  }
  setAuthToken(json.data.token);
  return json.data.user;
}

export async function fetchCurrentUser(): Promise<AuthUser> {
  const response = await apiFetch('/auth/me');
  const json = await response.json() as { data?: AuthUser; error?: ApiError['error'] };
  if (!response.ok || !json.data) {
    throw new Error(json.error?.message || `Gagal memvalidasi sesi (${response.status}).`);
  }
  return json.data;
}

export async function logout(): Promise<void> {
  const response = await apiFetch('/auth/logout', { method: 'POST' });
  setAuthToken(null);
  if (!response.ok && response.status !== 401) {
    throw new Error(`Gagal mengakhiri sesi login (${response.status}).`);
  }
}

export async function fetchDashboard(): Promise<DashboardData> {
  const response = await apiFetch('/dashboard/summary');
  if (!response.ok) {
    throw new Error('Gagal memuat data dashboard (' + response.status + ')');
  }
  const result = (await response.json()) as { data: DashboardData };
  return result.data;
}

export async function fetchStations(): Promise<StationItem[]> {
  const response = await apiFetch('/stations');
  if (!response.ok) {
    throw new Error('Gagal memuat data station (' + response.status + ')');
  }
  const result = (await response.json()) as { data: StationItem[] };
  return result.data;
}

export async function fetchRates(): Promise<RateItem[]> {
  const response = await apiFetch('/rates');
  if (!response.ok) {
    throw new Error('Gagal memuat data paket tarif (' + response.status + ')');
  }
  const result = (await response.json()) as { data: RateItem[] };
  return result.data;
}

export interface StartSessionInput {
  stationCode: string;
  rateKey?: string;
  customerName?: string;
  customerPhone?: string | null;
}

export interface StartSessionResult {
  id: string;
  number: string;
  startedAt: string;
  station: { code: string; consoleType: string };
  customer?: { name: string } | null;
  rate?: { name: string; amount: number; billingMode: string } | null;
}

export async function startSession(input: StartSessionInput): Promise<StartSessionResult> {
  const response = await apiFetch('/sessions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  const json = await response.json();
  if (!response.ok) {
    throw new Error(json?.error?.message || 'Gagal memulai sesi rental (' + response.status + ')');
  }
  return json.data as StartSessionResult;
}

export interface StopSessionInput {
  discount?: number;
  notes?: string | null;
}

export interface BillingBreakdown {
  actualMinutes: number;
  billedDurationMinutes: number;
  totalAmount: number;
  subtotal: number;
  discount: number;
  breakdown: string;
}

export interface StopSessionResult {
  session: { id: string; number: string; endedAt: string; totalAmount: number };
  station: { code: string };
  customer?: { name: string } | null;
  invoice: {
    id: string;
    number: string;
    subtotal: number;
    discount: number;
    total: number;
    status: string;
  };
  billing: BillingBreakdown;
}

export async function stopSession(
  sessionId: string,
  input: StopSessionInput = {}
): Promise<StopSessionResult> {
  const response = await apiFetch('/sessions/' + sessionId + '/stop', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  const json = await response.json();
  if (!response.ok) {
    throw new Error(json?.error?.message || 'Gagal mengakhiri sesi rental (' + response.status + ')');
  }
  return json.data as StopSessionResult;
}