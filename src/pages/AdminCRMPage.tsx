/**
 * AdminCRMPage — Back-office trouvé!
 * Route : trouvé.fr?crm (role=admin requis)
 * Données réelles : Supabase (via /api/admin/*) + Stripe (via /api/admin/stripe)
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import {
  LayoutDashboard, Users, CreditCard, Activity, Search,
  LogOut, RefreshCw, Check, X, Ban, Shield, Clock,
  ArrowUpRight, ArrowDownRight, Minus, Phone, Mail,
  Building2, MapPin, ChevronRight, ChevronDown, ChevronUp,
  Globe, ExternalLink, Zap, TrendingUp, AlertCircle,
  UserCheck, UserX, SlidersHorizontal, Download, Eye,
  Hash, Calendar, Wifi,
} from 'lucide-react'
import { getSupabaseClient } from '@/lib/supabase'
import { searchProspects, type ProspectResult, type ProspectSearchParams } from '@/lib/prospectApi'
import { DEPARTMENTS } from '@/lib/searchApi'
import type { Account } from '@/lib/accountStore'
import trouveLogo from '@/assets/trouve-logo.png'

// ─── Types ────────────────────────────────────────────────────────────────────

interface Metrics {
  users: { total: number; newThisMonth: number; pendingApprovals: number }
  activity: { searchesThisMonth: number; unlocksThisMonth: number }
  credits: { thisMonth: number; lastMonth: number; byType: { phone: number; email: number } }
  topOrgs: Array<{ organizationId: string; name: string; searchesUsed: number }>
  recentSearches: Array<{
    id: string; queryLabel: string; filters: Record<string, unknown>
    resultCount: number; createdAt: string; userEmail: string
  }>
}

interface StripeData {
  mrr: { euros: string }
  revenue: { thisMonthEuros: string }
  subscriptions: { active: number; newThisMonth: number; newLastMonth: number; canceledThisMonth: number }
  recentCharges: Array<{
    id: string; amountEuros: string; currency: string
    paid: boolean; refunded: boolean; description: string; createdAt: string
  }>
}

interface CRMUser {
  id: string; email: string; firstName: string; lastName: string
  functionTitle: string | null; role: string; status: string
  quota: number; monthlyUsage: number; createdAt: string; lastLoginAt: string | null
  cguAccepted: boolean
  organization: { siren: string; name: string; legalForm: string; active: boolean } | null
}

type Section = 'dashboard' | 'users' | 'pending' | 'revenue' | 'activity' | 'search'

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function getToken() {
  const { data: { session } } = await getSupabaseClient().auth.getSession()
  return session?.access_token ?? null
}

async function apiFetch<T>(path: string, tok: string): Promise<T> {
  const r = await fetch(path, { headers: { Authorization: `Bearer ${tok}` } })
  if (!r.ok) throw new Error((await r.json()).error ?? r.statusText)
  return r.json() as Promise<T>
}

async function apiPost(path: string, tok: string, body: unknown) {
  const r = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tok}` },
    body: JSON.stringify(body),
  })
  if (!r.ok) throw new Error((await r.json()).error ?? r.statusText)
  return r.json()
}

function fromNow(iso: string) {
  const d = Date.now() - new Date(iso).getTime()
  const m = Math.floor(d / 60000)
  if (m < 1) return 'À l\'instant'
  if (m < 60) return `Il y a ${m} min`
  const h = Math.floor(m / 60)
  if (h < 24) return `Il y a ${h}h`
  const days = Math.floor(h / 24)
  if (days < 30) return `Il y a ${days}j`
  return new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: '2-digit' })
}

function deltaP(a: number, b: number): number | null {
  if (b === 0) return null
  return Math.round(((a - b) / b) * 100)
}

// ─── Atoms ────────────────────────────────────────────────────────────────────

function Badge({ status }: { status: string }) {
  const m: Record<string, string> = {
    approved: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/20',
    pending:  'bg-amber-500/15 text-amber-400 border-amber-500/20',
    blocked:  'bg-red-500/15 text-red-400 border-red-500/20',
    rejected: 'bg-gray-700/50 text-gray-500 border-gray-700',
    trial:    'bg-blue-500/15 text-blue-400 border-blue-500/20',
  }
  const labels: Record<string, string> = {
    approved: 'Approuvé', pending: 'En attente', blocked: 'Bloqué', rejected: 'Refusé', trial: 'Trial',
  }
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold ${m[status] ?? m.rejected}`}>
      {labels[status] ?? status}
    </span>
  )
}

function RoleBadge({ role }: { role: string }) {
  const m: Record<string, string> = {
    admin:  'bg-purple-500/15 text-purple-400',
    agence: 'bg-blue-500/15 text-blue-400',
    agent:  'bg-gray-700/50 text-gray-500',
  }
  return (
    <span className={`inline-flex items-center rounded-md px-1.5 py-0.5 text-[11px] font-semibold ${m[role] ?? m.agent}`}>
      {role}
    </span>
  )
}

function KpiCard({
  label, value, sub, trend, icon: Icon, accent = false
}: {
  label: string; value: string | number; sub?: string
  trend?: number | null; icon: React.ElementType; accent?: boolean
}) {
  return (
    <div className={`rounded-2xl border p-5 ${accent ? 'border-blue-500/30 bg-blue-500/10' : 'border-gray-800 bg-gray-900'}`}>
      <div className="flex items-center justify-between">
        <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${accent ? 'bg-blue-500/20' : 'bg-gray-800'}`}>
          <Icon size={15} className={accent ? 'text-blue-400' : 'text-gray-400'} />
        </div>
        {trend !== undefined && trend !== null && (
          <span className={`flex items-center gap-0.5 text-xs font-semibold ${
            trend > 0 ? 'text-emerald-400' : trend < 0 ? 'text-red-400' : 'text-gray-600'
          }`}>
            {trend > 0 ? <ArrowUpRight size={12} /> : trend < 0 ? <ArrowDownRight size={12} /> : <Minus size={12} />}
            {Math.abs(trend)}%
          </span>
        )}
      </div>
      <p className="mt-3 text-2xl font-bold text-white">{value}</p>
      <p className="mt-0.5 text-xs font-medium text-gray-500">{label}</p>
      {sub && <p className="mt-0.5 text-[11px] text-gray-600">{sub}</p>}
    </div>
  )
}

function UsageBar({ used, quota }: { used: number; quota: number }) {
  const pct = quota > 0 ? Math.min(100, Math.round((used / quota) * 100)) : 0
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-20 overflow-hidden rounded-full bg-gray-800">
        <div
          className={`h-full rounded-full transition-all ${pct > 80 ? 'bg-red-500' : pct > 50 ? 'bg-amber-500' : 'bg-blue-500'}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-[11px] text-gray-600">{used}/{quota}</span>
    </div>
  )
}

// ─── Section : Dashboard ──────────────────────────────────────────────────────

function DashboardSection({ metrics, stripe, onNavigate }: {
  metrics: Metrics | null
  stripe: StripeData | null
  onNavigate: (s: Section) => void
}) {
  if (!metrics || !stripe) return (
    <div className="flex h-full items-center justify-center">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
    </div>
  )

  const credTrend = deltaP(metrics.credits.thisMonth, metrics.credits.lastMonth)

  return (
    <div className="space-y-8 p-8">
      {/* Alert bandeau */}
      {metrics.users.pendingApprovals > 0 && (
        <button
          onClick={() => onNavigate('pending')}
          className="flex w-full items-center gap-3 rounded-2xl border border-amber-500/30 bg-amber-500/10 px-5 py-4 text-left transition hover:bg-amber-500/15"
        >
          <Clock size={18} className="shrink-0 text-amber-400" />
          <div className="flex-1">
            <p className="text-sm font-semibold text-amber-300">
              {metrics.users.pendingApprovals} inscription{metrics.users.pendingApprovals > 1 ? 's' : ''} en attente de validation
            </p>
            <p className="text-xs text-amber-500/70">Cliquez pour gérer les demandes d'accès</p>
          </div>
          <ArrowUpRight size={16} className="shrink-0 text-amber-400" />
        </button>
      )}

      {/* KPIs */}
      <div>
        <h2 className="mb-4 text-xs font-bold uppercase tracking-widest text-gray-500">Métriques clés</h2>
        <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
          <KpiCard label="MRR" value={`${stripe.mrr.euros} €`}
            sub={`${stripe.subscriptions.active} abonnements actifs`}
            icon={CreditCard} accent />
          <KpiCard label="CA ce mois" value={`${stripe.revenue.thisMonthEuros} €`}
            sub={`+${stripe.subscriptions.newThisMonth} nouveaux abonnements`}
            icon={TrendingUp} />
          <KpiCard label="Utilisateurs actifs" value={metrics.users.total}
            sub={`+${metrics.users.newThisMonth} ce mois`}
            icon={Users} />
          <KpiCard label="Crédits débloqués" value={metrics.credits.thisMonth}
            sub={`${metrics.credits.byType.phone} tél · ${metrics.credits.byType.email} email`}
            trend={credTrend} icon={Zap} />
        </div>
      </div>

      {/* Two columns */}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">

        {/* Stripe derniers paiements */}
        <div className="rounded-2xl border border-gray-800 bg-gray-900">
          <div className="flex items-center justify-between border-b border-gray-800 px-5 py-4">
            <h3 className="text-sm font-semibold text-white">Derniers paiements Stripe</h3>
            <button onClick={() => onNavigate('revenue')} className="text-xs text-blue-400 hover:text-blue-300 transition">
              Voir tout →
            </button>
          </div>
          <div className="divide-y divide-gray-800/50">
            {stripe.recentCharges.length === 0 ? (
              <p className="px-5 py-8 text-center text-sm text-gray-600">Aucun paiement</p>
            ) : stripe.recentCharges.slice(0, 6).map(c => (
              <div key={c.id} className="flex items-center gap-3 px-5 py-3">
                <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${c.paid && !c.refunded ? 'bg-emerald-500/15' : 'bg-red-500/15'}`}>
                  <CreditCard size={12} className={c.paid && !c.refunded ? 'text-emerald-400' : 'text-red-400'} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-gray-200">{c.description}</p>
                  <p className="text-[11px] text-gray-600">{fromNow(c.createdAt)}</p>
                </div>
                <span className={`text-sm font-bold ${c.refunded ? 'text-gray-600 line-through' : c.paid ? 'text-white' : 'text-red-400'}`}>
                  {c.amountEuros} €
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Activité récente */}
        <div className="rounded-2xl border border-gray-800 bg-gray-900">
          <div className="flex items-center justify-between border-b border-gray-800 px-5 py-4">
            <h3 className="text-sm font-semibold text-white">Activité plateforme</h3>
            <button onClick={() => onNavigate('activity')} className="text-xs text-blue-400 hover:text-blue-300 transition">
              Voir tout →
            </button>
          </div>
          <div className="divide-y divide-gray-800/50">
            {metrics.recentSearches.slice(0, 6).map(s => (
              <div key={s.id} className="flex items-center gap-3 px-5 py-3">
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-blue-500/10">
                  <Search size={11} className="text-blue-400" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-gray-200">
                    {s.queryLabel === 'secteur immobilier' ? 'Tous secteurs' : `"${s.queryLabel}"`}
                  </p>
                  <p className="text-[11px] text-gray-600">{s.userEmail}</p>
                </div>
                <span className="text-xs font-semibold text-blue-400">
                  {s.resultCount.toLocaleString('fr-FR')}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Top orgs */}
        <div className="rounded-2xl border border-gray-800 bg-gray-900">
          <div className="border-b border-gray-800 px-5 py-4">
            <h3 className="text-sm font-semibold text-white">Top organisations ce mois</h3>
          </div>
          <div className="divide-y divide-gray-800/50">
            {metrics.topOrgs.slice(0, 6).map((o, i) => (
              <div key={o.organizationId} className="flex items-center gap-3 px-5 py-3">
                <span className="w-5 text-right text-xs font-bold text-gray-700">{i + 1}</span>
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gray-800">
                  <Building2 size={11} className="text-gray-500" />
                </div>
                <p className="flex-1 truncate text-sm text-gray-200">{o.name}</p>
                <span className="text-sm font-bold text-white">{o.searchesUsed.toLocaleString('fr-FR')}</span>
                <span className="text-[11px] text-gray-600">rech.</span>
              </div>
            ))}
          </div>
        </div>

        {/* Abonnements */}
        <div className="rounded-2xl border border-gray-800 bg-gray-900">
          <div className="border-b border-gray-800 px-5 py-4">
            <h3 className="text-sm font-semibold text-white">Abonnements Stripe</h3>
          </div>
          <div className="divide-y divide-gray-800/50">
            {[
              { label: 'Actifs', value: stripe.subscriptions.active, color: 'text-emerald-400' },
              { label: 'Nouveaux ce mois', value: stripe.subscriptions.newThisMonth, color: 'text-blue-400' },
              { label: 'Nouveaux mois précédent', value: stripe.subscriptions.newLastMonth, color: 'text-gray-400' },
              { label: 'Annulations ce mois', value: stripe.subscriptions.canceledThisMonth, color: stripe.subscriptions.canceledThisMonth > 0 ? 'text-red-400' : 'text-gray-600' },
              { label: 'Recherches ce mois', value: metrics.activity.searchesThisMonth.toLocaleString('fr-FR'), color: 'text-white' },
              { label: 'Déblocages ce mois', value: metrics.activity.unlocksThisMonth.toLocaleString('fr-FR'), color: 'text-white' },
            ].map(row => (
              <div key={row.label} className="flex items-center justify-between px-5 py-3">
                <p className="text-sm text-gray-400">{row.label}</p>
                <p className={`text-sm font-bold ${row.color}`}>{row.value}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Section : Utilisateurs ───────────────────────────────────────────────────

function UsersSection({ token, statusFilter, onCountUpdate }: {
  token: string
  statusFilter?: string
  onCountUpdate?: (n: number) => void
}) {
  const [users, setUsers]       = useState<CRMUser[]>([])
  const [total, setTotal]       = useState(0)
  const [page, setPage]         = useState(1)
  const [filter, setFilter]     = useState<string>(statusFilter ?? 'all')
  const [search, setSearch]     = useState('')
  const [loading, setLoading]   = useState(true)
  const [busy, setBusy]         = useState<string | null>(null)
  const [expanded, setExpanded] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const p = new URLSearchParams({ page: String(page), limit: '50' })
      if (filter !== 'all') p.set('status', filter)
      if (search.trim()) p.set('search', search.trim())
      const d = await apiFetch<{ users: CRMUser[]; total: number }>(`/api/admin/users?${p}`, token)
      setUsers(d.users)
      setTotal(d.total)
      onCountUpdate?.(d.total)
    } catch { /* silent */ }
    finally { setLoading(false) }
  }, [token, page, filter, search, onCountUpdate])

  useEffect(() => { void load() }, [load])

  const act = async (userId: string, action: string, value?: string | number) => {
    setBusy(userId)
    try {
      await apiPost('/api/admin/users', token, { userId, action, value })
      await load()
    } catch { /* silent */ }
    finally { setBusy(null) }
  }

  return (
    <div className="flex h-full flex-col">
      {/* Toolbar */}
      <div className="flex shrink-0 flex-wrap items-center gap-3 border-b border-gray-800 bg-gray-950 px-8 py-4">
        <div className="relative">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-600" />
          <input
            value={search} onChange={e => { setSearch(e.target.value); setPage(1) }}
            placeholder="Rechercher email, nom…"
            className="h-9 w-56 rounded-lg border border-gray-800 bg-gray-900 pl-9 pr-3 text-sm text-white placeholder-gray-600 focus:border-blue-600 focus:outline-none transition"
          />
        </div>
        <div className="flex gap-0.5 rounded-xl border border-gray-800 bg-gray-900 p-0.5">
          {(['all', 'pending', 'approved', 'blocked', 'rejected'] as const).map(f => (
            <button key={f} onClick={() => { setFilter(f); setPage(1) }}
              className={`rounded-lg px-3 py-1 text-xs font-medium transition ${
                filter === f ? 'bg-gray-700 text-white shadow-sm' : 'text-gray-500 hover:text-gray-300'
              }`}>
              {{ all: 'Tous', pending: 'En attente', approved: 'Approuvés', blocked: 'Bloqués', rejected: 'Refusés' }[f]}
            </button>
          ))}
        </div>
        <span className="ml-auto text-xs text-gray-600">{total} utilisateur{total > 1 ? 's' : ''}</span>
        <button onClick={load} className="rounded-lg border border-gray-800 p-2 text-gray-600 hover:text-gray-300 transition">
          <RefreshCw size={13} />
        </button>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto">
        {loading ? (
          <div className="flex h-full items-center justify-center">
            <div className="h-7 w-7 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
          </div>
        ) : users.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
            <Users size={32} className="text-gray-700" />
            <p className="text-sm text-gray-500">Aucun utilisateur pour ces filtres</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10 bg-gray-950">
              <tr className="border-b border-gray-800">
                {['Utilisateur', 'Organisation', 'Rôle', 'Statut', 'Usage', 'Inscrit', 'Actions'].map(h => (
                  <th key={h} className="px-6 py-3 text-left text-[11px] font-bold uppercase tracking-wide text-gray-600">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800/50">
              {users.map(u => (
                <>
                  <tr key={u.id}
                    className={`group transition hover:bg-gray-900/60 ${expanded === u.id ? 'bg-gray-900/40' : ''}`}>
                    <td className="px-6 py-4">
                      <div>
                        <p className="font-semibold text-white">{u.firstName} {u.lastName}</p>
                        <p className="text-[12px] text-gray-500">{u.email}</p>
                        {u.functionTitle && <p className="text-[11px] text-gray-600">{u.functionTitle}</p>}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      {u.organization ? (
                        <div>
                          <p className="font-medium text-gray-200">{u.organization.name}</p>
                          <p className="text-[11px] text-gray-600">{u.organization.siren}</p>
                          {!u.organization.active && (
                            <span className="text-[11px] text-red-400">Radiée</span>
                          )}
                        </div>
                      ) : <span className="text-gray-700">—</span>}
                    </td>
                    <td className="px-6 py-4"><RoleBadge role={u.role} /></td>
                    <td className="px-6 py-4">
                      <div className="space-y-1">
                        <Badge status={u.status} />
                        {!u.cguAccepted && (
                          <p className="text-[10px] text-amber-500">CGU non signées</p>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <UsageBar used={u.monthlyUsage} quota={u.quota} />
                      {u.lastLoginAt && (
                        <p className="mt-1 text-[11px] text-gray-600">{fromNow(u.lastLoginAt)}</p>
                      )}
                    </td>
                    <td className="px-6 py-4 text-[12px] text-gray-500">
                      {fromNow(u.createdAt)}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-1.5">
                        {u.status === 'pending' && (
                          <>
                            <button onClick={() => act(u.id, 'approve')} disabled={busy === u.id} title="Approuver"
                              className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-500/15 text-emerald-400 transition hover:bg-emerald-500/25 disabled:opacity-40">
                              {busy === u.id ? <div className="h-3 w-3 animate-spin rounded-full border border-emerald-400 border-t-transparent" /> : <Check size={13} />}
                            </button>
                            <button onClick={() => act(u.id, 'reject')} disabled={busy === u.id} title="Refuser"
                              className="flex h-7 w-7 items-center justify-center rounded-lg bg-red-500/15 text-red-400 transition hover:bg-red-500/25 disabled:opacity-40">
                              <X size={13} />
                            </button>
                          </>
                        )}
                        {u.status === 'approved' && (
                          <button onClick={() => act(u.id, 'block')} disabled={busy === u.id} title="Bloquer"
                            className="flex h-7 w-7 items-center justify-center rounded-lg bg-gray-800 text-gray-500 transition hover:bg-red-500/15 hover:text-red-400 disabled:opacity-40">
                            <Ban size={13} />
                          </button>
                        )}
                        {u.status === 'blocked' && (
                          <button onClick={() => act(u.id, 'approve')} disabled={busy === u.id} title="Débloquer"
                            className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-500/15 text-emerald-400 transition hover:bg-emerald-500/25 disabled:opacity-40">
                            <Check size={13} />
                          </button>
                        )}
                        <button onClick={() => setExpanded(expanded === u.id ? null : u.id)}
                          className="flex h-7 w-7 items-center justify-center rounded-lg bg-gray-800 text-gray-500 transition hover:text-gray-300">
                          {expanded === u.id ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                        </button>
                      </div>
                    </td>
                  </tr>
                  {expanded === u.id && (
                    <tr key={`${u.id}-exp`} className="bg-gray-900/30">
                      <td colSpan={7} className="px-6 py-4">
                        <div className="flex flex-wrap gap-6 text-xs">
                          <div>
                            <p className="mb-1 font-semibold uppercase tracking-wide text-gray-600">Actions rapides</p>
                            <div className="flex gap-2">
                              {u.role !== 'agence' && (
                                <button onClick={() => act(u.id, 'set_role', 'agence')}
                                  className="rounded-lg border border-blue-500/30 bg-blue-500/10 px-3 py-1.5 text-blue-400 transition hover:bg-blue-500/20">
                                  Passer Agence
                                </button>
                              )}
                              {u.role !== 'agent' && (
                                <button onClick={() => act(u.id, 'set_role', 'agent')}
                                  className="rounded-lg border border-gray-700 bg-gray-800 px-3 py-1.5 text-gray-400 transition hover:bg-gray-700">
                                  Passer Agent
                                </button>
                              )}
                              <button onClick={() => {
                                const v = prompt('Nouveau quota mensuel :', String(u.quota))
                                if (v !== null && !isNaN(parseInt(v))) act(u.id, 'set_quota', parseInt(v))
                              }}
                                className="rounded-lg border border-gray-700 bg-gray-800 px-3 py-1.5 text-gray-400 transition hover:bg-gray-700">
                                Modifier quota
                              </button>
                            </div>
                          </div>
                          <div>
                            <p className="mb-1 font-semibold uppercase tracking-wide text-gray-600">Détails compte</p>
                            <p className="text-gray-400">ID : <span className="font-mono text-gray-500 text-[11px]">{u.id}</span></p>
                            <p className="text-gray-400">CGU : <span className={u.cguAccepted ? 'text-emerald-400' : 'text-amber-400'}>{u.cguAccepted ? 'Acceptées' : 'Non signées'}</span></p>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination */}
      {total > 50 && (
        <div className="flex shrink-0 items-center justify-between border-t border-gray-800 px-8 py-3">
          <span className="text-xs text-gray-600">Page {page} / {Math.ceil(total / 50)}</span>
          <div className="flex gap-2">
            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
              className="rounded-lg border border-gray-800 px-3 py-1.5 text-xs text-gray-400 transition hover:bg-gray-800 disabled:opacity-40">
              Précédent
            </button>
            <button onClick={() => setPage(p => p + 1)} disabled={page >= Math.ceil(total / 50)}
              className="rounded-lg border border-gray-800 px-3 py-1.5 text-xs text-gray-400 transition hover:bg-gray-800 disabled:opacity-40">
              Suivant
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Section : Revenus ────────────────────────────────────────────────────────

function RevenueSection({ stripe }: { stripe: StripeData | null }) {
  if (!stripe) return (
    <div className="flex h-full items-center justify-center">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
    </div>
  )
  const subTrend = deltaP(stripe.subscriptions.newThisMonth, stripe.subscriptions.newLastMonth)

  return (
    <div className="space-y-8 p-8">
      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <KpiCard label="MRR" value={`${stripe.mrr.euros} €`} icon={CreditCard} accent />
        <KpiCard label="CA encaissé ce mois" value={`${stripe.revenue.thisMonthEuros} €`} icon={TrendingUp} />
        <KpiCard label="Abonnements actifs" value={stripe.subscriptions.active} icon={Users} />
        <KpiCard label="Nouveaux ce mois" value={stripe.subscriptions.newThisMonth}
          trend={subTrend} sub={`${stripe.subscriptions.newLastMonth} le mois précédent`} icon={ArrowUpRight} />
      </div>

      {stripe.subscriptions.canceledThisMonth > 0 && (
        <div className="flex items-center gap-3 rounded-2xl border border-red-500/20 bg-red-500/10 px-5 py-4">
          <ArrowDownRight size={18} className="text-red-400 shrink-0" />
          <p className="text-sm text-red-300 font-medium">
            {stripe.subscriptions.canceledThisMonth} annulation{stripe.subscriptions.canceledThisMonth > 1 ? 's' : ''} ce mois — à surveiller
          </p>
        </div>
      )}

      <div className="rounded-2xl border border-gray-800 bg-gray-900">
        <div className="border-b border-gray-800 px-6 py-4">
          <h3 className="text-sm font-semibold text-white">Historique des paiements</h3>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-800">
              {['Description', 'Montant', 'Statut', 'Date'].map(h => (
                <th key={h} className="px-6 py-3 text-left text-[11px] font-bold uppercase tracking-wide text-gray-600">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800/50">
            {stripe.recentCharges.map(c => (
              <tr key={c.id} className="hover:bg-gray-800/30 transition">
                <td className="px-6 py-4 text-gray-200">{c.description}</td>
                <td className="px-6 py-4">
                  <span className={`font-bold ${c.refunded ? 'text-gray-600 line-through' : c.paid ? 'text-white' : 'text-red-400'}`}>
                    {c.amountEuros} {c.currency.toUpperCase()}
                  </span>
                </td>
                <td className="px-6 py-4">
                  {c.refunded
                    ? <Badge status="rejected" />
                    : c.paid
                    ? <Badge status="approved" />
                    : <Badge status="blocked" />}
                </td>
                <td className="px-6 py-4 text-gray-500">{fromNow(c.createdAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ─── Section : Activité ───────────────────────────────────────────────────────

function ActivitySection({ metrics }: { metrics: Metrics | null }) {
  if (!metrics) return (
    <div className="flex h-full items-center justify-center">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
    </div>
  )
  return (
    <div className="space-y-6 p-8">
      <div className="grid grid-cols-2 gap-4 xl:grid-cols-3">
        <KpiCard label="Recherches ce mois" value={metrics.activity.searchesThisMonth.toLocaleString('fr-FR')} icon={Search} />
        <KpiCard label="Déblocages ce mois" value={metrics.activity.unlocksThisMonth.toLocaleString('fr-FR')} icon={Zap} />
        <KpiCard label="Crédits tél / email"
          value={`${metrics.credits.byType.phone} / ${metrics.credits.byType.email}`}
          icon={Phone} />
      </div>

      <div className="rounded-2xl border border-gray-800 bg-gray-900">
        <div className="border-b border-gray-800 px-6 py-4">
          <h3 className="text-sm font-semibold text-white">20 dernières recherches plateforme</h3>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-800">
              {['Requête', 'Filtres', 'Résultats', 'Utilisateur', 'Date'].map(h => (
                <th key={h} className="px-6 py-3 text-left text-[11px] font-bold uppercase tracking-wide text-gray-600">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800/50">
            {metrics.recentSearches.map(s => (
              <tr key={s.id} className="hover:bg-gray-800/30 transition">
                <td className="px-6 py-4 font-medium text-gray-200">
                  {s.queryLabel === 'secteur immobilier' ? 'Tous secteurs' : `"${s.queryLabel}"`}
                </td>
                <td className="px-6 py-4">
                  <div className="flex gap-1.5 flex-wrap">
                    {s.filters?.department && (
                      <span className="rounded-md bg-gray-800 px-2 py-0.5 text-[11px] text-gray-400">
                        Dép. {s.filters.department as string}
                      </span>
                    )}
                    {s.filters?.activityCode && (
                      <span className="rounded-md bg-gray-800 px-2 py-0.5 text-[11px] text-gray-400">
                        {s.filters.activityCode as string}
                      </span>
                    )}
                    {!s.filters?.department && !s.filters?.activityCode && (
                      <span className="text-gray-700">—</span>
                    )}
                  </div>
                </td>
                <td className="px-6 py-4">
                  <span className="font-bold text-blue-400">{s.resultCount.toLocaleString('fr-FR')}</span>
                </td>
                <td className="px-6 py-4 text-gray-500">{s.userEmail}</td>
                <td className="px-6 py-4 text-gray-500">{fromNow(s.createdAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ─── Section : Recherche prospects ───────────────────────────────────────────

function SearchSection() {
  const [query,     setQuery]     = useState('')
  const [dept,      setDept]      = useState('')
  const [results,   setResults]   = useState<ProspectResult[]>([])
  const [total,     setTotal]     = useState(0)
  const [loading,   setLoading]   = useState(false)
  const [searched,  setSearched]  = useState(false)
  const [selected,  setSelected]  = useState<ProspectResult | null>(null)

  const doSearch = async (overrides: Partial<ProspectSearchParams> = {}) => {
    const q = overrides.query ?? query
    const d = overrides.department ?? dept
    if (!q.trim() && !d) return
    setLoading(true); setSearched(true); setSelected(null)
    try {
      const r = await searchProspects({ query: q || 'secteur immobilier', department: d, page: 1, perPage: 50 })
      setResults(r.results); setTotal(r.total)
    } catch { setResults([]); setTotal(0) }
    finally { setLoading(false) }
  }

  return (
    <div className="flex h-full overflow-hidden">
      {/* Search + results */}
      <div className="flex flex-1 flex-col overflow-hidden">
        <div className="shrink-0 border-b border-gray-800 px-8 py-4">
          <form onSubmit={e => { e.preventDefault(); void doSearch() }} className="flex items-center gap-3">
            <div className="relative flex-1">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-600" />
              <input value={query} onChange={e => setQuery(e.target.value)}
                placeholder="Nom, prénom, ville, SIREN, téléphone…"
                className="h-10 w-full rounded-xl border border-gray-800 bg-gray-900 pl-9 pr-3 text-sm text-white placeholder-gray-600 focus:border-blue-600 focus:outline-none transition" />
            </div>
            <select value={dept} onChange={e => { setDept(e.target.value); void doSearch({ department: e.target.value }) }}
              className="h-10 rounded-xl border border-gray-800 bg-gray-900 px-3 text-sm text-gray-300 focus:border-blue-600 focus:outline-none transition">
              <option value="">Tous les départements</option>
              {DEPARTMENTS.map(d => <option key={d.code} value={d.code}>{d.label}</option>)}
            </select>
            <button type="submit" disabled={loading}
              className="flex h-10 items-center gap-2 rounded-xl bg-blue-600 px-5 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:opacity-60">
              {loading ? <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" /> : <Search size={14} />}
              Rechercher
            </button>
          </form>
        </div>

        <div className="flex-1 overflow-y-auto px-8 py-4">
          {!searched ? (
            <div className="flex h-full flex-col items-center justify-center gap-6 text-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-gray-800 bg-gray-900">
                <Search size={26} className="text-gray-600" />
              </div>
              <div>
                <p className="text-base font-semibold text-gray-400">Recherche de contacts professionnels</p>
                <p className="mt-1 text-sm text-gray-600">Accès direct à toute la base — résultats en temps réel</p>
              </div>
              <div className="flex flex-wrap justify-center gap-2">
                {['Paris 16', 'Cabinet Rivoli', 'ORPI', 'Marseille', 'Lyon agence'].map(s => (
                  <button key={s} onClick={() => { setQuery(s); void doSearch({ query: s }) }}
                    className="rounded-xl border border-gray-800 bg-gray-900 px-4 py-2 text-sm text-gray-500 transition hover:border-gray-700 hover:text-gray-300">
                    {s}
                  </button>
                ))}
              </div>
            </div>
          ) : loading ? (
            <div className="flex h-full items-center justify-center">
              <div className="h-7 w-7 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
            </div>
          ) : (
            <>
              <div className="mb-4 flex items-center justify-between">
                <p className="text-sm text-gray-500">
                  <span className="font-bold text-white">{total.toLocaleString('fr-FR')}</span> contact{total > 1 ? 's' : ''} trouvé{total > 1 ? 's' : ''}
                </p>
                <button onClick={() => { setSearched(false); setResults([]); setQuery('') }}
                  className="text-xs text-gray-600 hover:text-gray-400 transition">Effacer</button>
              </div>
              <div className="space-y-2">
                {results.map(r => (
                  <button key={r.id} onClick={() => setSelected(selected?.id === r.id ? null : r)}
                    className={`group w-full rounded-xl border p-4 text-left transition ${
                      selected?.id === r.id ? 'border-blue-600 bg-blue-600/10' : 'border-gray-800 bg-gray-900 hover:border-gray-700'
                    }`}>
                    <div className="flex items-start gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="font-semibold text-white">{r.fullName}</p>
                          {r.jobTitle && <span className="text-xs text-gray-500">· {r.jobTitle}</span>}
                          <div className={`ml-auto h-2 w-2 shrink-0 rounded-full ${r.isActive ? 'bg-emerald-400' : 'bg-red-600'}`} />
                        </div>
                        {r.companyName && <p className="mt-0.5 text-sm text-gray-400">{r.companyName}</p>}
                        <div className="mt-2 flex flex-wrap items-center gap-3">
                          {r.city && <span className="flex items-center gap-1 text-xs text-gray-600"><MapPin size={10} />{r.city}</span>}
                          {r.hasPhone && <span className="flex items-center gap-1 text-xs text-blue-500"><Phone size={10} />{r.phoneUnlocked ? r.phone : 'Tél. disponible'}</span>}
                          {r.hasEmail && <span className="flex items-center gap-1 text-xs text-blue-500"><Mail size={10} />{r.emailUnlocked ? r.email : 'Email disponible'}</span>}
                        </div>
                      </div>
                      <ChevronRight size={15} className={`mt-1 shrink-0 transition ${selected?.id === r.id ? 'text-blue-400 rotate-90' : 'text-gray-700 group-hover:text-gray-500'}`} />
                    </div>
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Detail panel */}
      {selected && (
        <div className="w-96 shrink-0 overflow-y-auto border-l border-gray-800 bg-gray-900">
          <div className="border-b border-gray-800 p-5">
            <div className="flex items-start justify-between">
              <div>
                <p className="font-bold text-white text-base">{selected.fullName}</p>
                {selected.jobTitle && <p className="mt-0.5 text-sm text-gray-400">{selected.jobTitle}</p>}
              </div>
              <button onClick={() => setSelected(null)} className="rounded-lg p-1 text-gray-600 hover:bg-gray-800 hover:text-gray-300 transition">
                <X size={15} />
              </button>
            </div>
            <div className={`mt-3 inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${selected.isActive ? 'bg-emerald-500/15 text-emerald-400' : 'bg-red-500/15 text-red-400'}`}>
              <div className={`h-1.5 w-1.5 rounded-full ${selected.isActive ? 'bg-emerald-400' : 'bg-red-400'}`} />
              Société {selected.isActive ? 'active' : 'radiée'}
            </div>
          </div>
          <div className="space-y-4 p-5">
            {selected.companyName && (
              <div className="rounded-xl border border-gray-800 p-4 space-y-2">
                <p className="text-[10px] font-bold uppercase tracking-widest text-gray-600">Entreprise</p>
                <div className="flex items-center gap-2">
                  <Building2 size={13} className="text-gray-500" />
                  <p className="font-semibold text-gray-200">{selected.companyName}</p>
                </div>
                {selected.companySiren && <p className="text-xs text-gray-600">SIREN : {selected.companySiren}</p>}
                {selected.activityLabel && <p className="text-xs text-gray-500">{selected.activityLabel}</p>}
                {selected.companySize && <p className="text-xs text-gray-500">{selected.companySize} salariés</p>}
              </div>
            )}
            {(selected.address || selected.city) && (
              <div className="rounded-xl border border-gray-800 p-4 space-y-1.5">
                <p className="text-[10px] font-bold uppercase tracking-widest text-gray-600">Localisation</p>
                {selected.address && <p className="text-xs text-gray-400"><MapPin size={11} className="inline mr-1" />{selected.address}</p>}
                {selected.city && <p className="text-xs text-gray-400">{selected.zipCode} {selected.city} · {selected.department}</p>}
              </div>
            )}
            <div className="rounded-xl border border-gray-800 p-4 space-y-3">
              <p className="text-[10px] font-bold uppercase tracking-widest text-gray-600">Coordonnées</p>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Phone size={13} className={selected.hasPhone ? 'text-blue-400' : 'text-gray-700'} />
                  <span className="text-sm text-gray-300">
                    {selected.phoneUnlocked && selected.phone ? selected.phone : selected.hasPhone ? '•••••••••' : 'Non disponible'}
                  </span>
                </div>
                {!selected.phoneUnlocked && selected.hasPhone && (
                  <span className="rounded-md bg-blue-600/20 px-2 py-0.5 text-[10px] font-semibold text-blue-400">Crédit requis</span>
                )}
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Mail size={13} className={selected.hasEmail ? 'text-blue-400' : 'text-gray-700'} />
                  <span className="text-sm text-gray-300">
                    {selected.emailUnlocked && selected.email ? selected.email : selected.hasEmail ? '•••••••••' : 'Non disponible'}
                  </span>
                </div>
                {!selected.emailUnlocked && selected.hasEmail && (
                  <span className="rounded-md bg-blue-600/20 px-2 py-0.5 text-[10px] font-semibold text-blue-400">Crédit requis</span>
                )}
              </div>
              {selected.linkedinUrl && (
                <a href={selected.linkedinUrl} target="_blank" rel="noreferrer"
                  className="flex items-center gap-2 text-sm text-blue-400 hover:text-blue-300 transition">
                  <ExternalLink size={12} /> LinkedIn
                </a>
              )}
              {selected.website && (
                <a href={selected.website.startsWith('http') ? selected.website : `https://${selected.website}`}
                  target="_blank" rel="noreferrer"
                  className="flex items-center gap-2 text-sm text-gray-400 hover:text-gray-300 transition">
                  <Globe size={12} /> {selected.website}
                </a>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Main ─────────────────────────────────────────────────────────────────────

const NAV_ITEMS: Array<{ id: Section; icon: React.ElementType; label: string; badge?: boolean }> = [
  { id: 'dashboard', icon: LayoutDashboard, label: 'Vue d\'ensemble'     },
  { id: 'pending',   icon: UserCheck,       label: 'En attente', badge: true },
  { id: 'users',     icon: Users,           label: 'Utilisateurs'        },
  { id: 'revenue',   icon: CreditCard,      label: 'Revenus'             },
  { id: 'activity',  icon: Activity,        label: 'Activité'            },
  { id: 'search',    icon: Search,          label: 'Recherche'           },
]

export default function AdminCRMPage({ account, onLogout }: { account: Account; onLogout: () => void }) {
  const [section,   setSection]  = useState<Section>('dashboard')
  const [token,     setToken]    = useState<string | null>(null)
  const [metrics,   setMetrics]  = useState<Metrics | null>(null)
  const [stripe,    setStripe]   = useState<StripeData | null>(null)
  const [loading,   setLoading]  = useState(true)
  const [error,     setError]    = useState<string | null>(null)
  const [pending,   setPending]  = useState(0)
  const [lastSync,  setLastSync] = useState<Date | null>(null)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => { getToken().then(setToken) }, [])

  const loadData = useCallback(async (tok: string, silent = false) => {
    if (!silent) setLoading(true)
    setError(null)
    try {
      const [m, s] = await Promise.all([
        apiFetch<Metrics>('/api/admin/metrics', tok),
        apiFetch<StripeData>('/api/admin/stripe', tok),
      ])
      setMetrics(m); setStripe(s)
      setPending(m.users.pendingApprovals)
      setLastSync(new Date())
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur de chargement')
    } finally {
      if (!silent) setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!token) return
    void loadData(token)
    // Auto-refresh toutes les 60 s
    intervalRef.current = setInterval(() => void loadData(token, true), 60000)
    return () => { if (intervalRef.current) clearInterval(intervalRef.current) }
  }, [token, loadData])

  const sectionTitle: Record<Section, string> = {
    dashboard: 'Vue d\'ensemble',
    pending:   'Inscriptions en attente',
    users:     'Utilisateurs',
    revenue:   'Revenus',
    activity:  'Activité plateforme',
    search:    'Recherche contacts',
  }

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-gray-950 text-white">

      {/* ── Top bar ────────────────────────────────────────────────────────── */}
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-gray-800 bg-gray-950 px-6">
        <div className="flex items-center gap-4">
          <img src={trouveLogo} alt="trouvé!" className="h-6 w-auto brightness-0 invert" />
          <div className="h-4 w-px bg-gray-800" />
          <div className="flex items-center gap-2">
            <Shield size={12} className="text-purple-400" />
            <span className="text-xs font-bold uppercase tracking-widest text-purple-400">CRM Admin</span>
          </div>
        </div>
        <div className="flex items-center gap-4">
          {lastSync && (
            <div className="flex items-center gap-1.5 text-[11px] text-gray-600">
              <Wifi size={10} className="text-emerald-500" />
              Sync {lastSync.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
            </div>
          )}
          <button onClick={() => { if (token) void loadData(token) }}
            className="flex items-center gap-1.5 rounded-lg border border-gray-800 px-3 py-1.5 text-xs text-gray-500 transition hover:border-gray-700 hover:text-gray-300">
            <RefreshCw size={12} /> Actualiser
          </button>
          <span className="text-xs text-gray-600">{account.email}</span>
          <button onClick={onLogout}
            className="flex items-center gap-1.5 rounded-lg border border-gray-800 px-3 py-1.5 text-xs text-gray-500 transition hover:border-red-900 hover:text-red-400">
            <LogOut size={12} /> Quitter le CRM
          </button>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">

        {/* ── Left sidebar ─────────────────────────────────────────────────── */}
        <nav className="flex w-56 shrink-0 flex-col border-r border-gray-800 bg-gray-950 py-4">
          <div className="space-y-0.5 px-3">
            {NAV_ITEMS.map(({ id, icon: Icon, label, badge }) => (
              <button
                key={id}
                onClick={() => setSection(id)}
                className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${
                  section === id
                    ? 'bg-blue-600/15 text-blue-400'
                    : 'text-gray-500 hover:bg-gray-900 hover:text-gray-300'
                }`}
              >
                <Icon size={15} className={section === id ? 'text-blue-400' : ''} />
                <span className="flex-1 text-left">{label}</span>
                {badge && pending > 0 && (
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-amber-500 text-[10px] font-bold text-white">
                    {pending > 9 ? '9+' : pending}
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* Bottom info */}
          <div className="mt-auto border-t border-gray-800 px-5 pt-4">
            <p className="text-[11px] text-gray-700">trouvé! Back-office</p>
            <p className="text-[11px] text-gray-700">Connecté : {account.email}</p>
          </div>
        </nav>

        {/* ── Main content ──────────────────────────────────────────────────── */}
        <main className="flex flex-1 flex-col overflow-hidden">

          {/* Page header */}
          <div className="flex h-12 shrink-0 items-center border-b border-gray-800 px-8">
            <h1 className="text-sm font-semibold text-gray-200">{sectionTitle[section]}</h1>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-hidden">
            {loading && section !== 'search' ? (
              <div className="flex h-full items-center justify-center">
                <div className="text-center">
                  <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
                  <p className="mt-3 text-xs text-gray-600">Chargement des données…</p>
                </div>
              </div>
            ) : error ? (
              <div className="flex h-full flex-col items-center justify-center gap-4">
                <AlertCircle size={28} className="text-red-500" />
                <p className="text-sm font-semibold text-gray-300">Accès refusé ou erreur réseau</p>
                <p className="text-xs text-gray-600">{error}</p>
                <button onClick={() => { if (token) void loadData(token) }}
                  className="flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 transition">
                  <RefreshCw size={13} /> Réessayer
                </button>
              </div>
            ) : (
              <div className="h-full overflow-y-auto">
                {section === 'dashboard' && (
                  <DashboardSection metrics={metrics} stripe={stripe} onNavigate={setSection} />
                )}
                {(section === 'users' || section === 'pending') && token && (
                  <UsersSection
                    key={section}
                    token={token}
                    statusFilter={section === 'pending' ? 'pending' : undefined}
                    onCountUpdate={n => { if (section === 'pending') setPending(n) }}
                  />
                )}
                {section === 'revenue' && <RevenueSection stripe={stripe} />}
                {section === 'activity' && <ActivitySection metrics={metrics} />}
                {section === 'search' && <SearchSection />}
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  )
}
