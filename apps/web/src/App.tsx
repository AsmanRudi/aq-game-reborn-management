import React, { useEffect, useState } from 'react';
import {
  Activity,
  AlertCircle,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  CircleDollarSign,
  Gamepad2,
  Info,
  Menu,
  MonitorPlay,
  Plus,
  RefreshCw,
  Settings2,
  Users,
  Wrench,
  X,
} from 'lucide-react';
import {
  fetchDashboard,
  fetchRates,
  fetchCurrentUser,
  hasAuthToken,
  login,
  logout,
  startSession,
  stopSession,
  DashboardData,
  StationItem,
  ActiveRowItem,
  RateItem,
  StopSessionResult,
  AuthUser,
} from './api';
import './auth.css';

type TabKey = 'dashboard' | 'booking' | 'sessions' | 'customers' | 'reports' | 'settings';

interface ToastState {
  title: string;
  message: string;
  type?: 'info' | 'warning';
}

export default function App() {
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [authLoading, setAuthLoading] = useState<boolean>(false);
  const [loginEmail, setLoginEmail] = useState<string>('');
  const [loginPassword, setLoginPassword] = useState<string>('');
  const [loginSubmitting, setLoginSubmitting] = useState<boolean>(false);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [configuredRates, setConfiguredRates] = useState<RateItem[] | null>(null);
  const [ratesError, setRatesError] = useState<string | null>(null);

  // Interactivity states
  const [activeTab, setActiveTab] = useState<TabKey>('dashboard');
  const [selectedStation, setSelectedStation] = useState<StationItem | null>(null);
  const [rentalModalStation, setRentalModalStation] = useState<string | null>(null);
  const [isRentalModalOpen, setIsRentalModalOpen] = useState<boolean>(false);
  const [isManageModalOpen, setIsManageModalOpen] = useState<boolean>(false);
  const [stopSessionTarget, setStopSessionTarget] = useState<ActiveRowItem | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState<boolean>(false);
  const [toast, setToast] = useState<ToastState | null>(null);

  // Rental form state
  const [rentalCustomerName, setRentalCustomerName] = useState<string>('');
  const [rentalCustomerPhone, setRentalCustomerPhone] = useState<string>('');
  const [rentalRateKey, setRentalRateKey] = useState<string>('');
  const [availableRates, setAvailableRates] = useState<RateItem[]>([]);
  const [rentalSubmitting, setRentalSubmitting] = useState<boolean>(false);
  const [rentalError, setRentalError] = useState<string | null>(null);

  // Stop session state
  const [stopSubmitting, setStopSubmitting] = useState<boolean>(false);
  const [stopError, setStopError] = useState<string | null>(null);
  const [stopResult, setStopResult] = useState<StopSessionResult | null>(null);

  const showToast = (message: string, title = 'Informasi Fitur', type: 'info' | 'warning' = 'info') => {
    setToast({ title, message, type });
  };

  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  // Keyboard navigation for closing modals
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setSelectedStation(null);
        setIsRentalModalOpen(false);
        setIsManageModalOpen(false);
        setStopSessionTarget(null);
        setMobileMenuOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const loadData = async () => {
    try {
      const result = await fetchDashboard();
      setData(result);
      setError(null);
    } catch (err: any) {
      setError(err?.message || 'Gagal terhubung ke API backend AQ Game.');
    } finally {
      setLoading(false);
    }
  };

  const loadConfiguredRates = async () => {
    try {
      const rates = await fetchRates();
      setConfiguredRates(rates);
      setRatesError(null);
    } catch (err: unknown) {
      setConfiguredRates(null);
      setRatesError(err instanceof Error ? err.message : 'Gagal membaca tarif dari database.');
    }
  };

  useEffect(() => {
    let cancelled = false;
    const handleExpired = () => {
      setAuthUser(null);
      setData(null);
      setConfiguredRates(null);
      setLoading(false);
      setLoginError('Sesi login telah berakhir. Silakan masuk kembali.');
    };
    window.addEventListener('aq-auth-expired', handleExpired);
    if (hasAuthToken()) {
      setAuthLoading(true);
      fetchCurrentUser()
        .then((user) => {
          if (!cancelled) setAuthUser(user);
        })
        .catch((err: unknown) => {
          if (!cancelled) setLoginError(err instanceof Error ? err.message : 'Sesi login tidak dapat divalidasi.');
        })
        .finally(() => {
          if (!cancelled) setAuthLoading(false);
        });
    }
    return () => {
      cancelled = true;
      window.removeEventListener('aq-auth-expired', handleExpired);
    };
  }, []);

  useEffect(() => {
    if (!authUser) return;
    setLoading(true);
    loadData();
    loadConfiguredRates();
    const interval = setInterval(loadData, 5000);
    const rateInterval = setInterval(loadConfiguredRates, 30000);
    return () => {
      clearInterval(interval);
      clearInterval(rateInterval);
    };
  }, [authUser]);

  const metrics = data?.metrics;
  const stations: StationItem[] = data?.stations ?? [];
  const activeRow = data?.activeRows?.[0] ?? null;
  const userInitials = authUser?.name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('') ?? '';
  const userRoleLabel = authUser?.role === 'ADMIN' ? 'Administrator' : 'Kasir';

  const formatRupiah = (val: number) => 'Rp ' + val.toLocaleString('id-ID');
  const isRateEffective = (rate: RateItem, at = Date.now()) =>
    Date.parse(rate.effectiveFrom) <= at &&
    (rate.effectiveTo === null || Date.parse(rate.effectiveTo) > at);
  const latestRate = (key: string) => configuredRates
    ?.filter((rate) => rate.key === key)
    .sort((left, right) => right.version - left.version)[0];
  const activeRate = (key: string) => configuredRates
    ?.filter((rate) => rate.key === key && isRateEffective(rate))
    .sort((left, right) => right.version - left.version)[0];
  const rateDatabaseNote = (key: string, targetAmount: number, unit: string) => {
    if (configuredRates === null) return 'Status database belum tersedia.';
    const active = activeRate(key);
    if (active) {
      return active.amount === targetAmount
        ? `Aktif di database · ${formatRupiah(active.amount)}${unit}`
        : `Tarif aktif DB ${formatRupiah(active.amount)}${unit}; target ${formatRupiah(targetAmount)}${unit}`;
    }
    const latest = latestRate(key);
    if (latest) {
      return latest.amount === targetAmount
        ? `Tersimpan nonaktif · ${formatRupiah(latest.amount)}${unit}`
        : `Tersimpan ${formatRupiah(latest.amount)}${unit}; target belum aktif`;
    }
    return 'Belum tersimpan di database.';
  };
  const packageSetNote = (keys: string[]) => {
    if (configuredRates === null) return 'Status database belum tersedia';
    const packageRates = keys
      .map((key) => latestRate(key))
      .filter((rate): rate is RateItem => rate !== undefined);
    if (packageRates.length === 0) return 'Belum tersimpan';
    const activeCount = packageRates.filter((rate) => rate.active).length;
    return activeCount > 0
      ? `${activeCount} paket aktif di database`
      : 'Tersimpan nonaktif';
  };

  const tabLabels: Record<TabKey, string> = {
    dashboard: 'Dashboard',
    booking: 'Booking',
    sessions: 'Sesi Rental',
    customers: 'Pelanggan',
    reports: 'Laporan',
    settings: 'Pengaturan',
  };

  const handleNavClick = (tab: TabKey) => {
    setActiveTab(tab);
    setMobileMenuOpen(false);
  };

  const handleLogin = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoginSubmitting(true);
    setLoginError(null);
    try {
      const user = await login(loginEmail, loginPassword);
      setAuthUser(user);
      setLoginPassword('');
      setError(null);
    } catch (err: unknown) {
      setLoginError(err instanceof Error ? err.message : 'Login gagal.');
    } finally {
      setLoginSubmitting(false);
    }
  };

  const handleLogout = async () => {
    try {
      await logout();
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : 'Sesi login tidak dapat diakhiri di server.', 'Logout gagal', 'warning');
    } finally {
      setAuthUser(null);
      setData(null);
      setConfiguredRates(null);
    }
  };

  const handleOpenRental = async (stationCode?: string) => {
    const station = stationCode
      ? stations.find((item) => item.code === stationCode)
      : stations.find((item) => item.status === 'Tersedia');
    if (!station || !station.canStartRental) {
      showToast('Belum ada station tersedia yang sudah dikonfirmasi untuk memulai rental.', 'Station belum siap', 'warning');
      return;
    }

    const code = station.code;
    setRentalModalStation(code);
    setRentalCustomerName('');
    setRentalCustomerPhone('');
    setRentalRateKey('');
    setRentalError(null);
    setIsRentalModalOpen(true);
    // Pre-fetch available rates
    try {
      const rates = await fetchRates();
      const now = Date.now();
      const compatibleRates = rates.filter((rate) =>
        rate.active &&
        Date.parse(rate.effectiveFrom) <= now &&
        (rate.effectiveTo === null || Date.parse(rate.effectiveTo) > now) &&
        rate.deviceType === station.deviceType &&
        rate.consoleType === station.consoleType &&
        rate.billingMode === (station.deviceType === 'PS_BOX' ? 'PACKAGE' : 'HOURLY')
      );
      setAvailableRates(compatibleRates);
      const defaultRate = station.deviceType === 'CONSOLE'
        ? compatibleRates.find((rate) => rate.billingMode === 'HOURLY')
        : undefined;
      if (defaultRate) setRentalRateKey(defaultRate.key);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Gagal memuat daftar tarif.';
      setAvailableRates([]);
      showToast(`${message} Pemilihan tarif tidak dapat diverifikasi.`, 'Tarif tidak tersedia', 'warning');
    }
  };

  const handleConfirmRental = async () => {
    if (!rentalModalStation) return;
    if (!rentalRateKey) {
      setRentalError('Belum ada tarif aktif yang sesuai dengan jenis station ini.');
      return;
    }
    setRentalSubmitting(true);
    setRentalError(null);
    try {
      await startSession({
        stationCode: rentalModalStation,
        rateKey: rentalRateKey || undefined,
        customerName: rentalCustomerName.trim() || 'Pelanggan Walk-in',
        customerPhone: rentalCustomerPhone.trim() || null,
      });
      setIsRentalModalOpen(false);
      showToast(
        `Sesi rental ${rentalModalStation} berhasil dimulai untuk ${rentalCustomerName.trim() || 'Pelanggan Walk-in'}.`,
        'Rental Dimulai'
      );
      await loadData();
    } catch (err: any) {
      setRentalError(err?.message || 'Gagal memulai sesi rental.');
    } finally {
      setRentalSubmitting(false);
    }
  };

  const handleConfirmStop = async () => {
    if (!stopSessionTarget) return;
    setStopSubmitting(true);
    setStopError(null);
    try {
      const result = await stopSession(stopSessionTarget.id);
      setStopResult(result);
      await loadData();
    } catch (err: any) {
      setStopError(err?.message || 'Gagal mengakhiri sesi rental.');
    } finally {
      setStopSubmitting(false);
    }
  };

  const handleStationClick = (station: StationItem) => {
    setSelectedStation(station);
  };

  if (authLoading) {
    return <main className="auth-screen"><p className="auth-status">Memvalidasi sesi staff...</p></main>;
  }

  if (!authUser) {
    return (
      <main className="auth-screen">
        <form className="auth-card" onSubmit={handleLogin}>
          <div className="auth-brand-mark"><Gamepad2 size={24} /></div>
          <p className="auth-eyebrow">AQ GAME REBORN MANAGEMENT</p>
          <h1>Login staff</h1>
          <p className="auth-description">Masuk dengan akun staff yang terdaftar dan aktif.</p>
          {loginError && <div className="auth-error" role="alert">{loginError}</div>}
          <label htmlFor="staff-email">Email</label>
          <input
            id="staff-email"
            name="email"
            type="email"
            autoComplete="username"
            required
            value={loginEmail}
            onChange={(event) => setLoginEmail(event.target.value)}
          />
          <label htmlFor="staff-password">Kata sandi</label>
          <input
            id="staff-password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            value={loginPassword}
            onChange={(event) => setLoginPassword(event.target.value)}
          />
          <button className="auth-submit" type="submit" disabled={loginSubmitting}>
            {loginSubmitting ? 'Memeriksa akun...' : 'Masuk'}
          </button>
          <p className="auth-footnote">Akun dan hak akses diverifikasi oleh server.</p>
        </form>
      </main>
    );
  }

  return (
    <div className="app-shell">
      {/* Mobile Drawer Backdrop */}
      {mobileMenuOpen && <div className="sidebar-backdrop" onClick={() => setMobileMenuOpen(false)} />}

      {/* Sidebar */}
      <aside className={`sidebar ${mobileMenuOpen ? 'mobile-open' : ''}`}>
        <div className="brand">
          <div className="brand-icon">
            <Gamepad2 size={22} />
          </div>
          <div>
            <b>AQ GAME</b>
            <span>REBORN MANAGEMENT</span>
          </div>
        </div>

        <button
          type="button"
          className="branch"
          onClick={() => showToast('Cabang utama: Bungus Teluk Kabung, Padang. Fitur multi-cabang berada di luar cakupan MVP.')}
          aria-label="Pilih cabang"
        >
          <span className="online-dot" /> Bungus Teluk Kabung <span className="chevron">⌄</span>
        </button>

        <p className="nav-label">MENU UTAMA</p>
        <nav>
          <button
            type="button"
            className={`nav-item ${activeTab === 'dashboard' ? 'selected' : ''}`}
            onClick={() => handleNavClick('dashboard')}
          >
            <MonitorPlay size={18} /> Dashboard
          </button>
          <button
            type="button"
            className={`nav-item ${activeTab === 'booking' ? 'selected' : ''}`}
            onClick={() => handleNavClick('booking')}
          >
            <CalendarDays size={18} /> Booking
          </button>
          <button
            type="button"
            className={`nav-item ${activeTab === 'sessions' ? 'selected' : ''}`}
            onClick={() => handleNavClick('sessions')}
          >
            <Activity size={18} /> Sesi Rental
          </button>
          <button
            type="button"
            className={`nav-item ${activeTab === 'customers' ? 'selected' : ''}`}
            onClick={() => handleNavClick('customers')}
          >
            <Users size={18} /> Pelanggan
          </button>
          <button
            type="button"
            className={`nav-item ${activeTab === 'reports' ? 'selected' : ''}`}
            onClick={() => handleNavClick('reports')}
          >
            <CircleDollarSign size={18} /> Laporan
          </button>
        </nav>

        <div className="sidebar-bottom">
          <button
            type="button"
            className={`nav-item ${activeTab === 'settings' ? 'selected' : ''}`}
            onClick={() => handleNavClick('settings')}
          >
            <Settings2 size={18} /> Pengaturan
          </button>

          <div
            className="staff"
            onClick={handleLogout}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => { if (e.key === 'Enter') void handleLogout(); }}
            aria-label="Keluar dari akun"
          >
            <div className="avatar">{userInitials}</div>
            <div>
              <b>{authUser.name}</b>
              <span>{userRoleLabel} · Keluar</span>
            </div>
            <span className="chevron">···</span>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="main-content">
        <header className="topbar">
          <div className="mobile-brand">
            <button
              type="button"
              className="mobile-menu-btn"
              onClick={() => setMobileMenuOpen(true)}
              aria-label="Buka navigasi menu"
            >
              <Menu size={20} />
            </button>
            <Gamepad2 size={20} /> AQ GAME
          </div>
          <div className="crumb">
            Operasional <span>/</span> {tabLabels[activeTab]}
          </div>
          <div className="top-actions">
            <span className="today">Kamis, 15 Oktober 2026</span>
            <div
              className="avatar"
               onClick={handleLogout}
              role="button"
              tabIndex={0}
               aria-label="Keluar dari akun"
            >
               {userInitials}
            </div>
          </div>
        </header>

        {/* Global Connection / Sync Error Banner */}
        {error && (
          <div style={{ marginTop: '16px', padding: '12px 16px', background: '#301820', border: '1px solid #6b2839', borderRadius: '8px', color: '#ffb3c0', fontSize: '14px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <AlertCircle size={16} />
            <span>{error}</span>
            <button
              type="button"
              onClick={loadData}
              style={{ marginLeft: 'auto', background: '#192638', border: '1px solid #334d72', color: '#8fb8ff', padding: '8px 12px', borderRadius: '4px', cursor: 'pointer', fontSize: '14px', minHeight: 44, display: 'flex', alignItems: 'center', gap: '6px' }}
            >
              <RefreshCw size={12} /> Coba Lagi
            </button>
          </div>
        )}

        {/* VIEW: DASHBOARD */}
        {activeTab === 'dashboard' && (
          <>
            <section className="page-heading">
              <div>
                <div className="eyebrow">
                  RINGKASAN HARI INI
                  <span className={`live-pill ${data ? 'connected' : error ? 'disconnected' : ''}`}>
                    <i /> {data ? 'TERHUBUNG' : error ? 'OFFLINE' : 'MEMUAT'}
                  </span>
                </div>
                <h1>Dashboard</h1>
                <p>Pantau station, tarif, dan rancangan program AQ GAME REBORN.</p>
              </div>
              <button
                type="button"
                className="primary-button"
                onClick={() => handleOpenRental()}
                aria-label="Mulai Rental"
              >
                <Plus size={17} /> Mulai Rental
              </button>
            </section>

            <section className="metrics">
              <article className="metric">
                <div className="metric-head">
                  Station tersedia <span className="metric-icon blue"><MonitorPlay size={17} /></span>
                </div>
                <div className="metric-value">
                  {metrics ? <>{metrics.availableStations} <small>/ {metrics.totalStations}</small></> : '—'}
                </div>
                <div className="metric-note">
                  <i className="tiny-dot green" />
                  {metrics ? `${metrics.availableStations} station siap digunakan` : 'Menunggu data backend'}
                </div>
              </article>
              <article className="metric">
                <div className="metric-head">
                  Sesi berjalan <span className="metric-icon purple"><Activity size={17} /></span>
                </div>
                <div className="metric-value">{metrics?.activeSessionsCount ?? '—'}</div>
                <div className="metric-note">
                  {metrics ? (activeRow ? `${activeRow.stationCode} sedang digunakan` : 'Tidak ada sesi berjalan') : 'Menunggu data backend'}
                </div>
              </article>
              <article className="metric">
                <div className="metric-head">
                  Booking hari ini <span className="metric-icon amber"><CalendarDays size={17} /></span>
                </div>
                <div className="metric-value">{metrics?.todayBookingsCount ?? '—'}</div>
                <div className="metric-note">{metrics ? 'Booking tercatat hari ini' : 'Menunggu data backend'}</div>
              </article>
              <article className="metric">
                <div className="metric-head">
                  Pendapatan hari ini <span className="metric-icon cyan"><CircleDollarSign size={17} /></span>
                </div>
                <div className="metric-value compact">{metrics ? formatRupiah(metrics.todayRevenue) : '—'}</div>
                <div className="metric-note">{metrics ? 'Pembayaran tercatat hari ini' : 'Menunggu data backend'}</div>
              </article>
            </section>

            <section className="dashboard-pricing">
              <div className="section-heading">
                <div>
                  <h2>Tarif & Program</h2>
                  <p>Harga ditampilkan terpisah menurut jenis perangkat.</p>
                </div>
                <span className="pricing-status">
                  {ratesError ? `Tarif database gagal dimuat: ${ratesError}` : 'Harga acuan dan status tarif database'}
                </span>
              </div>
              <div className="pricing-grid">
                <article className="pricing-card hourly-card">
                  <div className="pricing-card-heading">
                    <div>
                      <span className="pricing-label">KONSOL BIASA</span>
                      <h3>PlayStation 3</h3>
                    </div>
                    <span className="unit-count">3 unit*</span>
                  </div>
                  <p className="hourly-price">Target Rp6.000 <span>/ jam</span></p>
                  <p className="pricing-caption">{rateDatabaseNote('RATE-PS3-HOURLY', 6000, '/jam')}</p>
                </article>
                <article className="pricing-card hourly-card">
                  <div className="pricing-card-heading">
                    <div>
                      <span className="pricing-label">KONSOL BIASA</span>
                      <h3>PlayStation 4</h3>
                    </div>
                    <span className="unit-count">2 unit*</span>
                  </div>
                  <p className="hourly-price">Target Rp8.000 <span>/ jam</span></p>
                  <p className="pricing-caption">{rateDatabaseNote('RATE-PS4-HOURLY', 8000, '/jam')}</p>
                </article>
                <article className="pricing-card package-card">
                  <div className="pricing-card-heading">
                    <div>
                      <span className="pricing-label">PS BOX · PS3</span>
                      <h3>BOX-PS3-01</h3>
                    </div>
                    <span className="draft-chip">
                      {packageSetNote(['BOX-PS3-06JAM', 'BOX-PS3-12JAM', 'BOX-PS3-24JAM'])}
                    </span>
                  </div>
                  <ul className="package-list">
                    <li><span>6 jam</span><b>Rp50.000<small>{rateDatabaseNote('BOX-PS3-06JAM', 50000, '')}</small></b></li>
                    <li><span>12 jam</span><b>Rp90.000<small>{rateDatabaseNote('BOX-PS3-12JAM', 90000, '')}</small></b></li>
                    <li><span>24 jam</span><b>Rp130.000<small>{rateDatabaseNote('BOX-PS3-24JAM', 130000, '')}</small></b></li>
                  </ul>
                </article>
                <article className="pricing-card package-card">
                  <div className="pricing-card-heading">
                    <div>
                      <span className="pricing-label">PS BOX · PS4</span>
                      <h3>BOX-PS4-01</h3>
                    </div>
                    <span className="draft-chip">
                      {packageSetNote(['BOX-PS4-06JAM', 'BOX-PS4-12JAM', 'BOX-PS4-24JAM'])}
                    </span>
                  </div>
                  <ul className="package-list">
                    <li><span>6 jam</span><b>Rp60.000<small>{rateDatabaseNote('BOX-PS4-06JAM', 60000, '')}</small></b></li>
                    <li><span>12 jam</span><b>Rp100.000<small>{rateDatabaseNote('BOX-PS4-12JAM', 100000, '')}</small></b></li>
                    <li><span>24 jam</span><b>Rp140.000<small>{rateDatabaseNote('BOX-PS4-24JAM', 140000, '')}</small></b></li>
                  </ul>
                </article>
              </div>
              <p className="pricing-disclaimer">
                Paket PS Box adalah rancangan harga terpisah dan tidak tersedia untuk pemilihan tarif konsol biasa.
                Tarif aktif mengikuti data Rate di backend; harga di atas belum diverifikasi terhadap billing runtime.
                * Jumlah unit mengikuti konfigurasi seed; daftar aktual mengikuti data station backend.
              </p>
              <div className="reward-grid">
                <article className="reward-card">
                  <div className="reward-icon"><Activity size={19} /></div>
                  <div>
                    <span className="pricing-label">RANCANGAN PROGRAM LOYALITAS</span>
                    <h3>10 jam berbayar + 1 jam gratis</h3>
                    <p>Setiap akumulasi 10 jam bermain berbayar direncanakan mendapat bonus 1 jam gratis.</p>
                  </div>
                  <span className="draft-chip">Belum aktif</span>
                </article>
                <article className="reward-card">
                  <div className="reward-icon voucher"><CircleDollarSign size={19} /></div>
                  <div>
                    <span className="pricing-label">RANCANGAN VOUCHER PROMOSI</span>
                    <h3>1 voucher = 1 jam gratis</h3>
                    <p>Voucher direncanakan untuk 1 jam bermain gratis; penerbitan dan penukaran belum tersedia.</p>
                  </div>
                  <span className="draft-chip">Belum aktif</span>
                </article>
              </div>
            </section>

            <section className="stations-section">
              <div className="section-heading">
                <div>
                  <h2>Status Station</h2>
                  <p>Klik kartu station untuk melihat detail dan tindakan.</p>
                </div>
                <button
                  type="button"
                  className="outline-button"
                  onClick={() => setIsManageModalOpen(true)}
                >
                  Kelola station <span>→</span>
                </button>
              </div>

              <div className="legend">
                <span><i className="tiny-dot green" /> Tersedia</span>
                <span><i className="tiny-dot purple-bg" /> Aktif</span>
                <span><i className="tiny-dot amber-bg" /> Dipesan</span>
                <span><i className="tiny-dot gray-bg" /> Maintenance</span>
                <span><i className="tiny-dot unconfirmed-dot" /> Belum dikonfirmasi</span>
              </div>

              <div className="station-grid">
                {stations.map((station) => {
                  const isSelected = selectedStation?.code === station.code;
                  return (
                    <article
                      className={`station-card ${station.className} ${isSelected ? 'selected' : ''}`}
                      key={station.id || station.code}
                      onClick={() => handleStationClick(station)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          handleStationClick(station);
                        }
                      }}
                      tabIndex={0}
                      role="button"
                      aria-label={`Station ${station.code}, Status: ${station.status}`}
                    >
                      <div className="station-top">
                        <div className="console-icon">
                          <Gamepad2 size={19} />
                        </div>
                        <span className={`status-chip ${station.className}`}>
                          <i /> {station.status}
                        </span>
                      </div>
                      {!station.setupConfirmed && (
                        <span className="configuration-chip">Konfigurasi belum dikonfirmasi</span>
                      )}
                      <h3>{station.code || station.id}</h3>
                      <p className="console-type">{station.type}</p>
                      <div className="station-divider" />
                      {station.customer ? (
                        <div className="station-session">
                          <div>
                            <span>{station.className === 'active' ? 'Pelanggan' : 'Info'}</span>
                            <b>{station.customer}</b>
                          </div>
                          <div className="session-time">{station.elapsed}</div>
                        </div>
                      ) : (
                        <div className="station-footer">
                          <span>{station.canStartRental ? 'Siap untuk rental' : !station.setupConfirmed ? 'Konfigurasi perlu dikonfirmasi' : station.elapsed}</span>
                          {station.canStartRental && (
                            <button
                              type="button"
                              aria-label={`Mulai rental ${station.code}`}
                              onClick={(e) => {
                                e.stopPropagation();
                                handleOpenRental(station.code);
                              }}
                            >
                              <Plus size={17} />
                            </button>
                          )}
                        </div>
                      )}
                    </article>
                  );
                })}
              </div>
              {stations.length === 0 && (
                <div className="empty-activity station-empty">
                  <div className="empty-icon"><MonitorPlay size={19} /></div>
                  <div>
                    <b>Data station belum tersedia</b>
                    <span>Daftar status akan tampil setelah dashboard terhubung ke backend.</span>
                  </div>
                </div>
              )}
            </section>

            <section className="bottom-grid">
              <article className="panel">
                <div className="section-heading">
                  <div>
                    <h2>Sesi aktif</h2>
                    <p>Rental yang sedang berlangsung.</p>
                  </div>
                  <button
                    type="button"
                    className="text-button"
                    onClick={() => setActiveTab('sessions')}
                  >
                    Lihat semua →
                  </button>
                </div>
                {activeRow ? (
                  <div className="active-row">
                    <div className="console-icon">
                      <Gamepad2 size={18} />
                    </div>
                    <div className="active-info">
                      <b>
                        {activeRow.stationCode} <span className="status-chip active"><i /> AKTIF</span>
                      </b>
                      <span>{activeRow.customerName} · Mulai {activeRow.startedAtTime}</span>
                    </div>
                    <div className="elapsed">{activeRow.elapsed}</div>
                    <button
                      type="button"
                      className="stop-button"
                      onClick={() => setStopSessionTarget(activeRow)}
                    >
                      Akhiri
                    </button>
                  </div>
                ) : (
                  <div className="empty-activity">
                    <div className="empty-icon"><Gamepad2 size={19} /></div>
                    <div>
                      <b>Tidak ada sesi rental aktif</b>
                      <span>Sesi rental yang baru dimulai akan muncul di sini.</span>
                    </div>
                  </div>
                )}
              </article>

              <article className="panel">
                <div className="section-heading">
                  <div>
                    <h2>Aktivitas terbaru</h2>
                    <p>Transaksi dan aktivitas kasir.</p>
                  </div>
                  <button
                    type="button"
                    className="text-button"
                    onClick={() => setActiveTab('reports')}
                  >
                    Lihat semua →
                  </button>
                </div>
                <div className="empty-activity">
                  <div className="empty-icon">
                    <CircleDollarSign size={19} />
                  </div>
                  <div>
                    <b>Aktivitas belum ditampilkan</b>
                    <span>Ringkasan aktivitas belum tersedia pada dashboard.</span>
                  </div>
                </div>
              </article>
            </section>
          </>
        )}

        {/* VIEW: BOOKING */}
        {activeTab === 'booking' && (
          <section className="empty-view-card">
            <div className="brand-icon" style={{ width: 48, height: 48 }}>
              <CalendarDays size={26} />
            </div>
            <h2>Jadwal & Reservasi Booking</h2>
            <p>
              Modul reservasi booking station PS3/PS4 Bungus Teluk Kabung.
              Ringkasan booking belum tersedia pada tampilan ini.
            </p>
            <div style={{ marginTop: '14px', padding: '12px 18px', background: '#121f33', border: '1px solid #233e66', borderRadius: '8px', color: '#97bbf5', fontSize: '14px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Info size={15} />
              <span>Fitur pembuatan reservasi dan pembatalan booking dengan audit log belum diimplementasikan.</span>
            </div>
            <button
              type="button"
              className="outline-button"
              style={{ marginTop: '16px' }}
              onClick={() => setActiveTab('dashboard')}
            >
              Kembali ke Dashboard
            </button>
          </section>
        )}

        {/* VIEW: SESI RENTAL */}
        {activeTab === 'sessions' && (
          <section className="empty-view-card">
            <div className="brand-icon" style={{ width: 48, height: 48 }}>
              <Activity size={26} />
            </div>
            <h2>Manajemen Sesi Rental</h2>
            <p>
              Pantau seluruh rental yang sedang aktif secara real-time.
              Detail sesi tersedia pada ringkasan dashboard setelah data backend dimuat.
            </p>
            <div style={{ marginTop: '14px', padding: '12px 18px', background: '#121f33', border: '1px solid #233e66', borderRadius: '8px', color: '#97bbf5', fontSize: '14px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Info size={15} />
              <span>Fitur perpanjangan waktu dan stop sesi rental terikat pada aturan tarif yang belum disepakati.</span>
            </div>
            <button
              type="button"
              className="outline-button"
              style={{ marginTop: '16px' }}
              onClick={() => setActiveTab('dashboard')}
            >
              Kembali ke Dashboard
            </button>
          </section>
        )}

        {/* VIEW: PELANGGAN */}
        {activeTab === 'customers' && (
          <section className="empty-view-card">
            <div className="brand-icon" style={{ width: 48, height: 48 }}>
              <Users size={26} />
            </div>
            <h2>Data Pelanggan & Member</h2>
            <p>
              Direktori pelanggan dan histori sewa rental Bungus Teluk Kabung.
              Data pelanggan belum tersedia pada tampilan ini.
            </p>
            <div style={{ marginTop: '14px', padding: '12px 18px', background: '#121f33', border: '1px solid #233e66', borderRadius: '8px', color: '#97bbf5', fontSize: '14px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Info size={15} />
              <span>Pendaftaran member baru dan riwayat transaksi pelanggan belum diimplementasikan.</span>
            </div>
            <button
              type="button"
              className="outline-button"
              style={{ marginTop: '16px' }}
              onClick={() => setActiveTab('dashboard')}
            >
              Kembali ke Dashboard
            </button>
          </section>
        )}

        {/* VIEW: LAPORAN */}
        {activeTab === 'reports' && (
          <section className="empty-view-card">
            <div className="brand-icon" style={{ width: 48, height: 48 }}>
              <CircleDollarSign size={26} />
            </div>
            <h2>Laporan Operasional & Keuangan</h2>
            <p>
              Total pembayaran tercatat hari ini: <b>{metrics ? formatRupiah(metrics.todayRevenue) : 'menunggu data backend'}</b> (Zona waktu Asia/Jakarta).
            </p>
            <div style={{ marginTop: '14px', padding: '12px 18px', background: '#121f33', border: '1px solid #233e66', borderRadius: '8px', color: '#97bbf5', fontSize: '14px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Info size={15} />
              <span>Filter rentang tanggal kustom dan ekspor laporan keuangan belum diimplementasikan.</span>
            </div>
            <button
              type="button"
              className="outline-button"
              style={{ marginTop: '16px' }}
              onClick={() => setActiveTab('dashboard')}
            >
              Kembali ke Dashboard
            </button>
          </section>
        )}

        {/* VIEW: PENGATURAN */}
        {activeTab === 'settings' && (
          <section className="empty-view-card">
            <div className="brand-icon" style={{ width: 48, height: 48 }}>
              <Settings2 size={26} />
            </div>
            <h2>Pengaturan Sistem & Tarif</h2>
            <p>
              Konfigurasi tarif rental, paket hemat, dan station rental PS3/PS4.
            </p>
            <div style={{ marginTop: '14px', padding: '12px 18px', background: '#121f33', border: '1px solid #233e66', borderRadius: '8px', color: '#97bbf5', fontSize: '14px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Info size={15} />
              <span>Fitur manajemen akun staf dan penyesuaian aturan pembulatan belum diimplementasikan.</span>
            </div>
            <button
              type="button"
              className="outline-button"
              style={{ marginTop: '16px' }}
              onClick={() => setActiveTab('dashboard')}
            >
              Kembali ke Dashboard
            </button>
          </section>
        )}

        <footer>
          © 2026 AQ GAME REBORN <span>•</span> Bungus Teluk Kabung, Padang
        </footer>
      </main>

      {/* MODAL 1: Detail Station Card */}
      {selectedStation && (
        <div className="modal-backdrop" onClick={() => setSelectedStation(null)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>
                <Gamepad2 size={20} color="#78aaff" /> Station {selectedStation.code}
              </h3>
              <button
                type="button"
                className="modal-close"
                onClick={() => setSelectedStation(null)}
                aria-label="Tutup detail station"
              >
                <X size={18} />
              </button>
            </div>
            <div className="modal-body">
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                <span style={{ fontSize: 13, color: '#e8edf7' }}>{selectedStation.type}</span>
                <span className={`status-chip ${selectedStation.className}`}>
                  <i /> {selectedStation.status}
                </span>
              </div>

              <div className="modal-info-box">
                <div className="modal-info-row">
                  <span>Kode Unit:</span>
                  <b>{selectedStation.code}</b>
                </div>
                <div className="modal-info-row">
                  <span>Generasi Konsol:</span>
                  <b>{selectedStation.consoleType === 'PS4' ? 'PlayStation 4' : 'PlayStation 3'}</b>
                </div>
                <div className="modal-info-row">
                  <span>Status Operasional:</span>
                  <b style={{ textTransform: 'capitalize' }}>{selectedStation.status}</b>
                </div>
                <div className="modal-info-row">
                  <span>Kesiapan Konfigurasi:</span>
                  <b>{selectedStation.setupConfirmed ? 'Terkonfirmasi' : 'Belum dikonfirmasi'}</b>
                </div>
                {selectedStation.currentBookingNumber && (
                  <div className="modal-info-row">
                    <span>Nomor Booking:</span>
                    <b>{selectedStation.currentBookingNumber}</b>
                  </div>
                )}
                {selectedStation.customer && (
                  <div className="modal-info-row">
                    <span>{selectedStation.status === 'Aktif' ? 'Pelanggan Aktif:' : 'Keterangan:'}</span>
                    <b>{selectedStation.customer}</b>
                  </div>
                )}
                {selectedStation.elapsed && (
                  <div className="modal-info-row">
                    <span>{selectedStation.status === 'Aktif' ? 'Durasi Sesi:' : 'Waktu:'}</span>
                    <b style={{ color: '#bca1ff' }}>{selectedStation.elapsed}</b>
                  </div>
                )}
              </div>

              <p style={{ margin: '8px 0 0', fontSize: 14, lineHeight: 1.5, color: '#a5b4ca' }}>
                {selectedStation.canStartRental && 'Stasiun ini siap digunakan untuk rental pelanggan walk-in atau pemesanan booking.'}
                {selectedStation.status === 'Aktif' && 'Sesi rental sedang berlangsung. Waktu berjalan dipantau langsung dari clock server UTC.'}
                {selectedStation.status === 'Dipesan' && 'Stasiun memiliki reservasi terjadwal untuk hari ini.'}
                {selectedStation.status === 'Maintenance' && 'Stasiun sedang dalam perbaikan dan tidak dapat menerima rental atau booking.'}
                {!selectedStation.setupConfirmed && 'Konfigurasi unit belum dikonfirmasi; sesi atau booking yang sudah ada tetap ditampilkan, tetapi rental baru belum dapat dimulai.'}
              </p>
            </div>
            <div className="modal-footer">
              <button
                type="button"
                className="outline-button"
                onClick={() => setSelectedStation(null)}
              >
                Tutup
              </button>
              {selectedStation.canStartRental && (
                <button
                  type="button"
                  className="primary-button"
                  onClick={() => {
                    const code = selectedStation.code;
                    setSelectedStation(null);
                    handleOpenRental(code);
                  }}
                >
                  <Plus size={15} /> Mulai Rental Unit Ini
                </button>
              )}
              {selectedStation.status === 'Aktif' && (
                <button
                  type="button"
                  className="stop-button"
                  onClick={() => {
                    setSelectedStation(null);
                    const currentSession = data?.activeRows.find((row) => row.id === selectedStation.currentSessionId);
                    if (currentSession) setStopSessionTarget(currentSession);
                    else showToast('Sesi ini belum dapat diakhiri: fitur penagihan billing penuh belum diimplementasikan.', 'Konfirmasi', 'warning');
                  }}
                >
                  Akhiri Sesi
                </button>
              )}
              {selectedStation.status === 'Maintenance' && (
                <button
                  type="button"
                  className="outline-button"
                  onClick={() => {
                    setSelectedStation(null);
                    showToast(`Selesai perbaikan untuk ${selectedStation.code}: fitur toggle maintenance via UI kasir belum diimplementasikan.`, 'Maintenance');
                  }}
                >
                  <Wrench size={14} /> Selesai Perbaikan
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* MODAL 2: Mulai Rental Baru */}
      {isRentalModalOpen && (
        <div className="modal-backdrop" onClick={() => !rentalSubmitting && setIsRentalModalOpen(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>
                <Plus size={19} color="#4388f4" /> Mulai Rental Baru (Walk-in)
              </h3>
              <button
                type="button"
                className="modal-close"
                onClick={() => !rentalSubmitting && setIsRentalModalOpen(false)}
                aria-label="Tutup form rental"
                disabled={rentalSubmitting}
              >
                <X size={18} />
              </button>
            </div>
            <div className="modal-body">
              <div className="modal-info-box" style={{ marginBottom: 12 }}>
                <div className="modal-info-row">
                  <span>Unit Stasiun:</span>
                  <b style={{ color: '#74a6ff' }}>{rentalModalStation}</b>
                </div>
              </div>

              {/* Customer Name */}
              <div style={{ marginBottom: 10 }}>
                <label style={{ display: 'block', fontSize: 11, color: '#8293ad', marginBottom: 4 }}>Nama Pelanggan</label>
                <input
                  id="rental-customer-name"
                  type="text"
                  value={rentalCustomerName}
                  onChange={(e) => setRentalCustomerName(e.target.value)}
                  placeholder="Pelanggan Walk-in"
                  maxLength={100}
                  disabled={rentalSubmitting}
                  style={{
                    width: '100%', boxSizing: 'border-box', background: '#0d1829', border: '1px solid #243858',
                    borderRadius: 6, color: '#e1e9f6', padding: '8px 10px', fontSize: 13, outline: 'none',
                  }}
                />
              </div>

              {/* Customer Phone */}
              <div style={{ marginBottom: 10 }}>
                <label style={{ display: 'block', fontSize: 11, color: '#8293ad', marginBottom: 4 }}>No. HP (opsional)</label>
                <input
                  id="rental-customer-phone"
                  type="tel"
                  value={rentalCustomerPhone}
                  onChange={(e) => setRentalCustomerPhone(e.target.value)}
                  placeholder="08xxxxxxxxxx"
                  maxLength={20}
                  disabled={rentalSubmitting}
                  style={{
                    width: '100%', boxSizing: 'border-box', background: '#0d1829', border: '1px solid #243858',
                    borderRadius: 6, color: '#e1e9f6', padding: '8px 10px', fontSize: 13, outline: 'none',
                  }}
                />
              </div>

              {/* Rate Selection */}
              <div style={{ marginBottom: 12 }}>
                <label style={{ display: 'block', fontSize: 11, color: '#8293ad', marginBottom: 4 }}>Paket Tarif</label>
                {availableRates.length > 0 ? (
                  <>
                    <select
                      id="rental-rate-select"
                      value={rentalRateKey}
                      onChange={(e) => setRentalRateKey(e.target.value)}
                      disabled={rentalSubmitting}
                      style={{
                        width: '100%', boxSizing: 'border-box', background: '#0d1829', border: '1px solid #243858',
                        borderRadius: 6, color: '#e1e9f6', padding: '10px 12px', fontSize: 15, outline: 'none',
                      }}
                    >
                      <option value="">
                        {rentalModalStation?.startsWith('BOX-') ? '— Pilih Paket PS Box —' : '— Pilih Tarif Konsol —'}
                      </option>
                      {availableRates
                        .map((r) => (
                          <option key={`${r.key}-v${r.version}`} value={r.key}>
                            {r.name} — Rp {r.amount.toLocaleString('id-ID')}
                            {r.billingMode === 'PACKAGE' && r.durationMinutes
                              ? ` · ${r.durationMinutes / 60} jam`
                              : '/jam'}
                          </option>
                        ))
                      }
                    </select>
                    <p className="rate-picker-note">
                      Hanya tarif per jam untuk jenis konsol ini yang dapat dipilih. Paket PS Box tidak diterapkan ke konsol biasa.
                    </p>
                  </>
                ) : (
                  <div className="rate-picker-note">
                    {rentalModalStation?.startsWith('BOX-')
                      ? 'Belum ada paket PS Box aktif yang sesuai. Tarif konsol biasa tidak dapat digunakan.'
                      : 'Belum ada tarif konsol yang cocok dan aktif. Sesi tidak dapat dimulai dengan tarif acuan saja.'}
                  </div>
                )}
              </div>

              {rentalError && (
                <div style={{ padding: '8px 12px', background: '#301820', border: '1px solid #6b2839', borderRadius: 6, color: '#ffb3c0', fontSize: 12, display: 'flex', gap: 8, alignItems: 'center' }}>
                  <AlertCircle size={14} /> {rentalError}
                </div>
              )}
            </div>
            <div className="modal-footer">
              <button
                type="button"
                className="outline-button"
                onClick={() => setIsRentalModalOpen(false)}
                disabled={rentalSubmitting}
              >
                Batal
              </button>
              <button
                id="btn-confirm-rental"
                type="button"
                className="primary-button"
                onClick={handleConfirmRental}
                disabled={rentalSubmitting}
                style={{ opacity: rentalSubmitting ? 0.7 : 1 }}
              >
                {rentalSubmitting ? (
                  <><RefreshCw size={14} style={{ animation: 'spin 1s linear infinite' }} /> Memulai...</>
                ) : (
                  <><Plus size={15} /> Konfirmasi Mulai Rental</>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 3: Kelola Stasiun */}
      {isManageModalOpen && (
        <div className="modal-backdrop" onClick={() => setIsManageModalOpen(false)}>
          <div className="modal-card" style={{ maxWidth: 540 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>
                <MonitorPlay size={19} color="#78aaff" /> Kelola Seluruh Stasiun
              </h3>
              <button
                type="button"
                className="modal-close"
                onClick={() => setIsManageModalOpen(false)}
                aria-label="Tutup kelola stasiun"
              >
                <X size={18} />
              </button>
            </div>
            <div className="modal-body">
              <p style={{ margin: '0 0 14px', color: '#97a9c3' }}>
                Daftar konsol terdaftar pada database AQ Game Reborn:
              </p>
              <div style={{ display: 'grid', gap: 8 }}>
                {stations.map((s) => (
                  <div
                    key={s.code}
                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 12px', background: '#090f1a', border: '1px solid #1c2738', borderRadius: 8 }}
                  >
                    <div>
                      <b style={{ color: '#e1e9f6', fontSize: 12 }}>{s.code}</b>
                      <span style={{ display: 'block', fontSize: 10, color: '#74839a' }}>{s.type}</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span className={`status-chip ${s.className}`}>
                        <i /> {s.status}
                      </span>
                      <button
                        type="button"
                        className="outline-button"
                        style={{ padding: '4px 8px', fontSize: 10 }}
                        onClick={() => {
                          setIsManageModalOpen(false);
                          setSelectedStation(s);
                        }}
                      >
                        Detail
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="modal-footer">
              <button
                type="button"
                className="outline-button"
                onClick={() => setIsManageModalOpen(false)}
              >
                Tutup
              </button>
              <button
                type="button"
                className="primary-button"
                onClick={() => {
                  setIsManageModalOpen(false);
                  showToast('Form pendaftaran stasiun konsol baru belum diimplementasikan.', 'Info');
                }}
              >
                + Tambah Stasiun Baru
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 4: Konfirmasi Pengakhiran Sesi */}
      {stopSessionTarget && (
        <div className="modal-backdrop" onClick={() => { if (!stopSubmitting && !stopResult) { setStopSessionTarget(null); setStopError(null); } }}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 style={{ color: stopResult ? '#4ade80' : '#f08c99' }}>
                {stopResult
                  ? <><CheckCircle2 size={19} color="#4ade80" /> Sesi Selesai — Invoice Tersedia</>
                  : <><AlertCircle size={19} color="#f08c99" /> Konfirmasi Akhiri Sesi Rental</>
                }
              </h3>
              <button
                type="button"
                className="modal-close"
                onClick={() => { setStopSessionTarget(null); setStopResult(null); setStopError(null); }}
                aria-label="Tutup dialog konfirmasi"
                disabled={stopSubmitting}
              >
                <X size={18} />
              </button>
            </div>
            <div className="modal-body">
              {!stopResult ? (
                <>
                  <p style={{ margin: '0 0 12px', color: '#cad3e0' }}>
                    Apakah Anda yakin ingin mengakhiri sesi rental untuk unit berikut?
                  </p>
                  <div className="modal-info-box">
                    <div className="modal-info-row">
                      <span>Stasiun:</span>
                      <b style={{ color: '#b89aff' }}>{stopSessionTarget.stationCode}</b>
                    </div>
                    <div className="modal-info-row">
                      <span>Pelanggan:</span>
                      <b>{stopSessionTarget.customerName}</b>
                    </div>
                    <div className="modal-info-row">
                      <span>Waktu Mulai:</span>
                      <b>{stopSessionTarget.startedAtTime} WIB</b>
                    </div>
                    <div className="modal-info-row">
                      <span>Durasi Berjalan:</span>
                      <b style={{ color: '#bca1ff' }}>{stopSessionTarget.elapsed}</b>
                    </div>
                  </div>
                  {stopError && (
                    <div style={{ marginTop: 10, padding: '8px 12px', background: '#301820', border: '1px solid #6b2839', borderRadius: 6, color: '#ffb3c0', fontSize: 12, display: 'flex', gap: 8, alignItems: 'center' }}>
                      <AlertCircle size={14} /> {stopError}
                    </div>
                  )}
                </>
              ) : (
                <>
                  <p style={{ margin: '0 0 12px', color: '#cad3e0', fontSize: 13 }}>
                    Sesi rental telah diakhiri. Berikut ringkasan tagihan:
                  </p>
                  <div className="modal-info-box">
                    <div className="modal-info-row">
                      <span>No. Invoice:</span>
                      <b style={{ color: '#74a6ff', fontSize: 11 }}>{stopResult.invoice.number}</b>
                    </div>
                    <div className="modal-info-row">
                      <span>Stasiun:</span>
                      <b>{stopResult.station.code}</b>
                    </div>
                    {stopResult.customer && (
                      <div className="modal-info-row">
                        <span>Pelanggan:</span>
                        <b>{stopResult.customer.name}</b>
                      </div>
                    )}
                    <div className="modal-info-row">
                      <span>Durasi Tertagih:</span>
                      <b>{stopResult.billing.billedDurationMinutes} menit</b>
                    </div>
                    <div className="modal-info-row">
                      <span>Subtotal:</span>
                      <b>Rp {stopResult.invoice.subtotal.toLocaleString('id-ID')}</b>
                    </div>
                    {stopResult.invoice.discount > 0 && (
                      <div className="modal-info-row">
                        <span>Diskon:</span>
                        <b style={{ color: '#4ade80' }}>- Rp {stopResult.invoice.discount.toLocaleString('id-ID')}</b>
                      </div>
                    )}
                    <div className="modal-info-row" style={{ borderTop: '1px solid #1c2e4a', paddingTop: 8, marginTop: 4 }}>
                      <span style={{ fontWeight: 600, color: '#e1e9f6' }}>Total Tagihan:</span>
                      <b style={{ color: '#60a5fa', fontSize: 16 }}>Rp {stopResult.invoice.total.toLocaleString('id-ID')}</b>
                    </div>
                  </div>
                  <div style={{ marginTop: 10, padding: '8px 12px', background: '#0d1f10', border: '1px solid #1a4a1c', borderRadius: 6, color: '#86efac', fontSize: 11, display: 'flex', gap: 8, alignItems: 'center' }}>
                    <Info size={13} /> Invoice status: {stopResult.invoice.status} — Terima pembayaran tunai atau QRIS manual.
                  </div>
                  <p style={{ margin: '6px 0 0', fontSize: 10, color: '#5d7a9a' }}>{stopResult.billing.breakdown}</p>
                </>
              )}
            </div>
            <div className="modal-footer">
              {!stopResult ? (
                <>
                  <button
                    type="button"
                    className="outline-button"
                    onClick={() => { setStopSessionTarget(null); setStopError(null); }}
                    disabled={stopSubmitting}
                  >
                    Batal
                  </button>
                  <button
                    id="btn-confirm-stop"
                    type="button"
                    className="stop-button"
                    style={{ padding: '8px 14px', opacity: stopSubmitting ? 0.7 : 1 }}
                    onClick={handleConfirmStop}
                    disabled={stopSubmitting}
                  >
                    {stopSubmitting ? (
                      <><RefreshCw size={14} style={{ animation: 'spin 1s linear infinite' }} /> Menghitung...</>
                    ) : (
                      'Ya, Akhiri Sesi'
                    )}
                  </button>
                </>
              ) : (
                <button
                  id="btn-close-invoice"
                  type="button"
                  className="primary-button"
                  onClick={() => { setStopSessionTarget(null); setStopResult(null); setStopError(null); showToast(`Invoice ${stopResult.invoice.number} siap. Total: Rp ${stopResult.invoice.total.toLocaleString('id-ID')}.`, 'Pembayaran'); }}
                >
                  <CheckCircle2 size={15} /> Selesai
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* FLOATING TOAST NOTIFICATION */}
      {toast && (
        <div className={`toast-banner ${toast.type === 'warning' ? 'warning' : ''}`} role="alert">
          {toast.type === 'warning' ? <AlertCircle size={18} color="#f59e0b" /> : <CheckCircle2 size={18} color="#60a5fa" />}
          <div>
            <b style={{ display: 'block', fontSize: 11, marginBottom: 2 }}>{toast.title}</b>
            <span>{toast.message}</span>
          </div>
          <button
            type="button"
            onClick={() => setToast(null)}
            aria-label="Tutup notifikasi"
          >
            <X size={15} />
          </button>
        </div>
      )}
    </div>
  );
}
