import { useEffect, useState } from 'react'
import LandingPage from './pages/LandingPage'
import SearchPage from './pages/SearchPage'
import SuccessPage from './pages/SuccessPage'
import AccountPanel, { type AccountPanelView } from './components/account/AccountPanel'
import { restoreSession, clearSession, PersonalEmailError, type Account } from './lib/accountStore'
import { getSupabaseClient, isRemoteDatabaseConfigured } from './lib/supabase'

// ─── Restore dark mode preference immediately (before first paint) ────────────
if (localStorage.getItem('trouve_dark') === '1') {
  document.documentElement.classList.add('dark')
}

// ─── URL params ───────────────────────────────────────────────────────────────
const _params       = new URLSearchParams(window.location.search)
const isDemoMode    = import.meta.env.DEV && _params.has('demo')
const isSuccessPage = _params.has('success')
const successPlan   = _params.get('plan') ?? 'agence'

// ─── Compte démo (dev only) ───────────────────────────────────────────────────
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

export default function App() {
  const [account, setAccount]               = useState<Account | null>(isDemoMode ? DEMO_ACCOUNT : null)
  const [sessionLoading, setSessionLoading] = useState(!isDemoMode && !isSuccessPage)
  const [accountPanel, setAccountPanel]     = useState<AccountPanelView | null>(null)
  const [blockedEmail, setBlockedEmail]     = useState<string | null>(null)

  useEffect(() => {
    if (isDemoMode || isSuccessPage) return

    // ── Tentative initiale (session déjà existante) ───────────────────────
    restoreSession()
      .then(a  => { setAccount(a); setSessionLoading(false) })
      .catch((err: unknown) => {
        if (err instanceof PersonalEmailError) setBlockedEmail(err.email)
        setSessionLoading(false)
      })

    // ── Listener OAuth PKCE : Supabase échange le ?code= de façon asynchrone
    // après le redirect. SIGNED_IN se déclenche quand c'est prêt. ────────────
    if (!isRemoteDatabaseConfigured) return
    const { data: { subscription } } = getSupabaseClient().auth.onAuthStateChange(
      async (event) => {
        if (event === 'SIGNED_IN') {
          try {
            const a = await restoreSession()
            setAccount(a)
            setSessionLoading(false)
          } catch (err) {
            if (err instanceof PersonalEmailError) {
              setBlockedEmail((err as PersonalEmailError).email)
            }
            setSessionLoading(false)
          }
        } else if (event === 'SIGNED_OUT') {
          setAccount(null)
        }
      }
    )
    return () => subscription.unsubscribe()
  }, [])

  const handleAuthenticated = (a: Account) => {
    setAccount(a)
    setAccountPanel(null)
  }

  const handleLogout = async () => {
    await clearSession()
    setAccount(null)
    setAccountPanel(null)
  }

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
      </div>
    )
  }

  // ── Page succès Stripe ────────────────────────────────────────────────────
  if (isSuccessPage) {
    return (
      <SuccessPage
        plan={successPlan}
        onGoToApp={() => {
          // Nettoyer l'URL et recharger pour restaurer la session
          window.history.replaceState({}, '', '/')
          window.location.reload()
        }}
      />
    )
  }

  // ── Splash pendant restauration ───────────────────────────────────────────
  if (sessionLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#f5f8ff]">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-[#124bd2] border-t-transparent" />
      </div>
    )
  }

  // ── Connecté + approuvé → page de recherche ───────────────────────────────
  if (account && account.status === 'approved') {
    return (
      <>
        <SearchPage
          account={account}
          onLogout={handleLogout}
          onOpenAccount={() => setAccountPanel('workspace')}
        />
        {accountPanel && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm">
            <AccountPanel
              initialView={accountPanel}
              currentAccount={account}
              onAuthenticated={handleAuthenticated}
              onClose={() => setAccountPanel(null)}
              onLogout={handleLogout}
            />
          </div>
        )}
      </>
    )
  }

  // ── En attente de validation ──────────────────────────────────────────────
  if (account && account.status === 'pending') {
    return (
      <PendingApprovalPage
        account={account}
        onLogout={handleLogout}
      />
    )
  }

  // ── Non connecté → landing ────────────────────────────────────────────────
  return (
    <LandingPage
      externalAccountPanel={accountPanel}
      onOpenAccountPanel={view => setAccountPanel(view)}
      onAuthenticated={handleAuthenticated}
      onLogout={handleLogout}
    />
  )
}

// ─── Page d'attente de validation ─────────────────────────────────────────────
import trouveLogo from '@/assets/trouve-logo.png'
import { Ban, Clock, Mail, LogOut } from 'lucide-react'

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
