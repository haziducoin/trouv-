/**
 * Super Admin CRM — trouvé!
 * Accessible via trouvé.fr?crm (role=admin uniquement)
 * 100% données réelles : Supabase + Stripe — zéro mock data.
 */

import { useState, useEffect, useCallback } from 'react'
import {
  LayoutDashboard, Users, CreditCard, Activity, LogOut,
  RefreshCw, Ban, ShieldCheck, Clock, TrendingUp,
  AlertCircle, UserCheck, ChevronDown, ChevronUp,
  Phone, Mail, Search, CheckCircle2, XCircle,
  KeyRound, Eye, Zap, ArrowUp, ArrowDown,
  Loader2, Globe, Monitor, Wifi, WifiOff, Star,
  DollarSign, Hash, Calendar, MapPin, X,
} from 'lucide-react'
import { getSupabaseClient } from '@/lib/supabase'
import type { Account } from '@/lib/accountStore'
import trouveLogo from '@/assets/trouve-logo.png'

// ─── Stripe plans ─────────────────────────────────────────────────────────────
const STRIPE_PLANS = [
  { id: 'price_1TizarIWqycqHBP2XwD02TvU', label: 'Agence — 79€/mois' },
  { id: 'price_1TizarIWqycqHBP2Im8W6fIT', label: 'Agence — 756€/an' },
  { id: 'price_1TizaqIWqycqHBP2JxyTW49l', label: 'Solo — 33€/mois' },
  { id: 'price_1TizarIWqycqHBP2xLtnnudf', label: 'Solo — 312€/an' },
  { id: 'price_1TizUJIWqycqHBP2TFZFFFVu', label: 'Pro — 2292€/mois' },
  { id: 'price_1TizUJIWqycqHBP2Lfyzpon1', label: 'Pro — 8628€/an' },
]

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
  cguAccepted: boolean; ipAlert: boolean; ipAlertReason: string | null
  organization: { siren: string; name: string; active: boolean } | null
}

interface UserFull {
  profile: Record<string, unknown> | null
  searches: Array<{ id: string; query_label: string; result_count: number; created_at: string }>
  unlocks: Array<{ id: string; field_type: string; prospect_id: string; created_at: string }>
  sessions: Array<{ id: string; ip: string; user_agent: string; created_at: string; updated_at: string; not_after: string | null }>
  devices: Array<{ id: string; device_id: string; device_name: string; device_type: string; operating_system: string; browser: string; first_ip: string; last_ip: string; country: string; region: string; city: string; first_seen_at: string; last_seen_at: string; revoked_at: string | null; status: string }>
  subscription: Record<string, unknown> | null
  credits: { phone_credits: number; email_credits: number; unlimited: boolean } | null
  stripeSubscription: {
    id: string; status: string; planName: string; amount: number
    currency: string; interval: string; currentPeriodEnd: string; cancelAtPeriodEnd: boolean
  } | null
  stripeCustomer: { id: string; email: string; created: string } | null
}

interface LogEntry {
  id: string; action: string; actorEmail: string
  metadata: Record<string, unknown>; createdAt: string
}

interface LogsResponse {
  logs: LogEntry[]
  health: { searchesToday: number; unlocksToday: number; errorsToday: number }
}

// ─── Utilitaires ──────────────────────────────────────────────────────────────
function fromNow(iso: string | null | undefined): string {
  if (!iso) return '—'
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1) return 'à l\'instant'
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

async function apiPost(path: string, token: string, body: unknown): Promise<{ ok: boolean; error?: string }> {
  const r = await fetch(path, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  return r.json()
}

// ─── Composants UI ────────────────────────────────────────────────────────────
function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    approved: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    trial: 'bg-amber-50 text-amber-700 border-amber-200',
    pending: 'bg-blue-50 text-blue-700 border-blue-200',
    blocked: 'bg-red-50 text-red-600 border-red-200',
    rejected: 'bg-slate-100 text-slate-500 border-slate-200',
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
      <p className="text-sm text-slate-400">Chargement…</p>
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

// ─── Fiche client complète (drawer) ───────────────────────────────────────────
function UserDrawer({ userId, token, onClose, onRefresh }: {
  userId: string; token: string; onClose: () => void; onRefresh: () => void
}) {
  const [data, setData] = useState<UserFull | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [tab, setTab] = useState<'info' | 'sessions' | 'devices' | 'subscription' | 'credits' | 'history'>('info')

  // Formulaires
  const [creditPhone, setCreditPhone] = useState('0')
  const [creditEmail, setCreditEmail] = useState('0')
  const [selectedPlan, setSelectedPlan] = useState(STRIPE_PLANS[0].id)
  const [customerId, setCustomerId] = useState('')

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const d = await apiFetch<UserFull>(`/api/admin/user-full?userId=${userId}`, token)
      setData(d)
      setCustomerId(d.stripeCustomer?.id ?? '')
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Erreur')
    } finally {
      setLoading(false)
    }
  }, [userId, token])

  useEffect(() => { void load() }, [load])

  const act = async (action: string, value?: Record<string, unknown>, label?: string) => {
    setBusy(action)
    try {
      const r = await apiPost('/api/admin/user-full', token, { userId, action, value })
      if (r.error) alert(`Erreur : ${r.error}`)
      else { await load(); onRefresh() }
    } finally {
      setBusy(null)
    }
  }

  const profile = data?.profile as Record<string, unknown> | null

  return (
    <div className="fixed inset-0 z-50 flex">
      {/* Overlay */}
      <div className="flex-1 bg-black/40 backdrop-blur-sm" onClick={onClose} />

      {/* Panel */}
      <div className="w-full max-w-2xl bg-white shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4 bg-slate-50">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-100 text-sm font-bold text-blue-700">
              {String(profile?.first_name ?? profile?.professional_email ?? '?')[0].toUpperCase()}
            </div>
            <div>
              <p className="font-bold text-slate-800">
                {String(profile?.first_name ?? '')} {String(profile?.last_name ?? '')}
              </p>
              <p className="text-xs text-slate-400">{String(profile?.professional_email ?? '')}</p>
            </div>
          </div>
          <button onClick={onClose} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600">
            <X size={18} />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-slate-100 bg-white">
          {([
            ['info', 'Profil'],
            ['sessions', 'IPs'],
            ['devices', 'Appareils'],
            ['subscription', 'Abonnement'],
            ['credits', 'Crédits'],
            ['history', 'Historique'],
          ] as const).map(([key, label]) => (
            <button key={key} onClick={() => setTab(key)}
              className={`flex-1 px-3 py-3 text-xs font-semibold border-b-2 transition ${
                tab === key ? 'border-blue-600 text-blue-700' : 'border-transparent text-slate-500 hover:text-slate-700'
              }`}>
              {label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {loading ? <Spinner /> : error ? <ErrorState message={error} onRetry={load} /> : !data ? null : (
            <>
              {/* ── Profil ── */}
              {tab === 'info' && (
                <div className="p-6 space-y-6">
                  <div className="grid grid-cols-2 gap-4">
                    {[
                      ['Email', String(profile?.professional_email ?? '—'), Mail],
                      ['Rôle', String(profile?.role ?? '—'), Star],
                      ['Statut', String(profile?.access_status ?? '—'), CheckCircle2],
                      ['Quota mensuel', String(profile?.monthly_search_quota ?? '—'), Zap],
                      ['IP inscription', String(profile?.registration_ip ?? '—'), MapPin],
                      ['IP CGU', String(profile?.cgu_ip ?? '—'), Globe],
                      ['CGU acceptées', profile?.cgu_accepted ? fmt(String(profile?.cgu_accepted_at ?? '')) : 'Non', CheckCircle2],
                      ['Inscrit le', fmt(String(profile?.created_at ?? '')), Calendar],
                      ['Dernière connexion', fromNow(String(profile?.last_login_at ?? '')), Clock],
                      ['Fonction', String(profile?.function_title ?? '—'), Hash],
                    ].map(([label, value, Icon]) => {
                      const I = Icon as React.ElementType
                      return (
                      <div key={String(label)} className="rounded-xl border border-slate-100 bg-slate-50 p-3">
                        <div className="flex items-center gap-1.5 mb-1">
                          {I && <I size={11} className="text-slate-400" />}
                          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{String(label)}</p>
                        </div>
                        <p className="text-sm font-semibold text-slate-800 truncate">{String(value)}</p>
                      </div>
                      )
                    })}
                  </div>

                  {/* Organisation */}
                  {profile?.organization_id && (
                    <div className="rounded-xl border border-slate-100 p-4">
                      <p className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">Organisation</p>
                      <p className="text-sm font-semibold text-slate-800">SIREN : {String((profile?.organizations as Record<string, unknown>)?.siren ?? '—')}</p>
                      <p className="text-xs text-slate-500">{String((profile?.organizations as Record<string, unknown>)?.legal_name ?? '—')}</p>
                    </div>
                  )}

                  {/* Actions rapides */}
                  <div className="rounded-xl border border-slate-100 p-4 space-y-3">
                    <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Actions rapides</p>
                    <div className="flex flex-wrap gap-2">
                      <button onClick={() => act('approve', undefined, 'Approuver')} disabled={!!busy}
                        className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-bold text-white hover:bg-emerald-700 disabled:opacity-50">
                        {busy === 'approve' ? <Loader2 size={12} className="animate-spin" /> : <UserCheck size={12} />} Approuver
                      </button>
                      <button onClick={() => act('block', undefined, 'Bloquer')} disabled={!!busy}
                        className="flex items-center gap-1.5 rounded-lg bg-red-600 px-3 py-2 text-xs font-bold text-white hover:bg-red-700 disabled:opacity-50">
                        {busy === 'block' ? <Loader2 size={12} className="animate-spin" /> : <Ban size={12} />} Bloquer
                      </button>
                      <button onClick={() => act('revoke_sessions', undefined, 'Déconnecter')} disabled={!!busy}
                        className="flex items-center gap-1.5 rounded-lg bg-amber-500 px-3 py-2 text-xs font-bold text-white hover:bg-amber-600 disabled:opacity-50">
                        {busy === 'revoke_sessions' ? <Loader2 size={12} className="animate-spin" /> : <WifiOff size={12} />} Déconnecter
                      </button>
                    </div>
                    {/* Changer rôle */}
                    <div className="flex items-center gap-2">
                      <select onChange={e => act('set_role', { role: e.target.value })} defaultValue={String(profile?.role ?? 'agent')}
                        className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 outline-none focus:ring-2 focus:ring-blue-500">
                        <option value="agent">agent</option>
                        <option value="agence">agence</option>
                        <option value="admin">admin</option>
                      </select>
                      <span className="text-xs text-slate-400">Changer le rôle</span>
                    </div>
                  </div>
                </div>
              )}

              {/* ── Sessions / IP ── */}
              {tab === 'sessions' && (
                <div className="p-6 space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-bold text-slate-700">Adresses IP de connexion</p>
                      <p className="text-xs text-slate-400">Max autorisé : 2 IP distinctes par compte</p>
                    </div>
                    <button onClick={() => act('revoke_sessions')} disabled={!!busy}
                      className="flex items-center gap-1.5 rounded-lg bg-red-50 px-3 py-2 text-xs font-semibold text-red-600 hover:bg-red-100">
                      {busy === 'revoke_sessions' ? <Loader2 size={11} className="animate-spin" /> : <WifiOff size={11} />}
                      Déconnecter partout
                    </button>
                  </div>

                  {/* Alerte IP */}
                  {(data.sessions as Array<Record<string, unknown>>).length > 2 && (
                    <div className="rounded-xl border border-red-200 bg-red-50 p-4 flex items-start gap-3">
                      <AlertCircle size={16} className="text-red-500 shrink-0 mt-0.5" />
                      <div>
                        <p className="text-sm font-bold text-red-700">Compte partagé détecté</p>
                        <p className="text-xs text-red-600 mt-0.5">
                          {(data.sessions as Array<Record<string, unknown>>).length} adresses IP distinctes — seuil de 2 dépassé.
                          Ce compte circule probablement entre plusieurs utilisateurs.
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Liste des IPs */}
                  {(data.sessions as Array<Record<string, unknown>>).length === 0 ? (
                    <div className="rounded-xl border border-slate-100 bg-slate-50 p-6 text-center">
                      <Globe size={24} className="mx-auto mb-2 text-slate-300" />
                      <p className="text-sm text-slate-400">Aucune IP enregistrée pour ce compte</p>
                      <p className="text-xs text-slate-300 mt-1">Sera mis à jour à la prochaine connexion</p>
                    </div>
                  ) : (data.sessions as Array<Record<string, unknown>>).map((s, i) => (
                    <div key={String(s.ip_address)} className={`rounded-xl border p-4 ${
                      i >= 2 ? 'border-red-200 bg-red-50' : 'border-slate-100 bg-slate-50'
                    }`}>
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <div className={`h-2 w-2 rounded-full ${i >= 2 ? 'bg-red-400' : 'bg-emerald-400'}`} />
                          <span className="text-xs font-mono font-bold text-slate-800">{String(s.ip_address)}</span>
                          {i >= 2 && <span className="text-[10px] font-bold text-red-600 bg-red-100 px-1.5 py-0.5 rounded">Suspecte</span>}
                        </div>
                        <span className="text-[11px] text-slate-400">{Number(s.login_count)} connexion{Number(s.login_count) > 1 ? 's' : ''}</span>
                      </div>
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <Monitor size={11} className="text-slate-400 shrink-0" />
                          <span className="text-[11px] text-slate-500 truncate">{String(s.user_agent ?? '—')}</span>
                        </div>
                        <div className="flex items-center gap-3 text-[11px] text-slate-400">
                          <span>1ère vue : {fmt(String(s.first_seen_at))}</span>
                          <span>·</span>
                          <span>Dernière : {fromNow(String(s.last_seen_at))}</span>
                        </div>
                      </div>
                    </div>
                  ))}

                  {/* IPs inscription/CGU */}
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                    <p className="text-xs font-bold text-slate-500 mb-2 uppercase tracking-wider">IPs référence</p>
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-slate-500">Inscription</span>
                        <span className="text-xs font-mono font-semibold text-slate-800">{String(profile?.registration_ip ?? '—')}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-slate-500">Signature CGU</span>
                        <span className="text-xs font-mono font-semibold text-slate-800">{String(profile?.cgu_ip ?? '—')}</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* ── Appareils ── */}
              {tab === 'devices' && (
                <div className="p-6 space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-bold text-slate-700">Appareils connectés</p>
                      <p className="text-xs text-slate-400">Max autorisé : 2 appareils actifs par compte</p>
                    </div>
                    <button onClick={() => act('revoke_sessions')} disabled={!!busy}
                      className="flex items-center gap-1.5 rounded-lg bg-red-50 px-3 py-2 text-xs font-semibold text-red-600 hover:bg-red-100">
                      {busy === 'revoke_sessions' ? <Loader2 size={11} className="animate-spin" /> : <WifiOff size={11} />}
                      Tout révoquer
                    </button>
                  </div>

                  {/* Alerte limite */}
                  {(data.devices ?? []).filter(d => d.status === 'active').length >= 2 && (
                    <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 flex items-start gap-2">
                      <AlertCircle size={14} className="text-amber-500 shrink-0 mt-0.5" />
                      <p className="text-xs text-amber-700">Limite de 2 appareils actifs atteinte.</p>
                    </div>
                  )}

                  {(data.devices ?? []).length === 0 ? (
                    <div className="rounded-xl border border-slate-100 bg-slate-50 p-6 text-center">
                      <Monitor size={24} className="mx-auto mb-2 text-slate-300" />
                      <p className="text-sm text-slate-400">Aucun appareil enregistré</p>
                      <p className="text-xs text-slate-300 mt-1">Sera mis à jour à la prochaine connexion</p>
                    </div>
                  ) : (data.devices ?? []).map(d => (
                    <div key={d.id} className={`rounded-xl border p-4 ${
                      d.status === 'revoked' ? 'border-slate-100 bg-slate-50 opacity-60'
                      : d.device_type === 'mobile' ? 'border-blue-100 bg-blue-50'
                      : 'border-slate-200 bg-white'
                    }`}>
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <span className={`h-2 w-2 rounded-full shrink-0 ${d.status === 'active' ? 'bg-emerald-400' : 'bg-slate-300'}`} />
                            <span className="text-xs font-bold text-slate-800 truncate">{d.device_name || '—'}</span>
                            <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${
                              d.status === 'active' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'
                            }`}>{d.status === 'active' ? 'Actif' : 'Révoqué'}</span>
                          </div>
                          <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-[11px] text-slate-500">
                            <span><span className="text-slate-400">OS :</span> {d.operating_system || '—'}</span>
                            <span><span className="text-slate-400">Nav :</span> {d.browser || '—'}</span>
                            <span><span className="text-slate-400">IP :</span> <span className="font-mono">{d.last_ip || '—'}</span></span>
                            <span><span className="text-slate-400">Lieu :</span> {[d.city, d.country].filter(Boolean).join(', ') || '—'}</span>
                            <span><span className="text-slate-400">1ère vue :</span> {fmt(d.first_seen_at)}</span>
                            <span><span className="text-slate-400">Dernière :</span> {fromNow(d.last_seen_at)}</span>
                          </div>
                        </div>
                        {d.status === 'active' && (
                          <button
                            onClick={() => act('revoke_device', { deviceId: d.id })}
                            disabled={!!busy}
                            className="shrink-0 rounded-lg border border-red-200 bg-white p-1.5 text-red-500 hover:bg-red-50"
                            title="Révoquer cet appareil"
                          >
                            {busy === 'revoke_device' ? <Loader2 size={12} className="animate-spin" /> : <X size={12} />}
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* ── Abonnement ── */}
              {tab === 'subscription' && (
                <div className="p-6 space-y-5">
                  {/* Abonnement Stripe actif */}
                  {data.stripeSubscription ? (
                    <div className={`rounded-xl border p-4 ${
                      data.stripeSubscription.status === 'active' ? 'border-emerald-200 bg-emerald-50' : 'border-slate-200 bg-slate-50'
                    }`}>
                      <div className="flex items-center justify-between mb-3">
                        <p className="text-sm font-bold text-slate-800">Abonnement Stripe</p>
                        <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${
                          data.stripeSubscription.status === 'active' ? 'bg-emerald-100 text-emerald-700' :
                          data.stripeSubscription.status === 'past_due' ? 'bg-red-100 text-red-600' :
                          'bg-slate-100 text-slate-500'
                        }`}>{data.stripeSubscription.status}</span>
                      </div>
                      <div className="grid grid-cols-2 gap-3 text-sm">
                        <div><p className="text-[10px] text-slate-400 uppercase font-bold">Plan</p><p className="font-semibold">{data.stripeSubscription.planName}</p></div>
                        <div><p className="text-[10px] text-slate-400 uppercase font-bold">Montant</p><p className="font-semibold">{data.stripeSubscription.amount}€/{data.stripeSubscription.interval === 'month' ? 'mois' : 'an'}</p></div>
                        <div><p className="text-[10px] text-slate-400 uppercase font-bold">Renouvellement</p><p className="font-semibold">{fmt(data.stripeSubscription.currentPeriodEnd)}</p></div>
                        <div><p className="text-[10px] text-slate-400 uppercase font-bold">ID Stripe</p><p className="font-mono text-xs truncate">{data.stripeSubscription.id}</p></div>
                      </div>
                      {data.stripeSubscription.cancelAtPeriodEnd && (
                        <p className="mt-2 text-xs text-amber-600 font-semibold">Résiliation programmée fin de période</p>
                      )}
                    </div>
                  ) : (
                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-center">
                      <XCircle size={24} className="mx-auto mb-2 text-slate-300" />
                      <p className="text-sm text-slate-500">Aucun abonnement Stripe actif</p>
                    </div>
                  )}

                  {/* Abonnement BDD interne */}
                  {data.subscription && (
                    <div className="rounded-xl border border-blue-100 bg-blue-50 p-4">
                      <p className="text-xs font-bold uppercase text-blue-600 mb-2">Abonnement interne (BDD)</p>
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div><span className="text-slate-500">Plan :</span> <span className="font-semibold">{String(data.subscription.plan_code ?? '—')}</span></div>
                        <div><span className="text-slate-500">Statut :</span> <span className="font-semibold">{String(data.subscription.status ?? '—')}</span></div>
                        <div><span className="text-slate-500">Début :</span> <span className="font-semibold">{fmt(String(data.subscription.starts_at ?? ''))}</span></div>
                        <div><span className="text-slate-500">Renouvellement :</span> <span className="font-semibold">{fmt(String(data.subscription.renews_at ?? ''))}</span></div>
                      </div>
                    </div>
                  )}

                  {/* Assigner un abonnement manuellement */}
                  <div className="rounded-xl border border-slate-200 p-4 space-y-3">
                    <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Attribuer un abonnement manuellement</p>
                    <div className="space-y-2">
                      <div>
                        <label className="text-[11px] text-slate-500 font-semibold">Customer ID Stripe</label>
                        <input value={customerId} onChange={e => setCustomerId(e.target.value)}
                          placeholder="cus_xxxx"
                          className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-xs font-mono outline-none focus:ring-2 focus:ring-blue-500" />
                        {data.stripeCustomer && (
                          <p className="mt-1 text-[10px] text-emerald-600">Client Stripe trouvé : {data.stripeCustomer.email}</p>
                        )}
                      </div>
                      <div>
                        <label className="text-[11px] text-slate-500 font-semibold">Plan</label>
                        <select value={selectedPlan} onChange={e => setSelectedPlan(e.target.value)}
                          className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-xs outline-none focus:ring-2 focus:ring-blue-500">
                          {STRIPE_PLANS.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
                        </select>
                      </div>
                      <button
                        onClick={() => act('assign_subscription', { priceId: selectedPlan, customerId })}
                        disabled={!!busy || !customerId}
                        className="w-full flex items-center justify-center gap-2 rounded-lg bg-blue-600 py-2.5 text-xs font-bold text-white hover:bg-blue-700 disabled:opacity-50">
                        {busy === 'assign_subscription' ? <Loader2 size={12} className="animate-spin" /> : <CreditCard size={12} />}
                        Créer l'abonnement Stripe
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* ── Crédits ── */}
              {tab === 'credits' && (
                <div className="p-6 space-y-5">
                  {/* Solde actuel */}
                  <div className="grid grid-cols-3 gap-3">
                    <div className="rounded-xl border border-blue-100 bg-blue-50 p-4 text-center">
                      <Phone size={18} className="mx-auto mb-1 text-blue-500" />
                      <p className="text-2xl font-extrabold text-blue-700">{data.credits?.phone_credits ?? '—'}</p>
                      <p className="text-[11px] text-slate-400">Crédits téléphone</p>
                    </div>
                    <div className="rounded-xl border border-emerald-100 bg-emerald-50 p-4 text-center">
                      <Mail size={18} className="mx-auto mb-1 text-emerald-500" />
                      <p className="text-2xl font-extrabold text-emerald-700">{data.credits?.email_credits ?? '—'}</p>
                      <p className="text-[11px] text-slate-400">Crédits email</p>
                    </div>
                    <div className={`rounded-xl border p-4 text-center ${data.credits?.unlimited ? 'border-violet-200 bg-violet-50' : 'border-slate-100 bg-slate-50'}`}>
                      <Zap size={18} className={`mx-auto mb-1 ${data.credits?.unlimited ? 'text-violet-500' : 'text-slate-300'}`} />
                      <p className={`text-xs font-extrabold ${data.credits?.unlimited ? 'text-violet-700' : 'text-slate-400'}`}>
                        {data.credits?.unlimited ? 'ILLIMITÉ' : 'Limité'}
                      </p>
                      <p className="text-[11px] text-slate-400">Mode</p>
                    </div>
                  </div>

                  {/* Ajouter des crédits */}
                  <div className="rounded-xl border border-slate-200 p-4 space-y-3">
                    <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Définir les crédits</p>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-[11px] text-slate-500 font-semibold">Crédits téléphone</label>
                        <input type="number" min="0" value={creditPhone} onChange={e => setCreditPhone(e.target.value)}
                          className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500" />
                      </div>
                      <div>
                        <label className="text-[11px] text-slate-500 font-semibold">Crédits email</label>
                        <input type="number" min="0" value={creditEmail} onChange={e => setCreditEmail(e.target.value)}
                          className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500" />
                      </div>
                    </div>
                    <button
                      onClick={() => act('add_credits', { phone: parseInt(creditPhone), email: parseInt(creditEmail) })}
                      disabled={!!busy}
                      className="w-full flex items-center justify-center gap-2 rounded-lg bg-blue-600 py-2.5 text-xs font-bold text-white hover:bg-blue-700 disabled:opacity-50">
                      {busy === 'add_credits' ? <Loader2 size={12} className="animate-spin" /> : <Zap size={12} />}
                      Mettre à jour les crédits
                    </button>
                  </div>

                  {/* Illimité */}
                  <div className="rounded-xl border border-slate-200 p-4 flex items-center justify-between">
                    <div>
                      <p className="text-sm font-bold text-slate-700">Crédits illimités</p>
                      <p className="text-xs text-slate-400">Bypass total des quotas de déblocage</p>
                    </div>
                    <button
                      onClick={() => act('set_unlimited', { unlimited: !data.credits?.unlimited })}
                      disabled={!!busy}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition ${
                        data.credits?.unlimited ? 'bg-violet-600' : 'bg-slate-200'
                      } disabled:opacity-50`}>
                      <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition ${
                        data.credits?.unlimited ? 'translate-x-6' : 'translate-x-1'
                      }`} />
                    </button>
                  </div>
                </div>
              )}

              {/* ── Historique ── */}
              {tab === 'history' && (
                <div className="p-6 space-y-5">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3">
                      Dernières recherches ({data.searches.length})
                    </p>
                    <div className="space-y-1.5 max-h-64 overflow-y-auto">
                      {data.searches.length === 0 ? (
                        <p className="text-xs text-slate-400 text-center py-4">Aucune recherche</p>
                      ) : data.searches.map(s => (
                        <div key={s.id} className="flex items-center justify-between rounded-lg bg-slate-50 border border-slate-100 px-3 py-2">
                          <div className="flex items-center gap-2">
                            <Search size={11} className="text-slate-400" />
                            <p className="text-xs font-medium text-slate-700 truncate max-w-[250px]">{s.query_label || '—'}</p>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <span className="text-[10px] text-slate-400">{s.result_count} rés.</span>
                            <span className="text-[10px] text-slate-300">{fromNow(s.created_at)}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div>
                    <p className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3">
                      Déblocages ({data.unlocks.length})
                    </p>
                    <div className="space-y-1.5 max-h-64 overflow-y-auto">
                      {data.unlocks.length === 0 ? (
                        <p className="text-xs text-slate-400 text-center py-4">Aucun déblocage</p>
                      ) : data.unlocks.map(u => (
                        <div key={u.id} className="flex items-center justify-between rounded-lg bg-slate-50 border border-slate-100 px-3 py-2">
                          <div className="flex items-center gap-2">
                            {u.field_type === 'phone'
                              ? <Phone size={11} className="text-blue-500" />
                              : <Mail size={11} className="text-emerald-500" />}
                            <span className="text-xs font-medium text-slate-700">
                              {u.field_type === 'phone' ? 'Téléphone' : 'Email'}
                            </span>
                          </div>
                          <span className="text-[10px] text-slate-400">{fromNow(u.created_at)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Vue Dashboard ────────────────────────────────────────────────────────────
function DashboardView({ token }: { token: string }) {
  const [metrics, setMetrics] = useState<Metrics | null>(null)
  const [stripe, setStripe] = useState<StripeData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

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
    } finally { setLoading(false) }
  }, [token])

  useEffect(() => { void load() }, [load])

  if (loading) return <Spinner />
  if (error) return <ErrorState message={error} onRetry={load} />
  if (!metrics || !stripe) return null

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900">Vue d'ensemble</h1>
          <p className="text-sm text-slate-400 mt-0.5">{new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}</p>
        </div>
        <button onClick={load} className="flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50">
          <RefreshCw size={13} /> Actualiser
        </button>
      </div>

      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        <KpiCard label="MRR" value={`${stripe.mrr.euros} €`} icon={TrendingUp} accent="bg-emerald-500" />
        <KpiCard label="CA ce mois" value={`${stripe.revenue.thisMonthEuros} €`} icon={DollarSign} accent="bg-blue-500" />
        <KpiCard label="Utilisateurs" value={metrics.users.total} icon={Users} accent="bg-violet-500"
          sub={`+${metrics.users.newThisMonth} ce mois`} trend={metrics.users.newThisMonth > 0 ? 'up' : 'flat'} />
        <KpiCard label="En attente" value={metrics.users.pendingApprovals} icon={Clock}
          accent={metrics.users.pendingApprovals > 0 ? 'bg-amber-500' : 'bg-slate-300'} sub="À valider" />
      </div>

      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        <KpiCard label="Recherches / mois" value={metrics.activity.searchesThisMonth.toLocaleString('fr-FR')} icon={Search} />
        <KpiCard label="Déblocages / mois" value={metrics.activity.unlocksThisMonth} icon={KeyRound}
          sub={`${metrics.credits.byType.phone} tél · ${metrics.credits.byType.email} email`} />
        <KpiCard label="Abonnements actifs" value={stripe.subscriptions.active} icon={CheckCircle2}
          sub={`+${stripe.subscriptions.newThisMonth} ce mois`} trend={stripe.subscriptions.newThisMonth > 0 ? 'up' : 'flat'} />
        <KpiCard label="Résiliations" value={stripe.subscriptions.canceledThisMonth} icon={XCircle}
          accent={stripe.subscriptions.canceledThisMonth > 0 ? 'bg-red-400' : undefined} />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <div className="rounded-2xl bg-white border border-slate-100 shadow-sm">
          <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
            <h2 className="font-bold text-slate-800">Derniers paiements Stripe</h2>
            <CreditCard size={15} className="text-slate-400" />
          </div>
          <div className="divide-y divide-slate-50">
            {stripe.recentCharges.slice(0, 8).map(c => (
              <div key={c.id} className="flex items-center justify-between px-6 py-3">
                <div>
                  <p className="text-sm font-semibold text-slate-800">{c.amountEuros} €</p>
                  <p className="text-[11px] text-slate-400">{c.description || 'Paiement'} · {fromNow(c.createdAt)}</p>
                </div>
                <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                  c.refunded ? 'bg-orange-50 text-orange-600' :
                  c.paid ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-500'
                }`}>{c.refunded ? 'Remboursé' : c.paid ? 'Payé' : 'Échoué'}</span>
              </div>
            ))}
          </div>
        </div>

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
  const [drawerUserId, setDrawerUserId] = useState<string | null>(null)

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
    } finally { setLoading(false) }
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
    } finally { setBusy(null) }
  }

  return (
    <div className="space-y-6">
      {drawerUserId && (
        <UserDrawer
          userId={drawerUserId}
          token={token}
          onClose={() => setDrawerUserId(null)}
          onRefresh={load}
        />
      )}

      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900">Gestion des clients</h1>
          <p className="text-sm text-slate-400">{total} compte{total > 1 ? 's' : ''}</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input value={search} onChange={e => { setSearch(e.target.value); setPage(1) }}
              placeholder="Email, nom…"
              className="rounded-xl border border-slate-200 pl-9 pr-4 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500 w-52" />
          </div>
          <button onClick={load} className="flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50">
            <RefreshCw size={13} />
          </button>
        </div>
      </div>

      <div className="flex gap-2 flex-wrap">
        {[['all','Tous'], ['pending','En attente'], ['trial','Démo'], ['approved','Approuvés'], ['blocked','Bloqués'], ['ip_alert','Alerte IP']].map(([k, l]) => (
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
                <tr key={u.id} className="hover:bg-slate-50 transition">
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
                        <p className="font-medium text-slate-700 text-sm">{u.organization.name}</p>
                        <p className="text-[11px] text-slate-400">{u.organization.siren}</p>
                      </div>
                    ) : <span className="text-slate-300">—</span>}
                  </td>
                  <td className="px-5 py-4">
                    <div className="flex flex-col gap-1">
                      <StatusBadge status={u.status} />
                      {u.ipAlert && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-red-50 border border-red-200 px-2 py-0.5 text-[10px] font-bold text-red-600">
                          <Wifi size={9} /> IP suspecte
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-5 py-4">
                    <div className="w-28">
                      <div className="mb-1 flex justify-between text-[11px]">
                        <span className="font-semibold text-slate-700">{u.monthlyUsage}</span>
                        <span className="text-slate-400">/{u.quota}</span>
                      </div>
                      <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                        <div className="h-1.5 rounded-full bg-blue-500"
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
                      <button onClick={() => { window.location.href = `?crm&user=${u.id}` }}
                        className="flex items-center gap-1 rounded-lg bg-blue-50 px-2.5 py-1.5 text-[11px] font-semibold text-blue-700 hover:bg-blue-100">
                        <Eye size={12} /> Fiche
                      </button>
                      {u.status === 'pending' && (
                        <button onClick={() => action(u.id, 'approve')} disabled={busy === u.id}
                          className="rounded-lg bg-emerald-50 px-2.5 py-1.5 text-[11px] font-semibold text-emerald-700 hover:bg-emerald-100">
                          {busy === u.id ? <Loader2 size={11} className="animate-spin" /> : <UserCheck size={12} />}
                        </button>
                      )}
                      {u.status !== 'blocked' ? (
                        <button onClick={() => action(u.id, 'block')} disabled={busy === u.id}
                          className="rounded-lg bg-red-50 px-2.5 py-1.5 text-[11px] font-semibold text-red-600 hover:bg-red-100">
                          <Ban size={12} />
                        </button>
                      ) : (
                        <button onClick={() => action(u.id, 'approve')} disabled={busy === u.id}
                          className="rounded-lg bg-slate-100 px-2.5 py-1.5 text-[11px] font-semibold text-slate-600 hover:bg-slate-200">
                          <ShieldCheck size={12} />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {total > 50 && (
            <div className="flex items-center justify-between border-t border-slate-100 px-6 py-3">
              <p className="text-xs text-slate-400">Page {page} · {total} résultats</p>
              <div className="flex gap-2">
                <button disabled={page === 1} onClick={() => setPage(p => p - 1)}
                  className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium disabled:opacity-40 hover:bg-slate-50">Précédent</button>
                <button disabled={page * 50 >= total} onClick={() => setPage(p => p + 1)}
                  className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium disabled:opacity-40 hover:bg-slate-50">Suivant</button>
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
  const [error, setError] = useState<string | null>(null)

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
        <KpiCard label="MRR" value={`${stripe.mrr.euros} €`} icon={TrendingUp} accent="bg-emerald-500" />
        <KpiCard label="CA ce mois" value={`${stripe.revenue.thisMonthEuros} €`} icon={CreditCard} accent="bg-blue-500" />
        <KpiCard label="Abonnements actifs" value={stripe.subscriptions.active} icon={CheckCircle2} />
        <KpiCard label="Résiliations" value={stripe.subscriptions.canceledThisMonth} icon={XCircle}
          accent={stripe.subscriptions.canceledThisMonth > 0 ? 'bg-red-400' : undefined} />
      </div>

      <div className="rounded-2xl bg-white border border-slate-100 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100"><h2 className="font-bold text-slate-800">Transactions récentes</h2></div>
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
                <td className="px-6 py-3 font-extrabold text-slate-900">{c.amountEuros} €</td>
                <td className="px-6 py-3 text-slate-600 max-w-[300px] truncate">{c.description || 'Paiement trouvé!'}</td>
                <td className="px-6 py-3">
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                    c.refunded ? 'bg-orange-50 text-orange-600' :
                    c.paid ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-600'
                  }`}>{c.refunded ? 'Remboursé' : c.paid ? 'Payé' : 'Échoué'}</span>
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

// ─── Vue Logs ─────────────────────────────────────────────────────────────────
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
  const health = data?.health

  if (loading) return <Spinner />
  if (error) return <ErrorState message={error} onRetry={load} />

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

      {health && (
        <div className="grid grid-cols-3 gap-4">
          <KpiCard label="Recherches (24h)" value={health.searchesToday} icon={Search} accent="bg-blue-500" />
          <KpiCard label="Déblocages (24h)" value={health.unlocksToday} icon={KeyRound} accent="bg-violet-500" />
          <KpiCard label="Erreurs (24h)" value={health.errorsToday} icon={AlertCircle}
            accent={health.errorsToday > 0 ? 'bg-red-500' : 'bg-emerald-500'} />
        </div>
      )}

      <div className="flex gap-2 flex-wrap">
        {[['', 'Tous'], ['search', 'Recherches'], ['unlock', 'Déblocages'], ['admin_', 'Admin'], ['error', 'Erreurs']].map(([k, l]) => (
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
                  }`}>{l.action}</span>
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
interface AdminCRMPageProps { account: Account; onLogout: () => void }

export default function AdminCRMPage({ account, onLogout }: AdminCRMPageProps) {
  const [view, setView]   = useState<CRMView>('dashboard')
  const [token, setToken] = useState('')
  const [pendingCount, setPendingCount] = useState<number | null>(null)

  useEffect(() => { getToken().then(setToken) }, [])

  useEffect(() => {
    if (!token) return
    apiFetch<{ users: unknown[]; total: number }>('/api/admin/users?status=pending&limit=1', token)
      .then(d => setPendingCount(d.total)).catch(() => {})
  }, [token])

  const nav = [
    { key: 'dashboard' as CRMView, label: 'Vue d\'ensemble', icon: LayoutDashboard },
    { key: 'users'     as CRMView, label: 'Clients',         icon: Users },
    { key: 'finances'  as CRMView, label: 'Finances',        icon: CreditCard },
    { key: 'logs'      as CRMView, label: 'Santé système',   icon: Activity },
  ]

  return (
    <div className="flex min-h-screen bg-slate-50">
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
