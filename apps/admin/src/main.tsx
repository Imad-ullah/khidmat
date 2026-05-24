import React, { useMemo, useState } from 'react';
import ReactDOM from 'react-dom/client';
import axios, { AxiosError } from 'axios';
import { QueryClient, QueryClientProvider, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BarChart, Bar, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import {
  BadgeCheck,
  Ban,
  BookOpenCheck,
  Check,
  ClipboardList,
  FileClock,
  FolderKanban,
  Gauge,
  LogOut,
  RefreshCw,
  Search,
  Shield,
  Users,
} from 'lucide-react';
import './index.css';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:4000/api/v1';
const tokenKey = 'khidmat_admin_token';

type ApiResponse<T> = { success: boolean; message: string; data: T; error: { code: string; details?: unknown } | null };
type User = { id: string; phone: string; email: string | null; role: string; status: string; name: string | null; city: string | null; createdAt: string };
type Booking = { id: string; bookingType: string; status: string; categoryName: string; customerPhone: string; providerPhone: string | null; totalAmount: number | null; createdAt: string };
type Provider = { id: string; userId: string; displayName: string; city: string; verificationStatus: string; rejectionReason: string | null; services: Array<{ categoryName: string }> };
type Dispute = { id: string; bookingId: string; customerId: string; providerId: string | null; status: string; reason: string; resolution: string | null; createdAt: string };
type Category = { id: string; name: string; slug: string; isActive: boolean; bookingsCount: number; servicesCount: number };
type AuditLog = { id: string; action: string; targetId: string; admin: { phone: string; email: string | null }; createdAt: string };
type Dashboard = {
  kpis: { users: number; providersPending: number; openDisputes: number; activeBookings: number; completedThisMonth: number };
  bookingStatusCounts: Array<{ status: string; count: number }>;
  latestBookings: Booking[];
};

const queryClient = new QueryClient();
const api = axios.create({ baseURL: API_BASE_URL });
api.interceptors.request.use((config) => {
  const token = localStorage.getItem(tokenKey);
  if (token !== null) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

const readError = (error: unknown) => {
  if (error instanceof AxiosError) {
    return error.response?.data?.message ?? error.message;
  }
  return 'Something went wrong';
};

async function getData<T>(url: string): Promise<T> {
  const response = await api.get<ApiResponse<T>>(url);
  return response.data.data;
}

function useAdminQuery<T>(key: unknown[], url: string) {
  return useQuery({ queryKey: key, queryFn: () => getData<T>(url) });
}

function Badge({ children, tone = 'neutral' }: { children: React.ReactNode; tone?: 'neutral' | 'good' | 'warn' | 'bad' }) {
  const tones = {
    neutral: 'bg-slate-100 text-slate-700',
    good: 'bg-emerald-100 text-emerald-800',
    warn: 'bg-amber-100 text-amber-800',
    bad: 'bg-rose-100 text-rose-800',
  };
  return <span className={`inline-flex rounded px-2 py-1 text-xs font-semibold ${tones[tone]}`}>{children}</span>;
}

function ActionButton({ children, onClick, disabled = false }: { children: React.ReactNode; onClick?: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="inline-flex h-9 items-center gap-2 rounded border border-line bg-white px-3 text-sm font-semibold text-ink shadow-sm disabled:opacity-50"
    >
      {children}
    </button>
  );
}

function Panel({ title, icon, children, action }: { title: string; icon: React.ReactNode; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-line bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-line px-4 py-3">
        <h2 className="flex items-center gap-2 text-base font-bold">{icon}{title}</h2>
        {action}
      </div>
      <div className="p-4">{children}</div>
    </section>
  );
}

function DataState({ isLoading, error }: { isLoading: boolean; error: unknown }) {
  if (isLoading) return <div className="py-8 text-sm text-slate-600">Loading...</div>;
  if (error) return <div className="py-8 text-sm text-rose-700">{readError(error)}</div>;
  return null;
}

function Login({ onLogin }: { onLogin: () => void }) {
  const [email, setEmail] = useState('admin@khidmatapp.test');
  const [password, setPassword] = useState('adminpass123');
  const login = useMutation({
    mutationFn: async () => {
      const response = await api.post<ApiResponse<{ user: { role: string }; tokens: { accessToken: string } }>>('/auth/login', { email, password });
      return response.data.data;
    },
    onSuccess: (data) => {
      localStorage.setItem(tokenKey, data.tokens.accessToken);
      onLogin();
    },
  });

  return (
    <main className="grid min-h-screen place-items-center bg-mint px-4">
      <form
        className="w-full max-w-sm rounded-lg border border-line bg-white p-6 shadow-sm"
        onSubmit={(event) => {
          event.preventDefault();
          login.mutate();
        }}
      >
        <div className="mb-6 flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded bg-leaf text-white"><Shield size={20} /></div>
          <div>
            <h1 className="text-xl font-bold">KhidmatApp Admin</h1>
            <p className="text-sm text-slate-600">Operations console</p>
          </div>
        </div>
        <label className="mb-3 block text-sm font-semibold">
          Email
          <input className="mt-1 h-11 w-full rounded border border-line px-3 outline-leaf" value={email} onChange={(event) => setEmail(event.target.value)} />
        </label>
        <label className="mb-4 block text-sm font-semibold">
          Password
          <input className="mt-1 h-11 w-full rounded border border-line px-3 outline-leaf" type="password" value={password} onChange={(event) => setPassword(event.target.value)} />
        </label>
        {login.error ? <p className="mb-3 text-sm text-rose-700">{readError(login.error)}</p> : null}
        <button className="inline-flex h-11 w-full items-center justify-center gap-2 rounded bg-leaf font-bold text-white" disabled={login.isPending}>
          <Shield size={18} /> Sign in
        </button>
      </form>
    </main>
  );
}

const navItems = [
  ['Dashboard', Gauge],
  ['Providers', BadgeCheck],
  ['Bookings', BookOpenCheck],
  ['Disputes', ClipboardList],
  ['Users', Users],
  ['Categories', FolderKanban],
  ['Audit Logs', FileClock],
] as const;

function Layout({ active, setActive, children, onLogout }: { active: string; setActive: (value: string) => void; children: React.ReactNode; onLogout: () => void }) {
  return (
    <div className="min-h-screen bg-[#f5faf8]">
      <aside className="fixed bottom-0 left-0 top-0 hidden w-64 border-r border-line bg-white p-4 lg:block">
        <div className="mb-6 flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded bg-leaf text-white"><Shield size={20} /></div>
          <div>
            <div className="font-bold">KhidmatApp</div>
            <div className="text-xs text-slate-500">Admin Panel</div>
          </div>
        </div>
        <nav className="space-y-1">
          {navItems.map(([label, Icon]) => (
            <button key={label} className={`flex h-10 w-full items-center gap-3 rounded px-3 text-sm font-semibold ${active === label ? 'bg-mint text-leaf' : 'text-slate-700'}`} onClick={() => setActive(label)}>
              <Icon size={18} /> {label}
            </button>
          ))}
        </nav>
      </aside>
      <header className="sticky top-0 z-10 flex items-center justify-between border-b border-line bg-white px-4 py-3 lg:ml-64">
        <select className="h-10 rounded border border-line bg-white px-3 lg:hidden" value={active} onChange={(event) => setActive(event.target.value)}>
          {navItems.map(([label]) => <option key={label}>{label}</option>)}
        </select>
        <div className="hidden font-bold lg:block">{active}</div>
        <button className="inline-flex h-10 items-center gap-2 rounded border border-line px-3 text-sm font-semibold" onClick={onLogout}>
          <LogOut size={16} /> Logout
        </button>
      </header>
      <main className="p-4 lg:ml-64 lg:p-6">{children}</main>
    </div>
  );
}

function DashboardPage() {
  const query = useAdminQuery<Dashboard>(['dashboard'], '/admin/dashboard');
  if (query.isLoading || query.error) return <DataState isLoading={query.isLoading} error={query.error} />;
  const data = query.data!;
  const cards = [
    ['Users', data.kpis.users, Users],
    ['Pending Providers', data.kpis.providersPending, BadgeCheck],
    ['Open Disputes', data.kpis.openDisputes, ClipboardList],
    ['Active Bookings', data.kpis.activeBookings, BookOpenCheck],
    ['Completed This Month', data.kpis.completedThisMonth, Check],
  ] as const;
  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-5">
        {cards.map(([label, value, Icon]) => (
          <div key={label} className="rounded-lg border border-line bg-white p-4 shadow-sm">
            <Icon className="mb-3 text-leaf" size={20} />
            <div className="text-2xl font-bold">{value}</div>
            <div className="text-sm text-slate-600">{label}</div>
          </div>
        ))}
      </div>
      <Panel title="Booking Status" icon={<Gauge size={18} />}>
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data.bookingStatusCounts}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="status" tick={{ fontSize: 11 }} />
              <YAxis allowDecimals={false} />
              <Tooltip />
              <Bar dataKey="count" fill="#087b6f" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Panel>
      <BookingsTable bookings={data.latestBookings} />
    </div>
  );
}

function BookingsTable({ bookings }: { bookings: Booking[] }) {
  return (
    <Panel title="Bookings" icon={<BookOpenCheck size={18} />}>
      <div className="overflow-x-auto">
        <table className="kh-table">
          <thead><tr><th>Booking</th><th>Category</th><th>Customer</th><th>Provider</th><th>Status</th><th>Amount</th></tr></thead>
          <tbody>{bookings.map((booking) => (
            <tr key={booking.id}>
              <td className="font-mono text-xs">{booking.id}</td>
              <td>{booking.categoryName}</td>
              <td>{booking.customerPhone}</td>
              <td>{booking.providerPhone ?? 'Unassigned'}</td>
              <td><Badge tone={booking.status === 'CANCELLED' ? 'bad' : booking.status === 'COMPLETED' || booking.status === 'CLOSED' ? 'good' : 'warn'}>{booking.status}</Badge></td>
              <td>{booking.totalAmount ?? '-'}</td>
            </tr>
          ))}</tbody>
        </table>
      </div>
    </Panel>
  );
}

function ProvidersPage() {
  const pending = useAdminQuery<{ providers: Provider[] }>(['pending-providers'], '/admin/providers/pending');
  const queryClient = useQueryClient();
  const action = useMutation({
    mutationFn: async ({ id, type, reason }: { id: string; type: 'verify' | 'reject'; reason?: string }) => {
      await api.patch(`/admin/providers/${id}/${type}`, type === 'reject' ? { rejectionReason: reason ?? 'Documents require another review.' } : {});
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['pending-providers'] }),
  });
  if (pending.isLoading || pending.error) return <DataState isLoading={pending.isLoading} error={pending.error} />;
  return (
    <Panel title="Provider Management" icon={<BadgeCheck size={18} />}>
      <div className="overflow-x-auto">
        <table className="kh-table">
          <thead><tr><th>Name</th><th>City</th><th>Services</th><th>Status</th><th>Actions</th></tr></thead>
          <tbody>{pending.data!.providers.map((provider) => (
            <tr key={provider.id}>
              <td className="font-semibold">{provider.displayName}</td>
              <td>{provider.city}</td>
              <td>{provider.services.map((service) => service.categoryName).join(', ') || '-'}</td>
              <td><Badge tone="warn">{provider.verificationStatus}</Badge></td>
              <td className="flex gap-2">
                <ActionButton disabled={action.isPending} onClick={() => action.mutate({ id: provider.id, type: 'verify' })}><Check size={16} /> Approve</ActionButton>
                <ActionButton disabled={action.isPending} onClick={() => action.mutate({ id: provider.id, type: 'reject' })}><Ban size={16} /> Reject</ActionButton>
              </td>
            </tr>
          ))}</tbody>
        </table>
      </div>
    </Panel>
  );
}

function BookingsPage() {
  const [status, setStatus] = useState('');
  const query = useAdminQuery<{ bookings: Booking[] }>(['admin-bookings', status], `/admin/bookings${status ? `?status=${status}` : ''}`);
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 rounded-lg border border-line bg-white p-3">
        <Search size={18} />
        <select className="h-10 rounded border border-line px-3" value={status} onChange={(event) => setStatus(event.target.value)}>
          <option value="">All statuses</option>
          {['PENDING_CONFIRMATION', 'CONFIRMED', 'IN_PROGRESS', 'COMPLETED', 'CLOSED', 'CANCELLED', 'EXPIRED'].map((item) => <option key={item}>{item}</option>)}
        </select>
      </div>
      {query.isLoading || query.error ? <DataState isLoading={query.isLoading} error={query.error} /> : <BookingsTable bookings={query.data!.bookings} />}
    </div>
  );
}

function DisputesPage() {
  const query = useAdminQuery<{ disputes: Dispute[] }>(['admin-disputes'], '/admin/disputes');
  const queryClient = useQueryClient();
  const resolve = useMutation({
    mutationFn: async (id: string) => api.patch(`/admin/disputes/${id}/resolve`, { resolution: 'NO_ACTION', resolutionNote: 'Reviewed by admin from web panel.' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin-disputes'] }),
  });
  if (query.isLoading || query.error) return <DataState isLoading={query.isLoading} error={query.error} />;
  return (
    <Panel title="Dispute Management" icon={<ClipboardList size={18} />}>
      <div className="overflow-x-auto">
        <table className="kh-table">
          <thead><tr><th>Booking</th><th>Reason</th><th>Status</th><th>Created</th><th>Actions</th></tr></thead>
          <tbody>{query.data!.disputes.map((dispute) => (
            <tr key={dispute.id}>
              <td className="font-mono text-xs">{dispute.bookingId}</td>
              <td className="max-w-xl">{dispute.reason}</td>
              <td><Badge tone={dispute.status === 'RESOLVED' ? 'good' : 'warn'}>{dispute.status}</Badge></td>
              <td>{new Date(dispute.createdAt).toLocaleString()}</td>
              <td>{dispute.status === 'RESOLVED' ? '-' : <ActionButton disabled={resolve.isPending} onClick={() => resolve.mutate(dispute.id)}><Check size={16} /> Resolve</ActionButton>}</td>
            </tr>
          ))}</tbody>
        </table>
      </div>
    </Panel>
  );
}

function UsersPage() {
  const query = useAdminQuery<{ users: User[] }>(['admin-users'], '/admin/users');
  const queryClient = useQueryClient();
  const statusChange = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => api.patch(`/admin/users/${id}/status`, { status }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin-users'] }),
  });
  if (query.isLoading || query.error) return <DataState isLoading={query.isLoading} error={query.error} />;
  return (
    <Panel title="User Management" icon={<Users size={18} />}>
      <div className="overflow-x-auto">
        <table className="kh-table">
          <thead><tr><th>User</th><th>Contact</th><th>Role</th><th>Status</th><th>City</th><th>Actions</th></tr></thead>
          <tbody>{query.data!.users.map((user) => (
            <tr key={user.id}>
              <td className="font-semibold">{user.name ?? user.id}</td>
              <td>{user.email ?? user.phone}</td>
              <td>{user.role}</td>
              <td><Badge tone={user.status === 'ACTIVE' ? 'good' : user.status === 'SUSPENDED' ? 'bad' : 'warn'}>{user.status}</Badge></td>
              <td>{user.city ?? '-'}</td>
              <td className="flex gap-2">
                <ActionButton disabled={statusChange.isPending} onClick={() => statusChange.mutate({ id: user.id, status: 'ACTIVE' })}><Check size={16} /> Active</ActionButton>
                <ActionButton disabled={statusChange.isPending} onClick={() => statusChange.mutate({ id: user.id, status: 'SUSPENDED' })}><Ban size={16} /> Suspend</ActionButton>
              </td>
            </tr>
          ))}</tbody>
        </table>
      </div>
    </Panel>
  );
}

function CategoriesPage() {
  const [name, setName] = useState('');
  const query = useAdminQuery<{ categories: Category[] }>(['admin-categories'], '/admin/categories');
  const queryClient = useQueryClient();
  const create = useMutation({
    mutationFn: async () => api.post('/admin/categories', { name, slug: name.toLowerCase().trim().replace(/\s+/g, '-') }),
    onSuccess: () => {
      setName('');
      queryClient.invalidateQueries({ queryKey: ['admin-categories'] });
    },
  });
  const toggle = useMutation({
    mutationFn: async (category: Category) => api.patch(`/admin/categories/${category.id}`, { isActive: !category.isActive }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin-categories'] }),
  });
  if (query.isLoading || query.error) return <DataState isLoading={query.isLoading} error={query.error} />;
  return (
    <Panel title="Category Management" icon={<FolderKanban size={18} />} action={
      <form className="flex gap-2" onSubmit={(event) => { event.preventDefault(); create.mutate(); }}>
        <input className="h-9 rounded border border-line px-3 text-sm" placeholder="New category" value={name} onChange={(event) => setName(event.target.value)} />
        <ActionButton disabled={create.isPending || name.trim().length < 2}><Check size={16} /> Add</ActionButton>
      </form>
    }>
      <div className="overflow-x-auto">
        <table className="kh-table">
          <thead><tr><th>Name</th><th>Slug</th><th>Bookings</th><th>Providers</th><th>Status</th><th>Action</th></tr></thead>
          <tbody>{query.data!.categories.map((category) => (
            <tr key={category.id}>
              <td className="font-semibold">{category.name}</td>
              <td>{category.slug}</td>
              <td>{category.bookingsCount}</td>
              <td>{category.servicesCount}</td>
              <td><Badge tone={category.isActive ? 'good' : 'bad'}>{category.isActive ? 'ACTIVE' : 'INACTIVE'}</Badge></td>
              <td><ActionButton disabled={toggle.isPending} onClick={() => toggle.mutate(category)}><RefreshCw size={16} /> Toggle</ActionButton></td>
            </tr>
          ))}</tbody>
        </table>
      </div>
    </Panel>
  );
}

function AuditLogsPage() {
  const query = useAdminQuery<{ auditLogs: AuditLog[] }>(['admin-audit-logs'], '/admin/audit-logs');
  if (query.isLoading || query.error) return <DataState isLoading={query.isLoading} error={query.error} />;
  return (
    <Panel title="Audit Logs" icon={<FileClock size={18} />}>
      <div className="overflow-x-auto">
        <table className="kh-table">
          <thead><tr><th>Action</th><th>Target</th><th>Admin</th><th>Created</th></tr></thead>
          <tbody>{query.data!.auditLogs.map((log) => (
            <tr key={log.id}>
              <td><Badge>{log.action}</Badge></td>
              <td className="font-mono text-xs">{log.targetId}</td>
              <td>{log.admin.email ?? log.admin.phone}</td>
              <td>{new Date(log.createdAt).toLocaleString()}</td>
            </tr>
          ))}</tbody>
        </table>
      </div>
    </Panel>
  );
}

function App() {
  const [authed, setAuthed] = useState(() => localStorage.getItem(tokenKey) !== null);
  const [active, setActive] = useState('Dashboard');
  const page = useMemo(() => {
    if (active === 'Providers') return <ProvidersPage />;
    if (active === 'Bookings') return <BookingsPage />;
    if (active === 'Disputes') return <DisputesPage />;
    if (active === 'Users') return <UsersPage />;
    if (active === 'Categories') return <CategoriesPage />;
    if (active === 'Audit Logs') return <AuditLogsPage />;
    return <DashboardPage />;
  }, [active]);

  if (!authed) return <Login onLogin={() => setAuthed(true)} />;

  return (
    <Layout
      active={active}
      setActive={setActive}
      onLogout={() => {
        localStorage.removeItem(tokenKey);
        queryClient.clear();
        setAuthed(false);
      }}
    >
      {page}
    </Layout>
  );
}

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </React.StrictMode>,
);
