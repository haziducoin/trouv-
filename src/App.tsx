import { useEffect, useState } from 'react'
import { Analytics } from '@vercel/analytics/react'
import { SpeedInsights } from '@vercel/speed-insights/react'
import LandingPage from './pages/LandingPage'
import SearchPage from './pages/SearchPage'
import AdminCRMPage from './pages/AdminCRMPage'
import AdminUserPage from './pages/AdminUserPage'
import SuccessPage from './pages/SuccessPage'
import PreviewPage from './pages/PreviewPage'
import CompliancePage from './pages/CompliancePage'
import AccountPanel, { type AccountPanelView } from './components/account/AccountPanel'
import { restoreSession, clearSession, PersonalEmailError, type Account } from './lib/accountStore'
import { getSupabaseClient, isRemoteDatabaseConfigured } from './lib/supabase'
import { getDeviceId } from './lib/deviceId'

// ─── Restore dark mode preference immediately (before first paint) ────────────
if (localStorage.getItem('trouve_dark') === '1') {
  document.documentElement.classList.add('dark')
}

// ─── URL params ───────────────────────────────────────────────────────────────
const _params          = new URLSearchParams(window.location.search)
const _isCRMHostname   = window.location.hostname.startsWith('crm.')
const isDemoMode       = _params.has('demo')
const isSuccessPage    = _params.has('success')
const isPreviewPage    = _params.has('preview')
const isConformitePage = _params.has('conformite')
// CRM mode: subdomain crm.* en prod, ou ?crm en dev local
const isCRMMode        = _isCRMHostname
                       || (_params.has('crm') && !_params.has('user'))
// Fiche user : /user/UUID sur le subdomain, ou ?crm&user=UUID en dev
const isCRMUserPage    = (_isCRMHostname && window.location.pathname.startsWith('/user/'))
                       || (_params.has('crm') && _params.has('user'))
const successPlan      = _params.get('plan') ?? 'agence'
const panelParam       = _params.get('panel') as AccountPanelView | null

function formatOAuthError(rawError: string) {
  const decoded = decodeURIComponent(rawError)

  if (/unable to exchange external code/i.test(decoded)) {
    return [
      "Connexion Google impossible : l'échange OAuth n'a pas pu être finalisé.",
      "Réessayez depuis le bouton Google sans revenir avec le bouton précédent.",
      "Si l'erreur persiste, vérifiez l'URL de redirection Google/Supabase.",
    ].join(' ')
  }

  if (/redirect/i.test(decoded)) {
    return "Connexion Google impossible : l'URL de redirection n'est pas autorisée dans Supabase."
  }

  return `Connexion Google impossible : ${decoded}`
}

// ─── Comptes démo (dev only) ──────────────────────────────────────────────────
const DEMO_ACCOUNT: Account = {
  id:             'demo-preview',
  organizationId: 'org-preview',
  firstName:      'Sophie',
  lastName:       'Martin',
  email:          'sophie@cabinet-rivoli.fr',
  companyName:    'Cabinet Rivoli',
  siren:          '123456789',
  role:           'agence',
  status:         'approved',
  quota:          5000,
  monthlyUsage:   47,
  createdAt:      new Date().toISOString(),
}

const DEMO_EMPLOYEE_ACCOUNT: Account = {
  id:             'demo-employee',
  organizationId: 'org-preview',
  firstName:      'Thomas',
  lastName:       'Moreau',
  email:          't.moreau@cabinet-rivoli.fr',
  companyName:    'Cabinet Rivoli',
  siren:          '123456789',
  role:           'agent',
  status:         'approved',
  quota:          50,
  monthlyUsage:   23,
  createdAt:      new Date().toISOString(),
}

export default function App() {
  const [account, setAccount]               = useState<Account | null>(isDemoMode ? DEMO_ACCOUNT : null)
  const [sessionLoading, setSessionLoading] = useState(!isDemoMode && !isSuccessPage)
  const [accountPanel, setAccountPanel]     = useState<AccountPanelView | null>(panelParam)
  const [blockedEmail, setBlockedEmail]     = useState<string | null>(null)
  const [authError, setAuthError]           = useState<string | null>(null)
  const [loadingTooLong, setLoadingTooLong] = useState(false)
  const [demoView, setDemoView]             = useState<'admin' | 'employee'>('admin')

  // Après 4 s de chargement, on propose un bouton de secours
  useEffect(() => {
    if (!sessionLoading) return
    const t = setTimeout(() => setLoadingTooLong(true), 4000)
    return () => clearTimeout(t)
  }, [sessionLoading])

  useEffect(() => {
    if (isDemoMode || isSuccessPage) return

    // ── Mode local (sans Supabase) ────────────────────────────────────────
    if (!isRemoteDatabaseConfigured) {
      restoreSession()
        .then(a  => { setAccount(a); setSessionLoading(false) })
        .catch((err: unknown) => {
          if (err instanceof PersonalEmailError) setBlockedEmail(err.email)
          setSessionLoading(false)
        })
      return
    }

    let mounted = true

    // Timeout de sécurité INDESTRUCTIBLE — n'est jamais annulé avant d'avoir résolu
    // la session. Réduit à 5 s pour ne pas bloquer trop longtemps.
    const safetyTimeout = setTimeout(() => {
      if (mounted) {
        setSessionLoading(false)
        setLoadingTooLong(true)
      }
    }, 5000)

    // onAuthStateChange gère uniquement la restauration automatique au chargement
    // (INITIAL_SESSION) et la déconnexion (SIGNED_OUT).
    // SIGNED_IN déclenché par un login manuel est déjà traité par AccountPanel →
    // on l'ignore ici pour éviter le double appel fetchRemoteProfiles.
    const { data: { subscription } } = getSupabaseClient().auth.onAuthStateChange(
      async (event, session) => {
        if (event === 'INITIAL_SESSION') {
          if (!session) {
            // Retour OAuth raté
            const sp = new URLSearchParams(window.location.search)
            const hp = new URLSearchParams(window.location.hash.replace('#', '?'))
            const oauthErr = sp.get('error_description') || hp.get('error_description') || sp.get('error')
            if (oauthErr && mounted) {
              setAuthError(formatOAuthError(oauthErr))
              window.history.replaceState({}, '', '/')
            }
            clearTimeout(safetyTimeout)
            if (mounted) setSessionLoading(false)
            return
          }
          // Session existante au chargement → restaure le profil + tracking IP + appareil
          try {
            const a = await restoreSession()
            if (mounted) setAccount(a)
            // Tracking IP silencieux
            fetch('/api/track-ip', {
              method: 'POST',
              headers: { Authorization: `Bearer ${session.access_token}` },
            }).catch(() => {})
            // Enregistrement appareil silencieux
            fetch('/api/devices', {
              method: 'POST',
              headers: {
                Authorization: `Bearer ${session.access_token}`,
                'X-Device-Id': getDeviceId(),
              },
            }).catch(() => {})
          } catch (err) {
            if (err instanceof PersonalEmailError) {
              if (mounted) setBlockedEmail((err as PersonalEmailError).email)
            } else if (mounted) {
              setAuthError(err instanceof Error ? err.message : 'Erreur de connexion inattendue.')
            }
          } finally {
            clearTimeout(safetyTimeout)
            if (mounted) setSessionLoading(false)
          }
        } else if (event === 'SIGNED_OUT') {
          clearTimeout(safetyTimeout)
          if (mounted) {
            setAccount(null)
            setSessionLoading(false)
          }
        }
        // SIGNED_IN intentionnel : géré par AccountPanel.handleLogin → onAuthenticated
      }
    )

    return () => {
      mounted = false
      clearTimeout(safetyTimeout)
      subscription.unsubscribe()
    }
  }, [])

  const handleAuthenticated = (a: Account) => {
    setAccount(a)
    setAccountPanel(null)
    // Tracking IP + enregistrement appareil (silencieux, non bloquant)
    getSupabaseClient().auth.getSession().then(({ data }) => {
      const token = data.session?.access_token
      if (token) {
        const deviceId = getDeviceId()
        fetch('/api/track-ip', {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
        }).catch(() => {})
        fetch('/api/devices', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'X-Device-Id': deviceId,
          },
        }).catch(() => {})
      }
    })
  }

  const handleLogout = async () => {
    await clearSession()
    setAccount(null)
    setAccountPanel(null)
  }

  // ── Page conformité ───────────────────────────────────────────────────────
  if (isConformitePage) return (
    <CompliancePage onClose={() => window.history.back()} />
  )

  // ── Preview des composants UI ─────────────────────────────────────────────
  if (isPreviewPage) return (
    <>
      <PreviewPage />
      <Analytics />
    </>
  )

  // ── Email perso bloqué ────────────────────────────────────────────────────
  if (blockedEmail) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-[#f5f8ff] px-4">
        <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
          <div className="absolute left-1/2 top-[-8rem] h-[28rem] w-[44rem] -translate-x-1/2 rounded-full bg-red-200/20 blur-[80px]" />
        </div>
        <img src={trouveLogo} alt="trouvé!" className="mb-8 h-9 w-auto" />
        <div className="w-full max-w-sm rounded-3xl border border-red-100 bg-white p-8 shadow-xl text-center">
          <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-red-50 text-red-400">
            <Ban size={28} />
          </div>
          <h1 className="text-xl font-bold text-slate-800">Adresse non autorisée</h1>
          <p className="mt-3 text-sm leading-relaxed text-slate-500">
            <strong className="text-slate-700">{blockedEmail}</strong> est une adresse personnelle.<br />
            trouvé! est réservé aux professionnels de l'immobilier.<br />
            Connectez-vous avec votre <strong className="text-slate-700">email professionnel</strong>.
          </p>
          <button
            onClick={() => setBlockedEmail(null)}
            className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl bg-[#124bd2] px-4 py-3 text-sm font-semibold text-white transition hover:bg-[#0b3fbc]"
          >
            Réessayer avec un email pro
          </button>
        </div>
        <Analytics />
      </div>
    )
  }

  // ── Page succès Stripe ────────────────────────────────────────────────────
  if (isSuccessPage) {
    return (
      <>
        <SuccessPage
          plan={successPlan}
          onGoToApp={() => {
            // Nettoyer l'URL et recharger pour restaurer la session
            window.history.replaceState({}, '', '/')
            window.location.reload()
          }}
        />
        <Analytics />
      </>
    )
  }

  // ── Splash pendant restauration ───────────────────────────────────────────
  if (sessionLoading) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-5 bg-[#f5f8ff]">
        <img
          src="/favicon.svg"
          alt="trouvé!"
          className="h-8 w-8 animate-spin"
          style={{ animationDuration: '1s', animationTimingFunction: 'linear' }}
        />
        {loadingTooLong && (
          <div className="flex flex-col items-center gap-3 text-center">
            <p className="text-xs text-slate-400">La connexion prend du temps…</p>
            <button
              onClick={() => window.location.reload()}
              className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-medium text-slate-600 transition hover:border-blue-200 hover:text-[#124bd2]"
            >
              Actualiser
            </button>
            <button
              onClick={async () => {
                await getSupabaseClient().auth.signOut()
                window.location.reload()
              }}
              className="text-xs text-slate-400 underline underline-offset-2 transition hover:text-slate-600"
            >
              Se déconnecter et réessayer
            </button>
          </div>
        )}
        <Analytics />
      </div>
    )
  }

  // ── Mode démo (?demo=1) — lien de prospection sans compte ───────────────
  if (isDemoMode) {
    const demoAccount = demoView === 'admin' ? DEMO_ACCOUNT : DEMO_EMPLOYEE_ACCOUNT
    return (
      <>
        <SpeedInsights />
        {/* Bandeau démo — simuler un profil différent */}
        <div className="fixed bottom-20 lg:bottom-6 left-1/2 z-[999] -translate-x-1/2 flex items-center gap-2 rounded-2xl border border-white/10 bg-[#07113d]/95 px-3 py-1.5 shadow-2xl backdrop-blur-md">
          <span className="text-[11px] text-white/40">Simuler le profil :</span>
          <div className="flex items-center gap-0.5 rounded-xl bg-white/5 p-0.5">
            <button
              onClick={() => setDemoView('admin')}
              className={`rounded-lg px-3 py-1 text-[11px] font-semibold transition ${
                demoView === 'admin' ? 'bg-[#1B54FF] text-white shadow' : 'text-white/50 hover:text-white/80'
              }`}
            >
              Dirigeant
            </button>
            <button
              onClick={() => setDemoView('employee')}
              className={`rounded-lg px-3 py-1 text-[11px] font-semibold transition ${
                demoView === 'employee' ? 'bg-emerald-600 text-white shadow' : 'text-white/50 hover:text-white/80'
              }`}
            >
              Salarié
            </button>
          </div>
        </div>
        <SearchPage
          key={demoView}
          account={demoAccount}
          accessLevel="full"
          onLogout={() => window.location.replace('/')}
          onOpenAccount={(tab) => setAccountPanel((tab as AccountPanelView) ?? 'workspace')}
        />
        {accountPanel && (
          <AccountPanel
            initialView={accountPanel}
            currentAccount={demoAccount}
            onAuthenticated={() => {}}
            onClose={() => setAccountPanel(null)}
            onLogout={() => { setAccountPanel(null); window.location.replace('/') }}
          />
        )}
        <Analytics />
      </>
    )
  }

  // ── CRM Admin fiche utilisateur (?crm&user=...) ──────────────────────────
  if (isCRMUserPage) {
    return (
      <>
        <AdminUserPage />
        <Analytics />
      </>
    )
  }

  // ── CRM Admin (?crm) — interface back-office sécurisée ───────────────────
  if (isCRMMode && account && account.role === 'admin') {
    return (
      <>
        <AdminCRMPage account={account} onLogout={handleLogout} />
        <Analytics />
      </>
    )
  }

  // ── Connecté + approuvé → page de recherche ───────────────────────────────
  if (account && account.status === 'approved') {
    return (
      <>
        <SpeedInsights />
        <SearchPage
          account={account}
          accessLevel="full"
          onLogout={handleLogout}
          onOpenAccount={(tab) => setAccountPanel((tab as AccountPanelView) ?? 'workspace')}
        />
        {accountPanel && (
          <AccountPanel
            initialView={accountPanel}
            currentAccount={account}
            onAuthenticated={handleAuthenticated}
            onClose={() => setAccountPanel(null)}
            onLogout={handleLogout}
          />
        )}
        <Analytics />
      </>
    )
  }

  // ── En attente ou trial → accès limité, invite à payer ──────────────────
  if (account && (account.status === 'pending' || account.status === 'trial')) {
    return (
      <>
        <SpeedInsights />
        <SearchPage
          account={account}
          accessLevel="trial"
          onLogout={handleLogout}
          onOpenAccount={(tab) => setAccountPanel((tab as AccountPanelView) ?? 'workspace')}
        />
        {accountPanel && (
          <AccountPanel
            initialView={accountPanel}
            currentAccount={account}
            onAuthenticated={handleAuthenticated}
            onClose={() => setAccountPanel(null)}
            onLogout={handleLogout}
          />
        )}
        <Analytics />
      </>
    )
  }

  // ── Non connecté → landing ────────────────────────────────────────────────
  return (
    <>
      {/* Toast d'erreur auth (OAuth raté, erreur réseau, etc.) */}
      {authError && (
        <div className="fixed top-4 left-1/2 z-[500] -translate-x-1/2 flex max-w-[90vw] items-start gap-3 rounded-2xl border border-red-200 bg-white px-4 py-3 shadow-xl sm:max-w-sm">
          <AlertCircle size={16} className="mt-0.5 shrink-0 text-red-500" />
          <p className="flex-1 text-xs leading-relaxed text-slate-700">{authError}</p>
          <button onClick={() => setAuthError(null)} className="text-slate-300 hover:text-slate-600 text-sm font-bold">×</button>
        </div>
      )}
      <LandingPage
        externalAccountPanel={accountPanel}
        onOpenAccountPanel={view => setAccountPanel(view)}
        onAuthenticated={handleAuthenticated}
        onLogout={handleLogout}
      />
      <Analytics />
      <SpeedInsights />
    </>
  )
}

// ─── Page d'attente de validation ─────────────────────────────────────────────
import trouveLogo from '@/assets/trouve-logo.png'
import { Ban, Clock, Mail, LogOut, AlertCircle } from 'lucide-react'

function PendingApprovalPage({ account, onLogout }: { account: Account; onLogout: () => void }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[#f5f8ff] px-4">
      <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
        <div className="absolute left-1/2 top-[-8rem] h-[28rem] w-[44rem] -translate-x-1/2 rounded-full bg-blue-200/25 blur-[80px]" />
      </div>

      <img src={trouveLogo} alt="trouvé!" className="mb-8 h-9 w-auto" />

      <div className="w-full max-w-sm rounded-3xl border border-slate-200 bg-white p-8 shadow-xl text-center">
        <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-amber-50 text-amber-500">
          <Clock size={28} />
        </div>
        <h1 className="text-xl font-bold text-slate-800">Demande reçue !</h1>
        <p className="mt-3 text-sm leading-relaxed text-slate-500">
          Votre demande d'accès pour <strong className="text-slate-700">{account.companyName}</strong> est en cours de validation par notre équipe.
          Vous recevrez une confirmation à <strong className="text-slate-700">{account.email}</strong> sous 24–48h.
        </p>

        <div className="mt-6 flex items-center gap-3 rounded-2xl bg-slate-50 px-4 py-3 text-left">
          <Mail size={15} className="shrink-0 text-slate-400" />
          <p className="text-xs text-slate-500">
            Vérifiez votre boîte mail et vos spams. Le lien d'activation est valable 48h.
          </p>
        </div>

        <button
          onClick={onLogout}
          className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 py-2.5 text-sm font-medium text-slate-600 transition hover:bg-slate-50"
        >
          <LogOut size={14} /> Se déconnecter
        </button>
      </div>
    </div>
  )
}
