/**
 * Page complète de fiche utilisateur admin
 * URL : ?crm&user={userId}
 * Remplace l'ancien drawer (panneau coulissant)
 */
import { useState, useEffect, useCallback } from 'react'
import {
  ArrowLeft, AlertCircle, Ban, Calendar, CheckCircle2,
  CreditCard, Eye, Globe, Hash, KeyRound, Loader2,
  Mail, MapPin, Monitor, Phone, RefreshCw, Search,
  ShieldCheck, Star, UserCheck, WifiOff, X, Zap,
  Laptop, Smartphone, Tablet, Trash2,
} from 'lucide-react'
import trouveLogo from '@/assets/trouve-logo.png'
import { getSupabaseClient } from '@/lib/supabase'

// ─── Stripe plans ─────────────────────────────────────────────────────────────
const STRIPE_PLANS = [
  { id: 'price_1TizarIWqycqHBP2XwD02TvU', label: 'Agence — 79€/mois' },
  { id: 'price_1TizarIWqycqHBP2Im8W6fIT', label: 'Agence — 756€/an' },
  { id: 'price_1TizaqIWqycqHBP2JxyTW49l', label: 'Solo — 33€/mois' },
  { id: 'price_1TizarIWqycqHBP2xLtnnudf', label: 'Solo — 312€/an' },
  { id: 'price_1TizUJIWqycqHBP2TFZFFFVu', label: 'Pro — 2292€/mois' },
  { id: 'price_1TizUJIWqycqHBP2Lfyzpon1', label: 'Pro — 8628€/an' },
]

interface UserFull {
  profile: Record<string, unknown> | null
  searches: Array<{ id: string; query_label: string; result_count: number; created_at: string }>
  unlocks: Array<{ id: string; field_type: string; prospect_id: string; created_at: string }>
  sessions: Array<Record<string, unknown>>
  devices: Array<{ id: string; device_id: string; device_name: string; device_type: string; operating_system: string; browser: string; first_ip: string; last_ip: string; country: string; region: string; city: string; first_seen_at: string; last_seen_at: string; revoked_at: string | null; status: string }>
  subscription: Record<string, unknown> | null
  credits: { phone_credits: number; email_credits: number; unlimited: boolean } | null
  stripeSubscription: {
    id: string; status: string; planName: string; amount: number
    currency: string; interval: string; currentPeriodEnd: string; cancelAtPeriodEnd: boolean
  } | null
  stripeCustomer: { id: string; email: string; created: string } | null
}

// ─── Utilitaires ──────────────────────────────────────────────────────────────
function fromNow(iso: string | null | undefined): string {
  if (!iso) return '—'
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 60) return `${m} min`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h} h`
  const d = Math.floor(h / 24)
  return `${d} j`
}

function fmt(iso: string | null | undefined): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })
}

async function apiFetch<T>(url: string, token: string): Promise<T> {
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
  const json = await res.json()
  if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`)
  return json as T
}

async function apiPost(url: string, token: string, body: unknown) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  return res.json()
}

function Spinner() {
  return (
    <div className="flex items-center justify-center py-20">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-100 border-t-[#1B54FF]" />
    </div>
  )
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    approved: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    pending:  'bg-amber-50 text-amber-700 border-amber-200',
    blocked:  'bg-red-50 text-red-700 border-red-200',
    trial:    'bg-violet-50 text-violet-700 border-violet-200',
  }
  const labels: Record<string, string> = {
    approved: 'Approuvé', pending: 'En attente', blocked: 'Bloqué', trial: 'Démo',
  }
  return (
    <span className={`inline-block rounded-full border px-2.5 py-0.5 text-xs font-semibold ${map[status] ?? 'bg-slate-50 text-slate-600 border-slate-200'}`}>
      {labels[status] ?? status}
    </span>
  )
}

function DeviceIcon({ type }: { type: string }) {
  if (type === 'mobile') return <Smartphone size={16} className="text-[#1B54FF]" />
  if (type === 'tablet') return <Tablet size={16} className="text-[#1B54FF]" />
  return <Monitor size={16} className="text-[#1B54FF]" />
}

// ─── Composant principal ──────────────────────────────────────────────────────
export default function AdminUserPage() {
  const _isCRMHostname = window.location.hostname.startsWith('crm.')
  const userId = _isCRMHostname
    ? (window.location.pathname.split('/user/')[1]?.split('/')[0] ?? '')
    : (new URLSearchParams(window.location.search).get('user') ?? '')

  const [token, setToken] = useState<string | null>(null)
  const [authLoading, setAuthLoading] = useState(true)
  const [data, setData] = useState<UserFull | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [tab, setTab] = useState<'profil' | 'ips' | 'appareils' | 'abonnement' | 'credits' | 'historique'>('profil')

  // Formulaires
  const [creditPhone, setCreditPhone] = useState('0')
  const [creditEmail, setCreditEmail] = useState('0')
  const [selectedPlan, setSelectedPlan] = useState(STRIPE_PLANS[0].id)
  const [customerId, setCustomerId] = useState('')

  // Récupérer le token depuis Supabase
  useEffect(() => {
    getSupabaseClient().auth.getSession().then(({ data: { session } }) => {
      if (session?.access_token) setToken(session.access_token)
      setAuthLoading(false)
    })
  }, [])

  const load = useCallback(async () => {
    if (!token || !userId) return
    setLoading(true); setError(null)
    try {
      const d = await apiFetch<UserFull>(`/api/admin/user-full?userId=${userId}`, token)
      setData(d)
      setCustomerId(d.stripeCustomer?.id ?? '')
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Erreur de chargement')
    } finally {
      setLoading(false)
    }
  }, [token, userId])

  useEffect(() => { if (token) void load() }, [token, load])

  const act = async (action: string, value?: Record<string, unknown>) => {
    if (!token) return
    setBusy(action)
    try {
      const r = await apiPost('/api/admin/user-full', token, { userId, action, value })
      if (r.error) alert(`Erreur : ${r.error}`)
      else await load()
    } finally {
      setBusy(null)
    }
  }

  const goBack = () => { window.location.href = _isCRMHostname ? '/' : '?crm' }

  const profile = data?.profile as Record<string, unknown> | null

  // ── Chargement auth ──
  if (authLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <Spinner />
      </div>
    )
  }

  if (!token) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <div className="text-center">
          <p className="text-slate-500 mb-4">Session expirée ou accès refusé.</p>
          <button onClick={goBack} className="rounded-xl bg-[#1B54FF] px-5 py-2.5 text-sm font-semibold text-white">
            Retour au CRM
          </button>
        </div>
      </div>
    )
  }

  const TABS = [
    { key: 'profil',      label: 'Profil' },
    { key: 'ips',         label: 'IPs' },
    { key: 'appareils',   label: 'Appareils' },
    { key: 'abonnement',  label: 'Abonnement' },
    { key: 'credits',     label: 'Crédits' },
    { key: 'historique',  label: 'Historique' },
  ] as const

  return (
    <div className="min-h-screen bg-[#f5f7fc]">
      {/* ── Top navbar ── */}
      <nav className="sticky top-0 z-40 border-b border-slate-200/60 bg-white/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl items-center gap-4 px-6 py-3">
          <img src={trouveLogo} alt="trouvé!" className="h-7 w-fit" />
          <span className="text-slate-300">/</span>
          <button onClick={goBack}
            className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm text-slate-500 transition hover:bg-slate-100 hover:text-slate-700">
            <ArrowLeft size={14} /> Clients
          </button>
          <span className="text-slate-300">/</span>
          <span className="text-sm font-semibold text-slate-800">
            {profile ? `${String(profile.first_name ?? '')} ${String(profile.last_name ?? '')}`.trim() || String(profile.professional_email ?? userId) : userId}
          </span>
        </div>
      </nav>

      {loading ? (
        <div className="mx-auto max-w-7xl px-6 py-16"><Spinner /></div>
      ) : error ? (
        <div className="mx-auto max-w-7xl px-6 py-16 text-center">
          <p className="text-red-600 mb-4">{error}</p>
          <button onClick={load} className="rounded-xl border border-slate-200 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50">
            <RefreshCw size={13} className="inline mr-2" />Réessayer
          </button>
        </div>
      ) : !data ? null : (
        <div className="mx-auto max-w-7xl px-6 py-8">
          <div className="flex gap-7">

            {/* ── Colonne gauche : identité + actions rapides ── */}
            <aside className="w-72 shrink-0">
              {/* Carte identité */}
              <div className="rounded-2xl border border-slate-200/60 bg-white p-5 shadow-sm">
                <div className="flex flex-col items-center text-center">
                  <div className="flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-[#1B54FF] to-indigo-500 text-2xl font-bold text-white shadow-lg shadow-blue-200">
                    {String(profile?.first_name ?? profile?.professional_email ?? '?')[0].toUpperCase()}
                  </div>
                  <h1 className="mt-3 text-base font-bold text-slate-900">
                    {String(profile?.first_name ?? '')} {String(profile?.last_name ?? '')}
                  </h1>
                  <p className="mt-0.5 text-xs text-slate-400">{String(profile?.professional_email ?? '')}</p>
                  <div className="mt-3 flex flex-wrap justify-center gap-2">
                    <StatusBadge status={String(profile?.access_status ?? '')} />
                    <span className="inline-block rounded-full border border-blue-200 bg-blue-50 px-2.5 py-0.5 text-xs font-semibold text-blue-700">
                      {String(profile?.role ?? '—')}
                    </span>
                  </div>
                </div>

                <div className="mt-5 space-y-2.5">
                  {[
                    { label: 'Quota mensuel', value: String(profile?.monthly_search_quota ?? '—'), icon: Zap },
                    { label: 'Dernière connexion', value: fromNow(profile?.last_login_at as string), icon: Calendar },
                    { label: 'Inscrit le', value: fmt(profile?.created_at as string), icon: Calendar },
                    { label: 'CGU', value: profile?.cgu_accepted ? 'Acceptées' : 'Non acceptées', icon: CheckCircle2 },
                  ].map(({ label, value, icon: Icon }) => (
                    <div key={label} className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-1.5 text-slate-400">
                        <Icon size={11} /> {label}
                      </div>
                      <span className="font-semibold text-slate-700">{value}</span>
                    </div>
                  ))}
                </div>

                {/* Organisation */}
                {profile?.organization_id && (
                  <div className="mt-4 rounded-xl bg-slate-50 p-3">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">Organisation</p>
                    <p className="text-sm font-semibold text-slate-800">
                      {String((profile?.organizations as Record<string, unknown>)?.legal_name ?? '—')}
                    </p>
                    <p className="text-[11px] text-slate-400">
                      {String((profile?.organizations as Record<string, unknown>)?.siren ?? '—')}
                    </p>
                  </div>
                )}
              </div>

              {/* Actions rapides */}
              <div className="mt-4 rounded-2xl border border-slate-200/60 bg-white p-4 shadow-sm space-y-2">
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-3">Actions</p>
                <button onClick={() => act('approve')} disabled={!!busy}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 py-2.5 text-xs font-bold text-white hover:bg-emerald-700 disabled:opacity-50">
                  {busy === 'approve' ? <Loader2 size={11} className="animate-spin" /> : <UserCheck size={12} />}
                  Approuver
                </button>
                <button onClick={() => act('block')} disabled={!!busy}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-red-600 py-2.5 text-xs font-bold text-white hover:bg-red-700 disabled:opacity-50">
                  {busy === 'block' ? <Loader2 size={11} className="animate-spin" /> : <Ban size={12} />}
                  Bloquer
                </button>
                <button onClick={() => act('revoke_sessions')} disabled={!!busy}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-amber-500 py-2.5 text-xs font-bold text-white hover:bg-amber-600 disabled:opacity-50">
                  {busy === 'revoke_sessions' ? <Loader2 size={11} className="animate-spin" /> : <WifiOff size={12} />}
                  Déconnecter partout
                </button>
                <div className="pt-2 space-y-1.5">
                  {['agent', 'agence', 'admin'].map(role => (
                    <button key={role} onClick={() => act('set_role', { role })} disabled={!!busy}
                      className={`flex w-full items-center justify-center gap-2 rounded-lg py-2 text-[11px] font-semibold transition ${
                        String(profile?.role) === role
                          ? 'bg-[#1B54FF] text-white'
                          : 'border border-slate-200 text-slate-600 hover:bg-slate-50'
                      } disabled:opacity-50`}>
                      <Star size={10} /> {role.charAt(0).toUpperCase() + role.slice(1)}
                    </button>
                  ))}
                </div>
              </div>

              {/* Crédits actuels */}
              {data.credits && (
                <div className="mt-4 rounded-2xl border border-slate-200/60 bg-white p-4 shadow-sm">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-3">Crédits actuels</p>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="rounded-xl bg-blue-50 p-2.5 text-center">
                      <p className="text-lg font-extrabold text-blue-600">{data.credits.phone_credits}</p>
                      <p className="text-[10px] text-slate-500">Téléphone</p>
                    </div>
                    <div className="rounded-xl bg-emerald-50 p-2.5 text-center">
                      <p className="text-lg font-extrabold text-emerald-600">{data.credits.email_credits}</p>
                      <p className="text-[10px] text-slate-500">Email</p>
                    </div>
                  </div>
                  {data.credits.unlimited && (
                    <p className="mt-2 text-center text-[11px] font-bold text-violet-600">Illimité activé</p>
                  )}
                </div>
              )}
            </aside>

            {/* ── Contenu principal ── */}
            <div className="flex-1 min-w-0">
              {/* Onglets */}
              <div className="mb-5 flex gap-1 rounded-2xl bg-white border border-slate-200/60 shadow-sm p-1.5">
                {TABS.map(({ key, label }) => (
                  <button key={key} onClick={() => setTab(key)}
                    className={`flex-1 rounded-xl py-2.5 text-xs font-semibold transition ${
                      tab === key
                        ? 'bg-[#1B54FF] text-white shadow-sm shadow-blue-200'
                        : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700'
                    }`}>
                    {label}
                  </button>
                ))}
              </div>

              {/* ── Profil ── */}
              {tab === 'profil' && (
                <div className="grid grid-cols-2 gap-4">
                  {[
                    { label: 'Email', value: String(profile?.professional_email ?? '—'), icon: Mail },
                    { label: 'Rôle', value: String(profile?.role ?? '—'), icon: Star },
                    { label: 'Statut', value: String(profile?.access_status ?? '—'), icon: CheckCircle2 },
                    { label: 'Quota mensuel', value: String(profile?.monthly_search_quota ?? '—'), icon: Zap },
                    { label: 'IP inscription', value: String(profile?.registration_ip ?? '—'), icon: MapPin },
                    { label: 'IP CGU', value: String(profile?.cgu_ip ?? '—'), icon: Globe },
                    { label: 'CGU acceptées', value: profile?.cgu_accepted ? fmt(String(profile?.cgu_accepted_at ?? '')) : 'Non', icon: CheckCircle2 },
                    { label: 'Inscrit le', value: fmt(String(profile?.created_at ?? '')), icon: Calendar },
                    { label: 'Dernière connexion', value: fromNow(profile?.last_login_at as string), icon: Calendar },
                    { label: 'Fonction', value: String(profile?.function_title ?? '—'), icon: Hash },
                  ].map(({ label, value, icon: Icon }) => (
                    <div key={label} className="rounded-xl bg-white border border-slate-200/60 p-4 shadow-sm">
                      <div className="flex items-center gap-1.5 mb-1">
                        <Icon size={11} className="text-slate-400" />
                        <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{label}</p>
                      </div>
                      <p className="text-sm font-semibold text-slate-800 break-all">{value}</p>
                    </div>
                  ))}
                </div>
              )}

              {/* ── IPs ── */}
              {tab === 'ips' && (
                <div className="space-y-3">
                  <div className="rounded-xl bg-white border border-slate-200/60 p-5 shadow-sm">
                    <div className="flex items-center justify-between mb-4">
                      <div>
                        <p className="font-bold text-slate-800">Adresses IP de connexion</p>
                        <p className="text-xs text-slate-400">Max autorisé : 2 IP distinctes par compte</p>
                      </div>
                    </div>
                    {(data.sessions ?? []).length > 2 && (
                      <div className="mb-4 rounded-xl border border-red-200 bg-red-50 p-4 flex items-start gap-3">
                        <AlertCircle size={15} className="text-red-500 shrink-0 mt-0.5" />
                        <div>
                          <p className="text-sm font-bold text-red-700">Compte partagé détecté</p>
                          <p className="text-xs text-red-600 mt-0.5">
                            {data.sessions.length} adresses IP distinctes — seuil de 2 dépassé.
                          </p>
                        </div>
                      </div>
                    )}
                    {data.sessions.length === 0 ? (
                      <div className="rounded-xl border border-slate-100 bg-slate-50 p-8 text-center">
                        <Globe size={24} className="mx-auto mb-2 text-slate-300" />
                        <p className="text-sm text-slate-400">Aucune IP enregistrée</p>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {data.sessions.map((s, i) => (
                          <div key={String(s.ip_address ?? i)} className={`rounded-xl border p-4 ${i >= 2 ? 'border-red-200 bg-red-50' : 'border-slate-100 bg-slate-50'}`}>
                            <div className="flex items-center justify-between mb-2">
                              <div className="flex items-center gap-2">
                                <div className={`h-2 w-2 rounded-full ${i >= 2 ? 'bg-red-400' : 'bg-emerald-400'}`} />
                                <span className="text-sm font-mono font-bold text-slate-800">{String(s.ip_address ?? '—')}</span>
                                {i >= 2 && <span className="text-[10px] font-bold text-red-600 bg-red-100 px-1.5 py-0.5 rounded">Suspecte</span>}
                              </div>
                              <span className="text-xs text-slate-400">{Number(s.login_count ?? 0)} connexion{Number(s.login_count ?? 0) > 1 ? 's' : ''}</span>
                            </div>
                            <div className="flex items-center gap-2 text-xs text-slate-500">
                              <Monitor size={11} className="shrink-0 text-slate-400" />
                              <span className="truncate">{String(s.user_agent ?? '—')}</span>
                            </div>
                            <div className="flex gap-4 text-[11px] text-slate-400 mt-1">
                              <span>1ère vue : {fmt(String(s.first_seen_at ?? ''))}</span>
                              <span>Dernière : {fromNow(String(s.last_seen_at ?? ''))}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* IPs référence */}
                    <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
                      <p className="text-xs font-bold text-slate-500 mb-2 uppercase tracking-wider">IPs référence</p>
                      <div className="grid grid-cols-2 gap-3">
                        {[
                          { label: 'Inscription', value: String(profile?.registration_ip ?? '—') },
                          { label: 'Signature CGU', value: String(profile?.cgu_ip ?? '—') },
                        ].map(({ label, value }) => (
                          <div key={label} className="flex items-center justify-between">
                            <span className="text-xs text-slate-500">{label}</span>
                            <span className="text-xs font-mono font-semibold text-slate-800">{value}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* ── Appareils ── */}
              {tab === 'appareils' && (
                <div className="space-y-3">
                  <div className="rounded-xl bg-white border border-slate-200/60 p-5 shadow-sm">
                    <div className="flex items-center justify-between mb-4">
                      <div>
                        <p className="font-bold text-slate-800">Appareils connectés</p>
                        <p className="text-xs text-slate-400">Max 2 appareils actifs par compte</p>
                      </div>
                      <button onClick={() => act('revoke_sessions')} disabled={!!busy}
                        className="flex items-center gap-1.5 rounded-lg bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-100">
                        {busy === 'revoke_sessions' ? <Loader2 size={11} className="animate-spin" /> : <WifiOff size={11} />}
                        Tout révoquer
                      </button>
                    </div>

                    {(data.devices ?? []).filter(d => d.status === 'active').length >= 2 && (
                      <div className="mb-3 rounded-xl border border-amber-200 bg-amber-50 p-3 flex items-start gap-2">
                        <AlertCircle size={14} className="text-amber-500 shrink-0 mt-0.5" />
                        <p className="text-xs text-amber-700">Limite de 2 appareils actifs atteinte.</p>
                      </div>
                    )}

                    {(data.devices ?? []).length === 0 ? (
                      <div className="rounded-xl border border-slate-100 bg-slate-50 p-8 text-center">
                        <Laptop size={24} className="mx-auto mb-2 text-slate-300" />
                        <p className="text-sm text-slate-400">Aucun appareil enregistré</p>
                        <p className="text-xs text-slate-300 mt-1">Mis à jour à la prochaine connexion</p>
                      </div>
                    ) : (
                      <div className="grid grid-cols-2 gap-3">
                        {(data.devices ?? []).map(d => (
                          <div key={d.id} className={`rounded-xl border p-4 ${
                            d.status === 'revoked' ? 'border-slate-100 bg-slate-50 opacity-60'
                            : 'border-slate-200 bg-white'
                          }`}>
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex items-start gap-2 min-w-0 flex-1">
                                <div className="mt-0.5 rounded-lg bg-blue-50 p-1.5">
                                  <DeviceIcon type={d.device_type} />
                                </div>
                                <div className="min-w-0">
                                  <div className="flex items-center gap-1.5 mb-1">
                                    <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${d.status === 'active' ? 'bg-emerald-400' : 'bg-slate-300'}`} />
                                    <span className="text-xs font-bold text-slate-800 truncate">{d.device_name || '—'}</span>
                                  </div>
                                  <div className="space-y-0.5 text-[11px] text-slate-500">
                                    <p><span className="text-slate-400">OS :</span> {d.operating_system || '—'}</p>
                                    <p><span className="text-slate-400">Nav :</span> {d.browser || '—'}</p>
                                    <p><span className="text-slate-400">IP :</span> <span className="font-mono">{d.last_ip || '—'}</span></p>
                                    <p><span className="text-slate-400">Lieu :</span> {[d.city, d.country].filter(Boolean).join(', ') || '—'}</p>
                                    <p><span className="text-slate-400">Vu :</span> {fromNow(d.last_seen_at)}</p>
                                  </div>
                                </div>
                              </div>
                              {d.status === 'active' && (
                                <button
                                  onClick={() => act('revoke_device', { deviceId: d.id })}
                                  disabled={!!busy}
                                  className="shrink-0 rounded-lg border border-red-200 p-1.5 text-red-500 hover:bg-red-50"
                                >
                                  {busy === 'revoke_device' ? <Loader2 size={12} className="animate-spin" /> : <X size={12} />}
                                </button>
                              )}
                            </div>
                            {d.status === 'revoked' && (
                              <div className="mt-2 flex items-center gap-1 text-[10px] text-slate-400">
                                <Trash2 size={10} /> Révoqué {fmt(d.revoked_at ?? '')}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* ── Abonnement ── */}
              {tab === 'abonnement' && (
                <div className="space-y-4">
                  {data.stripeSubscription ? (
                    <div className={`rounded-xl border p-5 shadow-sm ${
                      data.stripeSubscription.status === 'active' ? 'border-emerald-200 bg-emerald-50' : 'border-slate-200 bg-white'
                    }`}>
                      <div className="flex items-center justify-between mb-3">
                        <p className="font-bold text-slate-800">Abonnement Stripe</p>
                        <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${
                          data.stripeSubscription.status === 'active' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'
                        }`}>{data.stripeSubscription.status}</span>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        {[
                          { label: 'Plan', value: data.stripeSubscription.planName },
                          { label: 'Montant', value: `${data.stripeSubscription.amount} ${data.stripeSubscription.currency.toUpperCase()} / ${data.stripeSubscription.interval === 'month' ? 'mois' : 'an'}` },
                          { label: 'Fin de période', value: fmt(data.stripeSubscription.currentPeriodEnd) },
                          { label: 'Résiliation programmée', value: data.stripeSubscription.cancelAtPeriodEnd ? 'Oui' : 'Non' },
                        ].map(({ label, value }) => (
                          <div key={label}>
                            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{label}</p>
                            <p className="mt-1 text-sm font-semibold text-slate-800">{value}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-5 shadow-sm">
                      <p className="text-sm text-slate-500">Aucun abonnement Stripe actif</p>
                    </div>
                  )}

                  {/* Assigner un abonnement */}
                  <div className="rounded-xl bg-white border border-slate-200/60 p-5 shadow-sm space-y-3">
                    <p className="font-bold text-slate-800">Assigner un abonnement</p>
                    <div>
                      <label className="text-[11px] font-semibold text-slate-500">Customer Stripe ID</label>
                      <input value={customerId} onChange={e => setCustomerId(e.target.value)} placeholder="cus_..."
                        className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500" />
                    </div>
                    <div>
                      <label className="text-[11px] font-semibold text-slate-500">Plan</label>
                      <select value={selectedPlan} onChange={e => setSelectedPlan(e.target.value)}
                        className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500">
                        {STRIPE_PLANS.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
                      </select>
                    </div>
                    <button onClick={() => act('assign_subscription', { priceId: selectedPlan, customerId })} disabled={!!busy || !customerId}
                      className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#1B54FF] py-2.5 text-xs font-bold text-white hover:bg-[#0b3fbc] disabled:opacity-50">
                      {busy === 'assign_subscription' ? <Loader2 size={12} className="animate-spin" /> : <CreditCard size={12} />}
                      Assigner l'abonnement
                    </button>
                  </div>
                </div>
              )}

              {/* ── Crédits ── */}
              {tab === 'credits' && (
                <div className="space-y-4">
                  <div className="rounded-xl bg-white border border-slate-200/60 p-5 shadow-sm space-y-4">
                    <p className="font-bold text-slate-800">Modifier les crédits</p>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="text-[11px] font-semibold text-slate-500">Crédits téléphone</label>
                        <input type="number" min="0" value={creditPhone} onChange={e => setCreditPhone(e.target.value)}
                          className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500" />
                      </div>
                      <div>
                        <label className="text-[11px] font-semibold text-slate-500">Crédits email</label>
                        <input type="number" min="0" value={creditEmail} onChange={e => setCreditEmail(e.target.value)}
                          className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500" />
                      </div>
                    </div>
                    <button onClick={() => act('add_credits', { phone: parseInt(creditPhone), email: parseInt(creditEmail) })} disabled={!!busy}
                      className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#1B54FF] py-2.5 text-xs font-bold text-white hover:bg-[#0b3fbc] disabled:opacity-50">
                      {busy === 'add_credits' ? <Loader2 size={12} className="animate-spin" /> : <Zap size={12} />}
                      Mettre à jour les crédits
                    </button>
                  </div>

                  <div className="rounded-xl bg-white border border-slate-200/60 p-5 shadow-sm flex items-center justify-between">
                    <div>
                      <p className="font-bold text-slate-800">Crédits illimités</p>
                      <p className="text-xs text-slate-400">Bypass total des quotas de déblocage</p>
                    </div>
                    <button onClick={() => act('set_unlimited', { unlimited: !data.credits?.unlimited })} disabled={!!busy}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition ${data.credits?.unlimited ? 'bg-violet-600' : 'bg-slate-200'} disabled:opacity-50`}>
                      <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition ${data.credits?.unlimited ? 'translate-x-6' : 'translate-x-1'}`} />
                    </button>
                  </div>
                </div>
              )}

              {/* ── Historique ── */}
              {tab === 'historique' && (
                <div className="grid grid-cols-2 gap-5">
                  <div className="rounded-xl bg-white border border-slate-200/60 p-5 shadow-sm">
                    <p className="font-bold text-slate-800 mb-3">Recherches ({data.searches.length})</p>
                    <div className="space-y-1.5 max-h-96 overflow-y-auto">
                      {data.searches.length === 0 ? (
                        <p className="text-xs text-slate-400 text-center py-4">Aucune recherche</p>
                      ) : data.searches.map(s => (
                        <div key={s.id} className="flex items-center justify-between rounded-lg bg-slate-50 border border-slate-100 px-3 py-2">
                          <div className="flex items-center gap-2 min-w-0">
                            <Search size={11} className="text-slate-400 shrink-0" />
                            <p className="text-xs font-medium text-slate-700 truncate">{s.query_label || '—'}</p>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <span className="text-[10px] text-slate-400">{s.result_count} rés.</span>
                            <span className="text-[10px] text-slate-300">{fromNow(s.created_at)}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="rounded-xl bg-white border border-slate-200/60 p-5 shadow-sm">
                    <p className="font-bold text-slate-800 mb-3">Déblocages ({data.unlocks.length})</p>
                    <div className="space-y-1.5 max-h-96 overflow-y-auto">
                      {data.unlocks.length === 0 ? (
                        <p className="text-xs text-slate-400 text-center py-4">Aucun déblocage</p>
                      ) : data.unlocks.map(u => (
                        <div key={u.id} className="flex items-center justify-between rounded-lg bg-slate-50 border border-slate-100 px-3 py-2">
                          <div className="flex items-center gap-2">
                            {u.field_type === 'phone' ? <Phone size={11} className="text-blue-500" /> : <Mail size={11} className="text-emerald-500" />}
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
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
