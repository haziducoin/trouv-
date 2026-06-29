/**
 * Super Admin CRM — trouvé!
 * Accessible via trouvé.fr?crm (role=admin uniquement)
 * 100% données réelles : Supabase + Stripe — zéro mock data.
 */

import React, { useState, useEffect, useCallback } from 'react'
import {
  LayoutDashboard, Users, CreditCard, Activity, LogOut,
  RefreshCw, Ban, ShieldCheck, Clock, TrendingUp,
  AlertCircle, UserCheck, ChevronDown, ChevronUp,
  Phone, Mail, Search, CheckCircle2, XCircle,
  KeyRound, Eye, EyeOff, Zap, ArrowUp, ArrowDown,
  Loader2, Globe, Monitor, Wifi, WifiOff, Star,
  DollarSign, Hash, Calendar, MapPin, X,
  UserPlus, Copy, GitBranch, ExternalLink, List, LogIn,
  Settings2, ToggleLeft, UsersRound, ShieldAlert, Code2,
} from 'lucide-react'
import { invalidateFlagsCache } from '@/hooks/useFeatureFlags'
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
type CRMView = 'dashboard' | 'users' | 'finances' | 'logs' | 'searches' | 'pipeline' | 'settings' | 'team'
type AdminScope = 'super' | 'support' | 'dev'

const SCOPE_LABELS: Record<AdminScope, string> = { super: 'Super Admin', support: 'Support', dev: 'Développeur' }
const SCOPE_COLORS: Record<AdminScope, string> = {
  super:   'bg-violet-100 text-violet-700',
  support: 'bg-blue-100 text-blue-700',
  dev:     'bg-slate-100 text-slate-600',
}
const SCOPE_ALLOWED_VIEWS: Record<AdminScope, CRMView[]> = {
  super:   ['dashboard', 'users', 'searches', 'finances', 'pipeline', 'logs', 'settings', 'team'],
  support: ['dashboard', 'users', 'searches', 'pipeline'],
  dev:     ['dashboard', 'logs', 'settings'],
}

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
  quota: number; monthlyUsage: number; phoneUnlocks: number; emailUnlocks: number
  createdAt: string; lastLoginAt: string | null
  cguAccepted: boolean; ipAlert: boolean; ipAlertReason: string | null
  organization: { siren: string; name: string; active: boolean } | null
}

interface UserFull {
  profile: Record<string, unknown> | null
  searches: Array<{ id: string; query_label: string; filters: Record<string, unknown>; result_count: number; units_consumed: number; created_at: string }>
  unlocks: Array<{ id: string; field_type: string; contact_id: string; created_at: string }>
  sessions: Array<{ ip_address: string; user_agent: string; first_seen_at: string; last_seen_at: string; login_count: number }>
  devices: Array<{ id: string; device_id: string; device_name: string; device_type: string; operating_system: string; browser: string; first_ip: string; last_ip: string; country: string; region: string; city: string; first_seen_at: string; last_seen_at: string; revoked_at: string | null; status: string }>
  subscription: Record<string, unknown> | null
  credits: { phone_credits: number; email_credits: number; unlimited: boolean } | null
  stripeSubscription: {
    id: string; status: string; planName: string; amount: number
    currency: string; interval: string; currentPeriodEnd: string; cancelAtPeriodEnd: boolean
  } | null
  stripeCustomer: { id: string; email: string; created: string } | null
  stripeInvoices: Array<{ id: string; number: string | null; status: string | null; amount: number; currency: string; date: string; pdfUrl: string | null; hostedUrl: string | null }>
}

interface DashboardData {
  kpis: {
    requestsToday: number
    signups7d: number
    signupsSparkline: Array<{ date: string; count: number }>
    mrr: { cents: number; euros: string }
    errorRate: { percent: number; errorsToday: number; totalEventsToday: number }
  }
  users: { total: number; pending: number; newThisMonth: number }
  activity: { searchesThisMonth: number; unlocksThisMonth: number }
  subscriptions: { active: number; newThisMonth: number; canceledThisMonth: number }
  recentSearches: Array<{ id: string; queryLabel: string; resultCount: number; createdAt: string; userEmail: string }>
  recentCharges: Array<{ id: string; amountEuros: string; paid: boolean; refunded: boolean; description: string; createdAt: string }>
}

interface LogEntry {
  id: string; action: string; actorEmail: string
  metadata: Record<string, unknown>; createdAt: string
}

interface LogsResponse {
  logs: LogEntry[]
  health: { searchesToday: number; unlocksToday: number; errorsToday: number }
}

interface AdminMember {
  id: string; email: string; firstName: string | null; lastName: string | null
  adminScope: AdminScope; lastLoginAt: string | null; createdAt: string
  lastAction: { action: string; created_at: string } | null
}

// ─── Audit Trail — labels & sévérité ─────────────────────────────────────────
type Severity = 'normal' | 'info' | 'warning' | 'critical'
const ACTION_LABELS: Record<string, { label: string; severity: Severity }> = {
  search:               { label: 'Recherche effectuée',            severity: 'normal'   },
  unlock:               { label: 'Contact débloqué',               severity: 'normal'   },
  admin_approve:        { label: 'Compte approuvé',                severity: 'info'     },
  admin_reject:         { label: 'Compte rejeté',                  severity: 'warning'  },
  admin_block:          { label: 'Compte bloqué',                  severity: 'warning'  },
  admin_set_role:       { label: 'Rôle client modifié',            severity: 'warning'  },
  admin_set_quota:      { label: 'Quota modifié',                  severity: 'info'     },
  admin_add_credits:    { label: 'Crédits ajoutés',                severity: 'info'     },
  admin_set_unlimited:  { label: 'Accès illimité accordé',         severity: 'info'     },
  admin_impersonate:    { label: 'Connexion en tant que client',   severity: 'critical' },
  admin_revoke_sessions:{ label: 'Sessions révoquées',             severity: 'warning'  },
  admin_revoke_device:  { label: 'Appareil révoqué',               severity: 'info'     },
  admin_reset_password: { label: 'Réinit. mot de passe',           severity: 'info'     },
  admin_magic_link:     { label: 'Magic link envoyé',              severity: 'info'     },
  admin_toggle_flag:    { label: 'Feature flag modifié',           severity: 'critical' },
  admin_set_scope:      { label: 'Rôle admin modifié',             severity: 'critical' },
  admin_delete_account: { label: 'Compte supprimé',                severity: 'critical' },
  rgpd_erasure:         { label: 'Suppression RGPD définitive',    severity: 'critical' },
  alerte_paiement:      { label: 'Paiement échoué (Stripe)',       severity: 'warning'  },
  churn:                { label: 'Abonnement résilié',             severity: 'warning'  },
}
const SEVERITY_STYLES: Record<Severity, string> = {
  normal:   'bg-slate-100 text-slate-600',
  info:     'bg-blue-50 text-blue-600',
  warning:  'bg-amber-50 text-amber-700',
  critical: 'bg-red-50 text-red-600',
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
  const [creditValue, setCreditValue] = useState('0')
  // Formulaire abonnement interne custom (sans Stripe)
  const [subPlanName, setSubPlanName] = useState('Agence')
  const [subAmount, setSubAmount]     = useState('79')
  const [subInterval, setSubInterval] = useState<'month' | 'year'>('month')
  const [subCredits, setSubCredits]   = useState('0')
  const [subEndDate, setSubEndDate]   = useState('')
  const [confirmImpersonate, setConfirmImpersonate] = useState(false)
  const [impersonating, setImpersonating] = useState(false)
  const [confirmRgpd, setConfirmRgpd] = useState(false)
  const [rgpdEmailInput, setRgpdEmailInput] = useState('')
  const [rgpdResult, setRgpdResult] = useState<{ deletedEmail: string; stripeCancelled: boolean } | null>(null)

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const d = await apiFetch<UserFull>(`/api/admin/user-full?userId=${userId}`, token)
      setData(d)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Erreur')
    } finally {
      setLoading(false)
    }
  }, [userId, token])

  useEffect(() => { void load() }, [load])

  const act = async (action: string, value?: Record<string, unknown>) => {
    setBusy(action)
    try {
      const r = await apiPost('/api/admin/user-full', token, { userId, action, value })
      if (r.error) alert(`Erreur : ${r.error}`)
      else { await load(); onRefresh() }
    } finally {
      setBusy(null)
    }
  }

  const doImpersonate = async () => {
    setImpersonating(true)
    try {
      const r = await fetch('/api/admin/user-full', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, action: 'impersonate' }),
      })
      const json = await r.json() as { ok?: boolean; link?: string; error?: string }
      if (json.error) {
        alert(`Erreur impersonation : ${json.error}`)
      } else if (json.link) {
        setConfirmImpersonate(false)
        window.open(json.link, '_blank', 'noopener,noreferrer')
      }
    } finally {
      setImpersonating(false)
    }
  }

  const profile = data?.profile as Record<string, unknown> | null

  return (
    <div className="fixed inset-0 z-50 flex bg-white">
      {/* Page plein écran */}
      <div className="w-full bg-white flex flex-col overflow-hidden">
        {/* ── Modal confirmation impersonation ─────────────────────────────── */}
        {confirmImpersonate && (
          <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/50 backdrop-blur-sm">
            <div className="mx-6 w-full max-w-sm rounded-2xl bg-white shadow-2xl p-6">
              <div className="flex items-center justify-center h-12 w-12 rounded-full bg-amber-100 mx-auto mb-4">
                <AlertCircle size={22} className="text-amber-600" />
              </div>
              <h3 className="text-base font-bold text-slate-900 text-center mb-1">
                Se connecter en tant que
              </h3>
              <p className="text-sm font-semibold text-blue-600 text-center mb-3 truncate">
                {String(profile?.professional_email ?? '')}
              </p>
              <div className="rounded-xl bg-amber-50 border border-amber-200 p-3 mb-5 space-y-1.5">
                <p className="text-xs text-amber-800 font-medium">
                  · Un magic link temporaire va être généré — <strong>aucun email ne sera envoyé</strong>.
                </p>
                <p className="text-xs text-amber-800 font-medium">
                  · La session s'ouvre dans un <strong>nouvel onglet</strong> avec la vue complète du client.
                </p>
                <p className="text-xs text-amber-800 font-medium">
                  · Cette action est <strong>journalisée</strong> dans les audit logs (RGPD).
                </p>
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => setConfirmImpersonate(false)}
                  className="flex-1 rounded-xl border border-slate-200 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50"
                >
                  Annuler
                </button>
                <button
                  onClick={doImpersonate}
                  disabled={impersonating}
                  className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-amber-500 py-2.5 text-sm font-bold text-white hover:bg-amber-600 disabled:opacity-60"
                >
                  {impersonating ? <Loader2 size={14} className="animate-spin" /> : <LogIn size={14} />}
                  Connexion
                </button>
              </div>
            </div>
          </div>
        )}

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
          <div className="flex items-center gap-2">
            <button
              onClick={() => setConfirmImpersonate(true)}
              title="Se connecter en tant que cet utilisateur"
              className="flex items-center gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-bold text-amber-700 hover:bg-amber-100 transition-colors"
            >
              <LogIn size={12} /> Login As
            </button>
            <button onClick={onClose} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600">
              <X size={18} />
            </button>
          </div>
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

        {/* ── Modale confirmation RGPD ──────────────────────────────────────── */}
        {confirmRgpd && (
          <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/60 backdrop-blur-sm">
            <div className="mx-6 w-full max-w-sm rounded-2xl bg-white shadow-2xl overflow-hidden">
              {rgpdResult ? (
                <div className="p-6 text-center space-y-4">
                  <div className="flex items-center justify-center h-14 w-14 rounded-full bg-emerald-100 mx-auto">
                    <CheckCircle2 size={26} className="text-emerald-600" />
                  </div>
                  <h3 className="text-base font-bold text-slate-900">Suppression effectuée</h3>
                  <div className="rounded-xl bg-slate-50 border border-slate-100 p-4 text-left space-y-1.5 text-[12px] text-slate-600">
                    <div className="flex gap-2"><CheckCircle2 size={12} className="text-emerald-500 mt-0.5 shrink-0" /> Données personnelles anonymisées</div>
                    <div className="flex gap-2"><CheckCircle2 size={12} className="text-emerald-500 mt-0.5 shrink-0" /> Historique de recherches supprimé</div>
                    <div className="flex gap-2">
                      {rgpdResult.stripeCancelled
                        ? <CheckCircle2 size={12} className="text-emerald-500 mt-0.5 shrink-0" />
                        : <XCircle size={12} className="text-slate-300 mt-0.5 shrink-0" />}
                      Abonnement Stripe {rgpdResult.stripeCancelled ? 'annulé' : 'inactif (déjà annulé)'}
                    </div>
                    <div className="flex gap-2"><CheckCircle2 size={12} className="text-emerald-500 mt-0.5 shrink-0" /> Compte Auth supprimé</div>
                    <div className="flex gap-2"><CheckCircle2 size={12} className="text-emerald-500 mt-0.5 shrink-0" /> Inscrit dans privacy_requests + audit_logs</div>
                  </div>
                  <p className="text-[11px] text-slate-400">Compte: {rgpdResult.deletedEmail}</p>
                  <button onClick={() => { setConfirmRgpd(false); setRgpdResult(null); onClose(); onRefresh() }}
                    className="w-full rounded-xl bg-slate-900 py-2.5 text-sm font-semibold text-white hover:bg-slate-800">
                    Fermer
                  </button>
                </div>
              ) : (
                <>
                  <div className="bg-red-600 px-6 py-4 flex items-center gap-3">
                    <AlertCircle size={20} className="text-white shrink-0" />
                    <h3 className="text-sm font-bold text-white">Suppression Définitive RGPD</h3>
                  </div>
                  <div className="p-6 space-y-4">
                    <p className="text-[12px] text-slate-600">
                      Cette action est <strong>irréversible</strong>. Elle va immédiatement :
                    </p>
                    <ul className="space-y-1.5 text-[12px] text-slate-600">
                      {[
                        'Supprimer toutes les recherches et déblocages',
                        'Supprimer les appareils, IPs et sessions',
                        'Anonymiser le profil (nom → "Supprimé RGPD")',
                        'Annuler l\'abonnement Stripe (si actif)',
                        'Supprimer le compte d\'authentification',
                        'Enregistrer dans privacy_requests + audit trail',
                      ].map(t => (
                        <li key={t} className="flex gap-2">
                          <span className="text-red-500 font-bold shrink-0">×</span> {t}
                        </li>
                      ))}
                    </ul>
                    <div>
                      <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                        Confirmez en tapant l'email du compte
                      </label>
                      <input
                        type="email"
                        value={rgpdEmailInput}
                        onChange={e => setRgpdEmailInput(e.target.value)}
                        placeholder={String(profile?.professional_email ?? '')}
                        className="mt-1.5 w-full rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-red-500"
                        autoFocus
                      />
                    </div>
                    <div className="flex gap-2 pt-1">
                      <button onClick={() => { setConfirmRgpd(false); setRgpdEmailInput('') }}
                        className="flex-1 rounded-xl border border-slate-200 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-50">
                        Annuler
                      </button>
                      <button
                        disabled={rgpdEmailInput.trim() !== String(profile?.professional_email ?? '') || !!busy}
                        onClick={async () => {
                          setBusy('delete_account')
                          try {
                            const r = await apiPost('/api/admin/user-full', token, { userId, action: 'delete_account' })
                            if (r.error) { alert(`Erreur : ${r.error}`); return }
                            const res = r as unknown as { ok: boolean; deletedEmail: string; stripeCancelled: boolean }
                            setRgpdResult({ deletedEmail: res.deletedEmail, stripeCancelled: res.stripeCancelled })
                            setRgpdEmailInput('')
                          } finally { setBusy(null) }
                        }}
                        className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-red-600 py-2.5 text-sm font-bold text-white hover:bg-red-700 disabled:opacity-40 transition">
                        {busy === 'delete_account' ? <Loader2 size={14} className="animate-spin" /> : null}
                        Supprimer définitivement
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {/* Content */}
        <div className="flex-1 overflow-y-auto [&>div]:mx-auto [&>div]:w-full [&>div]:max-w-5xl">
          {loading ? <Spinner /> : error ? <ErrorState message={error} onRetry={load} /> : !data ? null : (
            <>
              {/* ══ PROFIL CLIENT UNIFIÉ — 3 blocs ══ */}
              {tab === 'info' && (
                <div className="p-5 space-y-5">

                  {/* ── BLOC 1 : Informations client ── */}
                  <section className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
                    <div className="flex items-center gap-2 px-4 py-3 bg-slate-50 border-b border-slate-100">
                      <Users size={13} className="text-slate-500" />
                      <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Informations client</p>
                    </div>
                    <div className="p-4 grid grid-cols-2 gap-3">
                      {[
                        ['Email', String(profile?.professional_email ?? '—'), Mail],
                        ['Fonction', String(profile?.function_title ?? '—'), Hash],
                        ['Rôle', String(profile?.role ?? '—'), Star],
                        ['Statut', String(profile?.access_status ?? '—'), CheckCircle2],
                        ['Inscrit', fmt(String(profile?.created_at ?? '')), Calendar],
                        ['Dernière connexion', fromNow(String(profile?.last_login_at ?? '')), Clock],
                        ['IP inscription', String(profile?.registration_ip ?? '—'), MapPin],
                        ['CGU', profile?.cgu_accepted ? fmt(String(profile?.cgu_accepted_at ?? '')) : 'Non signées', CheckCircle2],
                      ].map(([label, value, Icon]) => {
                        const I = Icon as React.ElementType
                        return (
                          <div key={String(label)} className="rounded-xl bg-slate-50 border border-slate-100 p-3">
                            <div className="flex items-center gap-1.5 mb-1">
                              <I size={10} className="text-slate-400" />
                              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{String(label)}</p>
                            </div>
                            <p className="text-xs font-semibold text-slate-800 truncate">{String(value)}</p>
                          </div>
                        )
                      })}
                    </div>
                    {profile?.organization_id && (() => {
                      const org = profile?.organizations as Record<string, unknown> | null
                      return (
                        <div className="mx-4 mb-4 rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 flex items-center gap-3">
                          <Globe size={14} className="text-blue-500 shrink-0" />
                          <div className="min-w-0">
                            <p className="text-xs font-bold text-blue-800 truncate">{String(org?.legal_name ?? '—')}</p>
                            <p className="text-[11px] text-blue-500">SIREN : {String(org?.siren ?? '—')} · {org?.administrative_status === 'A' ? 'Active' : 'Inactive'}</p>
                          </div>
                        </div>
                      )
                    })()}
                    <div className="px-4 pb-4 flex flex-wrap gap-2">
                      <button onClick={() => act('approve')} disabled={!!busy}
                        className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-emerald-700 disabled:opacity-50">
                        {busy === 'approve' ? <Loader2 size={11} className="animate-spin" /> : <UserCheck size={11} />} Approuver
                      </button>
                      <button onClick={() => act('block')} disabled={!!busy}
                        className="flex items-center gap-1.5 rounded-lg bg-red-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-red-700 disabled:opacity-50">
                        {busy === 'block' ? <Loader2 size={11} className="animate-spin" /> : <Ban size={11} />} Bloquer
                      </button>
                      <button onClick={() => act('revoke_sessions')} disabled={!!busy}
                        className="flex items-center gap-1.5 rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-bold text-white hover:bg-amber-600 disabled:opacity-50">
                        {busy === 'revoke_sessions' ? <Loader2 size={11} className="animate-spin" /> : <WifiOff size={11} />} Déconnecter
                      </button>
                      <select onChange={e => act('set_role', { role: e.target.value })} defaultValue={String(profile?.role ?? 'agent')}
                        className="rounded-lg border border-slate-200 px-2 py-1.5 text-xs font-semibold text-slate-700 outline-none focus:ring-2 focus:ring-blue-500 bg-white">
                        <option value="agent">Rôle : agent</option>
                        <option value="agence">Rôle : agence</option>
                        <option value="admin">Rôle : admin</option>
                      </select>
                    </div>
                  </section>

                  {/* ── BLOC 2 : État financier ── */}
                  <section className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
                    <div className="flex items-center gap-2 px-4 py-3 bg-slate-50 border-b border-slate-100">
                      <CreditCard size={13} className="text-slate-500" />
                      <p className="text-xs font-bold uppercase tracking-wider text-slate-500">État financier</p>
                      {data.stripeSubscription && (
                        <span className={`ml-auto rounded-full px-2 py-0.5 text-[10px] font-bold ${
                          data.stripeSubscription.status === 'active' ? 'bg-emerald-100 text-emerald-700' :
                          data.stripeSubscription.status === 'past_due' ? 'bg-red-100 text-red-600' :
                          'bg-slate-100 text-slate-500'
                        }`}>{data.stripeSubscription.status}</span>
                      )}
                    </div>
                    <div className="p-4 space-y-3">
                      {data.stripeSubscription ? (
                        <div className="grid grid-cols-3 gap-2">
                          {[
                            ['Plan', data.stripeSubscription.planName],
                            ['MRR', `${data.stripeSubscription.amount}€/${data.stripeSubscription.interval === 'month' ? 'mois' : 'an'}`],
                            ['Renouvellement', fmt(data.stripeSubscription.currentPeriodEnd)],
                          ].map(([l, v]) => (
                            <div key={l} className="rounded-xl bg-slate-50 border border-slate-100 p-3">
                              <p className="text-[10px] font-bold uppercase text-slate-400 mb-0.5">{l}</p>
                              <p className="text-xs font-bold text-slate-800">{v}</p>
                            </div>
                          ))}
                          {data.stripeSubscription.cancelAtPeriodEnd && (
                            <div className="col-span-3 rounded-xl bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-700 font-semibold">
                              Résiliation programmée fin de période
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="rounded-xl bg-slate-50 border border-slate-100 p-4 text-center">
                          <p className="text-xs text-slate-400">Aucun abonnement Stripe actif</p>
                        </div>
                      )}
                      <div className="grid grid-cols-3 gap-2">
                        <div className="rounded-xl bg-blue-50 border border-blue-100 p-3">
                          <p className="text-[10px] font-bold uppercase text-blue-400 mb-0.5 flex items-center gap-1"><Phone size={9} /> Tél</p>
                          <p className="text-lg font-extrabold text-blue-700">{data.credits?.unlimited ? '∞' : (data.credits?.phone_credits ?? 0)}</p>
                        </div>
                        <div className="rounded-xl bg-violet-50 border border-violet-100 p-3">
                          <p className="text-[10px] font-bold uppercase text-violet-400 mb-0.5 flex items-center gap-1"><Mail size={9} /> Email</p>
                          <p className="text-lg font-extrabold text-violet-700">{data.credits?.unlimited ? '∞' : (data.credits?.email_credits ?? 0)}</p>
                        </div>
                        <div className="rounded-xl bg-slate-50 border border-slate-100 p-3">
                          <p className="text-[10px] font-bold uppercase text-slate-400 mb-0.5 flex items-center gap-1"><Zap size={9} /> Quota</p>
                          <p className="text-lg font-extrabold text-slate-700">{String(profile?.monthly_search_quota ?? 0)}</p>
                        </div>
                      </div>
                      {(data.stripeInvoices ?? []).length > 0 && (
                        <div>
                          <p className="text-[10px] font-bold uppercase text-slate-400 mb-2">3 dernières factures</p>
                          <div className="space-y-1.5">
                            {(data.stripeInvoices ?? []).map(inv => (
                              <div key={inv.id} className="flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50 px-3 py-2">
                                <div className="flex items-center gap-2">
                                  <span className={`h-1.5 w-1.5 rounded-full ${inv.status === 'paid' ? 'bg-emerald-400' : 'bg-red-400'}`} />
                                  <span className="text-[11px] font-mono text-slate-500">{inv.number ?? inv.id.slice(-8)}</span>
                                  <span className="text-[11px] text-slate-400">{fmt(inv.date)}</span>
                                </div>
                                <div className="flex items-center gap-2">
                                  <span className="text-xs font-bold text-slate-800">{inv.amount.toFixed(2)}€</span>
                                  {inv.pdfUrl && (
                                    <a href={inv.pdfUrl} target="_blank" rel="noreferrer" className="rounded p-1 hover:bg-slate-200 text-slate-400">
                                      <ExternalLink size={10} />
                                    </a>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </section>

                  {/* ── BLOC 3 : Activité SaaS (timeline) ── */}
                  <section className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
                    <div className="flex items-center gap-2 px-4 py-3 bg-slate-50 border-b border-slate-100">
                      <Activity size={13} className="text-slate-500" />
                      <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Activité SaaS</p>
                      <span className="ml-auto text-[11px] text-slate-400">{data.searches.length} rech. · {data.unlocks.length} déblocages</span>
                    </div>
                    <div className="p-4">
                      <div className="grid grid-cols-3 gap-2 mb-4">
                        <div className="rounded-xl bg-slate-50 border border-slate-100 p-3 text-center">
                          <p className="text-lg font-extrabold text-slate-800">{data.searches.length}</p>
                          <p className="text-[10px] text-slate-400 uppercase font-bold">Recherches</p>
                        </div>
                        <div className="rounded-xl bg-blue-50 border border-blue-100 p-3 text-center">
                          <p className="text-lg font-extrabold text-blue-700">{data.unlocks.filter(u => u.field_type === 'phone').length}</p>
                          <p className="text-[10px] text-blue-400 uppercase font-bold">Tél débloqués</p>
                        </div>
                        <div className="rounded-xl bg-violet-50 border border-violet-100 p-3 text-center">
                          <p className="text-lg font-extrabold text-violet-700">{data.unlocks.filter(u => u.field_type === 'email').length}</p>
                          <p className="text-[10px] text-violet-400 uppercase font-bold">Emails débloqués</p>
                        </div>
                      </div>
                      <p className="text-[10px] font-bold uppercase text-slate-400 mb-3">5 dernières actions</p>
                      {(() => {
                        const events = [
                          ...data.searches.slice(0, 10).map(s => ({ type: 'search' as const, label: s.query_label || 'Recherche sans libellé', sub: `${s.result_count} résultat${s.result_count > 1 ? 's' : ''}`, date: s.created_at })),
                          ...data.unlocks.slice(0, 10).map(u => ({ type: u.field_type as 'phone' | 'email', label: u.field_type === 'phone' ? 'Téléphone débloqué' : 'Email débloqué', sub: `Contact #${u.contact_id}`, date: u.created_at })),
                        ].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 5)
                        if (events.length === 0) return (
                          <div className="rounded-xl border border-slate-100 bg-slate-50 p-6 text-center">
                            <p className="text-xs text-slate-400">Aucune activité enregistrée</p>
                          </div>
                        )
                        return (
                          <div className="relative pl-5">
                            <div className="absolute left-[9px] top-2 bottom-2 w-px bg-slate-200" />
                            <div className="space-y-3">
                              {events.map((e, i) => (
                                <div key={i} className="relative flex items-start gap-3">
                                  <div className={`absolute -left-5 mt-1.5 h-3 w-3 rounded-full border-2 border-white ${e.type === 'phone' ? 'bg-blue-400' : e.type === 'email' ? 'bg-violet-400' : 'bg-slate-400'}`} />
                                  <div className="flex-1 rounded-xl border border-slate-100 bg-slate-50 px-3 py-2">
                                    <div className="flex items-center justify-between gap-2">
                                      <p className="text-xs font-semibold text-slate-800 truncate">{e.label}</p>
                                      <span className="text-[10px] text-slate-400 shrink-0">{fromNow(e.date)}</span>
                                    </div>
                                    <p className="text-[10px] text-slate-400 mt-0.5">{e.sub}</p>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )
                      })()}
                    </div>
                  </section>

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
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-xs font-bold uppercase text-blue-600">Abonnement actif</p>
                        <button onClick={() => act('cancel_internal_subscription')} disabled={!!busy}
                          className="text-[11px] font-semibold text-red-500 hover:text-red-600 disabled:opacity-50">Résilier</button>
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div><span className="text-slate-500">Plan :</span> <span className="font-semibold">{String(data.subscription.plan_name ?? data.subscription.plan_code ?? '—')}</span></div>
                        <div><span className="text-slate-500">Montant :</span> <span className="font-semibold">{data.subscription.amount_cents != null ? `${(Number(data.subscription.amount_cents) / 100).toFixed(0)}€/${data.subscription.billing_period === 'year' ? 'an' : 'mois'}` : '—'}</span></div>
                        <div><span className="text-slate-500">Statut :</span> <span className="font-semibold">{String(data.subscription.status ?? '—')}</span></div>
                        <div><span className="text-slate-500">Crédits :</span> <span className="font-semibold">{data.credits?.unlimited ? '∞' : (data.credits?.phone_credits ?? 0)}</span></div>
                        <div><span className="text-slate-500">Début :</span> <span className="font-semibold">{fmt(String(data.subscription.starts_at ?? ''))}</span></div>
                        <div><span className="text-slate-500">Fin :</span> <span className="font-semibold">{data.subscription.renews_at ? fmt(String(data.subscription.renews_at)) : 'Sans limite'}</span></div>
                      </div>
                    </div>
                  )}

                  {/* Attribuer un abonnement interne custom (sans Stripe) */}
                  <div className="rounded-xl border border-slate-200 p-4 space-y-3">
                    <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Attribuer un abonnement</p>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-[11px] text-slate-500 font-semibold">Nom du plan</label>
                        <input value={subPlanName} onChange={e => setSubPlanName(e.target.value)} placeholder="Agence, Pro…"
                          className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500" />
                      </div>
                      <div>
                        <label className="text-[11px] text-slate-500 font-semibold">Montant (€)</label>
                        <input type="number" min="0" value={subAmount} onChange={e => setSubAmount(e.target.value)}
                          className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500" />
                      </div>
                      <div>
                        <label className="text-[11px] text-slate-500 font-semibold">Périodicité</label>
                        <select value={subInterval} onChange={e => setSubInterval(e.target.value as 'month' | 'year')}
                          className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500">
                          <option value="month">Mensuel</option>
                          <option value="year">Annuel</option>
                        </select>
                      </div>
                      <div>
                        <label className="text-[11px] text-slate-500 font-semibold">Crédits inclus</label>
                        <input type="number" min="0" value={subCredits} onChange={e => setSubCredits(e.target.value)}
                          className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500" />
                      </div>
                      <div className="col-span-2">
                        <label className="text-[11px] text-slate-500 font-semibold">Date de fin (optionnel)</label>
                        <input type="date" value={subEndDate} onChange={e => setSubEndDate(e.target.value)}
                          className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500" />
                      </div>
                    </div>
                    <button
                      onClick={() => act('assign_internal_subscription', { planName: subPlanName, amountEuros: subAmount, interval: subInterval, credits: subCredits, endDate: subEndDate || null })}
                      disabled={!!busy}
                      className="w-full flex items-center justify-center gap-2 rounded-lg bg-blue-600 py-2.5 text-xs font-bold text-white hover:bg-blue-700 disabled:opacity-50">
                      {busy === 'assign_internal_subscription' ? <Loader2 size={12} className="animate-spin" /> : <CreditCard size={12} />}
                      Attribuer l'abonnement
                    </button>
                  </div>
                </div>
              )}

              {/* ── Crédits ── */}
              {tab === 'credits' && (
                <div className="p-6 space-y-5">
                  {/* Solde actuel */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="rounded-xl border border-blue-100 bg-blue-50 p-4 text-center">
                      <Zap size={18} className="mx-auto mb-1 text-blue-500" />
                      <p className="text-2xl font-extrabold text-blue-700">{data.credits?.unlimited ? '∞' : (data.credits?.phone_credits ?? '—')}</p>
                      <p className="text-[11px] text-slate-400">Crédits</p>
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
                    <div>
                      <label className="text-[11px] text-slate-500 font-semibold">Nombre de crédits</label>
                      <input type="number" min="0" value={creditValue} onChange={e => setCreditValue(e.target.value)}
                        className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500" />
                    </div>
                    <button
                      onClick={() => act('add_credits', { phone: parseInt(creditValue) || 0, email: parseInt(creditValue) || 0 })}
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

        {/* ── Zone de danger RGPD ───────────────────────────────────────────── */}
        {!loading && !error && data && (
          <div className="border-t border-red-100 bg-red-50/50 px-6 py-3 flex items-center justify-between shrink-0">
            <div className="min-w-0">
              <p className="text-[11px] font-bold uppercase tracking-wider text-red-600">Zone de danger — RGPD</p>
              <p className="text-[10px] text-slate-400 truncate">Suppression définitive et irréversible de toutes les données</p>
            </div>
            <button
              onClick={() => setConfirmRgpd(true)}
              className="ml-4 shrink-0 flex items-center gap-1.5 rounded-lg border border-red-200 bg-white px-3 py-1.5 text-xs font-bold text-red-600 hover:bg-red-600 hover:text-white hover:border-red-600 transition-colors">
              <Ban size={11} /> Supprimer les données
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Modal création client ────────────────────────────────────────────────────
function CreateUserModal({ token, onClose, onCreated }: {
  token: string; onClose: () => void; onCreated: () => void
}) {
  const [email,     setEmail]    = useState('')
  const [password,  setPassword] = useState('')
  const [showPwd,   setShowPwd]  = useState(false)
  const [phoneCr,   setPhoneCr]  = useState(50)
  const [emailCr,   setEmailCr]  = useState(50)
  const [unlimited, setUnlim]    = useState(false)
  const [busy,      setBusy]     = useState(false)
  const [error,     setError]    = useState<string | null>(null)
  const [result,    setResult]   = useState<{ email: string; tempPassword: string | null } | null>(null)
  const [copied,    setCopied]   = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true); setError(null)
    try {
      const r = await fetch('/api/admin/create-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ email: email.trim(), password: password.trim() || undefined,
          phoneCredits: unlimited ? 0 : phoneCr, emailCredits: unlimited ? 0 : emailCr, unlimited }),
      })
      const json = await r.json()
      if (!r.ok) { setError(json.error ?? 'Erreur serveur'); return }
      setResult({ email: json.email, tempPassword: json.tempPassword })
    } catch (e) { setError(e instanceof Error ? e.message : 'Erreur réseau') }
    finally { setBusy(false) }
  }

  const copy = (text: string) => {
    void navigator.clipboard.writeText(text).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000) })
  }

  const reset = () => { setResult(null); setEmail(''); setPassword(''); setPhoneCr(50); setEmailCr(50); setUnlim(false) }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="relative w-full max-w-md rounded-2xl border border-slate-200 bg-white shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-50">
              <UserPlus size={15} className="text-blue-600" />
            </div>
            <h2 className="text-sm font-semibold text-slate-900">Créer un compte client</h2>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100"><X size={15} /></button>
        </div>

        {result ? (
          <div className="px-6 py-6 space-y-4">
            <div className="flex items-center gap-2 rounded-xl bg-emerald-50 px-4 py-3">
              <CheckCircle2 size={15} className="shrink-0 text-emerald-600" />
              <p className="text-sm font-medium text-emerald-800">Compte créé avec succès</p>
            </div>
            <div>
              <p className="mb-1 text-xs font-medium text-slate-500">Email</p>
              <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-medium">{result.email}</p>
            </div>
            {result.tempPassword && (
              <div>
                <p className="mb-1 text-xs font-medium text-slate-500">Mot de passe temporaire</p>
                <div className="flex items-center gap-2">
                  <p className="flex-1 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 font-mono text-sm font-semibold text-amber-800">{result.tempPassword}</p>
                  <button onClick={() => copy(result.tempPassword!)}
                    className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50">
                    <Copy size={12} />{copied ? 'Copié !' : 'Copier'}
                  </button>
                </div>
                <p className="mt-1.5 text-xs text-amber-600">À communiquer au client — ne sera plus affiché.</p>
              </div>
            )}
            <div className="flex gap-2 pt-1">
              <button onClick={reset} className="flex-1 rounded-xl border border-slate-200 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-50">Créer un autre</button>
              <button onClick={() => { onCreated(); onClose() }} className="flex-1 rounded-xl bg-blue-600 py-2.5 text-sm font-semibold text-white hover:bg-blue-700">Fermer</button>
            </div>
          </div>
        ) : (
          <form onSubmit={submit} className="px-6 py-5 space-y-4">
            <div>
              <label className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-slate-700"><Mail size={12} /> Email</label>
              <input type="email" required value={email} onChange={e => setEmail(e.target.value)} placeholder="client@exemple.fr"
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm placeholder-slate-400 focus:border-blue-500 focus:bg-white focus:outline-none" />
            </div>
            <div>
              <label className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-slate-700">
                <Eye size={12} /> Mot de passe <span className="text-slate-400 font-normal">(vide = généré)</span>
              </label>
              <div className="relative">
                <input type={showPwd ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••"
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 pr-10 text-sm placeholder-slate-400 focus:border-blue-500 focus:bg-white focus:outline-none" />
                <button type="button" onClick={() => setShowPwd(v => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                  {showPwd ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
            </div>
            <div>
              <div className="mb-3 flex items-center justify-between">
                <span className="text-xs font-medium text-slate-700">Crédits alloués</span>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-500">Illimité</span>
                  <button type="button" onClick={() => setUnlim(v => !v)}
                    className={`relative inline-flex h-5 w-9 items-center rounded-full transition ${unlimited ? 'bg-violet-600' : 'bg-slate-200'}`}>
                    <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition ${unlimited ? 'translate-x-4' : 'translate-x-0.5'}`} />
                  </button>
                </div>
              </div>
              {!unlimited ? (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="mb-1 flex items-center gap-1 text-xs text-slate-500"><Phone size={11} /> Téléphone</label>
                    <input type="number" min={0} value={phoneCr} onChange={e => setPhoneCr(Math.max(0, parseInt(e.target.value) || 0))}
                      className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold focus:border-blue-500 focus:bg-white focus:outline-none" />
                  </div>
                  <div>
                    <label className="mb-1 flex items-center gap-1 text-xs text-slate-500"><Mail size={11} /> Email</label>
                    <input type="number" min={0} value={emailCr} onChange={e => setEmailCr(Math.max(0, parseInt(e.target.value) || 0))}
                      className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold focus:border-blue-500 focus:bg-white focus:outline-none" />
                  </div>
                </div>
              ) : (
                <div className="rounded-xl border border-violet-100 bg-violet-50 px-4 py-3 text-xs text-violet-700 font-medium">Déblocages illimités activés.</div>
              )}
            </div>
            <div className="rounded-xl border border-slate-100 bg-slate-50 px-4 py-3 text-xs text-slate-500">
              Statut initial : <span className="font-semibold text-emerald-700">approuvé</span> — connexion immédiate.
            </div>
            {error && <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-xs text-red-600"><AlertCircle size={13} />{error}</div>}
            <div className="flex gap-2 pt-1">
              <button type="button" onClick={onClose} className="flex-1 rounded-xl border border-slate-200 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-50">Annuler</button>
              <button type="submit" disabled={busy}
                className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-blue-600 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60">
                {busy ? <Loader2 size={14} className="animate-spin" /> : <><UserPlus size={14} /> Créer le compte</>}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}

// ─── Vue Dashboard ────────────────────────────────────────────────────────────
// ── Mini sparkline SVG (7 barres) ─────────────────────────────────────────────
function Sparkline({ data }: { data: Array<{ date: string; count: number }> }) {
  const max = Math.max(...data.map(d => d.count), 1)
  const w = 56, h = 24, barW = 6, gap = 2
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="overflow-visible">
      {data.map((d, i) => {
        const barH = Math.max(2, Math.round((d.count / max) * h))
        return (
          <rect
            key={d.date}
            x={i * (barW + gap)}
            y={h - barH}
            width={barW}
            height={barH}
            rx={2}
            className="fill-blue-400 opacity-70"
          />
        )
      })}
    </svg>
  )
}

// ── Carte KPI héro (version enrichie) ─────────────────────────────────────────
function HeroKpi({ label, value, sub, accentClass, icon: Icon, spark, badge, badgeColor }: {
  label: string; value: string | number; sub: string
  accentClass: string; icon: React.ElementType
  spark?: Array<{ date: string; count: number }>
  badge?: string; badgeColor?: string
}) {
  return (
    <div className={`relative rounded-2xl border p-5 shadow-sm overflow-hidden bg-white ${accentClass}`}>
      <div className="flex items-start justify-between mb-4">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1">{label}</p>
          <p className="text-4xl font-extrabold text-slate-900 tabular-nums leading-none">{value}</p>
          <p className="text-xs text-slate-400 mt-1.5">{sub}</p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-100">
            <Icon size={16} className="text-slate-500" />
          </div>
          {badge && (
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${badgeColor ?? 'bg-slate-100 text-slate-500'}`}>
              {badge}
            </span>
          )}
        </div>
      </div>
      {spark && (
        <div className="flex items-end">
          <Sparkline data={spark} />
          <span className="ml-2 text-[10px] text-slate-400">7 jours</span>
        </div>
      )}
    </div>
  )
}

function DashboardView({ token }: { token: string }) {
  const [data, setData]     = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]   = useState<string | null>(null)
  const [lastRefresh, setLastRefresh] = useState(new Date())

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const d = await apiFetch<DashboardData>('/api/admin/dashboard', token)
      setData(d)
      setLastRefresh(new Date())
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Erreur inconnue')
    } finally { setLoading(false) }
  }, [token])

  useEffect(() => { void load() }, [load])

  if (loading) return <Spinner />
  if (error)   return <ErrorState message={error} onRetry={load} />
  if (!data)   return null

  const { kpis, users, activity, subscriptions, recentSearches, recentCharges } = data

  const errColor = kpis.errorRate.percent === 0
    ? 'bg-emerald-100 text-emerald-700'
    : kpis.errorRate.percent < 10
    ? 'bg-amber-100 text-amber-700'
    : 'bg-red-100 text-red-600'

  return (
    <div className="space-y-7">

      {/* ── En-tête ── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900">Vue d'ensemble</h1>
          <p className="text-sm text-slate-400 mt-0.5">
            {new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}
            {' · '}mis à jour {fromNow(lastRefresh.toISOString())}
          </p>
        </div>
        <button onClick={load} className="flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors">
          <RefreshCw size={13} /> Actualiser
        </button>
      </div>

      {/* ── 4 KPIs HÉRO ── */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">

        {/* KPI 1 — Requêtes aujourd'hui */}
        <HeroKpi
          label="Requêtes aujourd'hui"
          value={kpis.requestsToday.toLocaleString('fr-FR')}
          sub={`${activity.searchesThisMonth.toLocaleString('fr-FR')} ce mois`}
          accentClass="border-blue-100"
          icon={Search}
          badge={kpis.requestsToday > 0 ? 'Live' : 'Aucune'}
          badgeColor={kpis.requestsToday > 0 ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-400'}
        />

        {/* KPI 2 — Inscriptions 7 jours */}
        <HeroKpi
          label="Inscriptions 7 jours"
          value={kpis.signups7d}
          sub={`+${users.newThisMonth} ce mois · ${users.pending} en attente`}
          accentClass="border-violet-100"
          icon={UserPlus}
          spark={kpis.signupsSparkline}
          badge={users.pending > 0 ? `${users.pending} à valider` : undefined}
          badgeColor="bg-amber-100 text-amber-700"
        />

        {/* KPI 3 — MRR */}
        <HeroKpi
          label="MRR"
          value={`${parseFloat(kpis.mrr.euros).toLocaleString('fr-FR')} €`}
          sub={`${subscriptions.active} abonnement${subscriptions.active > 1 ? 's' : ''} actif${subscriptions.active > 1 ? 's' : ''}`}
          accentClass="border-emerald-100"
          icon={TrendingUp}
          badge={subscriptions.newThisMonth > 0 ? `+${subscriptions.newThisMonth} ce mois` : undefined}
          badgeColor="bg-emerald-100 text-emerald-700"
        />

        {/* KPI 4 — Taux d'erreur */}
        <HeroKpi
          label="Taux d'erreur système"
          value={`${kpis.errorRate.percent} %`}
          sub={`${kpis.errorRate.errorsToday} erreur${kpis.errorRate.errorsToday !== 1 ? 's' : ''} / ${kpis.errorRate.totalEventsToday} events aujourd'hui`}
          accentClass={kpis.errorRate.percent === 0 ? 'border-emerald-100' : kpis.errorRate.percent < 10 ? 'border-amber-100' : 'border-red-100'}
          icon={Activity}
          badge={kpis.errorRate.percent === 0 ? 'Nominal' : kpis.errorRate.percent < 10 ? 'Attention' : 'Critique'}
          badgeColor={errColor}
        />
      </div>

      {/* ── Barre de contexte ── */}
      <div className="grid grid-cols-3 xl:grid-cols-6 gap-3">
        {[
          { label: 'Utilisateurs', value: users.total, icon: Users },
          { label: 'Recherches / mois', value: activity.searchesThisMonth.toLocaleString('fr-FR'), icon: Search },
          { label: 'Déblocages / mois', value: activity.unlocksThisMonth, icon: KeyRound },
          { label: 'Abonnements', value: subscriptions.active, icon: CheckCircle2 },
          { label: 'Nouveaux ce mois', value: `+${subscriptions.newThisMonth}`, icon: ArrowUp },
          { label: 'Résiliations', value: subscriptions.canceledThisMonth, icon: XCircle },
        ].map(({ label, value, icon: Icon }) => (
          <div key={label} className="rounded-xl bg-white border border-slate-100 shadow-sm p-3 flex items-center gap-3">
            <Icon size={13} className="text-slate-400 shrink-0" />
            <div className="min-w-0">
              <p className="text-[10px] text-slate-400 font-medium uppercase tracking-wide truncate">{label}</p>
              <p className="text-base font-extrabold text-slate-800 tabular-nums">{value}</p>
            </div>
          </div>
        ))}
      </div>

      {/* ── Données détaillées ── */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">

        {/* Dernières recherches */}
        <div className="rounded-2xl bg-white border border-slate-100 shadow-sm">
          <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
            <h2 className="font-bold text-slate-800 text-sm">Activité récente</h2>
            <Search size={13} className="text-slate-400" />
          </div>
          <div className="divide-y divide-slate-50">
            {recentSearches.length === 0 && (
              <p className="px-6 py-8 text-center text-xs text-slate-400">Aucune recherche</p>
            )}
            {recentSearches.map(s => (
              <div key={s.id} className="flex items-center justify-between px-6 py-3 hover:bg-slate-50 transition-colors">
                <div className="min-w-0 pr-2">
                  <p className="text-sm font-semibold text-slate-800 truncate">{s.queryLabel || '—'}</p>
                  <p className="text-[11px] text-slate-400 truncate">{s.userEmail} · {fromNow(s.createdAt)}</p>
                </div>
                <span className="text-[11px] font-mono text-slate-400 shrink-0">{s.resultCount} rés.</span>
              </div>
            ))}
          </div>
        </div>

        {/* Derniers paiements Stripe */}
        <div className="rounded-2xl bg-white border border-slate-100 shadow-sm">
          <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
            <h2 className="font-bold text-slate-800 text-sm">Derniers paiements</h2>
            <CreditCard size={13} className="text-slate-400" />
          </div>
          <div className="divide-y divide-slate-50">
            {recentCharges.length === 0 && (
              <p className="px-6 py-8 text-center text-xs text-slate-400">Aucun paiement ce mois</p>
            )}
            {recentCharges.map(c => (
              <div key={c.id} className="flex items-center justify-between px-6 py-3 hover:bg-slate-50 transition-colors">
                <div className="min-w-0 pr-2">
                  <p className="text-sm font-semibold text-slate-800">{c.amountEuros} €</p>
                  <p className="text-[11px] text-slate-400 truncate">{c.description} · {fromNow(c.createdAt)}</p>
                </div>
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                  c.refunded ? 'bg-orange-50 text-orange-600' :
                  c.paid     ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-500'
                }`}>{c.refunded ? 'Remb.' : c.paid ? 'Payé' : 'Échoué'}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

    </div>
  )
}

// ─── Vue Paramètres système — Feature Flags ───────────────────────────────────
interface FeatureFlag {
  key: string
  label: string
  description: string | null
  enabled: boolean
  updated_at: string
  profiles: { professional_email: string } | null
}

const FLAG_ICONS: Record<string, React.ElementType> = {
  search:            Search,
  phone_unlock:      Phone,
  email_unlock:      Mail,
  new_registrations: UserPlus,
  stripe_checkout:   CreditCard,
  enrichment_ai:     Zap,
}

const CRITICAL_FLAGS = new Set(['stripe_checkout', 'new_registrations'])

function FlagToggle({ enabled, busy, onToggle }: { enabled: boolean; busy: boolean; onToggle: () => void }) {
  return (
    <button
      role="switch"
      aria-checked={enabled}
      onClick={onToggle}
      disabled={busy}
      className={`relative inline-flex h-7 w-12 shrink-0 cursor-pointer items-center rounded-full transition-colors duration-200 focus:outline-none disabled:opacity-50 ${
        enabled ? 'bg-emerald-500' : 'bg-slate-300'
      }`}
    >
      <span className={`inline-block h-5 w-5 rounded-full bg-white shadow-sm transition-transform duration-200 ${
        enabled ? 'translate-x-6' : 'translate-x-1'
      }`} />
    </button>
  )
}

function SettingsView({ token }: { token: string }) {
  const [flags, setFlags] = useState<FeatureFlag[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [confirmOff, setConfirmOff] = useState<FeatureFlag | null>(null)
  const [toast, setToast] = useState<{ key: string; enabled: boolean } | null>(null)

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const d = await apiFetch<FeatureFlag[]>('/api/admin/settings', token)
      setFlags(d)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Erreur')
    } finally { setLoading(false) }
  }, [token])

  useEffect(() => { void load() }, [load])

  const toggle = async (flag: FeatureFlag, forceEnabled?: boolean) => {
    const next = forceEnabled ?? !flag.enabled
    // Interrupteur critique → confirmation avant coupure
    if (!next && CRITICAL_FLAGS.has(flag.key) && forceEnabled === undefined) {
      setConfirmOff(flag); return
    }
    setBusy(flag.key)
    try {
      const r = await fetch('/api/admin/settings', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: flag.key, enabled: next }),
      })
      const json = await r.json() as { ok?: boolean; error?: string }
      if (json.error) { alert(`Erreur : ${json.error}`); return }
      // Invalide le cache flags dans l'app cliente
      invalidateFlagsCache()
      setFlags(prev => prev.map(f => f.key === flag.key
        ? { ...f, enabled: next, updated_at: new Date().toISOString() }
        : f
      ))
      setToast({ key: flag.key, enabled: next })
      setTimeout(() => setToast(null), 3000)
    } finally {
      setBusy(null)
      setConfirmOff(null)
    }
  }

  if (loading) return <Spinner />
  if (error)   return <ErrorState message={error} onRetry={load} />

  const enabled  = flags.filter(f => f.enabled)
  const disabled = flags.filter(f => !f.enabled)

  return (
    <div className="space-y-7">

      {/* Toast confirmation */}
      {toast && (
        <div className={`fixed bottom-6 right-6 z-50 flex items-center gap-3 rounded-2xl px-5 py-3 text-sm font-bold text-white shadow-xl transition-all ${
          toast.enabled ? 'bg-emerald-600' : 'bg-slate-700'
        }`}>
          <ToggleLeft size={16} />
          {toast.enabled ? `✓ ${flags.find(f => f.key === toast.key)?.label} activé` : `⊘ ${flags.find(f => f.key === toast.key)?.label} désactivé`}
        </div>
      )}

      {/* Modal confirmation coupure critique */}
      {confirmOff && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="mx-6 w-full max-w-sm rounded-2xl bg-white shadow-2xl p-6">
            <div className="flex items-center justify-center h-12 w-12 rounded-full bg-red-100 mx-auto mb-4">
              <AlertCircle size={22} className="text-red-600" />
            </div>
            <h3 className="text-base font-bold text-slate-900 text-center mb-1">Couper une fonctionnalité critique</h3>
            <p className="text-sm text-slate-500 text-center mb-4">
              Désactiver <strong className="text-slate-800">{confirmOff.label}</strong> impactera immédiatement tous les utilisateurs actifs.
            </p>
            <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-3 mb-5">
              <p className="text-xs text-red-700 font-medium">{confirmOff.description}</p>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setConfirmOff(null)}
                className="flex-1 rounded-xl border border-slate-200 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50">
                Annuler
              </button>
              <button onClick={() => toggle(confirmOff, false)} disabled={busy === confirmOff.key}
                className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-red-600 py-2.5 text-sm font-bold text-white hover:bg-red-700 disabled:opacity-60">
                {busy === confirmOff.key ? <Loader2 size={14} className="animate-spin" /> : null}
                Désactiver quand même
              </button>
            </div>
          </div>
        </div>
      )}

      {/* En-tête */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900">Paramètres système</h1>
          <p className="text-sm text-slate-400 mt-0.5">Interrupteurs d'urgence — actif en temps réel, sans redéploiement</p>
        </div>
        <button onClick={load} className="flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50">
          <RefreshCw size={13} /> Actualiser
        </button>
      </div>

      {/* Alerte si des flags sont OFF */}
      {disabled.length > 0 && (
        <div className="flex items-start gap-3 rounded-2xl bg-amber-50 border border-amber-200 px-5 py-4">
          <AlertCircle size={16} className="text-amber-600 mt-0.5 shrink-0" />
          <div>
            <p className="text-sm font-bold text-amber-800">
              {disabled.length} fonctionnalité{disabled.length > 1 ? 's' : ''} désactivée{disabled.length > 1 ? 's' : ''}
            </p>
            <p className="text-xs text-amber-700 mt-0.5">
              {disabled.map(f => f.label).join(' · ')} — les utilisateurs voient un message « Maintenance en cours ».
            </p>
          </div>
        </div>
      )}

      {/* Grille de flags */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {flags.map(flag => {
          const Icon = FLAG_ICONS[flag.key] ?? Settings2
          const isCritical = CRITICAL_FLAGS.has(flag.key)
          const isBusy = busy === flag.key
          return (
            <div key={flag.key} className={`relative rounded-2xl border bg-white p-5 shadow-sm transition-all ${
              flag.enabled
                ? isCritical ? 'border-slate-200' : 'border-slate-200'
                : 'border-red-200 bg-red-50/30'
            }`}>
              {isCritical && (
                <span className="absolute top-3 right-16 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-700">
                  critique
                </span>
              )}
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-2.5">
                  <div className={`flex h-9 w-9 items-center justify-center rounded-xl ${
                    flag.enabled ? 'bg-blue-50' : 'bg-slate-100'
                  }`}>
                    <Icon size={15} className={flag.enabled ? 'text-blue-600' : 'text-slate-400'} />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-slate-800">{flag.label}</p>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <span className={`h-1.5 w-1.5 rounded-full ${flag.enabled ? 'bg-emerald-400' : 'bg-red-400'}`} />
                      <span className={`text-[11px] font-semibold ${flag.enabled ? 'text-emerald-600' : 'text-red-500'}`}>
                        {flag.enabled ? 'Actif' : 'Hors service'}
                      </span>
                    </div>
                  </div>
                </div>
                <FlagToggle enabled={flag.enabled} busy={isBusy} onToggle={() => toggle(flag)} />
              </div>
              {flag.description && (
                <p className="text-xs text-slate-400 mb-3 leading-relaxed">{flag.description}</p>
              )}
              <div className="flex items-center justify-between pt-3 border-t border-slate-100">
                <span className="text-[10px] font-mono text-slate-300">{flag.key}</span>
                <span className="text-[10px] text-slate-400">
                  {flag.profiles?.professional_email
                    ? `${flag.profiles.professional_email.split('@')[0]} · `
                    : ''
                  }{fromNow(flag.updated_at)}
                </span>
              </div>
            </div>
          )
        })}
      </div>

      {/* Section info — comportement quand un flag est OFF */}
      <div className="rounded-2xl border border-slate-100 bg-slate-50 p-5 space-y-3">
        <div className="flex items-center gap-2">
          <ShieldCheck size={14} className="text-slate-500" />
          <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Comportement côté client</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {[
            ['search', 'La barre de recherche est grisée avec "Recherche temporairement indisponible"'],
            ['phone_unlock / email_unlock', 'Le bouton déblocage affiche "Module en maintenance" et ne consomme aucun crédit'],
            ['stripe_checkout / new_registrations', 'Le flux concerné affiche "Service temporairement suspendu — revenez bientôt"'],
          ].map(([label, desc]) => (
            <div key={label} className="rounded-xl bg-white border border-slate-100 p-3">
              <p className="text-[10px] font-mono font-bold text-slate-500 mb-1">{label}</p>
              <p className="text-xs text-slate-500">{desc}</p>
            </div>
          ))}
        </div>
      </div>

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
  const [showCreate, setShowCreate] = useState(false)

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

      {showCreate && (
        <CreateUserModal token={token} onClose={() => setShowCreate(false)} onCreated={load} />
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
          <button onClick={() => setShowCreate(true)}
            className="flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700">
            <UserPlus size={13} /> Créer un compte
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
                    <div className="space-y-1">
                      <div className="flex items-center gap-1.5 text-[11px]">
                        <Phone size={10} className="text-blue-400" />
                        <span className="font-semibold text-slate-700">{u.phoneUnlocks}</span>
                        <span className="text-slate-400">tél</span>
                      </div>
                      <div className="flex items-center gap-1.5 text-[11px]">
                        <Mail size={10} className="text-violet-400" />
                        <span className="font-semibold text-slate-700">{u.emailUnlocks}</span>
                        <span className="text-slate-400">email</span>
                      </div>
                      <div className="flex items-center gap-1 text-[10px] text-slate-400">
                        <span>{u.monthlyUsage}</span><span>/</span><span>{u.quota} rech.</span>
                      </div>
                    </div>
                  </td>
                  <td className="px-5 py-4">
                    <p className="text-[12px] text-slate-600">{fmt(u.createdAt)}</p>
                    <p className="text-[11px] text-slate-400">{fromNow(u.lastLoginAt)}</p>
                  </td>
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-1.5">
                      <button onClick={() => setDrawerUserId(u.id)}
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

// ─── Vue Audit Trail ──────────────────────────────────────────────────────────
function LogsView({ token }: { token: string }) {
  const [data, setData]       = useState<LogsResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState<string | null>(null)
  const [filter, setFilter]   = useState('')
  const [actorFilter, setActorFilter] = useState('')
  const [expanded, setExpanded] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try { setData(await apiFetch<LogsResponse>('/api/admin/logs', token)) }
    catch (e: unknown) { setError(e instanceof Error ? e.message : 'Erreur') }
    finally { setLoading(false) }
  }, [token])

  useEffect(() => { void load() }, [load])

  const logs = (data?.logs ?? []).filter(l => {
    if (filter && !l.action.includes(filter)) return false
    if (actorFilter && !String(l.actorEmail).toLowerCase().includes(actorFilter.toLowerCase())) return false
    return true
  })
  const health = data?.health

  function renderMetadata(meta: Record<string, unknown>): string {
    const entries = Object.entries(meta)
      .filter(([k]) => !['source', 'event'].includes(k))
      .map(([k, v]) => `${k}: ${String(v)}`)
    return entries.join(' · ') || '—'
  }

  if (loading) return <Spinner />
  if (error) return <ErrorState message={error} onRetry={load} />

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900">Audit Trail</h1>
          <p className="text-sm text-slate-400">Journal indélébile de toutes les actions — {data?.logs.length ?? 0} entrées</p>
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

      <div className="flex flex-wrap gap-2 items-center">
        <div className="flex gap-1.5 flex-wrap">
          {[
            ['', 'Tous'],
            ['search', 'Recherches'],
            ['unlock', 'Déblocages'],
            ['admin_', 'Actions admin'],
            ['alerte_paiement', 'Paiements'],
            ['churn', 'Churn'],
          ].map(([k, l]) => (
            <button key={k} onClick={() => setFilter(k)}
              className={`rounded-full px-3 py-1 text-xs font-semibold border transition ${filter === k ? 'bg-slate-900 text-white border-slate-900' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}>
              {l}
            </button>
          ))}
        </div>
        <input
          type="text" value={actorFilter} onChange={e => setActorFilter(e.target.value)}
          placeholder="Filtrer par acteur…"
          className="ml-auto rounded-xl border border-slate-200 px-3 py-1.5 text-xs outline-none focus:ring-2 focus:ring-blue-500 w-44"
        />
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
            ) : logs.map(l => {
              const info = ACTION_LABELS[l.action]
              const sev: Severity = info?.severity ?? (l.action.startsWith('admin_') ? 'warning' : 'normal')
              const label = info?.label ?? l.action
              const isExpanded = expanded === l.id
              return (
                <tr key={l.id} className="hover:bg-slate-50 cursor-pointer" onClick={() => setExpanded(isExpanded ? null : l.id)}>
                  <td className="px-5 py-3">
                    <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-bold ${SEVERITY_STYLES[sev]}`}>
                      {label}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-[12px] text-slate-600 max-w-[180px] truncate">
                    {l.actorEmail ? String(l.actorEmail) : <span className="text-slate-300 italic">système</span>}
                  </td>
                  <td className="px-5 py-3 text-[11px] text-slate-400 max-w-[280px]">
                    {isExpanded && l.metadata ? (
                      <div className="space-y-0.5">
                        {Object.entries(l.metadata).map(([k, v]) => (
                          <div key={k}><span className="font-medium text-slate-500">{k}:</span> {String(v)}</div>
                        ))}
                      </div>
                    ) : (
                      <span className="truncate block">{l.metadata ? renderMetadata(l.metadata) : '—'}</span>
                    )}
                  </td>
                  <td className="px-5 py-3 text-[11px] text-slate-400 whitespace-nowrap">{fromNow(l.createdAt)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ─── Vue Recherches ───────────────────────────────────────────────────────────
function SearchesView({ token }: { token: string }) {
  const [data, setData]       = useState<Metrics | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState<string | null>(null)
  const [query, setQuery]     = useState('')

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try { setData(await apiFetch<Metrics>('/api/admin/metrics', token)) }
    catch (e: unknown) { setError(e instanceof Error ? e.message : 'Erreur') }
    finally { setLoading(false) }
  }, [token])

  useEffect(() => { void load() }, [load])

  if (loading) return <Spinner />
  if (error) return <ErrorState message={error} onRetry={load} />
  if (!data) return null

  const searches = data.recentSearches.filter(s =>
    !query || s.queryLabel.toLowerCase().includes(query.toLowerCase()) || s.userEmail.toLowerCase().includes(query.toLowerCase())
  )

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900">Recherches récentes</h1>
          <p className="text-sm text-slate-400">{data.recentSearches.length} dernières requêtes</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Filtrer…"
              className="rounded-xl border border-slate-200 pl-9 pr-4 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500 w-52" />
          </div>
          <button onClick={load} className="flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50">
            <RefreshCw size={13} />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        <KpiCard label="Recherches / mois" value={data.activity.searchesThisMonth.toLocaleString('fr-FR')} icon={Search} accent="bg-blue-500" />
        <KpiCard label="Déblocages / mois" value={data.activity.unlocksThisMonth} icon={KeyRound} accent="bg-violet-500" />
        <KpiCard label="Crédits tél" value={data.credits.byType.phone} icon={Phone} />
        <KpiCard label="Crédits email" value={data.credits.byType.email} icon={Mail} />
      </div>

      <div className="rounded-2xl bg-white border border-slate-100 shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50">
              {['Requête', 'Résultats', 'Utilisateur', 'Date'].map(h => (
                <th key={h} className="px-5 py-3 text-left text-[11px] font-bold uppercase tracking-wide text-slate-500">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {searches.length === 0 ? (
              <tr><td colSpan={4} className="py-12 text-center text-sm text-slate-400">Aucune recherche</td></tr>
            ) : searches.map(s => (
              <tr key={s.id} className="hover:bg-slate-50">
                <td className="px-5 py-3">
                  <div className="flex items-center gap-2">
                    <Search size={12} className="text-slate-400 shrink-0" />
                    <span className="font-medium text-slate-800 truncate max-w-[280px]">{s.queryLabel || '—'}</span>
                  </div>
                </td>
                <td className="px-5 py-3">
                  <span className="rounded-full bg-blue-50 px-2 py-0.5 text-xs font-semibold text-blue-700">{s.resultCount}</span>
                </td>
                <td className="px-5 py-3 text-[12px] text-slate-500 truncate max-w-[200px]">{s.userEmail}</td>
                <td className="px-5 py-3 text-[11px] text-slate-400">{fromNow(s.createdAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {data.topOrgs.length > 0 && (
        <div className="rounded-2xl bg-white border border-slate-100 shadow-sm">
          <div className="px-6 py-4 border-b border-slate-100">
            <h2 className="font-bold text-slate-800">Top organisations</h2>
          </div>
          <div className="p-4 grid grid-cols-2 md:grid-cols-5 gap-3">
            {data.topOrgs.map((o, i) => (
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

// ─── Pipeline types ────────────────────────────────────────────────────────────
interface Lead {
  id: string
  name: string
  email: string | null
  company: string | null
  stage: 'prospect' | 'demo' | 'client' | 'churned'
  notes: string | null
  value_eur: number
  created_at: string
  updated_at: string
}

const STAGES: { key: Lead['stage']; label: string; color: string; bg: string; border: string }[] = [
  { key: 'prospect', label: 'Prospect',  color: 'text-slate-700',  bg: 'bg-slate-50',   border: 'border-slate-200' },
  { key: 'demo',     label: 'Démo',      color: 'text-blue-700',   bg: 'bg-blue-50',    border: 'border-blue-200'  },
  { key: 'client',   label: 'Client',    color: 'text-green-700',  bg: 'bg-green-50',   border: 'border-green-200' },
  { key: 'churned',  label: 'Churné',    color: 'text-red-600',    bg: 'bg-red-50',     border: 'border-red-200'   },
]

// ─── Vue Pipeline (Kanban natif Supabase) ─────────────────────────────────────
function PipelineView({ token }: { token: string }) {
  const [leads, setLeads]         = useState<Lead[]>([])
  const [loading, setLoading]     = useState(true)
  const [error, setError]         = useState<string | null>(null)
  const [dragging, setDragging]   = useState<string | null>(null)
  const [dragOver, setDragOver]   = useState<Lead['stage'] | null>(null)
  const [showForm, setShowForm]   = useState(false)
  const [editLead, setEditLead]   = useState<Lead | null>(null)

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const data = await apiFetch<Lead[]>('/api/admin/pipeline', token)
      setLeads(data)
    } catch (e: unknown) { setError(e instanceof Error ? e.message : 'Erreur') }
    finally { setLoading(false) }
  }, [token])

  useEffect(() => { void load() }, [load])

  const moveStage = async (id: string, stage: Lead['stage']) => {
    setLeads(prev => prev.map(l => l.id === id ? { ...l, stage } : l))
    await apiFetch(`/api/admin/pipeline?id=${id}`, token, 'PATCH', { stage })
  }

  const deleteLead = async (id: string) => {
    if (!confirm('Supprimer ce lead ?')) return
    setLeads(prev => prev.filter(l => l.id !== id))
    await fetch(`/api/admin/pipeline?id=${id}`, {
      method: 'DELETE', headers: { Authorization: `Bearer ${token}` },
    })
  }

  const totalMrr = leads.filter(l => l.stage === 'client').reduce((s, l) => s + l.value_eur, 0)
  const totalPipeline = leads.filter(l => l.stage !== 'churned').reduce((s, l) => s + l.value_eur, 0)

  if (loading) return <Spinner />
  if (error)   return <ErrorState message={error} onRetry={load} />

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900">Pipeline commercial</h1>
          <p className="text-sm text-slate-400">{leads.length} leads · {totalPipeline.toLocaleString('fr-FR')}€ pipeline</p>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={load} className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-600 hover:bg-slate-50">
            <RefreshCw size={13} />
          </button>
          <button onClick={() => { setEditLead(null); setShowForm(true) }}
            className="flex items-center gap-2 rounded-xl bg-[#1B54FF] px-4 py-2 text-sm font-semibold text-white hover:bg-[#1B54FF]/90 shadow-sm">
            <UserPlus size={13} /> Ajouter un lead
          </button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-4 gap-4">
        {STAGES.map(s => {
          const col = leads.filter(l => l.stage === s.key)
          return (
            <div key={s.key} className={`rounded-2xl border ${s.border} ${s.bg} p-4`}>
              <p className={`text-xs font-bold uppercase tracking-wide ${s.color} mb-1`}>{s.label}</p>
              <p className="text-2xl font-extrabold text-slate-900">{col.length}</p>
              {col.some(l => l.value_eur > 0) && (
                <p className="text-xs text-slate-500 mt-0.5">{col.reduce((a, l) => a + l.value_eur, 0).toLocaleString('fr-FR')}€</p>
              )}
            </div>
          )
        })}
      </div>

      {/* Kanban */}
      <div className="grid grid-cols-4 gap-4 items-start">
        {STAGES.map(s => {
          const col = leads.filter(l => l.stage === s.key)
          const isOver = dragOver === s.key
          return (
            <div key={s.key}
              className={`rounded-2xl border-2 transition-colors min-h-[200px] p-3 space-y-3 ${isOver ? `${s.border} ${s.bg}` : 'border-transparent bg-slate-50'}`}
              onDragOver={e => { e.preventDefault(); setDragOver(s.key) }}
              onDragLeave={() => setDragOver(null)}
              onDrop={async e => {
                e.preventDefault(); setDragOver(null)
                if (dragging && dragging !== s.key + ':skip') await moveStage(dragging, s.key)
                setDragging(null)
              }}
            >
              <div className="flex items-center justify-between px-1">
                <span className={`text-xs font-bold uppercase tracking-wide ${s.color}`}>{s.label}</span>
                <span className="text-xs font-bold text-slate-400">{col.length}</span>
              </div>
              {col.map(lead => (
                <div key={lead.id}
                  draggable
                  onDragStart={() => setDragging(lead.id)}
                  onDragEnd={() => setDragging(null)}
                  className={`rounded-xl bg-white border border-slate-100 shadow-sm p-3 cursor-grab active:cursor-grabbing transition-opacity ${dragging === lead.id ? 'opacity-40' : ''}`}
                >
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <p className="text-sm font-semibold text-slate-800 leading-tight">{lead.name}</p>
                    <div className="flex gap-1 shrink-0">
                      <button onClick={() => { setEditLead(lead); setShowForm(true) }}
                        className="rounded p-1 hover:bg-slate-100 text-slate-400"><Eye size={11} /></button>
                      <button onClick={() => deleteLead(lead.id)}
                        className="rounded p-1 hover:bg-red-50 text-slate-400 hover:text-red-500"><X size={11} /></button>
                    </div>
                  </div>
                  {lead.company && <p className="text-[11px] text-slate-400 truncate">{lead.company}</p>}
                  {lead.email && <p className="text-[11px] text-blue-500 truncate">{lead.email}</p>}
                  {lead.value_eur > 0 && (
                    <p className="text-[11px] font-bold text-green-600 mt-1">{lead.value_eur.toLocaleString('fr-FR')}€/mois</p>
                  )}
                  {lead.notes && <p className="text-[11px] text-slate-400 mt-1 line-clamp-2">{lead.notes}</p>}
                  {/* Quick stage buttons */}
                  <div className="flex gap-1 mt-2">
                    {STAGES.filter(st => st.key !== s.key).map(st => (
                      <button key={st.key} onClick={() => moveStage(lead.id, st.key)}
                        className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${st.bg} ${st.color} border ${st.border} hover:opacity-80`}>
                        → {st.label}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
              {col.length === 0 && (
                <div className="flex items-center justify-center h-20 rounded-xl border-2 border-dashed border-slate-200">
                  <p className="text-xs text-slate-300">Glisser ici</p>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* MRR client total */}
      {totalMrr > 0 && (
        <div className="rounded-2xl bg-green-50 border border-green-200 p-4 flex items-center gap-3">
          <DollarSign size={18} className="text-green-600" />
          <div>
            <p className="text-xs font-bold uppercase text-green-600">MRR clients actifs</p>
            <p className="text-xl font-extrabold text-green-700">{totalMrr.toLocaleString('fr-FR')}€/mois</p>
          </div>
        </div>
      )}

      {/* Modal ajout / édition */}
      {showForm && (
        <LeadFormModal
          token={token}
          lead={editLead}
          onClose={() => setShowForm(false)}
          onSaved={() => { setShowForm(false); void load() }}
        />
      )}
    </div>
  )
}

function LeadFormModal({ token, lead, onClose, onSaved }: {
  token: string; lead: Lead | null; onClose: () => void; onSaved: () => void
}) {
  const [name, setName]       = useState(lead?.name ?? '')
  const [email, setEmail]     = useState(lead?.email ?? '')
  const [company, setCompany] = useState(lead?.company ?? '')
  const [stage, setStage]     = useState<Lead['stage']>(lead?.stage ?? 'prospect')
  const [notes, setNotes]     = useState(lead?.notes ?? '')
  const [value, setValue]     = useState(String(lead?.value_eur ?? 0))
  const [saving, setSaving]   = useState(false)
  const [err, setErr]         = useState<string | null>(null)

  const save = async () => {
    if (!name.trim()) { setErr('Nom requis'); return }
    setSaving(true); setErr(null)
    try {
      const body = { name: name.trim(), email: email || null, company: company || null, stage, notes: notes || null, value_eur: parseInt(value) || 0 }
      if (lead) {
        await apiFetch(`/api/admin/pipeline?id=${lead.id}`, token, 'PATCH', body)
      } else {
        await apiFetch('/api/admin/pipeline', token, 'POST', body)
      }
      onSaved()
    } catch (e: unknown) { setErr(e instanceof Error ? e.message : 'Erreur') }
    finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl p-6" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-bold text-slate-900">{lead ? 'Modifier le lead' : 'Nouveau lead'}</h2>
          <button onClick={onClose} className="rounded-lg p-1.5 hover:bg-slate-100"><X size={16} /></button>
        </div>
        <div className="space-y-3">
          <div>
            <label className="text-xs font-semibold text-slate-500 uppercase">Nom *</label>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="Jean Dupont"
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase">Email</label>
              <input value={email} onChange={e => setEmail(e.target.value)} placeholder="jean@..." type="email"
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase">Entreprise</label>
              <input value={company} onChange={e => setCompany(e.target.value)} placeholder="Acme SAS"
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase">Stade</label>
              <select value={stage} onChange={e => setStage(e.target.value as Lead['stage'])}
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500 bg-white">
                {STAGES.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase">Valeur €/mois</label>
              <input value={value} onChange={e => setValue(e.target.value)} type="number" min="0" placeholder="79"
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-500 uppercase">Notes</label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3} placeholder="Contexte, besoins, prochaines étapes…"
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
          </div>
          {err && <p className="text-xs text-red-500">{err}</p>}
        </div>
        <div className="flex justify-end gap-3 mt-5">
          <button onClick={onClose} className="rounded-xl border border-slate-200 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50">Annuler</button>
          <button onClick={save} disabled={saving}
            className="flex items-center gap-2 rounded-xl bg-[#1B54FF] px-5 py-2 text-sm font-semibold text-white hover:bg-[#1B54FF]/90 disabled:opacity-60">
            {saving ? <Loader2 size={13} className="animate-spin" /> : null}
            {lead ? 'Enregistrer' : 'Créer'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Vue Équipe Admin (RBAC) ──────────────────────────────────────────────────
function TeamView({ token, currentUserId }: { token: string; currentUserId: string }) {
  const [members, setMembers] = useState<AdminMember[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState<string | null>(null)
  const [saving, setSaving]   = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try { setMembers(await apiFetch<AdminMember[]>('/api/admin/team', token)) }
    catch (e: unknown) { setError(e instanceof Error ? e.message : 'Erreur') }
    finally { setLoading(false) }
  }, [token])

  useEffect(() => { void load() }, [load])

  const updateScope = async (userId: string, newScope: AdminScope | null) => {
    setSaving(userId)
    try {
      await apiPost('/api/admin/team', token, { userId, adminScope: newScope })
      setMembers(prev => prev.map(m => m.id === userId ? { ...m, adminScope: newScope ?? 'super' } : m))
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : 'Erreur')
    } finally {
      setSaving(null)
    }
  }

  const scopeOptions: Array<{ value: AdminScope; label: string; desc: string; icon: React.ElementType }> = [
    { value: 'super',   label: 'Super Admin', desc: 'Accès total',                        icon: ShieldAlert },
    { value: 'support', label: 'Support',     desc: 'Clients, pipeline, pas de finances', icon: UsersRound  },
    { value: 'dev',     label: 'Développeur', desc: 'Logs, feature flags, pas de clients', icon: Code2       },
  ]

  if (loading) return <Spinner />
  if (error)   return <ErrorState message={error} onRetry={load} />

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900">Équipe Admin</h1>
          <p className="text-sm text-slate-400">Gérer les accès et permissions des membres admin</p>
        </div>
        <button onClick={load} className="flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50">
          <RefreshCw size={13} /> Actualiser
        </button>
      </div>

      {/* Matrice de permissions */}
      <div className="grid grid-cols-3 gap-4">
        {scopeOptions.map(({ value, label, desc, icon: Icon }) => (
          <div key={value} className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
            <div className="flex items-center gap-2 mb-2">
              <span className={`inline-flex h-7 w-7 items-center justify-center rounded-lg ${SCOPE_COLORS[value]}`}>
                <Icon size={14} />
              </span>
              <span className="font-semibold text-slate-800 text-sm">{label}</span>
            </div>
            <p className="text-[11px] text-slate-400">{desc}</p>
            <div className="mt-3 space-y-1 text-[11px] text-slate-500">
              {((): React.ReactNode => {
                const ok = (text: string) => <div key={text} className="flex gap-1"><CheckCircle2 size={10} className="text-emerald-500 mt-0.5 shrink-0" />{text}</div>
                const no = (text: string) => <div key={text} className="flex gap-1"><XCircle size={10} className="text-red-400 mt-0.5 shrink-0" />{text}</div>
                if (value === 'super')   return <>{ok('Tableau de bord')}{ok('Clients + actions sensibles')}{ok('Finances Stripe')}{ok('Audit Trail + Feature Flags')}{ok('Gestion de l’équipe')}</>
                if (value === 'support') return <>{ok('Tableau de bord')}{ok('Clients + impersonation')}{ok('Recherches + Pipeline')}{no('Finances, crédits, suppression')}</>
                return <>{ok('Tableau de bord')}{ok('Audit Trail complet')}{ok('Feature Flags')}{no('Données clients, finances')}</>
              })()}
            </div>
          </div>
        ))}
      </div>

      {/* Liste des membres */}
      <div className="rounded-2xl bg-white border border-slate-100 shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50">
              {['Membre', 'Rôle actuel', 'Dernière action', 'Dernière connexion', 'Modifier'].map(h => (
                <th key={h} className="px-5 py-3 text-left text-[11px] font-bold uppercase tracking-wide text-slate-500">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {members.map(m => {
              const isSelf = m.id === currentUserId
              const lastActionInfo = m.lastAction ? ACTION_LABELS[m.lastAction.action] : null
              return (
                <tr key={m.id} className="hover:bg-slate-50">
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-2.5">
                      <div className="h-8 w-8 rounded-full bg-violet-100 flex items-center justify-center text-xs font-bold text-violet-700 shrink-0">
                        {(m.email ?? '?')[0].toUpperCase()}
                      </div>
                      <div>
                        <p className="text-[12px] font-semibold text-slate-800 truncate max-w-[160px]">{m.email}</p>
                        {m.firstName && <p className="text-[11px] text-slate-400">{m.firstName} {m.lastName}</p>}
                        {isSelf && <span className="text-[10px] text-blue-500 font-semibold">Vous</span>}
                      </div>
                    </div>
                  </td>
                  <td className="px-5 py-3">
                    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-bold ${SCOPE_COLORS[m.adminScope]}`}>
                      {SCOPE_LABELS[m.adminScope]}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-[11px] text-slate-500">
                    {m.lastAction ? (
                      <div>
                        <span className={`inline-flex rounded px-1.5 py-0.5 text-[10px] font-bold ${SEVERITY_STYLES[lastActionInfo?.severity ?? 'normal']}`}>
                          {lastActionInfo?.label ?? m.lastAction.action}
                        </span>
                        <span className="ml-1.5 text-slate-400">{fromNow(m.lastAction.created_at)}</span>
                      </div>
                    ) : <span className="text-slate-300">—</span>}
                  </td>
                  <td className="px-5 py-3 text-[11px] text-slate-400">{fromNow(m.lastLoginAt)}</td>
                  <td className="px-5 py-3">
                    {isSelf ? (
                      <span className="text-[11px] text-slate-300 italic">Impossible de se modifier soi-même</span>
                    ) : (
                      <select
                        disabled={!!saving}
                        value={m.adminScope}
                        onChange={e => void updateScope(m.id, e.target.value as AdminScope)}
                        className="rounded-xl border border-slate-200 px-2 py-1 text-xs text-slate-700 outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
                      >
                        <option value="super">Super Admin</option>
                        <option value="support">Support</option>
                        <option value="dev">Développeur</option>
                      </select>
                    )}
                    {saving === m.id && <Loader2 size={12} className="inline ml-2 animate-spin text-slate-400" />}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ─── Layout principal ─────────────────────────────────────────────────────────
interface AdminCRMPageProps { account: Account; onLogout: () => void; onSwitchToSearch?: () => void }

export default function AdminCRMPage({ account, onLogout, onSwitchToSearch }: AdminCRMPageProps) {
  const [view, setView]         = useState<CRMView>('dashboard')
  const [token, setToken]       = useState('')
  const [adminScope, setAdminScope] = useState<AdminScope>('super')
  const [adminUserId, setAdminUserId] = useState('')
  const [pendingCount, setPendingCount] = useState<number | null>(null)

  // Normalisation BAN interne (jointure SQL)
  const [banStatus, setBanStatus]   = useState<{ pending: number; done: number } | null>(null)
  const [banRunning, setBanRunning] = useState(false)
  const [banLog, setBanLog]         = useState<string[]>([])

  useEffect(() => { getToken().then(setToken) }, [])

  useEffect(() => {
    if (!token) return
    apiFetch<{ adminScope: AdminScope; userId: string }>('/api/admin/me', token)
      .then(d => { setAdminScope(d.adminScope ?? 'super'); setAdminUserId(d.userId) })
      .catch(() => {})
    apiFetch<{ users: unknown[]; total: number }>('/api/admin/users?status=pending&limit=1', token)
      .then(d => setPendingCount(d.total)).catch(() => {})
  }, [token])

  const allNav = [
    { key: 'dashboard' as CRMView, label: 'Vue d\'ensemble', icon: LayoutDashboard },
    { key: 'users'     as CRMView, label: 'Clients',         icon: Users           },
    { key: 'searches'  as CRMView, label: 'Recherches',      icon: List            },
    { key: 'finances'  as CRMView, label: 'Finances',        icon: CreditCard      },
    { key: 'pipeline'  as CRMView, label: 'Pipeline',        icon: GitBranch       },
    { key: 'logs'      as CRMView, label: 'Audit Trail',     icon: Activity        },
    { key: 'settings'  as CRMView, label: 'Feature Flags',   icon: Settings2       },
    { key: 'team'      as CRMView, label: 'Équipe Admin',    icon: UsersRound      },
  ]
  const allowedViews = SCOPE_ALLOWED_VIEWS[adminScope]
  const nav = allNav.filter(n => allowedViews.includes(n.key))

  // Si la vue active n'est plus accessible pour le scope, revenir au dashboard
  useEffect(() => {
    if (!allowedViews.includes(view)) setView('dashboard')
  }, [adminScope, view, allowedViews])

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
              <span className={`inline-flex items-center rounded-full px-1.5 py-0.5 text-[9px] font-bold ${SCOPE_COLORS[adminScope]}`}>
                {SCOPE_LABELS[adminScope]}
              </span>
            </div>
          </div>
          {onSwitchToSearch && (
            <button onClick={onSwitchToSearch}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#124bd2] py-2 text-xs font-semibold text-white hover:bg-[#0b3fbc] mb-2">
              <Search size={13} /> Accéder à la recherche
            </button>
          )}

          {/* ── Normalisation BAN interne ── */}
          <button
            onClick={async () => {
              if (!banStatus && token) {
                const s = await apiFetch<{ pending: number; done: number }>('/api/admin?sub=normalize-addresses', token).catch(() => null)
                if (s) setBanStatus(s)
              }
            }}
            className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-slate-200 py-1.5 text-[10px] font-medium text-slate-500 hover:bg-slate-50 mb-1"
          >
            <MapPin size={11} /> Normalisation BAN
          </button>
          {banStatus && (
            <div className="mb-2 rounded-lg bg-slate-50 border border-slate-100 px-3 py-2 text-[10px] text-slate-600 leading-relaxed">
              <div className="flex justify-between mb-1.5">
                <span className="text-slate-400">En attente</span>
                <span className="font-semibold">{banStatus.pending.toLocaleString('fr-FR')}</span>
              </div>
              <div className="flex justify-between mb-2">
                <span className="text-slate-400">Normalisés</span>
                <span className="font-semibold text-emerald-600">{banStatus.done.toLocaleString('fr-FR')}</span>
              </div>
              <button
                disabled={banRunning || banStatus.pending === 0}
                onClick={async () => {
                  if (!token || banRunning) return
                  setBanRunning(true)
                  try {
                    let remaining = banStatus.pending
                    while (remaining > 0) {
                      const r = await apiFetch<{ processed: number; matched: number }>(
                        '/api/admin?sub=normalize-addresses', token, 'POST', { batchSize: 10000 }
                      ).catch(() => null)
                      if (!r || r.processed === 0) break
                      remaining -= r.processed
                      setBanLog(prev => [`Batch : ${r.matched}/${r.processed} trouvés — restants ~${Math.max(0, remaining).toLocaleString('fr-FR')}`, ...prev.slice(0, 4)])
                      setBanStatus(prev => prev ? { ...prev, pending: Math.max(0, prev.pending - r.processed), done: prev.done + r.matched } : prev)
                      await new Promise(x => setTimeout(x, 200))
                    }
                  } finally { setBanRunning(false) }
                }}
                className="w-full flex items-center justify-center gap-1.5 rounded-lg bg-[#124bd2] py-1.5 text-[10px] font-semibold text-white hover:bg-[#0b3fbc] disabled:opacity-50 transition"
              >
                {banRunning
                  ? <><Loader2 size={10} className="animate-spin" /> En cours…</>
                  : banStatus.pending === 0 ? '✓ Tout normalisé' : `▶ Lancer (${Math.ceil(banStatus.pending / 10000)} batchs)`
                }
              </button>
              {banLog.length > 0 && (
                <div className="mt-1.5 space-y-0.5">
                  {banLog.map((l, i) => <p key={i} className="text-[9px] text-slate-400 truncate">{l}</p>)}
                </div>
              )}
            </div>
          )}

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
            {view === 'searches'  && <SearchesView  token={token} />}
            {view === 'finances'  && <FinancesView  token={token} />}
            {view === 'pipeline'  && <PipelineView  token={token} />}
            {view === 'logs'      && <LogsView       token={token} />}
            {view === 'settings'  && <SettingsView   token={token} />}
            {view === 'team'      && <TeamView       token={token} currentUserId={adminUserId} />}
          </>
        )}
      </main>
    </div>
  )
}
