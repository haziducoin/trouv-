import { useState, useEffect, useCallback, useRef } from 'react'
import {
  Search, Users, TrendingUp, CreditCard, LogOut, RefreshCw,
  X, ChevronRight, Building2, MapPin, Phone, Mail, Globe,
  Check, Ban, Shield, Clock, ArrowUpRight, ArrowDownRight,
  Minus, SlidersHorizontal, ExternalLink, Activity, Zap,
  ChevronDown, LayoutDashboard, FileSearch,
} from 'lucide-react'
import { getSupabaseClient } from '@/lib/supabase'
import { searchProspects, type ProspectResult, type ProspectSearchParams } from '@/lib/prospectApi'
import { DEPARTMENTS } from '@/lib/searchApi'
import type { Account } from '@/lib/accountStore'
import trouveLogo from '@/assets/trouve-logo.png'

// ─── Types ────────────────────────────────────────────────────────────────────

interface PlatformMetrics {
  users: { total: number; newThisMonth: number; pendingApprovals: number }
  activity: { searchesThisMonth: number; unlocksThisMonth: number }
  credits: { thisMonth: number; lastMonth: number; byType: { phone: number; email: number } }
  topOrgs: Array<{ organizationId: string; name: string; searchesUsed: number }>
  recentSearches: Array<{ id: string; queryLabel: string; filters: Record<string,unknown>; resultCount: number; createdAt: string; userEmail: string }>
}

interface StripeMetrics {
  mrr: { euros: string }
  revenue: { thisMonthEuros: string }
  subscriptions: { active: number; newThisMonth: number; canceledThisMonth: number }
  recentCharges: Array<{ id: string; amountEuros: string; description: string; createdAt: string; paid: boolean; refunded: boolean }>
}

interface CRMUser {
  id: string; email: string; firstName: string; lastName: string
  role: string; status: string; quota: number; monthlyUsage: number
  createdAt: string; lastLoginAt: string | null
  organization: { siren: string; name: string; active: boolean } | null
}

type PanelView = 'metrics' | 'users' | 'revenue' | 'activity' | 'prospect'
type NavItem = { id: PanelView; icon: React.ElementType; label: string }

const NAV: NavItem[] = [
  { id: 'metrics',  icon: LayoutDashboard, label: 'Vue d\'ensemble' },
  { id: 'users',    icon: Users,           label: 'Utilisateurs'    },
  { id: 'revenue',  icon: CreditCard,      label: 'Revenus'         },
  { id: 'activity', icon: Activity,        label: 'Activité'        },
]

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function getToken() {
  const { data: { session } } = await getSupabaseClient().auth.getSession()
  return session?.access_token ?? null
}

async function apiFetch<T>(path: string, token: string): Promise<T> {
  const r = await fetch(path, { headers: { Authorization: `Bearer ${token}` } })
  if (!r.ok) throw new Error((await r.json()).error ?? r.statusText)
  return r.json() as Promise<T>
}

async function apiPost(path: string, token: string, body: unknown) {
  const r = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  })
  if (!r.ok) throw new Error((await r.json()).error ?? r.statusText)
}

function rel(iso: string) {
  const d = Date.now() - new Date(iso).getTime()
  const m = Math.floor(d / 60000)
  if (m < 1) return 'À l\'instant'
  if (m < 60) return `${m} min`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h`
  const days = Math.floor(h / 24)
  return days < 30 ? `${days}j` : new Date(iso).toLocaleDateString('fr-FR', { day:'2-digit', month:'short' })
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function Kpi({ label, value, sub, up }: { label: string; value: string | number; sub?: string; up?: number | null }) {
  return (
    <div className="rounded-xl border border-gray-800 bg-gray-900 p-4">
      <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">{label}</p>
      <p className="mt-1.5 text-2xl font-bold text-white">{value}</p>
      {sub && <p className="mt-0.5 text-xs text-gray-500">{sub}</p>}
      {up !== undefined && up !== null && (
        <div className={`mt-1 flex items-center gap-0.5 text-xs font-medium ${up > 0 ? 'text-emerald-400' : up < 0 ? 'text-red-400' : 'text-gray-500'}`}>
          {up > 0 ? <ArrowUpRight size={11} /> : up < 0 ? <ArrowDownRight size={11} /> : <Minus size={11} />}
          {Math.abs(up)}% vs mois précédent
        </div>
      )}
    </div>
  )
}

function StatusDot({ status }: { status: string }) {
  const c = { approved: 'bg-emerald-400', pending: 'bg-amber-400', blocked: 'bg-red-500', rejected: 'bg-gray-600' }
  return <span className={`inline-block h-1.5 w-1.5 rounded-full ${c[status as keyof typeof c] ?? 'bg-gray-600'}`} />
}

// ─── Right panel sections ─────────────────────────────────────────────────────

function MetricsPanel({ metrics, stripe }: { metrics: PlatformMetrics | null; stripe: StripeMetrics | null }) {
  if (!metrics || !stripe) return (
    <div className="flex h-full items-center justify-center">
      <div className="h-5 w-5 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
    </div>
  )
  const credUp = metrics.credits.lastMonth > 0
    ? Math.round(((metrics.credits.thisMonth - metrics.credits.lastMonth) / metrics.credits.lastMonth) * 100)
    : null

  return (
    <div className="space-y-3 p-4">
      <p className="text-[10px] font-bold uppercase tracking-widest text-gray-500">Vue d'ensemble</p>
      <div className="grid grid-cols-2 gap-2">
        <Kpi label="MRR" value={`${stripe.mrr.euros} €`} sub={`${stripe.subscriptions.active} abonnements`} />
        <Kpi label="CA ce mois" value={`${stripe.revenue.thisMonthEuros} €`} />
        <Kpi label="Utilisateurs" value={metrics.users.total} sub={`+${metrics.users.newThisMonth} ce mois`} />
        <Kpi label="Crédits" value={metrics.credits.thisMonth} up={credUp} />
      </div>
      {metrics.users.pendingApprovals > 0 && (
        <div className="flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2.5">
          <Clock size={13} className="text-amber-400 shrink-0" />
          <p className="text-xs text-amber-300 font-medium">
            {metrics.users.pendingApprovals} compte{metrics.users.pendingApprovals > 1 ? 's' : ''} en attente
          </p>
        </div>
      )}
      <p className="pt-1 text-[10px] font-bold uppercase tracking-widest text-gray-500">Activité ce mois</p>
      <div className="space-y-2">
        <div className="flex items-center justify-between rounded-lg bg-gray-900 px-3 py-2.5">
          <div className="flex items-center gap-2 text-xs text-gray-400"><Search size={12} />Recherches</div>
          <span className="text-sm font-bold text-white">{metrics.activity.searchesThisMonth.toLocaleString('fr-FR')}</span>
        </div>
        <div className="flex items-center justify-between rounded-lg bg-gray-900 px-3 py-2.5">
          <div className="flex items-center gap-2 text-xs text-gray-400"><Zap size={12} />Déblocages</div>
          <span className="text-sm font-bold text-white">{metrics.activity.unlocksThisMonth.toLocaleString('fr-FR')}</span>
        </div>
        <div className="flex items-center justify-between rounded-lg bg-gray-900 px-3 py-2.5">
          <div className="flex items-center gap-2 text-xs text-gray-400"><Phone size={12} />Tél débloqués</div>
          <span className="text-sm font-bold text-white">{metrics.credits.byType.phone}</span>
        </div>
        <div className="flex items-center justify-between rounded-lg bg-gray-900 px-3 py-2.5">
          <div className="flex items-center gap-2 text-xs text-gray-400"><Mail size={12} />Emails débloqués</div>
          <span className="text-sm font-bold text-white">{metrics.credits.byType.email}</span>
        </div>
      </div>
      <p className="pt-1 text-[10px] font-bold uppercase tracking-widest text-gray-500">Top organisations</p>
      <div className="space-y-1">
        {metrics.topOrgs.slice(0, 5).map((o, i) => (
          <div key={o.organizationId} className="flex items-center gap-2 rounded-lg px-3 py-2 hover:bg-gray-900">
            <span className="w-4 text-right text-[10px] font-bold text-gray-600">{i + 1}</span>
            <span className="flex-1 truncate text-xs text-gray-300">{o.name}</span>
            <span className="text-xs font-semibold text-white">{o.searchesUsed}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function UsersPanel({ token, onRefresh }: { token: string; onRefresh?: () => void }) {
  const [users, setUsers] = useState<CRMUser[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'all' | 'pending' | 'approved'>('all')
  const [busy, setBusy] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ limit: '30' })
      if (filter !== 'all') params.set('status', filter)
      const d = await apiFetch<{ users: CRMUser[] }>(`/api/admin/users?${params}`, token)
      setUsers(d.users)
    } catch { /* silent */ }
    finally { setLoading(false) }
  }, [token, filter])

  useEffect(() => { void load() }, [load])

  const act = async (userId: string, action: string, value?: string) => {
    setBusy(userId)
    try {
      await apiPost('/api/admin/users', token, { userId, action, value })
      await load()
      onRefresh?.()
    } catch { /* silent */ }
    finally { setBusy(null) }
  }

  return (
    <div className="flex h-full flex-col">
      <div className="p-4 space-y-3">
        <p className="text-[10px] font-bold uppercase tracking-widest text-gray-500">Utilisateurs</p>
        <div className="flex gap-1 rounded-lg bg-gray-900 p-0.5">
          {(['all', 'pending', 'approved'] as const).map(f => (
            <button key={f} onClick={() => setFilter(f)}
              className={`flex-1 rounded-md py-1 text-[11px] font-medium transition ${
                filter === f ? 'bg-gray-700 text-white' : 'text-gray-500 hover:text-gray-300'
              }`}>
              {{ all: 'Tous', pending: 'En attente', approved: 'Actifs' }[f]}
            </button>
          ))}
        </div>
      </div>
      <div className="flex-1 overflow-y-auto px-2 pb-4 space-y-1">
        {loading ? (
          <div className="flex justify-center py-12">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
          </div>
        ) : users.length === 0 ? (
          <p className="py-12 text-center text-xs text-gray-600">Aucun utilisateur</p>
        ) : users.map(u => (
          <div key={u.id} className="rounded-xl border border-gray-800 bg-gray-900 p-3 hover:border-gray-700 transition">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <StatusDot status={u.status} />
                  <p className="truncate text-xs font-semibold text-white">
                    {u.firstName} {u.lastName}
                  </p>
                </div>
                <p className="mt-0.5 truncate text-[11px] text-gray-500">{u.email}</p>
                {u.organization && (
                  <p className="mt-0.5 truncate text-[11px] text-gray-600">{u.organization.name}</p>
                )}
              </div>
              <div className="flex shrink-0 items-center gap-1">
                {u.status === 'pending' && (
                  <>
                    <button onClick={() => act(u.id, 'approve')} disabled={busy === u.id}
                      className="flex h-6 w-6 items-center justify-center rounded-md bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 disabled:opacity-50 transition">
                      <Check size={11} />
                    </button>
                    <button onClick={() => act(u.id, 'reject')} disabled={busy === u.id}
                      className="flex h-6 w-6 items-center justify-center rounded-md bg-red-500/20 text-red-400 hover:bg-red-500/30 disabled:opacity-50 transition">
                      <X size={11} />
                    </button>
                  </>
                )}
                {u.status === 'approved' && (
                  <button onClick={() => act(u.id, 'block')} disabled={busy === u.id}
                    className="flex h-6 w-6 items-center justify-center rounded-md bg-gray-800 text-gray-500 hover:bg-red-500/20 hover:text-red-400 disabled:opacity-50 transition">
                    <Ban size={11} />
                  </button>
                )}
              </div>
            </div>
            <div className="mt-2 flex items-center gap-2">
              <div className="h-1 flex-1 overflow-hidden rounded-full bg-gray-800">
                <div className="h-full rounded-full bg-blue-600 transition-all"
                  style={{ width: `${Math.min(100, u.quota > 0 ? (u.monthlyUsage / u.quota) * 100 : 0)}%` }} />
              </div>
              <span className="text-[10px] text-gray-600">{u.monthlyUsage}/{u.quota}</span>
              {u.lastLoginAt && <span className="text-[10px] text-gray-600">{rel(u.lastLoginAt)}</span>}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function RevenuePanel({ stripe }: { stripe: StripeMetrics | null }) {
  if (!stripe) return <div className="flex h-full items-center justify-center"><div className="h-5 w-5 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" /></div>
  return (
    <div className="space-y-3 p-4">
      <p className="text-[10px] font-bold uppercase tracking-widest text-gray-500">Revenus Stripe</p>
      <div className="grid grid-cols-2 gap-2">
        <Kpi label="MRR" value={`${stripe.mrr.euros} €`} />
        <Kpi label="CA ce mois" value={`${stripe.revenue.thisMonthEuros} €`} />
        <Kpi label="Abonnements actifs" value={stripe.subscriptions.active} />
        <Kpi label="Nouveaux ce mois" value={stripe.subscriptions.newThisMonth} />
      </div>
      {stripe.subscriptions.canceledThisMonth > 0 && (
        <div className="flex items-center gap-2 rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2">
          <ArrowDownRight size={13} className="text-red-400 shrink-0" />
          <p className="text-xs text-red-300">{stripe.subscriptions.canceledThisMonth} annulation{stripe.subscriptions.canceledThisMonth > 1 ? 's' : ''} ce mois</p>
        </div>
      )}
      <p className="pt-1 text-[10px] font-bold uppercase tracking-widest text-gray-500">Derniers paiements</p>
      <div className="space-y-1">
        {stripe.recentCharges.map(c => (
          <div key={c.id} className="flex items-center gap-2 rounded-lg px-3 py-2.5 hover:bg-gray-900 transition">
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs text-gray-300">{c.description}</p>
              <p className="text-[10px] text-gray-600">{rel(c.createdAt)}</p>
            </div>
            <span className={`text-sm font-bold ${c.refunded ? 'text-gray-600 line-through' : c.paid ? 'text-white' : 'text-red-400'}`}>
              {c.amountEuros} €
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

function ActivityPanel({ metrics }: { metrics: PlatformMetrics | null }) {
  if (!metrics) return <div className="flex h-full items-center justify-center"><div className="h-5 w-5 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" /></div>
  return (
    <div className="space-y-3 p-4">
      <p className="text-[10px] font-bold uppercase tracking-widest text-gray-500">Flux d'activité</p>
      <div className="space-y-1">
        {metrics.recentSearches.map(s => (
          <div key={s.id} className="rounded-xl border border-gray-800 bg-gray-900 p-3 hover:border-gray-700 transition">
            <div className="flex items-start gap-2">
              <Search size={11} className="mt-0.5 shrink-0 text-blue-400" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-medium text-white">
                  {s.queryLabel === 'secteur immobilier' ? 'Tous secteurs' : `"${s.queryLabel}"`}
                </p>
                <p className="text-[10px] text-gray-500">{s.userEmail}</p>
                <div className="mt-1 flex items-center gap-2">
                  <span className="text-[10px] font-semibold text-blue-400">{s.resultCount.toLocaleString('fr-FR')} résultats</span>
                  {s.filters?.department && <span className="text-[10px] text-gray-600">Dép. {s.filters.department as string}</span>}
                  <span className="ml-auto text-[10px] text-gray-600">{rel(s.createdAt)}</span>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function ProspectPanel({ prospect, onClose }: { prospect: ProspectResult; onClose: () => void }) {
  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-gray-800 p-4">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-gray-500">Fiche contact</p>
            <p className="mt-1 text-base font-bold text-white">{prospect.fullName}</p>
            {prospect.jobTitle && <p className="text-xs text-gray-400">{prospect.jobTitle}</p>}
          </div>
          <button onClick={onClose} className="rounded-lg p-1 text-gray-600 hover:bg-gray-800 hover:text-gray-300 transition">
            <X size={14} />
          </button>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {prospect.companyName && (
          <div className="rounded-xl border border-gray-800 bg-gray-900 p-3 space-y-2">
            <p className="text-[10px] font-bold uppercase tracking-widest text-gray-500">Entreprise</p>
            <div className="flex items-center gap-2">
              <Building2 size={13} className="text-gray-500 shrink-0" />
              <p className="text-sm font-medium text-white">{prospect.companyName}</p>
            </div>
            {prospect.companySiren && (
              <p className="text-xs text-gray-500">SIREN : {prospect.companySiren}</p>
            )}
            {prospect.activityLabel && (
              <p className="text-xs text-gray-500">{prospect.activityLabel}</p>
            )}
            {prospect.companySize && (
              <p className="text-xs text-gray-500">{prospect.companySize} salariés</p>
            )}
          </div>
        )}

        {(prospect.city || prospect.address) && (
          <div className="rounded-xl border border-gray-800 bg-gray-900 p-3 space-y-2">
            <p className="text-[10px] font-bold uppercase tracking-widest text-gray-500">Localisation</p>
            {prospect.address && (
              <div className="flex items-center gap-2">
                <MapPin size={13} className="text-gray-500 shrink-0" />
                <p className="text-xs text-gray-300">{prospect.address}</p>
              </div>
            )}
            {prospect.city && (
              <p className="text-xs text-gray-400">{prospect.zipCode} {prospect.city} — {prospect.department}</p>
            )}
          </div>
        )}

        <div className="rounded-xl border border-gray-800 bg-gray-900 p-3 space-y-2">
          <p className="text-[10px] font-bold uppercase tracking-widest text-gray-500">Coordonnées</p>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Phone size={13} className={prospect.hasPhone ? 'text-blue-400' : 'text-gray-700'} />
              <span className="text-xs text-gray-300">
                {prospect.phoneUnlocked && prospect.phone ? prospect.phone : prospect.hasPhone ? '••••••••' : 'Non disponible'}
              </span>
            </div>
            {!prospect.phoneUnlocked && prospect.hasPhone && (
              <span className="rounded-md bg-blue-600/20 px-2 py-0.5 text-[10px] font-semibold text-blue-400">Crédit requis</span>
            )}
          </div>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Mail size={13} className={prospect.hasEmail ? 'text-blue-400' : 'text-gray-700'} />
              <span className="text-xs text-gray-300">
                {prospect.emailUnlocked && prospect.email ? prospect.email : prospect.hasEmail ? '••••••••' : 'Non disponible'}
              </span>
            </div>
            {!prospect.emailUnlocked && prospect.hasEmail && (
              <span className="rounded-md bg-blue-600/20 px-2 py-0.5 text-[10px] font-semibold text-blue-400">Crédit requis</span>
            )}
          </div>
          {prospect.linkedinUrl && (
            <a href={prospect.linkedinUrl} target="_blank" rel="noreferrer"
              className="flex items-center gap-2 text-xs text-blue-400 hover:text-blue-300 transition">
              <ExternalLink size={12} /> LinkedIn
            </a>
          )}
          {prospect.website && (
            <a href={prospect.website.startsWith('http') ? prospect.website : `https://${prospect.website}`}
              target="_blank" rel="noreferrer"
              className="flex items-center gap-2 text-xs text-gray-400 hover:text-gray-300 transition">
              <Globe size={12} /> {prospect.website}
            </a>
          )}
        </div>

        <div className="flex items-center gap-2 rounded-xl border border-gray-800 bg-gray-900 px-3 py-2.5">
          <div className={`h-2 w-2 rounded-full ${prospect.isActive ? 'bg-emerald-400' : 'bg-red-500'}`} />
          <p className="text-xs text-gray-400">
            Société {prospect.isActive ? 'active' : 'radiée'}
          </p>
        </div>
      </div>
    </div>
  )
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function AdminCRMPage({ account, onLogout }: { account: Account; onLogout: () => void }) {
  const [token,       setToken]    = useState<string | null>(null)
  const [metrics,     setMetrics]  = useState<PlatformMetrics | null>(null)
  const [stripe,      setStripe]   = useState<StripeMetrics | null>(null)
  const [panelView,   setPanelView] = useState<PanelView>('metrics')
  const [panelOpen,   setPanelOpen] = useState(true)
  const [selectedProspect, setProspect] = useState<ProspectResult | null>(null)

  // Search state
  const [query,       setQuery]    = useState('')
  const [department,  setDept]     = useState('')
  const [results,     setResults]  = useState<ProspectResult[]>([])
  const [total,       setTotal]    = useState(0)
  const [searching,   setSearching] = useState(false)
  const [searched,    setSearched] = useState(false)
  const [showFilters, setShowFilters] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { getToken().then(setToken) }, [])

  const loadData = useCallback(async (tok: string) => {
    try {
      const [m, s] = await Promise.all([
        apiFetch<PlatformMetrics>('/api/admin/metrics', tok),
        apiFetch<StripeMetrics>('/api/admin/stripe', tok),
      ])
      setMetrics(m); setStripe(s)
    } catch { /* silent — already admin-verified at render */ }
  }, [])

  useEffect(() => { if (token) void loadData(token) }, [token, loadData])

  const doSearch = useCallback(async (params: Partial<ProspectSearchParams> = {}) => {
    const q = params.query ?? query
    if (!q.trim() && !params.department && !department) return
    setSearching(true); setSearched(true)
    try {
      const res = await searchProspects({ query: q || 'secteur immobilier', department: params.department ?? department, page: 1, perPage: 30 })
      setResults(res.results); setTotal(res.total)
    } catch { setResults([]); setTotal(0) }
    finally { setSearching(false) }
  }, [query, department])

  const openProspect = (p: ProspectResult) => {
    setProspect(p)
    setPanelView('prospect')
    setPanelOpen(true)
  }

  const navTo = (id: PanelView) => {
    setProspect(null)
    setPanelView(id)
    setPanelOpen(true)
  }

  return (
    <div className="flex h-screen flex-col bg-gray-950 text-white overflow-hidden">

      {/* ── Top bar ──────────────────────────────────────────────────────── */}
      <header className="flex h-12 shrink-0 items-center justify-between border-b border-gray-800 bg-gray-950 px-4">
        <div className="flex items-center gap-3">
          <img src={trouveLogo} alt="trouvé!" className="h-5 w-auto brightness-0 invert" />
          <div className="flex items-center gap-1.5 rounded-md border border-purple-500/30 bg-purple-500/10 px-2 py-0.5">
            <Shield size={10} className="text-purple-400" />
            <span className="text-[10px] font-bold uppercase tracking-widest text-purple-400">CRM Admin</span>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {metrics && metrics.users.pendingApprovals > 0 && (
            <button onClick={() => navTo('users')}
              className="flex items-center gap-1.5 rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 text-[11px] font-medium text-amber-300 hover:bg-amber-500/20 transition">
              <Clock size={10} />
              {metrics.users.pendingApprovals} en attente
            </button>
          )}
          <button onClick={() => { if (token) void loadData(token) }}
            className="rounded-lg p-1.5 text-gray-500 hover:bg-gray-800 hover:text-gray-300 transition">
            <RefreshCw size={13} />
          </button>
          <span className="text-xs text-gray-500">{account.email}</span>
          <button onClick={onLogout}
            className="flex items-center gap-1.5 rounded-lg border border-gray-800 px-2.5 py-1 text-xs text-gray-500 transition hover:border-gray-700 hover:text-gray-300">
            <LogOut size={12} /> Quitter
          </button>
        </div>
      </header>

      {/* ── Body ─────────────────────────────────────────────────────────── */}
      <div className="flex flex-1 overflow-hidden">

        {/* ── Left icon nav ──────────────────────────────────────────────── */}
        <nav className="flex w-14 shrink-0 flex-col items-center gap-1 border-r border-gray-800 bg-gray-950 py-3">
          {NAV.map(({ id, icon: Icon, label }) => (
            <button key={id} title={label}
              onClick={() => navTo(id)}
              className={`group relative flex h-9 w-9 items-center justify-center rounded-lg transition ${
                panelView === id && panelOpen
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-600 hover:bg-gray-800 hover:text-gray-300'
              }`}>
              <Icon size={16} />
              <span className="pointer-events-none absolute left-full ml-2 z-50 whitespace-nowrap rounded-md bg-gray-800 px-2 py-1 text-[11px] text-white opacity-0 shadow-lg group-hover:opacity-100 transition">
                {label}
              </span>
            </button>
          ))}
          <div className="mt-auto flex flex-col items-center gap-1">
            <button title="Recherche prospects"
              onClick={() => { setPanelOpen(false); inputRef.current?.focus() }}
              className="flex h-9 w-9 items-center justify-center rounded-lg text-gray-600 hover:bg-gray-800 hover:text-gray-300 transition">
              <FileSearch size={16} />
            </button>
          </div>
        </nav>

        {/* ── Main search area ──────────────────────────────────────────── */}
        <main className="flex flex-1 flex-col overflow-hidden">

          {/* Search bar */}
          <div className="border-b border-gray-800 bg-gray-950 px-6 py-3">
            <form onSubmit={e => { e.preventDefault(); void doSearch() }} className="flex items-center gap-3">
              <div className="relative flex-1">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
                <input
                  ref={inputRef}
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                  placeholder="Nom, prénom, ville, SIREN, téléphone…"
                  className="h-9 w-full rounded-lg border border-gray-800 bg-gray-900 pl-9 pr-3 text-sm text-white placeholder-gray-600 focus:border-blue-600 focus:outline-none transition"
                />
              </div>
              <select value={department} onChange={e => { setDept(e.target.value); void doSearch({ department: e.target.value }) }}
                className="h-9 rounded-lg border border-gray-800 bg-gray-900 px-2 text-sm text-gray-300 focus:border-blue-600 focus:outline-none transition">
                <option value="">Tous dépts</option>
                {DEPARTMENTS.map(d => <option key={d.code} value={d.code}>{d.label}</option>)}
              </select>
              <button type="submit" disabled={searching}
                className="flex h-9 items-center gap-1.5 rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:opacity-60">
                {searching ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" /> : <Search size={13} />}
                Rechercher
              </button>
              <button type="button" onClick={() => setShowFilters(v => !v)}
                className={`flex h-9 items-center gap-1.5 rounded-lg border px-3 text-xs transition ${showFilters ? 'border-blue-600 text-blue-400' : 'border-gray-800 text-gray-500 hover:border-gray-700 hover:text-gray-300'}`}>
                <SlidersHorizontal size={12} /> Filtres
              </button>
            </form>
          </div>

          {/* Results */}
          <div className="flex-1 overflow-y-auto px-6 py-4">
            {!searched && (
              <div className="flex h-full flex-col items-center justify-center gap-4 text-center">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-gray-800 bg-gray-900">
                  <Search size={22} className="text-gray-600" />
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-400">Lancez une recherche</p>
                  <p className="mt-1 text-xs text-gray-600">Nom, prénom, ville, SIREN ou numéro de téléphone</p>
                </div>
                <div className="grid grid-cols-3 gap-2 mt-2">
                  {['Paris 16', 'Marseille', 'Cabinet Rivoli', 'Lyon immobilier', 'Bordeaux agence', 'ORPI'].map(s => (
                    <button key={s} onClick={() => { setQuery(s); void doSearch({ query: s }) }}
                      className="rounded-lg border border-gray-800 bg-gray-900 px-3 py-1.5 text-xs text-gray-500 transition hover:border-gray-700 hover:text-gray-300">
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {searched && (
              <>
                {total > 0 && (
                  <div className="mb-3 flex items-center justify-between">
                    <p className="text-xs text-gray-500">
                      <span className="font-semibold text-white">{total.toLocaleString('fr-FR')}</span> résultat{total > 1 ? 's' : ''}
                    </p>
                    <button onClick={() => { setSearched(false); setResults([]); setQuery('') }}
                      className="text-xs text-gray-600 hover:text-gray-400 transition">
                      Effacer
                    </button>
                  </div>
                )}
                {searching ? (
                  <div className="flex justify-center py-16">
                    <div className="h-6 w-6 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
                  </div>
                ) : results.length === 0 ? (
                  <div className="flex flex-col items-center py-16 text-center">
                    <p className="text-sm text-gray-500">Aucun résultat</p>
                    <p className="mt-1 text-xs text-gray-600">Essayez avec d'autres termes</p>
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    {results.map(r => (
                      <button key={r.id} onClick={() => openProspect(r)}
                        className={`group w-full rounded-xl border p-3 text-left transition ${
                          selectedProspect?.id === r.id
                            ? 'border-blue-600 bg-blue-600/10'
                            : 'border-gray-800 bg-gray-900 hover:border-gray-700'
                        }`}>
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <p className="font-semibold text-white text-sm">{r.fullName}</p>
                              {r.jobTitle && <span className="text-xs text-gray-500">· {r.jobTitle}</span>}
                            </div>
                            {r.companyName && (
                              <p className="mt-0.5 text-xs text-gray-400">{r.companyName}</p>
                            )}
                            <div className="mt-1 flex items-center gap-3">
                              {r.city && (
                                <span className="flex items-center gap-1 text-[11px] text-gray-600">
                                  <MapPin size={9} />{r.city}
                                </span>
                              )}
                              {r.hasPhone && (
                                <span className="flex items-center gap-1 text-[11px] text-blue-500">
                                  <Phone size={9} />{r.phoneUnlocked ? r.phone : 'Tél.'}
                                </span>
                              )}
                              {r.hasEmail && (
                                <span className="flex items-center gap-1 text-[11px] text-blue-500">
                                  <Mail size={9} />{r.emailUnlocked ? r.email : 'Email'}
                                </span>
                              )}
                              <div className={`ml-auto h-1.5 w-1.5 rounded-full ${r.isActive ? 'bg-emerald-400' : 'bg-red-600'}`} />
                            </div>
                          </div>
                          <ChevronRight size={14} className="mt-1 shrink-0 text-gray-700 group-hover:text-gray-400 transition" />
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        </main>

        {/* ── Right panel ──────────────────────────────────────────────── */}
        <aside className={`flex flex-col border-l border-gray-800 bg-gray-950 transition-all duration-300 overflow-hidden ${panelOpen ? 'w-80' : 'w-0'}`}>
          {panelOpen && (
            <div className="flex h-full flex-col">
              <div className="flex h-10 shrink-0 items-center justify-between border-b border-gray-800 px-3">
                <div className="flex items-center gap-1">
                  {NAV.map(({ id, icon: Icon }) => (
                    <button key={id} onClick={() => { setPanelView(id); setProspect(null) }}
                      className={`flex h-6 w-6 items-center justify-center rounded-md transition ${
                        panelView === id && !selectedProspect ? 'bg-gray-800 text-white' : 'text-gray-600 hover:text-gray-400'
                      }`}>
                      <Icon size={12} />
                    </button>
                  ))}
                </div>
                <button onClick={() => setPanelOpen(false)}
                  className="rounded-md p-1 text-gray-600 hover:bg-gray-800 hover:text-gray-300 transition">
                  <ChevronRight size={14} />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto">
                {selectedProspect && panelView === 'prospect'
                  ? <ProspectPanel prospect={selectedProspect} onClose={() => { setProspect(null); setPanelView('metrics') }} />
                  : panelView === 'metrics'  ? <MetricsPanel metrics={metrics} stripe={stripe} />
                  : panelView === 'users'    ? <UsersPanel token={token ?? ''} onRefresh={() => { if (token) void loadData(token) }} />
                  : panelView === 'revenue'  ? <RevenuePanel stripe={stripe} />
                  : panelView === 'activity' ? <ActivityPanel metrics={metrics} />
                  : null
                }
              </div>
            </div>
          )}
          {!panelOpen && (
            <button onClick={() => setPanelOpen(true)}
              className="absolute right-0 top-1/2 -translate-y-1/2 flex h-16 w-5 items-center justify-center rounded-l-lg border border-r-0 border-gray-800 bg-gray-900 text-gray-600 hover:text-gray-300 transition">
              <ChevronDown size={12} className="-rotate-90" />
            </button>
          )}
        </aside>
      </div>
    </div>
  )
}
