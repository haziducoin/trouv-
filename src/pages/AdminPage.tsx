import { useState, useEffect, useCallback } from 'react'
import {
  Users, TrendingUp, Search, CreditCard, RefreshCw, Check, X,
  ChevronDown, AlertCircle, Shield, Building2, Clock,
  ArrowUpRight, ArrowDownRight, Minus, UserPlus, Phone, Mail, Eye, EyeOff, Copy,
} from 'lucide-react'
import { getSupabaseClient } from '@/lib/supabase'
import type { Account } from '@/lib/accountStore'

// ─── Types ────────────────────────────────────────────────────────────────────

interface MetricsData {
  users: { total: number; newThisMonth: number; pendingApprovals: number }
  activity: { searchesThisMonth: number; unlocksThisMonth: number }
  credits: {
    thisMonth: number; lastMonth: number
    byType: { phone: number; email: number }
  }
  topOrgs: Array<{ organizationId: string; name: string; searchesUsed: number }>
  recentSearches: Array<{
    id: string; queryLabel: string; filters: Record<string, unknown>
    resultCount: number; createdAt: string; userEmail: string
  }>
}

interface StripeData {
  mrr: { cents: number; euros: string }
  revenue: { thisMonthCents: number; thisMonthEuros: string }
  subscriptions: { active: number; newThisMonth: number; newLastMonth: number; canceledThisMonth: number }
  recentCharges: Array<{
    id: string; amountEuros: string; currency: string
    paid: boolean; refunded: boolean; description: string; createdAt: string
  }>
}

interface AdminUser {
  id: string; email: string; firstName: string; lastName: string
  functionTitle: string | null; role: string; status: string
  quota: number; createdAt: string; lastLoginAt: string | null
  cguAccepted: boolean; monthlyUsage: number
  organization: { siren: string; name: string; legalForm: string; active: boolean } | null
}

type StatusFilter = 'all' | 'pending' | 'approved' | 'blocked' | 'rejected'

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function getToken(): Promise<string | null> {
  const { data: { session } } = await getSupabaseClient().auth.getSession()
  return session?.access_token ?? null
}

async function apiGet<T>(path: string, token: string): Promise<T> {
  const r = await fetch(path, { headers: { Authorization: `Bearer ${token}` } })
  if (!r.ok) throw new Error((await r.json()).error ?? r.statusText)
  return r.json() as Promise<T>
}

async function apiPost(path: string, token: string, body: unknown): Promise<void> {
  const r = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  })
  if (!r.ok) throw new Error((await r.json()).error ?? r.statusText)
}

function formatRelative(iso: string) {
  const d = Date.now() - new Date(iso).getTime()
  const m = Math.floor(d / 60000)
  if (m < 1) return "À l'instant"
  if (m < 60) return `Il y a ${m} min`
  const h = Math.floor(m / 60)
  if (h < 24) return `Il y a ${h}h`
  const days = Math.floor(h / 24)
  if (days < 30) return `Il y a ${days}j`
  return new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: '2-digit' })
}

function delta(current: number, previous: number) {
  if (previous === 0) return null
  return Math.round(((current - previous) / previous) * 100)
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function KpiCard({
  icon: Icon, label, value, sub, trend, trendLabel, color = 'blue',
}: {
  icon: React.ElementType; label: string; value: string | number
  sub?: string; trend?: number | null; trendLabel?: string; color?: 'blue' | 'green' | 'amber' | 'red'
}) {
  const colors = {
    blue:  { bg: 'bg-blue-50',  icon: 'text-blue-600',  val: 'text-blue-700' },
    green: { bg: 'bg-green-50', icon: 'text-green-600', val: 'text-green-700' },
    amber: { bg: 'bg-amber-50', icon: 'text-amber-600', val: 'text-amber-700' },
    red:   { bg: 'bg-red-50',   icon: 'text-red-600',   val: 'text-red-700' },
  }
  const c = colors[color]
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between">
        <div className={`flex h-9 w-9 items-center justify-center rounded-lg ${c.bg}`}>
          <Icon size={16} className={c.icon} />
        </div>
        {trend !== undefined && trend !== null && (
          <div className={`flex items-center gap-0.5 text-xs font-medium ${
            trend > 0 ? 'text-green-600' : trend < 0 ? 'text-red-500' : 'text-gray-400'
          }`}>
            {trend > 0 ? <ArrowUpRight size={13} /> : trend < 0 ? <ArrowDownRight size={13} /> : <Minus size={13} />}
            {Math.abs(trend)}%
          </div>
        )}
      </div>
      <p className="mt-3 text-2xl font-bold text-gray-900">{value}</p>
      <p className="mt-0.5 text-sm font-medium text-gray-500">{label}</p>
      {(sub || trendLabel) && (
        <p className="mt-1 text-xs text-gray-400">{sub ?? trendLabel}</p>
      )}
    </div>
  )
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    approved: { label: 'Approuvé', cls: 'bg-green-50 text-green-700 border-green-200' },
    pending:  { label: 'En attente', cls: 'bg-amber-50 text-amber-700 border-amber-200' },
    blocked:  { label: 'Bloqué', cls: 'bg-red-50 text-red-600 border-red-200' },
    rejected: { label: 'Refusé', cls: 'bg-gray-100 text-gray-500 border-gray-200' },
    trial:    { label: 'Trial', cls: 'bg-blue-50 text-blue-600 border-blue-200' },
  }
  const s = map[status] ?? { label: status, cls: 'bg-gray-100 text-gray-500 border-gray-200' }
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${s.cls}`}>
      {s.label}
    </span>
  )
}

function RoleBadge({ role }: { role: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    admin:  { label: 'Admin', cls: 'bg-purple-50 text-purple-700' },
    agence: { label: 'Agence', cls: 'bg-blue-50 text-blue-700' },
    agent:  { label: 'Agent', cls: 'bg-gray-100 text-gray-600' },
  }
  const s = map[role] ?? { label: role, cls: 'bg-gray-100 text-gray-600' }
  return (
    <span className={`inline-flex items-center rounded-md px-1.5 py-0.5 text-xs font-semibold ${s.cls}`}>
      {s.label}
    </span>
  )
}

// ─── User action dropdown ──────────────────────────────────────────────────────

function UserActions({ user, token, onRefresh }: {
  user: AdminUser; token: string; onRefresh: () => void
}) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr]   = useState<string | null>(null)

  const act = async (action: string, value?: string | number) => {
    setBusy(true); setErr(null); setOpen(false)
    try {
      await apiPost('/api/admin/users', token, { userId: user.id, action, value })
      onRefresh()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Erreur')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="relative">
      {err && <p className="absolute -top-6 right-0 text-xs text-red-500 whitespace-nowrap">{err}</p>}
      <button
        onClick={() => setOpen(v => !v)}
        disabled={busy}
        className="flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-xs font-medium text-gray-600 transition hover:border-gray-300 hover:bg-gray-50 disabled:opacity-50"
      >
        {busy ? <span className="h-3 w-3 animate-spin rounded-full border border-gray-400 border-t-transparent" /> : 'Actions'}
        <ChevronDown size={11} />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-20 mt-1 w-44 rounded-xl border border-gray-200 bg-white py-1 shadow-lg">
            {user.status !== 'approved' && (
              <button onClick={() => act('approve')}
                className="flex w-full items-center gap-2 px-3 py-2 text-xs text-green-700 hover:bg-green-50">
                <Check size={12} /> Approuver
              </button>
            )}
            {user.status !== 'rejected' && (
              <button onClick={() => act('reject')}
                className="flex w-full items-center gap-2 px-3 py-2 text-xs text-gray-600 hover:bg-gray-50">
                <X size={12} /> Refuser
              </button>
            )}
            {user.status !== 'blocked' && (
              <button onClick={() => act('block')}
                className="flex w-full items-center gap-2 px-3 py-2 text-xs text-red-600 hover:bg-red-50">
                <X size={12} /> Bloquer
              </button>
            )}
            <div className="my-1 border-t border-gray-100" />
            {user.role !== 'agence' && (
              <button onClick={() => act('set_role', 'agence')}
                className="flex w-full items-center gap-2 px-3 py-2 text-xs text-blue-700 hover:bg-blue-50">
                <Building2 size={12} /> Passer Agence
              </button>
            )}
            {user.role !== 'agent' && (
              <button onClick={() => act('set_role', 'agent')}
                className="flex w-full items-center gap-2 px-3 py-2 text-xs text-gray-600 hover:bg-gray-50">
                <Users size={12} /> Passer Agent
              </button>
            )}
            <div className="my-1 border-t border-gray-100" />
            <button onClick={() => {
              const v = prompt('Nouveau quota mensuel :', String(user.quota))
              if (v !== null) act('set_quota', parseInt(v, 10))
            }}
              className="flex w-full items-center gap-2 px-3 py-2 text-xs text-gray-600 hover:bg-gray-50">
              <TrendingUp size={12} /> Modifier quota
            </button>
          </div>
        </>
      )}
    </div>
  )
}

// ─── Create user modal ────────────────────────────────────────────────────────

function CreateUserModal({ token, onClose, onCreated }: {
  token: string; onClose: () => void; onCreated: () => void
}) {
  const [email,        setEmail]      = useState('')
  const [password,     setPassword]   = useState('')
  const [showPwd,      setShowPwd]    = useState(false)
  const [phoneCr,      setPhoneCr]    = useState(50)
  const [emailCr,      setEmailCr]    = useState(50)
  const [unlimited,    setUnlimited]  = useState(false)
  const [busy,         setBusy]       = useState(false)
  const [error,        setError]      = useState<string | null>(null)
  const [result,       setResult]     = useState<{ email: string; tempPassword: string | null } | null>(null)
  const [copied,       setCopied]     = useState(false)

  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setBusy(true); setError(null)
    try {
      const r = await fetch('/api/admin/create-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          email: email.trim(),
          password: password.trim() || undefined,
          phoneCredits: unlimited ? 0 : phoneCr,
          emailCredits: unlimited ? 0 : emailCr,
          unlimited,
        }),
      })
      const json = await r.json()
      if (!r.ok) { setError(json.error ?? 'Erreur serveur'); return }
      setResult({ email: json.email, tempPassword: json.tempPassword })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur réseau')
    } finally {
      setBusy(false)
    }
  }

  const copy = (text: string) => {
    navigator.clipboard.writeText(text).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000) })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="relative w-full max-w-md rounded-2xl border border-gray-200 bg-white shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-50">
              <UserPlus size={15} className="text-blue-600" />
            </div>
            <h2 className="text-sm font-semibold text-gray-900">Créer un compte client</h2>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600">
            <X size={15} />
          </button>
        </div>

        {result ? (
          /* ── Succès ── */
          <div className="px-6 py-6">
            <div className="mb-4 flex items-center gap-2 rounded-xl bg-green-50 px-4 py-3">
              <Check size={15} className="shrink-0 text-green-600" />
              <p className="text-sm font-medium text-green-800">Compte créé avec succès</p>
            </div>
            <div className="space-y-3">
              <div>
                <p className="mb-1 text-xs font-medium text-gray-500">Email</p>
                <p className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm font-medium text-gray-800">
                  {result.email}
                </p>
              </div>
              {result.tempPassword && (
                <div>
                  <p className="mb-1 text-xs font-medium text-gray-500">Mot de passe temporaire</p>
                  <div className="flex items-center gap-2">
                    <p className="flex-1 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 font-mono text-sm font-semibold text-amber-800">
                      {result.tempPassword}
                    </p>
                    <button
                      onClick={() => copy(result.tempPassword!)}
                      className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-medium text-gray-600 hover:bg-gray-50"
                    >
                      <Copy size={12} />
                      {copied ? 'Copié !' : 'Copier'}
                    </button>
                  </div>
                  <p className="mt-1.5 text-xs text-amber-600">Communiquez ce mot de passe au client — il ne sera plus affiché.</p>
                </div>
              )}
            </div>
            <div className="mt-6 flex gap-2">
              <button
                onClick={() => { setResult(null); setEmail(''); setPassword(''); setPhoneCr(50); setEmailCr(50); setUnlimited(false) }}
                className="flex-1 rounded-xl border border-gray-200 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-50"
              >
                Créer un autre
              </button>
              <button onClick={() => { onCreated(); onClose() }}
                className="flex-1 rounded-xl bg-blue-600 py-2.5 text-sm font-semibold text-white hover:bg-blue-700">
                Fermer
              </button>
            </div>
          </div>
        ) : (
          /* ── Formulaire ── */
          <form onSubmit={submit} className="px-6 py-5 space-y-4">
            {/* Email */}
            <div>
              <label className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-gray-700">
                <Mail size={12} /> Email
              </label>
              <input
                type="email" required value={email} onChange={e => setEmail(e.target.value)}
                placeholder="client@exemple.fr"
                className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:bg-white focus:outline-none"
              />
            </div>

            {/* Mot de passe */}
            <div>
              <label className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-gray-700">
                <Eye size={12} /> Mot de passe <span className="text-gray-400 font-normal">(laisser vide pour générer)</span>
              </label>
              <div className="relative">
                <input
                  type={showPwd ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••••••"
                  className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 pr-10 text-sm text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:bg-white focus:outline-none"
                />
                <button type="button" onClick={() => setShowPwd(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                  {showPwd ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
            </div>

            {/* Crédits */}
            <div>
              <div className="mb-3 flex items-center justify-between">
                <label className="text-xs font-medium text-gray-700">Crédits alloués</label>
                <label className="flex cursor-pointer items-center gap-2">
                  <span className="text-xs text-gray-500">Illimité</span>
                  <button
                    type="button"
                    onClick={() => setUnlimited(v => !v)}
                    className={`relative h-5 w-9 rounded-full transition-colors ${unlimited ? 'bg-blue-600' : 'bg-gray-200'}`}
                  >
                    <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${unlimited ? 'translate-x-4' : 'translate-x-0.5'}`} />
                  </button>
                </label>
              </div>
              {!unlimited && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="mb-1 flex items-center gap-1 text-xs text-gray-500">
                      <Phone size={11} /> Téléphone
                    </label>
                    <input
                      type="number" min={0} max={99999} value={phoneCr}
                      onChange={e => setPhoneCr(Math.max(0, parseInt(e.target.value) || 0))}
                      className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm font-semibold text-gray-900 focus:border-blue-500 focus:bg-white focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="mb-1 flex items-center gap-1 text-xs text-gray-500">
                      <Mail size={11} /> Email
                    </label>
                    <input
                      type="number" min={0} max={99999} value={emailCr}
                      onChange={e => setEmailCr(Math.max(0, parseInt(e.target.value) || 0))}
                      className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm font-semibold text-gray-900 focus:border-blue-500 focus:bg-white focus:outline-none"
                    />
                  </div>
                </div>
              )}
              {unlimited && (
                <div className="rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-xs text-blue-700 font-medium">
                  Ce compte aura des déblocages illimités.
                </div>
              )}
            </div>

            {/* Résumé */}
            <div className="rounded-xl border border-gray-100 bg-gray-50 px-4 py-3 text-xs text-gray-500">
              Compte créé en statut <span className="font-semibold text-green-700">approuvé</span> — le client peut se connecter immédiatement.
            </div>

            {error && (
              <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-xs text-red-600">
                <AlertCircle size={13} /> {error}
              </div>
            )}

            <div className="flex gap-2 pt-1">
              <button type="button" onClick={onClose}
                className="flex-1 rounded-xl border border-gray-200 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-50">
                Annuler
              </button>
              <button type="submit" disabled={busy}
                className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-blue-600 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60">
                {busy
                  ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  : <><UserPlus size={14} /> Créer le compte</>
                }
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function AdminPage({ account }: { account: Account }) {
  const [token,       setToken]   = useState<string | null>(null)
  const [metrics,     setMetrics] = useState<MetricsData | null>(null)
  const [stripeData,  setStripe]  = useState<StripeData | null>(null)
  const [users,       setUsers]   = useState<AdminUser[]>([])
  const [userTotal,   setUserTotal] = useState(0)
  const [userPage,    setUserPage] = useState(1)
  const [statusFilter, setStatus] = useState<StatusFilter>('all')
  const [searchQuery, setSearchQ] = useState('')
  const [loading,     setLoading] = useState(true)
  const [usersLoading,setUsersL]  = useState(true)
  const [error,       setError]   = useState<string | null>(null)
  const [tab,         setTab]     = useState<'overview' | 'users' | 'searches'>('overview')
  const [showCreate,  setCreate]  = useState(false)

  // Charger le token JWT une fois
  useEffect(() => { getToken().then(setToken) }, [])

  // Charger métriques + stripe
  const loadDashboard = useCallback(async (tok: string) => {
    setLoading(true); setError(null)
    try {
      const [m, s] = await Promise.all([
        apiGet<MetricsData>('/api/admin/metrics', tok),
        apiGet<StripeData>('/api/admin/stripe', tok),
      ])
      setMetrics(m); setStripe(s)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur de chargement')
    } finally {
      setLoading(false)
    }
  }, [])

  // Charger liste utilisateurs
  const loadUsers = useCallback(async (tok: string, page: number, status: StatusFilter, search: string) => {
    setUsersL(true)
    try {
      const params = new URLSearchParams({ page: String(page), limit: '50' })
      if (status !== 'all') params.set('status', status)
      if (search.trim()) params.set('search', search.trim())
      const data = await apiGet<{ users: AdminUser[]; total: number }>(`/api/admin/users?${params}`, tok)
      setUsers(data.users); setUserTotal(data.total)
    } catch { /* silent — token invalide géré dans loadDashboard */ }
    finally { setUsersL(false) }
  }, [])

  useEffect(() => {
    if (!token) return
    void loadDashboard(token)
  }, [token, loadDashboard])

  useEffect(() => {
    if (!token || tab !== 'users') return
    void loadUsers(token, userPage, statusFilter, searchQuery)
  }, [token, tab, userPage, statusFilter, searchQuery, loadUsers])

  const refresh = () => {
    if (!token) return
    void loadDashboard(token)
    if (tab === 'users') void loadUsers(token, userPage, statusFilter, searchQuery)
  }

  // ── Loading / Error state ──────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center py-32">
        <div className="h-7 w-7 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 py-32 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-red-50">
          <AlertCircle size={24} className="text-red-500" />
        </div>
        <div>
          <p className="font-semibold text-gray-800">Accès refusé ou erreur réseau</p>
          <p className="mt-1 text-sm text-gray-400">{error}</p>
        </div>
        <button onClick={refresh}
          className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">
          <RefreshCw size={13} /> Réessayer
        </button>
      </div>
    )
  }

  const creditsUp = metrics ? delta(metrics.credits.thisMonth, metrics.credits.lastMonth) : null

  return (
    <div className="mx-auto max-w-6xl px-6 py-8">

      {/* Header */}
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Dashboard Admin</h1>
          <p className="mt-0.5 text-sm text-gray-400">
            Connecté en tant que <span className="font-medium text-gray-600">{account.email}</span>
          </p>
        </div>
        <button onClick={refresh}
          className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-medium text-gray-600 transition hover:border-gray-300 hover:bg-gray-50">
          <RefreshCw size={12} /> Actualiser
        </button>
      </div>

      {/* KPI cards */}
      {metrics && stripeData && (
        <div className="mb-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
          <KpiCard
            icon={CreditCard}
            label="MRR"
            value={`${stripeData.mrr.euros} €`}
            sub={`${stripeData.subscriptions.active} abonnements actifs`}
            color="green"
          />
          <KpiCard
            icon={Users}
            label="Utilisateurs approuvés"
            value={metrics.users.total}
            sub={`+${metrics.users.newThisMonth} ce mois`}
            color="blue"
          />
          <KpiCard
            icon={Search}
            label="Recherches ce mois"
            value={metrics.activity.searchesThisMonth.toLocaleString('fr-FR')}
            color="blue"
          />
          <KpiCard
            icon={TrendingUp}
            label="Crédits débloqués"
            value={metrics.credits.thisMonth}
            sub={`${metrics.credits.byType.phone} tél · ${metrics.credits.byType.email} email`}
            trend={creditsUp}
            trendLabel="vs mois précédent"
            color="amber"
          />
        </div>
      )}

      {/* Alertes */}
      {metrics && metrics.users.pendingApprovals > 0 && (
        <div
          className="mb-6 flex cursor-pointer items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 transition hover:border-amber-300"
          onClick={() => { setTab('users'); setStatus('pending') }}
          role="button"
        >
          <Clock size={15} className="shrink-0 text-amber-600" />
          <p className="text-sm font-medium text-amber-800">
            {metrics.users.pendingApprovals} compte{metrics.users.pendingApprovals > 1 ? 's' : ''} en attente de validation
          </p>
          <ArrowUpRight size={13} className="ml-auto text-amber-500" />
        </div>
      )}

      {/* Tabs */}
      <div className="mb-6 flex gap-1 rounded-xl border border-gray-200 bg-gray-50 p-1 w-fit">
        {(['overview', 'users', 'searches'] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`rounded-lg px-4 py-1.5 text-sm font-medium transition ${
              tab === t ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {{ overview: 'Vue d\'ensemble', users: 'Utilisateurs', searches: 'Recherches' }[t]}
          </button>
        ))}
      </div>

      {/* ── Tab : Vue d'ensemble ─────────────────────────────────────────────── */}
      {tab === 'overview' && stripeData && metrics && (
        <div className="grid gap-6 lg:grid-cols-2">

          {/* Stripe : CA + abonnements */}
          <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
            <div className="border-b border-gray-100 px-5 py-4">
              <h2 className="text-sm font-semibold text-gray-800">Revenus Stripe — mois courant</h2>
            </div>
            <div className="divide-y divide-gray-50 px-5">
              <div className="flex items-center justify-between py-3.5">
                <span className="text-sm text-gray-500">CA encaissé</span>
                <span className="font-semibold text-gray-900">{stripeData.revenue.thisMonthEuros} €</span>
              </div>
              <div className="flex items-center justify-between py-3.5">
                <span className="text-sm text-gray-500">Nouveaux abonnements</span>
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-gray-900">{stripeData.subscriptions.newThisMonth}</span>
                  {stripeData.subscriptions.newLastMonth > 0 && (
                    <span className="text-xs text-gray-400">vs {stripeData.subscriptions.newLastMonth} mois passé</span>
                  )}
                </div>
              </div>
              <div className="flex items-center justify-between py-3.5">
                <span className="text-sm text-gray-500">Annulations</span>
                <span className={`font-semibold ${stripeData.subscriptions.canceledThisMonth > 0 ? 'text-red-600' : 'text-gray-900'}`}>
                  {stripeData.subscriptions.canceledThisMonth}
                </span>
              </div>
            </div>
            {stripeData.recentCharges.length > 0 && (
              <>
                <div className="border-t border-gray-100 px-5 pt-4 pb-2">
                  <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">Derniers paiements</p>
                </div>
                <div className="divide-y divide-gray-50 px-5 pb-2">
                  {stripeData.recentCharges.slice(0, 5).map(c => (
                    <div key={c.id} className="flex items-center justify-between py-2.5">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs text-gray-700">{c.description}</p>
                        <p className="text-xs text-gray-400">{formatRelative(c.createdAt)}</p>
                      </div>
                      <div className="ml-4 flex items-center gap-2">
                        <span className={`text-xs font-semibold ${c.refunded ? 'text-gray-400 line-through' : 'text-gray-900'}`}>
                          {c.amountEuros} €
                        </span>
                        {!c.paid && <span className="text-xs text-red-500">Échoué</span>}
                        {c.refunded && <span className="text-xs text-gray-400">Remboursé</span>}
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>

          {/* Top orgs */}
          <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
            <div className="border-b border-gray-100 px-5 py-4">
              <h2 className="text-sm font-semibold text-gray-800">Top organisations ce mois</h2>
            </div>
            {metrics.topOrgs.length === 0 ? (
              <p className="px-5 py-8 text-center text-sm text-gray-400">Aucune donnée</p>
            ) : (
              <div className="divide-y divide-gray-50 px-5">
                {metrics.topOrgs.map((org, i) => (
                  <div key={org.organizationId} className="flex items-center gap-3 py-3">
                    <span className="w-5 shrink-0 text-right text-xs font-bold text-gray-300">
                      {i + 1}
                    </span>
                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-blue-50">
                      <Building2 size={12} className="text-blue-600" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-gray-800">{org.name}</p>
                    </div>
                    <span className="text-sm font-semibold text-gray-900">
                      {org.searchesUsed.toLocaleString('fr-FR')}
                    </span>
                    <span className="text-xs text-gray-400">recherches</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Tab : Utilisateurs ──────────────────────────────────────────────── */}
      {tab === 'users' && (
        <div>
          {/* Filters */}
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <input
              type="search"
              placeholder="Rechercher email, nom…"
              value={searchQuery}
              onChange={e => { setSearchQ(e.target.value); setUserPage(1) }}
              className="h-9 w-56 rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-800 placeholder-gray-400 focus:border-blue-500 focus:outline-none"
            />
            <div className="flex gap-1 rounded-lg border border-gray-200 bg-gray-50 p-0.5">
              {(['all', 'pending', 'approved', 'blocked', 'rejected'] as const).map(s => (
                <button
                  key={s}
                  onClick={() => { setStatus(s); setUserPage(1) }}
                  className={`rounded-md px-2.5 py-1 text-xs font-medium transition ${
                    statusFilter === s ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  {{ all: 'Tous', pending: 'En attente', approved: 'Approuvés', blocked: 'Bloqués', rejected: 'Refusés' }[s]}
                </button>
              ))}
            </div>
            <span className="text-xs text-gray-400">{userTotal} utilisateur{userTotal > 1 ? 's' : ''}</span>
            <button
              onClick={() => setCreate(true)}
              className="ml-auto flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-700"
            >
              <UserPlus size={12} /> Créer un compte
            </button>
          </div>

          {showCreate && token && (
            <CreateUserModal
              token={token}
              onClose={() => setCreate(false)}
              onCreated={() => loadUsers(token, userPage, statusFilter, searchQuery)}
            />
          )}

          {/* Table */}
          {usersLoading ? (
            <div className="flex items-center justify-center py-20">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
            </div>
          ) : users.length === 0 ? (
            <div className="rounded-xl border border-gray-200 bg-white py-16 text-center">
              <Users size={24} className="mx-auto mb-3 text-gray-300" />
              <p className="text-sm text-gray-400">Aucun utilisateur pour ces filtres</p>
            </div>
          ) : (
            <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50">
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-400">Utilisateur</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-400">Organisation</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-400">Rôle</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-400">Statut</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-400">Usage</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-400">Inscrit</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {users.map(u => (
                    <tr key={u.id} className="transition hover:bg-gray-50/50">
                      <td className="px-4 py-3">
                        <p className="font-medium text-gray-800">
                          {u.firstName} {u.lastName}
                        </p>
                        <p className="text-xs text-gray-400">{u.email}</p>
                        {u.functionTitle && (
                          <p className="text-xs text-gray-400">{u.functionTitle}</p>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {u.organization ? (
                          <>
                            <p className="font-medium text-gray-800 text-xs">{u.organization.name}</p>
                            <p className="text-xs text-gray-400">{u.organization.siren}</p>
                            {!u.organization.active && (
                              <span className="text-xs text-red-500">Radiée</span>
                            )}
                          </>
                        ) : (
                          <span className="text-xs text-gray-300">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <RoleBadge role={u.role} />
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge status={u.status} />
                        {!u.cguAccepted && (
                          <p className="mt-1 text-xs text-amber-500">CGU non signées</p>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5">
                          <div className="h-1.5 w-16 overflow-hidden rounded-full bg-gray-100">
                            <div
                              className="h-full rounded-full bg-blue-500 transition-all"
                              style={{ width: `${Math.min(100, u.quota > 0 ? (u.monthlyUsage / u.quota) * 100 : 0)}%` }}
                            />
                          </div>
                          <span className="text-xs text-gray-400">
                            {u.monthlyUsage}/{u.quota}
                          </span>
                        </div>
                        {u.lastLoginAt && (
                          <p className="mt-0.5 text-xs text-gray-400">
                            Connexion {formatRelative(u.lastLoginAt)}
                          </p>
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-400">
                        {formatRelative(u.createdAt)}
                      </td>
                      <td className="px-4 py-3">
                        {token && (
                          <UserActions
                            user={u}
                            token={token}
                            onRefresh={() => loadUsers(token, userPage, statusFilter, searchQuery)}
                          />
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {/* Pagination */}
              {userTotal > 50 && (
                <div className="flex items-center justify-between border-t border-gray-100 px-4 py-3">
                  <span className="text-xs text-gray-400">
                    Page {userPage} · {Math.ceil(userTotal / 50)} pages
                  </span>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setUserPage(p => Math.max(1, p - 1))}
                      disabled={userPage === 1}
                      className="rounded-lg border border-gray-200 px-3 py-1 text-xs font-medium text-gray-600 transition hover:bg-gray-50 disabled:opacity-40"
                    >
                      Précédent
                    </button>
                    <button
                      onClick={() => setUserPage(p => p + 1)}
                      disabled={userPage >= Math.ceil(userTotal / 50)}
                      className="rounded-lg border border-gray-200 px-3 py-1 text-xs font-medium text-gray-600 transition hover:bg-gray-50 disabled:opacity-40"
                    >
                      Suivant
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Tab : Recherches récentes ────────────────────────────────────────── */}
      {tab === 'searches' && metrics && (
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
          {metrics.recentSearches.length === 0 ? (
            <div className="py-16 text-center">
              <Search size={24} className="mx-auto mb-3 text-gray-300" />
              <p className="text-sm text-gray-400">Aucune recherche enregistrée</p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-400">Requête</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-400">Filtres</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-400">Résultats</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-400">Utilisateur</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-400">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {metrics.recentSearches.map(s => (
                  <tr key={s.id} className="transition hover:bg-gray-50/50">
                    <td className="px-4 py-3">
                      <p className="font-medium text-gray-800">
                        {s.queryLabel === 'secteur immobilier' ? 'Tous secteurs' : `"${s.queryLabel}"`}
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {s.filters?.department && (
                          <span className="rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-600">
                            Dép. {s.filters.department as string}
                          </span>
                        )}
                        {s.filters?.activityCode && (
                          <span className="rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-600">
                            {s.filters.activityCode as string}
                          </span>
                        )}
                        {!s.filters?.department && !s.filters?.activityCode && (
                          <span className="text-xs text-gray-300">—</span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="font-semibold text-gray-800">
                        {s.resultCount.toLocaleString('fr-FR')}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500">{s.userEmail}</td>
                    <td className="px-4 py-3 text-xs text-gray-400">{formatRelative(s.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Footer note */}
      <div className="mt-8 flex items-center gap-2 rounded-xl border border-gray-100 bg-gray-50 px-4 py-3">
        <Shield size={12} className="shrink-0 text-gray-400" />
        <p className="text-xs text-gray-400">
          Accès restreint aux comptes <code className="rounded bg-gray-100 px-1 text-gray-500">role = admin</code>.
          Toutes les actions sont journalisées dans <code className="rounded bg-gray-100 px-1 text-gray-500">audit_logs</code>.
        </p>
      </div>
    </div>
  )
}
