/**
 * Super Admin CRM — trouvé!
 * Accessible via trouvé.fr?crm (role=admin uniquement)
 * 100% données réelles : Supabase + Stripe — zéro mock data.
 */

import { useState, useEffect, useCallback } from 'react'
import {
  LayoutDashboard, Users, CreditCard, Activity, LogOut,
  RefreshCw, X, Ban, ShieldCheck, Clock, TrendingUp,
  AlertCircle, UserCheck, ChevronDown, ChevronUp,
  Phone, Mail, Building2, Search, CheckCircle2, XCircle,
  KeyRound, Eye, History as HistoryIcon, Zap, ArrowUp, ArrowDown,
  Loader2,
} from 'lucide-react'
import { getSupabaseClient } from '@/lib/supabase'
import type { Account } from '@/lib/accountStore'
import trouveLogo from '@/assets/trouve-logo.png'

// ─── Types ────────────────────────────────────────────────────────────────────

type CRMView = 'dashboard' | 'users' | 'finances' | 'logs'

interface Metrics {
  users: { total: number; newThisMonth: number; pendingApprovals: number }
  activity: { searchesThisMonth: number; unlocksThisMonth: number }
  credits: { thisMonth: number; lastMonth: number; byType: { phone: number; email: number } }
  topOrgs: Array<{ organizationId: string; name: string; searchesUsed: number }>
  recentSearches: Array<{ id: string; queryLabel: string; resultCount: number; createdAt: string; userEmail: string }>
}

interface StripeData {
  mrr: { euros: string }
  revenue: { thisMonthEuros: string }
  subscriptions: { active: number; newThisMonth: number; canceledThisMonth: number }
  recentCharges: Array<{ id: string; amountEuros: string; paid: boolean; refunded: boolean; description: string; createdAt: string }>
}

interface CRMUser {
  id: string; email: string; firstName: string; lastName: string
  functionTitle: string | null; role: string; status: string
  quota: number; monthlyUsage: number; createdAt: string; lastLoginAt: string | null
  cguAccepted: boolean
  organization: { siren: string; name: string; active: boolean } | null
}

interface LogEntry {
  id: string; action: string; actorEmail: string
  metadata: Record<string, unknown>; createdAt: string
}

interface UserHistory {
  profile: CRMUser | null
  searches: Array<{ id: string; query_label: string; result_count: number; created_at: string }>
  unlocks: Array<{ id: string; field_type: string; prospect_id: string; created_at: string }>
}

// ─── Utilitaires ──────────────────────────────────────────────────────────────

function fromNow(iso: string | null | undefined): string {
  if (!iso) return '—'
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 60) return `il y a ${m} min`
  const h = Math.floor(m / 60)
  if (h < 24) return `il y a ${h} h`
  const d = Math.floor(h / 24)
  return `il y a ${d} j`
}

function fmt(iso: string | null | undefined): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })
}

async function getToken(): Promise<string> {
  const { data } = await getSupabaseClient().auth.getSession()
  return data.session?.access_token ?? ''
}

async function apiFetch<T>(path: string, token: string): Promise<T> {
  const r = await fetch(path, { headers: { Authorization: `Bearer ${token}` } })
  if (!r.ok) throw new Error(`${r.status} ${r.statusText}`)
  return r.json() as Promise<T>
}

// ─── Composants UI ────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    approved:  'bg-emerald-50 text-emerald-700 border-emerald-200',
    trial:     'bg-amber-50 text-amber-700 border-amber-200',
    pending:   'bg-blue-50 text-blue-700 border-blue-200',
    blocked:   'bg-red-50 text-red-600 border-red-200',
    rejected:  'bg-slate-100 text-slate-500 border-slate-200',
  }
  const labels: Record<string, string> = {
    approved: 'Approuvé', trial: 'Démo', pending: 'En attente',
    blocked: 'Bloqué', rejected: 'Refusé',
  }
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold ${styles[status] ?? styles.rejected}`}>
      {labels[status] ?? status}
    </span>
  )
}

function KpiCard({ label, value, sub, trend, icon: Icon, accent }: {
  label: string; value: string | number; sub?: string
  trend?: 'up' | 'down' | 'flat'; icon: React.ElementType; accent?: string
}) {
  return (
    <div className="rounded-2xl bg-white border border-slate-100 p-5 shadow-sm">
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">{label}</span>
        <div className={`flex h-8 w-8 items-center justify-center rounded-xl ${accent ?? 'bg-slate-100'}`}>
          <Icon size={15} className={accent ? 'text-white' : 'text-slate-500'} />
        </div>
      </div>
      <p className="text-3xl font-extrabold text-slate-900 tabular-nums">{value}</p>
      {sub && (
        <div className="mt-1 flex items-center gap-1">
          {trend === 'up' && <ArrowUp size={12} className="text-emerald-500" />}
          {trend === 'down' && <ArrowDown size={12} className="text-red-400" />}
          <p className="text-xs text-slate-400">{sub}</p>
        </div>
      )}
    </div>
  )
}

function Spinner() {
  return (
    <div className="flex flex-col items-center justify-center py-24 gap-3">
      <Loader2 size={28} className="animate-spin text-blue-500" />
      <p className="text-sm text-slate-400">Chargement des données…</p>
    </div>
  )
}

function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-24 gap-4">
      <AlertCircle size={32} className="text-red-400" />
      <p className="text-sm text-red-500">{message}</p>
      <button onClick={onRetry} className="flex items-center gap-2 rounded-lg bg-slate-100 px-4 py-2 text-sm font-medium hover:bg-slate-200">
        <RefreshCw size={13} /> Réessayer
      </button>
    </div>
  )
}

// ─── Vue Dashboard ────────────────────────────────────────────────────────────

function DashboardView({ token }: { token: string }) {
  const [metrics, setMetrics] = useState<Metrics | null>(null)
  const [stripe, setStripe]   = useState<StripeData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const [m, s] = await Promise.all([
        apiFetch<Metrics>('/api/admin/metrics', token),
        apiFetch<StripeData>('/api/admin/stripe', token),
      ])
      setMetrics(m); setStripe(s)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Erreur inconnue')
    } finally {
      setLoading(false)
    }
  }, [token])

  useEffect(() => { void load() }, [load])

  if (loading) return <Spinner />
  if (error) return <ErrorState message={error} onRetry={load} />
  if (!metrics || !stripe) return null

  const creditTrend = metrics.credits.lastMonth > 0
    ? metrics.credits.thisMonth > metrics.credits.lastMonth ? 'up' : 'down'
    : 'flat'

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900">Vue d'ensemble</h1>
          <p className="text-sm text-slate-400 mt-0.5">Données en temps réel — {new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}</p>
        </div>
        <button onClick={load} className="flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50">
          <RefreshCw size={13} /> Actualiser
        </button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        <KpiCard label="MRR" value={stripe.mrr.euros} icon={CreditCard} accent="bg-emerald-500" trend="up" sub="Abonnements actifs" />
        <KpiCard label="CA ce mois" value={stripe.revenue.thisMonthEuros} icon={TrendingUp} accent="bg-blue-500" />
        <KpiCard label="Utilisateurs" value={metrics.users.total} icon={Users} accent="bg-violet-500"
          sub={`+${metrics.users.newThisMonth} ce mois`} trend={metrics.users.newThisMonth > 0 ? 'up' : 'flat'} />
        <KpiCard label="En attente" value={metrics.users.pendingApprovals} icon={Clock}
          accent={metrics.users.pendingApprovals > 0 ? 'bg-amber-500' : 'bg-slate-300'}
          sub="Comptes à valider" />
      </div>

      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        <KpiCard label="Recherches / mois" value={metrics.activity.searchesThisMonth.toLocaleString('fr-FR')} icon={Search} />
        <KpiCard label="Déblocages / mois" value={metrics.activity.unlocksThisMonth} icon={KeyRound}
          sub={`📞 ${metrics.credits.byType.phone} tél · ✉️ ${metrics.credits.byType.email} email`} />
        <KpiCard label="Abonnements actifs" value={stripe.subscriptions.active} icon={CheckCircle2}
          sub={`+${stripe.subscriptions.newThisMonth} ce mois`} trend={stripe.subscriptions.newThisMonth > 0 ? 'up' : 'flat'} />
        <KpiCard label="Crédits débloqués" value={metrics.credits.thisMonth} icon={Zap}
          sub={`vs ${metrics.credits.lastMonth} le mois dernier`} trend={creditTrend} />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {/* Derniers paiements Stripe */}
        <div className="rounded-2xl bg-white border border-slate-100 shadow-sm">
          <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
            <h2 className="font-bold text-slate-800">Derniers paiements Stripe</h2>
            <CreditCard size={15} className="text-slate-400" />
          </div>
          <div className="divide-y divide-slate-50">
            {stripe.recentCharges.slice(0, 8).map(c => (
              <div key={c.id} className="flex items-center justify-between px-6 py-3">
                <div>
                  <p className="text-sm font-semibold text-slate-800">{c.amountEuros}</p>
                  <p className="text-[11px] text-slate-400">{c.description || 'Paiement'} · {fromNow(c.createdAt)}</p>
                </div>
                <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                  c.refunded ? 'bg-orange-50 text-orange-600' :
                  c.paid ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-500'
                }`}>
                  {c.refunded ? 'Remboursé' : c.paid ? 'Payé' : 'Échoué'}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Dernières recherches plateforme */}
        <div className="rounded-2xl bg-white border border-slate-100 shadow-sm">
          <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
            <h2 className="font-bold text-slate-800">Activité récente</h2>
            <Activity size={15} className="text-slate-400" />
          </div>
          <div className="divide-y divide-slate-50">
            {metrics.recentSearches.slice(0, 8).map(s => (
              <div key={s.id} className="flex items-center justify-between px-6 py-3">
                <div>
                  <p className="text-sm font-semibold text-slate-800 truncate max-w-[200px]">{s.queryLabel || '—'}</p>
                  <p className="text-[11px] text-slate-400">{s.userEmail} · {fromNow(s.createdAt)}</p>
                </div>
                <span className="text-[11px] text-slate-400">{s.resultCount} rés.</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Top orgs */}
      {metrics.topOrgs.length > 0 && (
        <div className="rounded-2xl bg-white border border-slate-100 shadow-sm">
          <div className="px-6 py-4 border-b border-slate-100">
            <h2 className="font-bold text-slate-800">Top organisations ce mois</h2>
          </div>
          <div className="p-4 grid grid-cols-2 md:grid-cols-5 gap-3">
            {metrics.topOrgs.map((o, i) => (
              <div key={o.organizationId} className="rounded-xl bg-slate-50 border border-slate-100 p-3 text-center">
                <p className="text-[10px] text-slate-400 mb-1">#{i + 1}</p>
                <p className="text-sm font-bold text-slate-800 truncate">{o.name}</p>
                <p className="text-lg font-extrabold text-blue-600 mt-1">{o.searchesUsed}</p>
                <p className="text-[10px] text-slate-400">recherches</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Vue Utilisateurs ─────────────────────────────────────────────────────────

function UsersView({ token }: { token: string }) {
  const [users, setUsers]       = useState<CRMUser[]>([])
  const [total, setTotal]       = useState(0)
  const [page, setPage]         = useState(1)
  const [filter, setFilter]     = useState('all')
  const [search, setSearch]     = useState('')
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState<string | null>(null)
  const [busy, setBusy]         = useState<string | null>(null)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [history, setHistory]   = useState<Record<string, UserHistory>>({})
  const [histLoading, setHistLoading] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const p = new URLSearchParams({ page: String(page), limit: '50' })
      if (filter !== 'all') p.set('status', filter)
      if (search) p.set('search', search)
      const d = await apiFetch<{ users: CRMUser[]; total: number }>(`/api/admin/users?${p}`, token)
      setUsers(d.users); setTotal(d.total)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Erreur')
    } finally {
      setLoading(false)
    }
  }, [token, page, filter, search])

  useEffect(() => { void load() }, [load])

  const action = async (userId: string, act: string, value?: string | number) => {
    setBusy(userId)
    try {
      await fetch('/api/admin/users', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, action: act, value }),
      })
      await load()
    } finally {
      setBusy(null)
    }
  }

  const openHistory = async (userId: string) => {
    if (expanded === userId) { setExpanded(null); return }
    setExpanded(userId)
    if (history[userId]) return
    setHistLoading(userId)
    try {
      const h = await apiFetch<UserHistory>(`/api/admin/user-history?userId=${userId}`, token)
      setHistory(prev => ({ ...prev, [userId]: h }))
    } finally {
      setHistLoading(null)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900">Gestion des clients</h1>
          <p className="text-sm text-slate-400">{total} compte{total > 1 ? 's' : ''} au total</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input value={search} onChange={e => { setSearch(e.target.value); setPage(1) }}
              placeholder="Email, nom…"
              className="rounded-xl border border-slate-200 pl-9 pr-4 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500 w-52"
            />
          </div>
          <button onClick={load} className="flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50">
            <RefreshCw size={13} />
          </button>
        </div>
      </div>

      {/* Filtres */}
      <div className="flex gap-2 flex-wrap">
        {[['all','Tous'], ['pending','En attente'], ['trial','Démo'], ['approved','Approuvés'], ['blocked','Bloqués'], ['rejected','Refusés']].map(([k, l]) => (
          <button key={k} onClick={() => { setFilter(k); setPage(1) }}
            className={`rounded-full px-3 py-1 text-xs font-semibold border transition ${filter === k ? 'bg-slate-900 text-white border-slate-900' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}>
            {l}
          </button>
        ))}
      </div>

      {loading ? <Spinner /> : error ? <ErrorState message={error} onRetry={load} /> : (
        <div className="rounded-2xl bg-white border border-slate-100 shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50">
                {['Utilisateur', 'Organisation', 'Statut', 'Usage', 'Inscrit', 'Actions'].map(h => (
                  <th key={h} className="px-5 py-3 text-left text-[11px] font-bold uppercase tracking-wide text-slate-500">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {users.map(u => (
                <>
                  <tr key={u.id} className={`hover:bg-slate-50 transition ${expanded === u.id ? 'bg-blue-50/30' : ''}`}>
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-3">
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-100 text-xs font-bold text-blue-700">
                          {(u.firstName?.[0] ?? u.email[0]).toUpperCase()}
                        </div>
                        <div>
                          <p className="font-semibold text-slate-800">{u.firstName} {u.lastName}</p>
                          <p className="text-[11px] text-slate-400">{u.email}</p>
                          {u.functionTitle && <p className="text-[11px] text-slate-400">{u.functionTitle}</p>}
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-4">
                      {u.organization ? (
                        <div>
                          <p className="font-medium text-slate-700">{u.organization.name}</p>
                          <p className="text-[11px] text-slate-400">{u.organization.siren}</p>
                          {!u.organization.active && <span className="text-[10px] text-red-400">Radiée</span>}
                        </div>
                      ) : <span className="text-slate-300">—</span>}
                    </td>
                    <td className="px-5 py-4">
                      <StatusBadge status={u.status} />
                      {!u.cguAccepted && <p className="mt-1 text-[10px] text-amber-500">CGU non signées</p>}
                    </td>
                    <td className="px-5 py-4">
                      <div className="w-28">
                        <div className="mb-1 flex justify-between text-[11px]">
                          <span className="font-semibold text-slate-700">{u.monthlyUsage}</span>
                          <span className="text-slate-400">/{u.quota}</span>
                        </div>
                        <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                          <div className="h-1.5 rounded-full bg-blue-500 transition-all"
                            style={{ width: `${Math.min(100, Math.round(u.monthlyUsage / (u.quota || 1) * 100))}%` }} />
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-4">
                      <p className="text-[12px] text-slate-600">{fmt(u.createdAt)}</p>
                      <p className="text-[11px] text-slate-400">{fromNow(u.lastLoginAt)}</p>
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-1.5">
                        <button onClick={() => openHistory(u.id)}
                          className="flex items-center gap-1 rounded-lg bg-slate-100 px-2.5 py-1.5 text-[11px] font-medium text-slate-600 hover:bg-slate-200"
                          title="Voir l'historique">
                          <Eye size={12} />
                          {expanded === u.id ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
                        </button>
                        {u.status === 'pending' && (
                          <button onClick={() => action(u.id, 'approve')} disabled={busy === u.id}
                            className="rounded-lg bg-emerald-50 px-2.5 py-1.5 text-[11px] font-semibold text-emerald-700 hover:bg-emerald-100">
                            {busy === u.id ? <Loader2 size={11} className="animate-spin" /> : <UserCheck size={12} />}
                          </button>
                        )}
                        {u.status !== 'blocked' && (
                          <button onClick={() => action(u.id, 'block')} disabled={busy === u.id}
                            className="rounded-lg bg-red-50 px-2.5 py-1.5 text-[11px] font-semibold text-red-600 hover:bg-red-100"
                            title="Bloquer">
                            <Ban size={12} />
                          </button>
                        )}
                        {u.status === 'blocked' && (
                          <button onClick={() => action(u.id, 'approve')} disabled={busy === u.id}
                            className="rounded-lg bg-blue-50 px-2.5 py-1.5 text-[11px] font-semibold text-blue-600 hover:bg-blue-100"
                            title="Réactiver">
                            <ShieldCheck size={12} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>

                  {/* Fiche détail client */}
                  {expanded === u.id && (
                    <tr key={`${u.id}-detail`}>
                      <td colSpan={6} className="bg-blue-50/30 px-6 py-4 border-b border-blue-100">
                        {histLoading === u.id ? (
                          <div className="flex items-center gap-2 text-sm text-slate-400 py-4">
                            <Loader2 size={14} className="animate-spin" /> Chargement…
                          </div>
                        ) : history[u.id] ? (
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            {/* Dernières recherches */}
                            <div>
                              <p className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-500">
                                <Search size={12} /> Historique de recherche ({history[u.id].searches.length})
                              </p>
                              <div className="space-y-1.5 max-h-48 overflow-y-auto">
                                {history[u.id].searches.length === 0 ? (
                                  <p className="text-xs text-slate-400">Aucune recherche</p>
                                ) : history[u.id].searches.map(s => (
                                  <div key={s.id} className="flex items-center justify-between rounded-lg bg-white border border-slate-100 px-3 py-2">
                                    <p className="text-xs font-medium text-slate-700 truncate max-w-[200px]">{s.query_label || '—'}</p>
                                    <div className="flex items-center gap-2 shrink-0">
                                      <span className="text-[10px] text-slate-400">{s.result_count} rés.</span>
                                      <span className="text-[10px] text-slate-300">{fromNow(s.created_at)}</span>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                            {/* Déblocages */}
                            <div>
                              <p className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-500">
                                <KeyRound size={12} /> Déblocages ({history[u.id].unlocks.length})
                              </p>
                              <div className="space-y-1.5 max-h-48 overflow-y-auto">
                                {history[u.id].unlocks.length === 0 ? (
                                  <p className="text-xs text-slate-400">Aucun déblocage</p>
                                ) : history[u.id].unlocks.map(k => (
                                  <div key={k.id} className="flex items-center justify-between rounded-lg bg-white border border-slate-100 px-3 py-2">
                                    <div className="flex items-center gap-2">
                                      {k.field_type === 'phone' ? <Phone size={11} className="text-blue-500" /> : <Mail size={11} className="text-emerald-500" />}
                                      <span className="text-xs font-medium text-slate-700">{k.field_type === 'phone' ? 'Téléphone' : 'Email'}</span>
                                    </div>
                                    <span className="text-[10px] text-slate-400">{fromNow(k.created_at)}</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          </div>
                        ) : null}

                        {/* Actions manuelles */}
                        <div className="mt-4 flex flex-wrap items-center gap-2 pt-3 border-t border-blue-100">
                          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mr-2">Actions :</span>
                          {u.status === 'pending' && (
                            <button onClick={() => action(u.id, 'approve')}
                              className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-emerald-700">
                              <UserCheck size={12} /> Approuver
                            </button>
                          )}
                          {u.status !== 'blocked' ? (
                            <button onClick={() => action(u.id, 'block')}
                              className="flex items-center gap-1.5 rounded-lg bg-red-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-red-700">
                              <Ban size={12} /> Bannir
                            </button>
                          ) : (
                            <button onClick={() => action(u.id, 'approve')}
                              className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-blue-700">
                              <ShieldCheck size={12} /> Réactiver
                            </button>
                          )}
                          <button onClick={() => {
                            const q = prompt('Nouveau quota mensuel (recherches) :')
                            if (q && !isNaN(parseInt(q))) action(u.id, 'set_quota', parseInt(q))
                          }}
                            className="flex items-center gap-1.5 rounded-lg bg-slate-700 px-3 py-1.5 text-xs font-bold text-white hover:bg-slate-800">
                            <Zap size={12} /> Modifier quota
                          </button>
                        </div>
                      </td>
                    </tr>
                  )}
                </>
              ))}
            </tbody>
          </table>

          {/* Pagination */}
          {total > 50 && (
            <div className="flex items-center justify-between border-t border-slate-100 px-6 py-3">
              <p className="text-xs text-slate-400">Page {page} · {total} résultats</p>
              <div className="flex gap-2">
                <button disabled={page === 1} onClick={() => setPage(p => p - 1)}
                  className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium disabled:opacity-40 hover:bg-slate-50">
                  Précédent
                </button>
                <button disabled={page * 50 >= total} onClick={() => setPage(p => p + 1)}
                  className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium disabled:opacity-40 hover:bg-slate-50">
                  Suivant
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Vue Finances ─────────────────────────────────────────────────────────────

function FinancesView({ token }: { token: string }) {
  const [stripe, setStripe] = useState<StripeData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]    = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try { setStripe(await apiFetch<StripeData>('/api/admin/stripe', token)) }
    catch (e: unknown) { setError(e instanceof Error ? e.message : 'Erreur') }
    finally { setLoading(false) }
  }, [token])

  useEffect(() => { void load() }, [load])

  if (loading) return <Spinner />
  if (error) return <ErrorState message={error} onRetry={load} />
  if (!stripe) return null

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900">Finances & Paiements</h1>
          <p className="text-sm text-slate-400">Données Stripe en temps réel</p>
        </div>
        <button onClick={load} className="flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50">
          <RefreshCw size={13} /> Actualiser
        </button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard label="MRR" value={stripe.mrr.euros} icon={TrendingUp} accent="bg-emerald-500" />
        <KpiCard label="CA ce mois" value={stripe.revenue.thisMonthEuros} icon={CreditCard} accent="bg-blue-500" />
        <KpiCard label="Abonnements actifs" value={stripe.subscriptions.active} icon={CheckCircle2} />
        <KpiCard label="Résiliations" value={stripe.subscriptions.canceledThisMonth} icon={XCircle}
          accent={stripe.subscriptions.canceledThisMonth > 0 ? 'bg-red-400' : 'bg-slate-200'} />
      </div>

      <div className="rounded-2xl bg-white border border-slate-100 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100">
          <h2 className="font-bold text-slate-800">Transactions récentes</h2>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50">
              {['Montant', 'Description', 'Statut', 'Date'].map(h => (
                <th key={h} className="px-6 py-3 text-left text-[11px] font-bold uppercase tracking-wide text-slate-500">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {stripe.recentCharges.map(c => (
              <tr key={c.id} className="hover:bg-slate-50">
                <td className="px-6 py-3 font-extrabold text-slate-900">{c.amountEuros}</td>
                <td className="px-6 py-3 text-slate-600 max-w-[300px] truncate">{c.description || 'Paiement trouvé!'}</td>
                <td className="px-6 py-3">
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                    c.refunded ? 'bg-orange-50 text-orange-600' :
                    c.paid ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-600'
                  }`}>
                    {c.refunded ? 'Remboursé' : c.paid ? 'Payé' : 'Échoué'}
                  </span>
                </td>
                <td className="px-6 py-3 text-[12px] text-slate-400">{fromNow(c.createdAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ─── Vue Logs / Santé système ─────────────────────────────────────────────────

interface LogsResponse {
  logs: LogEntry[]
  health: { searchesToday: number; unlocksToday: number; errorsToday: number }
}

function LogsView({ token }: { token: string }) {
  const [data, setData]       = useState<LogsResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState<string | null>(null)
  const [filter, setFilter]   = useState('')

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try { setData(await apiFetch<LogsResponse>('/api/admin/logs', token)) }
    catch (e: unknown) { setError(e instanceof Error ? e.message : 'Erreur') }
    finally { setLoading(false) }
  }, [token])

  useEffect(() => { void load() }, [load])

  const logs = data?.logs.filter(l => !filter || l.action.includes(filter)) ?? []

  if (loading) return <Spinner />
  if (error) return <ErrorState message={error} onRetry={load} />
  if (!data) return null

  const { health } = data

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900">Santé du système</h1>
          <p className="text-sm text-slate-400">Audit logs en temps réel depuis Supabase</p>
        </div>
        <button onClick={load} className="flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50">
          <RefreshCw size={13} /> Actualiser
        </button>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <KpiCard label="Recherches (24h)" value={health.searchesToday} icon={Search} accent="bg-blue-500" />
        <KpiCard label="Déblocages (24h)" value={health.unlocksToday} icon={KeyRound} accent="bg-violet-500" />
        <KpiCard label="Erreurs (24h)" value={health.errorsToday} icon={AlertCircle}
          accent={health.errorsToday > 0 ? 'bg-red-500' : 'bg-emerald-500'} />
      </div>

      {/* Filtre */}
      <div className="flex gap-2 flex-wrap">
        {[['', 'Tous'], ['search', 'Recherches'], ['unlock', 'Déblocages'], ['admin_', 'Actions admin'], ['error', 'Erreurs']].map(([k, l]) => (
          <button key={k} onClick={() => setFilter(k)}
            className={`rounded-full px-3 py-1 text-xs font-semibold border transition ${filter === k ? 'bg-slate-900 text-white border-slate-900' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}>
            {l}
          </button>
        ))}
      </div>

      <div className="rounded-2xl bg-white border border-slate-100 shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50">
              {['Action', 'Acteur', 'Détails', 'Date'].map(h => (
                <th key={h} className="px-5 py-3 text-left text-[11px] font-bold uppercase tracking-wide text-slate-500">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {logs.length === 0 ? (
              <tr><td colSpan={4} className="py-12 text-center text-sm text-slate-400">Aucun log trouvé</td></tr>
            ) : logs.map(l => (
              <tr key={l.id} className="hover:bg-slate-50">
                <td className="px-5 py-3">
                  <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-bold ${
                    l.action.includes('error') ? 'bg-red-50 text-red-600' :
                    l.action.startsWith('admin_') ? 'bg-violet-50 text-violet-700' :
                    l.action === 'search' ? 'bg-blue-50 text-blue-600' :
                    l.action === 'unlock' ? 'bg-amber-50 text-amber-700' :
                    'bg-slate-100 text-slate-600'
                  }`}>
                    {l.action}
                  </span>
                </td>
                <td className="px-5 py-3 text-[12px] text-slate-600 max-w-[180px] truncate">{String(l.actorEmail)}</td>
                <td className="px-5 py-3 text-[11px] text-slate-400 max-w-[240px] truncate">
                  {l.metadata ? JSON.stringify(l.metadata).slice(0, 80) : '—'}
                </td>
                <td className="px-5 py-3 text-[11px] text-slate-400">{fromNow(l.createdAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ─── Layout principal ─────────────────────────────────────────────────────────

interface AdminCRMPageProps {
  account: Account
  onLogout: () => void
}

export default function AdminCRMPage({ account, onLogout }: AdminCRMPageProps) {
  const [view, setView]     = useState<CRMView>('dashboard')
  const [token, setToken]   = useState('')
  const [pendingCount, setPendingCount] = useState<number | null>(null)

  useEffect(() => {
    getToken().then(setToken)
  }, [])

  // Compte "en attente" pour badge sidebar
  useEffect(() => {
    if (!token) return
    apiFetch<{ users: CRMUser[]; total: number }>('/api/admin/users?status=pending&limit=1', token)
      .then(d => setPendingCount(d.total))
      .catch(() => {})
  }, [token])

  const nav: Array<{ key: CRMView; label: string; icon: React.ElementType }> = [
    { key: 'dashboard', label: 'Vue d\'ensemble', icon: LayoutDashboard },
    { key: 'users',     label: 'Clients',          icon: Users },
    { key: 'finances',  label: 'Finances',          icon: CreditCard },
    { key: 'logs',      label: 'Santé système',     icon: Activity },
  ]

  return (
    <div className="flex min-h-screen bg-slate-50">
      {/* Sidebar */}
      <aside className="fixed inset-y-0 left-0 z-40 flex w-56 flex-col bg-white border-r border-slate-100 shadow-sm">
        <div className="flex h-16 items-center gap-2 px-5 border-b border-slate-100">
          <img src={trouveLogo} alt="trouvé!" className="h-6 w-auto" />
          <span className="rounded-full bg-violet-100 px-1.5 py-0.5 text-[10px] font-bold text-violet-700">ADMIN</span>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 pt-4 space-y-0.5">
          {nav.map(({ key, label, icon: Icon }) => (
            <button key={key} onClick={() => setView(key)}
              className={`relative flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${
                view === key ? 'bg-blue-50 text-blue-700' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
              }`}>
              {view === key && <span className="absolute left-0 top-1/2 -translate-y-1/2 h-5 w-0.5 rounded-full bg-blue-600" />}
              <Icon size={15} className={view === key ? 'text-blue-600' : 'text-slate-400'} />
              <span className="flex-1 text-left">{label}</span>
              {key === 'users' && pendingCount !== null && pendingCount > 0 && (
                <span className="rounded-full bg-amber-500 px-1.5 py-0.5 text-[10px] font-bold text-white">{pendingCount}</span>
              )}
            </button>
          ))}
        </nav>

        {/* Footer utilisateur */}
        <div className="border-t border-slate-100 p-4">
          <div className="flex items-center gap-2.5 mb-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-violet-100 text-xs font-bold text-violet-700">
              {account.email[0].toUpperCase()}
            </div>
            <div className="min-w-0">
              <p className="text-xs font-semibold text-slate-700 truncate">{account.email}</p>
              <p className="text-[10px] text-slate-400">Super Admin</p>
            </div>
          </div>
          <button onClick={onLogout}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 py-2 text-xs font-medium text-slate-500 hover:bg-slate-50">
            <LogOut size={13} /> Déconnexion
          </button>
        </div>
      </aside>

      {/* Contenu principal */}
      <main className="ml-56 flex-1 min-w-0 p-8">
        {!token ? <Spinner /> : (
          <>
            {view === 'dashboard' && <DashboardView token={token} />}
            {view === 'users'     && <UsersView     token={token} />}
            {view === 'finances'  && <FinancesView  token={token} />}
            {view === 'logs'      && <LogsView      token={token} />}
          </>
        )}
      </main>
    </div>
  )
}
