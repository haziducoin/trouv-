import { type FormEvent, useEffect, useMemo, useState } from 'react'
import {
  ArrowDown,
  ArrowLeft,
  BadgeCheck,
  BarChart3,
  Building2,
  Gift,
  Link,
  BriefcaseBusiness,
  Check,
  Clock3,
  CreditCard,
  Database,
  Eye,
  EyeOff,
  History,
  KeyRound,
  Lock,
  LogOut,
  Mail,
  MapPin,
  MessageSquare,
  Phone,
  Plus,
  Search,
  ShieldCheck,
  Sparkles,
  Target,
  TrendingUp,
  UserRound,
  UsersRound,
  X,
  Zap,
  type LucideIcon,
} from 'lucide-react'
import trouveLogo from '@/assets/trouve-logo.png'
import {
  authenticate,
  authenticateWithOAuth,
  createAccessRequest,
  DEMO_ADMIN,
  getAccounts,
  getAuditEvents,
  getDataMetrics,
  getDemoRequests,
  isOAuthPreviewEnabled,
  PersonalEmailError,
  restoreSession,
  reviewAccessRequest,
  reviewDemoRequest,
  usesRemoteDatabase,
  type Account,
  type AuditEvent,
  type DataMetric,
  type DemoRequest,
  type OAuthProvider,
  type UserRole,
} from '@/lib/accountStore'
import RegisterWizard from '@/components/auth/RegisterWizard'
import DevicesSection from '@/components/account/DevicesSection'
import { databaseModeLabel, getSupabaseClient } from '@/lib/supabase'

export type AccountPanelView = 'login' | 'register' | 'workspace' | 'profil' | 'abonnement' | 'dashboard' | 'parrainage'

interface AccountPanelProps {
  initialView: AccountPanelView
  currentAccount: Account | null
  onAuthenticated: (account: Account) => void
  onClose: () => void
  onLogout: () => void | Promise<void>
}

const roleLabels: Record<UserRole, string> = {
  agent: 'Agent',
  agence: 'Agence',
  admin: 'Administrateur',
}

const statusLabels = {
  pending:   'En validation',
  trial:     'Démo en cours',
  approved:  'Validé',
  rejected:  'Refusé',
  suspended: 'Suspendu',
}

// Traduit une erreur brute (Supabase, réseau, JSON…) en message clair pour l'utilisateur.
function friendlyAuthError(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error ?? '')
  const m = raw.toLowerCase()
  if (m.includes('invalid login credentials') || m.includes('invalid credentials'))
    return 'Email ou mot de passe incorrect.'
  if (m.includes('email not confirmed'))
    return "Votre compte n'est pas encore activé."
  if (m.includes('already registered') || m.includes('already exists') || m.includes('user already'))
    return 'Un compte existe déjà avec cet email. Connectez-vous plutôt.'
  if (m.includes('provider is not enabled') || m.includes('unsupported provider'))
    return "La connexion Google/Microsoft n'est pas encore disponible. Créez votre compte avec votre email professionnel ci-dessous."
  if (m.includes('rate limit') || m.includes('too many') || m.includes('429'))
    return 'Trop de tentatives. Patientez quelques minutes avant de réessayer.'
  if (m.includes('failed to fetch') || m.includes('networkerror') || m.includes('network request'))
    return 'Problème de connexion réseau. Vérifiez votre connexion et réessayez.'
  if (m.includes('password') && (m.includes('least') || m.includes('short') || m.includes('6')))
    return 'Le mot de passe doit contenir au moins 8 caractères.'
  // Message déjà lisible en français → on le garde tel quel (mais jamais de JSON brut).
  if (raw && !raw.trim().startsWith('{') && raw.length < 160) return raw
  return 'Connexion impossible pour le moment. Réessayez dans un instant.'
}

export default function AccountPanel({
  initialView,
  currentAccount,
  onAuthenticated,
  onClose,
  onLogout,
}: AccountPanelProps) {
  const [view, setView] = useState<AccountPanelView>(
    currentAccount && (initialView === 'login' || initialView === 'register') ? 'workspace' : initialView
  )
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [rememberMe, setRememberMe] = useState(() => localStorage.getItem('trouve_remember_me_v1') !== '0')
  const [loginError, setLoginError] = useState('')
  const [loginLoading, setLoginLoading] = useState(false)
  const [oauthLoading, setOauthLoading] = useState<OAuthProvider | null>(null)
  const [form, setForm] = useState({
    firstName: '',
    lastName: '',
    email: '',
    password: '',
    role: 'agent' as Exclude<UserRole, 'admin'>,
  })
  const [registerError, setRegisterError] = useState('')
  const [requestCreated, setRequestCreated] = useState<Account | null>(null)
  const [accounts, setAccounts]           = useState<Account[]>([])
  const [auditEvents, setAuditEvents]     = useState<AuditEvent[]>([])
  const [dataMetrics, setDataMetrics]     = useState<DataMetric[]>([])
  const [demoRequests, setDemoRequests]   = useState<DemoRequest[]>([])
  const [workspaceError, setWorkspaceError] = useState('')

  useEffect(() => {
    if (initialView === 'login' || initialView === 'register') {
      setView(currentAccount ? 'workspace' : initialView)
    } else {
      setView(initialView)
    }
  }, [currentAccount, initialView])

  useEffect(() => {
    if (currentAccount && view === 'workspace') {
      void refreshWorkspaceData()
    }
  }, [currentAccount, view])

  const refreshWorkspaceData = async () => {
    setWorkspaceError('')
    try {
      setAccounts(await getAccounts())
      if (currentAccount?.role === 'admin') {
        const [events, metrics, demos] = await Promise.all([getAuditEvents(), getDataMetrics(), getDemoRequests()])
        setAuditEvents(events)
        setDataMetrics(metrics)
        setDemoRequests(demos)
      }
    } catch (error) {
      setWorkspaceError(error instanceof Error ? error.message : 'Données indisponibles.')
    }
  }

  const pendingRequests = useMemo(
    () => accounts.filter((account) => account.status === 'pending'),
    [accounts],
  )

  const verifiedMembers = useMemo(
    () =>
      accounts.filter(
        (account) =>
          account.status === 'approved' &&
          account.siren === currentAccount?.siren &&
          account.role !== 'admin',
      ),
    [accounts, currentAccount],
  )

  const handleRegistration = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setRegisterError('')
    try {
      const newAccount = await createAccessRequest(form)
      // Redirection directe vers l'accès limité, sans écran d'attente
      onAuthenticated(newAccount)
    } catch (error) {
      if (error instanceof PersonalEmailError) {
        setRegisterError(
          `${error.email} est une adresse personnelle. Utilisez votre email professionnel (ex : prenom@votre-agence.fr).`,
        )
      } else {
        setRegisterError(friendlyAuthError(error))
      }
    }
  }

  const handleLogin = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setLoginLoading(true)
    setLoginError('')
    try {
      localStorage.setItem('trouve_remember_me_v1', rememberMe ? '1' : '0')
      if (rememberMe) {
        sessionStorage.removeItem('trouve_session_only_v1')
      } else {
        sessionStorage.setItem('trouve_session_only_v1', '1')
      }
      // Filet de sécurité global : si authenticate() ne répond pas en 12 s,
      // on débloque l'UI avec un message clair plutôt que de rester bloqué.
      const deadline = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('La connexion a pris trop de temps. Vérifiez votre connexion internet et réessayez.')), 12000)
      )
      const account = await Promise.race([authenticate(email, password), deadline])
      onAuthenticated(account)
      setView('workspace')
    } catch (error) {
      if (error instanceof PersonalEmailError) {
        setLoginError(`${error.email} est une adresse personnelle. Connectez-vous avec votre email professionnel.`)
      } else {
        setLoginError(friendlyAuthError(error))
      }
    } finally {
      setLoginLoading(false)
    }
  }

  const handleOAuth = async (provider: OAuthProvider) => {
    setLoginError('')
    setOauthLoading(provider)
    try {
      const account = await authenticateWithOAuth(provider)
      if (account) {
        onAuthenticated(account)
        setView('workspace')
        setOauthLoading(null)
      }
    } catch (error) {
      setOauthLoading(null)
      setLoginError(friendlyAuthError(error))
    }
  }

  const handleReview = async (accountId: string, status: 'approved' | 'rejected') => {
    if (!currentAccount) return
    await reviewAccessRequest(accountId, status, currentAccount.email)
    await refreshWorkspaceData()
  }

  const handleDemoReview = async (requestId: string, decision: 'approved' | 'rejected') => {
    if (!currentAccount) return
    await reviewDemoRequest(requestId, decision, currentAccount.email)
    await refreshWorkspaceData()
  }

  const isDrawerView = view === 'workspace' || view === 'profil' || view === 'abonnement' || view === 'dashboard' || view === 'parrainage'

  if (!isDrawerView) {
    const isRegister = view === 'register'
    const oauthPreview = isOAuthPreviewEnabled()
    // OAuth masqué tant que Google/Microsoft ne sont pas configurés dans Supabase.
    // Pour réactiver : poser VITE_OAUTH_ENABLED=1 dans Vercel (après config des providers).
    const oauthEnabled = oauthPreview || import.meta.env.VITE_OAUTH_ENABLED === '1'

    return (
      <div className="fixed inset-0 z-50 overflow-y-auto bg-[#f4f7ff] text-[#07113d]">
        <div className="flex min-h-screen items-center justify-center px-4 py-10">
          <aside className="relative w-full max-w-[460px] rounded-2xl bg-white px-7 py-8 shadow-[0_4px_32px_-4px_rgba(7,17,61,0.12)] sm:px-10">
            <button
              type="button"
              aria-label="Fermer"
              onClick={onClose}
              className="absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 text-slate-500 transition hover:border-blue-200 hover:text-[#124bd2]"
            >
              <X size={17} />
            </button>

            <img src={trouveLogo} alt="trouvé!" className="h-8 w-fit sm:h-9" />

            <div className="mt-8 max-w-[440px]">
              <h1 className="text-[1.65rem] font-bold leading-tight tracking-tight text-[#07113d]">
                {isRegister ? 'Créer votre accès' : 'Bienvenue'}
              </h1>
              <p className="mt-1.5 text-sm leading-6 text-slate-500">
                {isRegister
                  ? ''
                  : 'Connectez-vous à votre espace professionnel.'}
              </p>

              {oauthEnabled && (<>
              <div className="mt-5 space-y-3">
                <button
                  type="button"
                  onClick={() => void handleOAuth('google')}
                  disabled={Boolean(oauthLoading)}
                  className="flex h-12 w-full items-center justify-center gap-3 rounded-xl border border-slate-200 bg-white text-sm font-semibold text-[#07113d] shadow-sm transition hover:border-blue-300 hover:shadow-md"
                >
                  <span className="grid h-6 w-6 place-items-center rounded-md bg-white text-lg font-bold text-[#4285f4]">G</span>
                  {oauthLoading === 'google'
                    ? 'Ouverture Google...'
                    : isRegister ? "S'inscrire avec Google" : 'Se connecter avec Google'}
                </button>
                <button
                  type="button"
                  onClick={() => void handleOAuth('azure')}
                  disabled={Boolean(oauthLoading)}
                  className="flex h-12 w-full items-center justify-center gap-3 rounded-xl border border-slate-200 bg-white text-sm font-semibold text-[#07113d] shadow-sm transition hover:border-blue-300 hover:shadow-md"
                >
                  <span className="grid h-5 w-5 grid-cols-2 gap-0.5">
                    <span className="bg-[#f25022]" />
                    <span className="bg-[#7fba00]" />
                    <span className="bg-[#00a4ef]" />
                    <span className="bg-[#ffb900]" />
                  </span>
                  {oauthLoading === 'azure'
                    ? 'Ouverture Microsoft...'
                    : isRegister ? "S'inscrire avec Microsoft" : 'Se connecter avec Microsoft'}
                </button>
                <p className="text-xs leading-5 text-slate-400">
                  {oauthPreview
                    ? 'Mode preview local : Google/Microsoft ouvrent un compte démo validé, sans quitter le site.'
                    : isRegister
                      ? 'Adresse professionnelle requise (@votreentreprise.fr).'
                      : 'Connexion réservée aux adresses professionnelles.'}
                </p>
              </div>

              <div className="my-5 flex items-center gap-4 text-xs text-slate-400">
                <span className="h-px flex-1 bg-slate-200" />
                ou par e-mail
                <span className="h-px flex-1 bg-slate-200" />
              </div>
              </>)}

              {isRegister ? (
                <div className="mt-2">
                  <RegisterWizard
                    onComplete={async () => {
                      try {
                        const account = await restoreSession()
                        if (account) onAuthenticated(account)
                        else setView('login')
                      } catch {
                        setView('login')
                      }
                    }}
                    onBackToLogin={() => setView('login')}
                  />
                </div>
              ) : (
                <div className="mt-5 rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
                  <form onSubmit={handleLogin} className="space-y-4">
                    <AuthInput id="login-email" label="Adresse e-mail pro" type="email" icon={Mail} value={email} onChange={setEmail} />
                    <AuthInput id="login-password" label="Mot de passe" type="password" icon={KeyRound} value={password} onChange={setPassword} />
                    <div className="flex items-center justify-between gap-3 pt-1 text-sm">
                      <label className="inline-flex cursor-pointer items-center gap-2 text-slate-500">
                        <input
                          type="checkbox"
                          checked={rememberMe}
                          onChange={(event) => setRememberMe(event.target.checked)}
                          className="h-4 w-4 rounded border-slate-300 text-[#0757f8] focus:ring-[#0757f8]"
                        />
                        <span>Rester connecté</span>
                      </label>
                      <button
                        type="button"
                        onClick={() => window.open(`mailto:contact@trouve.fr?subject=Réinitialisation mot de passe&body=Email : ${encodeURIComponent(email || '(à renseigner)')}`, '_blank')}
                        className="text-xs font-semibold text-[#0757f8] hover:underline"
                      >
                        Mot de passe oublié ?
                      </button>
                    </div>
                    {loginError && (
                      <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{loginError}</p>
                    )}
                    <button
                      disabled={loginLoading}
                      className="h-12 w-full rounded-xl bg-[#1B54FF] text-sm font-semibold text-white shadow-[0_8px_24px_-8px_rgba(27,84,255,0.55)] transition hover:bg-[#0048dd] active:scale-[0.98] disabled:opacity-60"
                    >
                      {loginLoading ? 'Connexion...' : 'Se connecter'}
                    </button>
                  </form>
                </div>
              )}

              {!requestCreated && (
                <div className="mt-5">
                  <button
                    type="button"
                    onClick={() => setView(isRegister ? 'login' : 'register')}
                    className="flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-[#1B54FF] text-sm font-semibold text-[#1B54FF] transition hover:bg-blue-50"
                  >
                    {isRegister ? 'Déjà un compte — Se connecter' : 'Pas encore de compte — S\'inscrire'}
                  </button>
                </div>
              )}
            </div>

            <div className="mt-8 flex items-center justify-center gap-5 border-t border-slate-100 pt-5 text-[11px] text-slate-400">
              <span className="flex items-center gap-1.5"><ShieldCheck size={13} className="text-emerald-400" />Sécurisé</span>
              <span className="flex items-center gap-1.5"><Lock size={13} className="text-emerald-400" />RGPD</span>
              <span className="flex items-center gap-1.5"><BadgeCheck size={13} className="text-emerald-400" />Non revendu</span>
            </div>
          </aside>
        </div>
      </div>
    )
  }

  const drawerView = view as AccountPanelView

  const sectionTitles: Partial<Record<AccountPanelView, string>> = {
    profil:      'Mon profil',
    abonnement:  'Mon abonnement',
    dashboard:   'Dashboard',
    parrainage:  'Parrainage',
    workspace:   'Compte professionnel',
  }

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-[#f5f7fc] dark:bg-slate-950">
      {/* ── Top navbar ── */}
      <nav className="sticky top-0 z-10 border-b border-slate-200/60 dark:border-slate-800 bg-white/90 dark:bg-slate-900/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-2xl items-center gap-3 px-4 py-3 sm:px-6">
          <img src={trouveLogo} alt="trouvé!" className="h-7 w-fit" />
          <span className="text-slate-300 dark:text-slate-600">/</span>
          <button type="button" onClick={onClose}
            className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm text-slate-500 dark:text-slate-400 transition hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-700 dark:hover:text-slate-200">
            <ArrowLeft size={14} />
            Retour
          </button>
          <span className="text-slate-300 dark:text-slate-600">/</span>
          <span className="text-sm font-semibold text-slate-800 dark:text-slate-200">
            {sectionTitles[view as AccountPanelView] ?? 'Mon compte'}
          </span>
        </div>
      </nav>

      <section className="mx-auto max-w-2xl px-4 py-8 sm:px-6">


        {(drawerView === 'login' || drawerView === 'register') && !requestCreated && (
          <nav className="mb-7 flex rounded-2xl bg-slate-100 dark:bg-slate-800 p-1">
            {[
              { id: 'register' as const, label: 'Créer mon compte' },
              { id: 'login' as const, label: 'Connexion' },
            ].map((item) => (
              <button
                type="button"
                key={item.id}
                onClick={() => setView(item.id)}
                className={`flex-1 rounded-xl px-4 py-3 text-sm font-medium transition ${
                  drawerView === item.id
                    ? 'bg-white dark:bg-slate-700 text-slate-950 dark:text-white shadow-sm'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                {item.label}
              </button>
            ))}
          </nav>
        )}

        {requestCreated && (
          <div className="rounded-[28px] border border-blue-100 bg-blue-50 p-7">
            <BadgeCheck className="text-blue-700" size={32} />
            <h3 className="mt-5 text-xl font-semibold text-slate-950">Demande transmise</h3>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Le compte nominatif de {requestCreated.firstName} {requestCreated.lastName} est en
              attente de validation. L'administrateur contrôle la société avant activation.
            </p>
            {usesRemoteDatabase && (
              <p className="mt-3 rounded-xl bg-white px-4 py-3 text-xs leading-5 text-blue-800">
                Votre demande est enregistrée dans la base externe. Confirmez aussi votre email si
                Supabase vous a envoyé un lien de vérification.
              </p>
            )}
            <div className="mt-5 rounded-2xl bg-white p-4 text-sm text-slate-600">
              <p className="font-medium text-slate-950">{requestCreated.email}</p>
              <p className="mt-1 text-amber-700">Statut : en validation</p>
            </div>
            <button
              type="button"
              onClick={() => {
                setRequestCreated(null)
                setView('login')
              }}
              className="mt-6 w-full rounded-xl bg-slate-950 px-4 py-3 text-sm font-medium text-white"
            >
              Aller à la connexion
            </button>
          </div>
        )}

        {!requestCreated && drawerView === 'register' && (
          <form onSubmit={handleRegistration} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <Field
                id="register-first-name"
                label="Prénom"
                value={form.firstName}
                onChange={(value) => setForm({ ...form, firstName: value })}
              />
              <Field
                id="register-last-name"
                label="Nom"
                value={form.lastName}
                onChange={(value) => setForm({ ...form, lastName: value })}
              />
            </div>
            <Field
              id="register-email"
              label="Email professionnel"
              type="email"
              value={form.email}
              onChange={(value) => setForm({ ...form, email: value })}
            />
            <Field
              id="register-password"
              label="Mot de passe"
              type="password"
              value={form.password}
              minLength={8}
              onChange={(value) => setForm({ ...form, password: value })}
            />
            {registerError && (
              <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{registerError}</p>
            )}
            <button className="flex h-[52px] w-full items-center justify-center gap-2 rounded-xl bg-blue-700 px-4 py-3.5 text-sm font-medium text-white transition hover:bg-blue-800">
              <ShieldCheck size={16} />
              Soumettre pour validation
            </button>
            <p className="text-center text-xs leading-5 text-slate-500">
              Compte personnel, traçabilité active et aucun export massif autorisé.
            </p>
          </form>
        )}

        {!requestCreated && drawerView === 'login' && (
          <form onSubmit={handleLogin} className="space-y-4">
            <Field id="login-email" label="Email" type="email" placeholder="prenom.nom@votre-agence.fr" value={email} onChange={setEmail} />
            <Field id="login-password" label="Mot de passe" type="password" placeholder="••••••••" value={password} onChange={setPassword} />
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => window.open(`mailto:contact@trouve.fr?subject=Réinitialisation mot de passe&body=Email : ${encodeURIComponent(email || '(à renseigner)')}`, '_blank')}
                className="text-xs font-medium text-[#0757f8] hover:underline"
              >
                Mot de passe oublié ?
              </button>
            </div>
            {loginError && (
              <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{loginError}</p>
            )}
            <button
              disabled={loginLoading}
              className="flex h-[52px] w-full items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 py-3.5 text-sm font-medium text-white transition hover:bg-slate-800 disabled:opacity-60"
            >
              <KeyRound size={16} />
              {loginLoading ? 'Connexion...' : 'Se connecter'}
            </button>
            {!usesRemoteDatabase ? (
              <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-xs leading-6 text-slate-600">
                <p className="font-medium text-slate-900">Compte admin de démonstration</p>
                <p>{DEMO_ADMIN.email}</p>
                <p className="mt-2 text-slate-500">Le mot de passe de démonstration n'est plus affiché dans l'interface client.</p>
              </div>
            ) : (
              <div className="mt-6 rounded-2xl border border-blue-100 bg-blue-50 p-4 text-xs leading-6 text-blue-800">
                Authentification sécurisée via Supabase. Les comptes et validations sont conservés
                dans votre base externe.
              </div>
            )}
          </form>
        )}

        {drawerView === 'profil' && currentAccount && (
          <ProfilSection account={currentAccount} onLogout={onLogout} />
        )}

        {drawerView === 'abonnement' && currentAccount && (
          <div>
            {currentAccount.role !== 'admin' && (
              <SubscriptionPanel quota={currentAccount.quota} monthlyUsage={currentAccount.monthlyUsage} isDemo={currentAccount.id === 'demo-preview'} onRequestAuth={() => setView('login')} />
            )}
            <button type="button" onClick={onLogout}
              className="mt-8 flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 px-4 py-3 text-sm font-medium text-slate-600 transition hover:bg-slate-50">
              <LogOut size={15} /> Se déconnecter
            </button>
          </div>
        )}

        {drawerView === 'dashboard' && currentAccount && (
          <DashboardSection account={currentAccount} onRequestAuth={() => setView('login')} onLogout={onLogout} />
        )}

        {drawerView === 'parrainage' && currentAccount && (
          <ParrainageSection account={currentAccount} onLogout={onLogout} />
        )}

        {drawerView === 'workspace' && currentAccount && (
          <Workspace
            account={currentAccount}
            accounts={accounts}
            auditEvents={auditEvents}
            dataMetrics={dataMetrics}
            demoRequests={demoRequests}
            pendingRequests={pendingRequests}
            verifiedMembers={verifiedMembers}
            workspaceError={workspaceError}
            onReview={handleReview}
            onDemoReview={handleDemoReview}
            onLogout={onLogout}
            onRequestAuth={() => setView('login')}
          />
        )}

      </section>
    </div>
  )

}

function AuthShowcase() {
  return (
    <section className="relative hidden min-h-screen items-center justify-center overflow-hidden bg-[#f3f7ff] p-5 lg:flex">
      <div className="absolute inset-4 rounded-[32px] bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.98),rgba(240,246,255,0.72)_48%,rgba(232,241,255,0.96))] shadow-[inset_0_1px_0_rgba(255,255,255,0.9),0_30px_100px_-70px_rgba(7,39,115,0.7)]" />
      <div className="absolute left-20 top-20 h-72 w-72 rounded-full bg-blue-200/30 blur-[90px]" />
      <div className="absolute bottom-16 right-16 h-80 w-80 rounded-full bg-indigo-200/30 blur-[90px]" />

      <div className="relative z-10 w-full max-w-[900px]">
        <div className="mx-auto max-w-3xl text-center">
          <h2 className="text-3xl font-extrabold tracking-tight text-[#07113d] xl:text-4xl">
            <span className="block text-[#0757f8]">Retrouvez un 06, un 07</span>
            ou un email direct
          </h2>
          <div className="mx-auto mt-1 h-2.5 w-48 rounded-full bg-[#0757f8]/15" />
          <p className="mt-4 text-base leading-7 text-slate-500">
            Nom, prénom, ville, adresse, téléphone, email ou réseau public.
            <span className="block">Croisez les indices, puis débloquez le contact après validation.</span>
          </p>
        </div>

        <div className="mx-auto mt-6 flex max-w-3xl items-center gap-4 rounded-2xl border border-white/80 bg-white p-2.5 shadow-[0_24px_80px_-50px_rgba(7,39,115,0.8)]">
          <Search className="ml-3 text-slate-400" size={22} />
          <span className="flex-1 text-left text-lg text-slate-400">Ex : Camille Moreau, Paris 16, 06 42 18 74 93</span>
          <button className="rounded-xl bg-[#0757f8] px-6 py-3.5 text-base font-bold text-white shadow-[0_14px_35px_-18px_rgba(7,87,248,0.85)]">
            Rechercher
          </button>
        </div>

        <div className="mt-3 flex justify-center text-[#0757f8]">
          <ArrowDown size={24} />
        </div>

        <div className="relative mx-auto mt-3 max-w-3xl">
          <div className="absolute inset-x-[-70px] top-10 -z-10 h-[180px] bg-[radial-gradient(#2f7dff_1px,transparent_1px)] [background-size:18px_18px] opacity-20" />
          <div className="grid gap-5 rounded-[26px] border border-white/80 bg-white/95 p-5 shadow-[0_28px_90px_-58px_rgba(7,39,115,0.9)] md:grid-cols-[1fr_210px]">
            <div className="flex gap-5">
              <div className="relative h-24 w-24 shrink-0 overflow-hidden rounded-full bg-gradient-to-br from-blue-100 to-slate-200">
                <div className="absolute left-1/2 top-7 h-10 w-10 -translate-x-1/2 rounded-full bg-[#f1c5a5]" />
                <div className="absolute bottom-0 left-1/2 h-16 w-20 -translate-x-1/2 rounded-t-[28px] bg-[#10245c]" />
                <div className="absolute left-1/2 top-[44px] h-10 w-14 -translate-x-1/2 rounded-b-full bg-[#f1c5a5]" />
                <div className="absolute left-1/2 top-[39px] h-5 w-12 -translate-x-1/2 rounded-full border-2 border-[#07113d]/60" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-4">
                  <div>
                    <h3 className="text-xl font-bold text-[#07113d]">Camille Moreau</h3>
                    <p className="mt-2 text-sm leading-6 text-slate-500">Paris 16<br />Profil public cohérent</p>
                  </div>
                  <span className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-700 shadow-[0_12px_28px_-16px_rgba(16,185,129,0.9)]">
                    Contact trouvé <BadgeCheck size={14} />
                  </span>
                </div>
                <div className="mt-5 space-y-2.5 text-[15px] font-medium text-[#07113d]">
                  <InfoLine icon={Phone} label="06 42 18 74 93" />
                  <InfoLine icon={Mail} label="camille.moreau@gmail.com" />
                  <InfoLine icon={MapPin} label="Paris 16 · adresse cohérente" />
                  <InfoLine icon={BriefcaseBusiness} label="Entreprise associée détectée" />
                  <InfoLine icon={UsersRound} label="Homonymes filtrés" />
                </div>
              </div>
            </div>
            <div className="space-y-3">
              <ProofCard icon={Zap} title="Résultat instantané" detail="en 2,3 secondes" />
              <ProofCard icon={Target} title="Informations fiables" detail="Mises à jour en continu" />
              <ProofCard icon={ShieldCheck} title="Données sécurisées" detail="Confidentielles & RGPD" />
            </div>
          </div>
        </div>

        <div className="mx-auto mt-7 grid max-w-4xl grid-cols-3 rounded-[24px] border border-white/80 bg-white/70 p-5 text-center shadow-[0_24px_70px_-60px_rgba(7,39,115,0.75)] backdrop-blur">
          <Metric value="267M+" label="Données" />
          <Metric value="25+" label="Critères" framed />
          <Metric value="<1s" label="Résultats" />
        </div>
      </div>
    </section>
  )
}

function AuthInput({
  id,
  label,
  type = 'text',
  value,
  minLength,
  inputMode,
  icon: Icon,
  onChange,
}: {
  id: string
  label: string
  type?: string
  value: string
  minLength?: number
  inputMode?: 'text' | 'numeric' | 'decimal' | 'tel' | 'search' | 'email' | 'url'
  icon?: LucideIcon
  onChange: (value: string) => void
}) {
  const [showPwd, setShowPwd] = useState(false)
  const isPassword = type === 'password'
  const effectiveType = isPassword ? (showPwd ? 'text' : 'password') : type
  const EyeIcon = showPwd ? EyeOff : Eye

  return (
    <div className="flex-1">
      <label htmlFor={id} className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">
        {label}
      </label>
      <div className="relative">
        {Icon && <Icon className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={17} />}
        <input
          id={id}
          required
          type={effectiveType}
          minLength={minLength}
          inputMode={inputMode}
          value={value}
          placeholder=""
          onChange={(event) => onChange(event.target.value)}
          className={`h-[50px] w-full rounded-xl border border-slate-200 bg-white text-sm font-medium text-[#07113d] outline-none transition focus:border-[#0757f8] focus:ring-4 focus:ring-blue-50 ${
            Icon ? 'pl-11' : 'pl-4'
          } ${isPassword ? 'pr-12' : 'pr-4'}`}
        />
        {isPassword && (
          <button
            type="button"
            tabIndex={-1}
            onClick={() => setShowPwd(v => !v)}
            className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 transition hover:text-slate-600"
            aria-label={showPwd ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
          >
            <EyeIcon size={18} />
          </button>
        )}
      </div>
    </div>
  )
}

function InfoLine({ icon: Icon, label }: { icon: LucideIcon; label: string }) {
  return (
    <div className="flex items-center gap-3">
      <Icon size={18} className="text-[#0757f8]" />
      <span>{label}</span>
    </div>
  )
}

function ProofCard({ icon: Icon, title, detail }: { icon: LucideIcon; title: string; detail: string }) {
  return (
    <div className="flex items-center gap-4 rounded-2xl bg-[#f3f7ff] p-4">
      <Icon size={25} className="text-[#0757f8]" />
      <div>
        <p className="text-sm font-bold text-[#07113d]">{title}</p>
        <p className="mt-1 text-xs text-slate-500">{detail}</p>
      </div>
    </div>
  )
}

function Metric({ value, label, framed = false }: { value: string; label: string; framed?: boolean }) {
  return (
    <div className={framed ? 'border-x border-slate-200' : ''}>
      <p className="text-3xl font-extrabold tracking-tight text-[#0757f8]">{value}</p>
      <p className="mt-2 text-sm font-semibold uppercase tracking-[0.22em] text-slate-500">{label}</p>
    </div>
  )
}

function Workspace({
  account,
  auditEvents,
  dataMetrics,
  demoRequests,
  pendingRequests,
  verifiedMembers,
  workspaceError,
  onReview,
  onDemoReview,
  onLogout,
  onRequestAuth,
}: {
  account: Account
  accounts: Account[]
  auditEvents: AuditEvent[]
  dataMetrics: DataMetric[]
  demoRequests: DemoRequest[]
  pendingRequests: Account[]
  verifiedMembers: Account[]
  workspaceError: string
  onReview: (accountId: string, status: 'approved' | 'rejected') => void
  onDemoReview: (requestId: string, decision: 'approved' | 'rejected') => void
  onLogout: () => void | Promise<void>
  onRequestAuth: () => void
}) {
  return (
    <div>
      <div className="rounded-[28px] bg-slate-950 p-6 text-white">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="rounded-full bg-white/10 p-3">
              {account.role === 'admin' ? <ShieldCheck size={19} /> : <UserRound size={19} />}
            </div>
            <div>
              <p className="text-base font-medium">{account.firstName} {account.lastName}</p>
              <p className="text-xs text-slate-400">{account.email}</p>
            </div>
          </div>
          <span className="rounded-full border border-blue-400/25 bg-blue-400/10 px-3 py-1 text-xs text-blue-200">
            {roleLabels[account.role]}
          </span>
        </div>
        <div className="mt-6 flex items-center gap-2 text-sm text-emerald-300">
          <BadgeCheck size={15} />
          Accès {statusLabels[account.status].toLowerCase()}
        </div>
        {account.role !== 'admin' && (
          <p className="mt-2 text-xs text-slate-400">{account.companyName} · Compte nominatif</p>
        )}
      </div>

      {account.role !== 'admin' && (
        <div className="mt-5 grid grid-cols-2 gap-3">
          <MiniMetric label="Utilisation mensuelle" value={`${account.monthlyUsage} / ${account.quota}`} />
          <MiniMetric label="Accès" value={account.role === 'agence' ? 'Équipe' : 'Nominatif'} />
          <MiniMetric label="Export massif" value="Désactivé" />
          <MiniMetric label="Journalisation" value="Active" />
        </div>
      )}

      {account.role === 'agence' && (
        <div className="mt-6 rounded-2xl border border-slate-200 dark:border-slate-700 dark:bg-slate-800/50 p-5">
          <p className="flex items-center gap-2 font-medium text-slate-950 dark:text-white">
            <UsersRound size={17} className="text-blue-700" />
            Comptes de l'agence
          </p>
          <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
            {verifiedMembers.length || 1} utilisateur{verifiedMembers.length > 1 ? 's' : ''} autorisé{verifiedMembers.length > 1 ? 's' : ''} · quota partagé suivi
          </p>
          <div className="mt-4 space-y-2">
            {verifiedMembers.map((member) => (
              <div key={member.id} className="flex items-center justify-between rounded-xl bg-slate-50 dark:bg-slate-800 px-3 py-3 text-xs">
                <div>
                  <p className="font-medium text-slate-900 dark:text-slate-100">{member.firstName} {member.lastName}</p>
                  <p className="mt-0.5 text-slate-500 dark:text-slate-400">{member.email}</p>
                </div>
                <span className="rounded-full bg-white dark:bg-slate-700 px-2.5 py-1 text-blue-700 dark:text-blue-400">{roleLabels[member.role]}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {account.role === 'admin' && (
        <>
          <div className="mt-6 rounded-2xl border border-slate-200 p-5">
            <div className="flex items-center justify-between gap-3">
              <p className="flex items-center gap-2 font-medium text-slate-950">
                <Database size={17} className="text-blue-700" />
                Base de données
              </p>
              <span className={`rounded-full px-3 py-1 text-xs ${
                usesRemoteDatabase ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'
              }`}>
                {databaseModeLabel()}
              </span>
            </div>
            <p className="mt-2 text-xs leading-5 text-slate-500">
              {usesRemoteDatabase
                ? 'Suivi externe actif : données centralisées, accès contrôlés et journal auditable.'
                : 'Structure prête pour Supabase. Les données visibles ici restent locales avant connexion.'}
            </p>
            <div className="mt-4 grid grid-cols-3 gap-2">
              {dataMetrics.map((metric) => (
                <div key={metric.entity} className="rounded-xl bg-slate-50 px-3 py-3">
                  <p className="text-lg font-semibold text-slate-950">{metric.total}</p>
                  <p className="mt-1 truncate text-[11px] capitalize text-slate-500">{metric.entity}</p>
                </div>
              ))}
            </div>
            {workspaceError && (
              <p className="mt-4 rounded-xl bg-red-50 px-3 py-2 text-xs text-red-700">{workspaceError}</p>
            )}
          </div>
          <div className="mt-6">
            <div className="flex items-center justify-between">
              <p className="flex items-center gap-2 font-medium text-slate-950">
                <Building2 size={17} className="text-blue-700" />
                Demandes à valider
              </p>
              <span className="rounded-full bg-blue-50 px-3 py-1 text-xs text-blue-700">
                {pendingRequests.length} en attente
              </span>
            </div>
            <div className="mt-4 space-y-3">
              {pendingRequests.length === 0 && (
                <p className="rounded-2xl bg-slate-50 p-5 text-sm text-slate-500">
                  Aucune demande en attente pour le moment.
                </p>
              )}
              {pendingRequests.map((request) => (
                <div key={request.id} className="rounded-2xl border border-slate-200 p-4">
                  <div className="flex justify-between gap-4">
                    <div>
                      <p className="text-sm font-medium text-slate-950">
                        {request.firstName} {request.lastName}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">{request.companyName} · Compte professionnel</p>
                      <p className="mt-1 text-xs text-slate-500">
                        {request.email} · {roleLabels[request.role]}
                      </p>
                    </div>
                    <span className="h-fit rounded-full bg-amber-50 px-3 py-1 text-xs text-amber-700">
                      À contrôler
                    </span>
                  </div>
                  <div className="mt-4 flex gap-2">
                    <button
                      type="button"
                      onClick={() => onReview(request.id, 'approved')}
                      className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-blue-700 px-3 py-2.5 text-xs font-medium text-white"
                    >
                      <Check size={14} />
                      Valider
                    </button>
                    <button
                      type="button"
                      onClick={() => onReview(request.id, 'rejected')}
                      className="flex-1 rounded-xl border border-slate-200 px-3 py-2.5 text-xs font-medium text-slate-700"
                    >
                      Refuser
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="mt-6">
            <div className="flex items-center justify-between">
              <p className="flex items-center gap-2 font-medium text-slate-950">
                <MessageSquare size={17} className="text-emerald-600" />
                Demandes de démo
              </p>
              <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs text-emerald-700">
                {demoRequests.filter(r => r.status === 'pending').length} en attente
              </span>
            </div>
            <div className="mt-4 space-y-3">
              {demoRequests.length === 0 && (
                <p className="rounded-2xl bg-slate-50 p-5 text-sm text-slate-500">
                  Aucune demande de démo pour le moment.
                </p>
              )}
              {demoRequests.map((req) => (
                <div key={req.id} className="rounded-2xl border border-slate-200 p-4">
                  <div className="flex justify-between gap-4">
                    <div>
                      <p className="text-sm font-medium text-slate-950">
                        {req.firstName} {req.lastName}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">{req.email}</p>
                      {req.message && (
                        <p className="mt-2 rounded-xl bg-slate-50 px-3 py-2 text-xs italic text-slate-600">
                          « {req.message} »
                        </p>
                      )}
                    </div>
                    <span className={`h-fit rounded-full px-3 py-1 text-xs ${
                      req.status === 'pending'  ? 'bg-amber-50 text-amber-700' :
                      req.status === 'approved' ? 'bg-emerald-50 text-emerald-700' :
                      'bg-red-50 text-red-700'
                    }`}>
                      {req.status === 'pending' ? 'En attente' : req.status === 'approved' ? 'Validée' : 'Refusée'}
                    </span>
                  </div>
                  {req.status === 'pending' && (
                    <div className="mt-4 flex gap-2">
                      <button
                        type="button"
                        onClick={() => onDemoReview(req.id, 'approved')}
                        className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-emerald-600 px-3 py-2.5 text-xs font-medium text-white"
                      >
                        <Check size={14} />
                        Accorder démo
                      </button>
                      <button
                        type="button"
                        onClick={() => onDemoReview(req.id, 'rejected')}
                        className="flex-1 rounded-xl border border-slate-200 px-3 py-2.5 text-xs font-medium text-slate-700"
                      >
                        Refuser
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className="mt-7">
            <p className="mb-4 flex items-center gap-2 font-medium text-slate-950">
              <Clock3 size={17} className="text-blue-700" />
              Journal récent
            </p>
            <div className="space-y-2">
              {auditEvents.slice(0, 4).map((event) => (
                <div key={event.id} className="flex justify-between rounded-xl bg-slate-50 px-4 py-3 text-xs text-slate-600">
                  <span>
                    {usesRemoteDatabase
                      ? formatAction(event.action)
                      : `${event.targetEmail} · ${formatAction(event.action)}`}
                  </span>
                  <span>{new Date(event.timestamp).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</span>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {/* ── Mon abonnement ───────────────────────────────────────────── */}
      {account.role !== 'admin' && (
        <SubscriptionPanel quota={account.quota} monthlyUsage={account.monthlyUsage} isDemo={account.id === 'demo-preview'} onRequestAuth={onRequestAuth} />
      )}

      <button
        type="button"
        onClick={onLogout}
        className="mt-8 flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 px-4 py-3 text-sm font-medium text-slate-600 transition hover:bg-slate-50"
      >
        <LogOut size={15} />
        Se déconnecter
      </button>
    </div>
  )
}

function ProfilSection({ account, onLogout }: { account: Account; onLogout: () => void | Promise<void> }) {
  const initial = (account.firstName?.[0] ?? account.companyName?.[0] ?? 'U').toUpperCase()
  const plan    = account.quota >= 10000 ? 'Pro' : account.quota >= 4000 ? 'Agence' : 'Solo'
  const usagePct = Math.min(100, Math.round((account.monthlyUsage / account.quota) * 100))

  const dangerAction = (subject: string) =>
    window.open(`mailto:contact@trouve.fr?subject=${encodeURIComponent(subject)}&body=Bonjour, je souhaite procéder à l'action suivante pour mon compte ${account.email}.`, '_blank')

  return (
    <div className="flex flex-col gap-5">
      {/* Avatar + identité */}
      <div className="flex items-center gap-4 rounded-2xl border border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 p-5">
        <div className="relative shrink-0">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-[#1B54FF] to-indigo-500 text-2xl font-bold text-white shadow-lg shadow-blue-500/25">
            {initial}
          </div>
          <span className="absolute bottom-0.5 right-0.5 h-3.5 w-3.5 rounded-full border-2 border-white dark:border-slate-800 bg-emerald-400" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-base font-bold text-slate-900 dark:text-white">{account.companyName || `${account.firstName} ${account.lastName}`}</p>
            <span className="rounded-full bg-blue-50 px-2.5 py-0.5 text-[10px] font-bold text-blue-700">{roleLabels[account.role]}</span>
            <span className="flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-[10px] font-bold text-emerald-700">
              <BadgeCheck size={10} /> Validé
            </span>
          </div>
          <p className="mt-0.5 text-xs text-slate-400">{account.email}</p>
          <p className="text-[10px] text-slate-300">Plan {plan} · Compte nominatif</p>
        </div>
      </div>

      {/* Informations personnelles */}
      <div>
        <p className="mb-2.5 flex items-center gap-2 text-sm font-semibold text-slate-800 dark:text-slate-200">
          <UserRound size={15} className="text-blue-700" /> Informations personnelles
        </p>
        <div className="grid grid-cols-2 gap-2.5">
          <div className="rounded-xl border border-slate-200 dark:border-slate-700 dark:bg-slate-800 p-3">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Prénom</p>
            <p className="mt-1 text-sm font-medium text-slate-800 dark:text-slate-200">{account.firstName || '—'}</p>
          </div>
          <div className="rounded-xl border border-slate-200 dark:border-slate-700 dark:bg-slate-800 p-3">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Nom</p>
            <p className="mt-1 text-sm font-medium text-slate-800 dark:text-slate-200">{account.lastName || '—'}</p>
          </div>
          <div className="col-span-2 rounded-xl border border-slate-200 dark:border-slate-700 dark:bg-slate-800 p-3">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Adresse e-mail professionnelle</p>
            <p className="mt-1 text-sm font-medium text-slate-800 dark:text-slate-200">{account.email}</p>
          </div>
        </div>
      </div>

      {/* Entreprise & licences */}
      <div>
        <p className="mb-2.5 flex items-center gap-2 text-sm font-semibold text-slate-800 dark:text-slate-200">
          <Building2 size={15} className="text-blue-700" /> Entreprise & licences
        </p>
        <div className="grid grid-cols-2 gap-2.5">
          <div className="col-span-2 rounded-xl border border-slate-200 dark:border-slate-700 dark:bg-slate-800 p-3">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Raison sociale</p>
            <p className="mt-1 text-sm font-medium text-slate-800 dark:text-slate-200">{account.companyName || '—'}</p>
          </div>
          <div className="rounded-xl border border-slate-200 dark:border-slate-700 dark:bg-slate-800 p-3">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">SIREN</p>
            <p className="mt-1 text-sm font-medium text-slate-800 dark:text-slate-200">{account.siren || '—'}</p>
          </div>
          <div className="rounded-xl border border-slate-200 dark:border-slate-700 dark:bg-slate-800 p-3">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Plan actif</p>
            <p className="mt-1 text-sm font-medium text-slate-800 dark:text-slate-200">{plan}</p>
          </div>
        </div>
      </div>

      {/* Utilisation du mois */}
      <div>
        <p className="mb-2.5 flex items-center gap-2 text-sm font-semibold text-slate-800 dark:text-slate-200">
          <BarChart3 size={15} className="text-blue-700" /> Utilisation ce mois
        </p>
        <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 p-4">
          <div className="mb-1.5 flex justify-between text-xs text-slate-500 dark:text-slate-400">
            <span>{account.monthlyUsage} recherches effectuées</span>
            <span>/ {account.quota} incluses</span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-600">
            <div className={`h-2 rounded-full ${usagePct > 80 ? 'bg-amber-500' : 'bg-[#1B54FF]'}`} style={{ width: `${usagePct}%` }} />
          </div>
          <p className="mt-1 text-right text-[10px] text-slate-400">{usagePct}% utilisé · renouvellement le 1er du mois</p>
        </div>
      </div>

      {/* Sécurité */}
      <div>
        <p className="mb-2.5 flex items-center gap-2 text-sm font-semibold text-slate-800 dark:text-slate-200">
          <ShieldCheck size={15} className="text-blue-700" /> Sécurité & accès
        </p>
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between rounded-xl border border-slate-200 dark:border-slate-700 dark:bg-slate-800 px-4 py-3">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Mot de passe</p>
              <p className="mt-0.5 text-sm text-slate-700 dark:text-slate-300">••••••••••••</p>
            </div>
            <button type="button"
              onClick={() => window.open(`mailto:contact@trouve.fr?subject=Réinitialisation mot de passe&body=Email : ${account.email}`, '_blank')}
              className="text-xs font-semibold text-[#1B54FF] hover:underline">
              Modifier →
            </button>
          </div>
          <div className="flex items-center justify-between rounded-xl border border-slate-200 dark:border-slate-700 dark:bg-slate-800 px-4 py-3">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Journalisation</p>
              <p className="mt-0.5 text-sm text-slate-700 dark:text-slate-300">Toutes les recherches sont tracées</p>
            </div>
            <span className="rounded-full bg-emerald-50 dark:bg-emerald-900/30 px-2.5 py-0.5 text-[10px] font-bold text-emerald-700 dark:text-emerald-400">Actif</span>
          </div>
        </div>
      </div>

      {/* Appareils connectés */}
      <div>
        <p className="mb-2.5 flex items-center gap-2 text-sm font-semibold text-slate-800 dark:text-slate-200">
          <KeyRound size={15} className="text-blue-700" /> Appareils connectés
        </p>
        <DevicesSection />
      </div>

      {/* Zone sensible */}
      <div className="rounded-2xl border border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-950/30 p-4">
        <p className="mb-1 text-sm font-bold text-red-600 dark:text-red-400">Zone sensible</p>
        <p className="mb-3 text-xs text-red-400 dark:text-red-500">Ces actions sont irréversibles. Lisez attentivement avant de procéder.</p>
        <div className="flex flex-col gap-2">
          {[
            { label: 'Résilier l\'abonnement',           sub: 'Accès actif jusqu\'à la fin de la période en cours.',      subject: 'Résiliation abonnement' },
            { label: 'Supprimer le compte',               sub: 'Supprime définitivement l\'accès et toutes les licences.', subject: 'Suppression compte' },
            { label: 'Suppression des données (RGPD)',    sub: 'Droit à l\'effacement — traité sous 30 jours.',            subject: 'Suppression données RGPD' },
          ].map(({ label, sub, subject }) => (
            <div key={label} className="flex items-center justify-between gap-3 rounded-xl border border-red-200 dark:border-red-900/40 bg-white dark:bg-slate-800 px-3 py-2.5">
              <div>
                <p className="text-xs font-semibold text-slate-800 dark:text-slate-200">{label}</p>
                <p className="text-[10px] text-slate-400">{sub}</p>
              </div>
              <button type="button" onClick={() => dangerAction(subject)}
                className="shrink-0 rounded-lg border border-red-300 dark:border-red-700 px-2.5 py-1 text-[10px] font-semibold text-red-600 dark:text-red-400 transition hover:bg-red-50 dark:hover:bg-red-900/30">
                Demander →
              </button>
            </div>
          ))}
        </div>
      </div>

      <button type="button" onClick={onLogout}
        className="flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 dark:border-slate-700 px-4 py-3 text-sm font-medium text-slate-600 dark:text-slate-300 transition hover:bg-slate-50 dark:hover:bg-slate-800">
        <LogOut size={15} /> Se déconnecter
      </button>
    </div>
  )
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 60) return `Il y a ${m} min`
  const h = Math.floor(m / 60)
  if (h < 24) return `Il y a ${h} h`
  const d = Math.floor(h / 24)
  if (d === 1) return 'Hier'
  return `Il y a ${d} j`
}

const AVATAR_COLORS = [
  'bg-blue-100 text-blue-700',
  'bg-emerald-100 text-emerald-700',
  'bg-purple-100 text-purple-700',
  'bg-amber-100 text-amber-700',
  'bg-rose-100 text-rose-700',
]

function DashboardSection({ account, onRequestAuth, onLogout }: { account: Account; onRequestAuth: () => void; onLogout: () => void | Promise<void> }) {
  const usagePct = Math.min(100, Math.round((account.monthlyUsage / account.quota) * 100))
  const remaining = account.quota - account.monthlyUsage

  const [history, setHistory] = useState<Array<{ query: string; result_name?: string; result_company?: string; result_location?: string; created_at: string }>>([])

  useEffect(() => {
    if (!usesRemoteDatabase) return
    import('@/lib/supabase').then(({ getSupabaseClient }) => {
      getSupabaseClient().rpc('get_search_history', { p_limit: 5 }).then(({ data }) => {
        if (data) setHistory(data as typeof history)
      })
    })
  }, [])

  return (
    <div className="flex flex-col gap-4">
      {/* Grande stat mois en cours */}
      <div className="rounded-2xl bg-gradient-to-br from-[#1B54FF] to-indigo-500 p-5 text-white">
        <p className="text-[10px] font-bold uppercase tracking-widest opacity-75">Mois en cours</p>
        <div className="mt-2 flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-5xl font-extrabold leading-none tracking-tight">{account.monthlyUsage}</p>
            <p className="mt-1 text-sm opacity-80">recherches sur {account.quota.toLocaleString('fr-FR')} incluses</p>
          </div>
          <div className="text-right">
            <p className="text-2xl font-bold">{usagePct}%</p>
            <p className="text-xs opacity-75">du quota utilisé</p>
          </div>
        </div>
        <div className="mt-4 h-1.5 w-full overflow-hidden rounded-full bg-white/25">
          <div className="h-1.5 rounded-full bg-white" style={{ width: `${usagePct}%` }} />
        </div>
        <div className="mt-1 flex justify-between text-[10px] opacity-70">
          <span>{usagePct}% utilisé</span>
          <span>Renouvellement le 1er du mois</span>
        </div>
      </div>

      {/* 2 mini stats */}
      <div className="grid grid-cols-2 gap-2.5">
        {[
          { value: account.monthlyUsage.toString(),       label: 'Recherches ce mois' },
          { value: remaining.toLocaleString('fr-FR'),     label: 'Recherches restantes', green: true },
        ].map(({ value, label, green }) => (
          <div key={label} className="rounded-xl border border-slate-200 dark:border-slate-700 dark:bg-slate-800 p-3 text-center">
            <p className={`text-xl font-extrabold ${green ? 'text-emerald-600' : 'text-[#1B54FF]'}`}>{value}</p>
            <p className="mt-0.5 text-[10px] text-slate-500 dark:text-slate-400">{label}</p>
          </div>
        ))}
      </div>

      {/* Activité récente — vraies données */}
      <div>
        <p className="mb-2.5 flex items-center gap-2 text-sm font-semibold text-slate-800 dark:text-slate-200">
          <History size={15} className="text-blue-700" /> Dernières recherches
        </p>
        {history.length === 0 ? (
          <p className="rounded-xl border border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-4 py-3 text-center text-xs text-slate-400">
            Aucune recherche ce mois
          </p>
        ) : (
          <div className="flex flex-col gap-1.5">
            {history.map((item, i) => {
              const label = item.result_name || item.query
              const sub = [item.result_company, item.result_location].filter(Boolean).join(' · ')
              const initials = label.split(' ').map((w: string) => w[0]).join('').slice(0, 2).toUpperCase()
              return (
                <div key={i} className="flex items-center justify-between rounded-xl border border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-2.5">
                  <div className="flex items-center gap-2.5">
                    <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold ${AVATAR_COLORS[i % AVATAR_COLORS.length]}`}>{initials}</div>
                    <div>
                      <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">{label}</p>
                      {sub && <p className="text-[10px] text-slate-400">{sub}</p>}
                    </div>
                  </div>
                  <span className="shrink-0 text-[10px] text-slate-400">{timeAgo(item.created_at)}</span>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Votre compte */}
      <div>
        <p className="mb-2.5 flex items-center gap-2 text-sm font-semibold text-slate-800 dark:text-slate-200">
          <UsersRound size={15} className="text-blue-700" /> Votre compte
        </p>
        <div className="flex flex-col gap-2">
          <div className="rounded-xl border border-slate-200 dark:border-slate-700 dark:bg-slate-800 p-3">
            <div className="mb-2 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="flex h-7 w-7 items-center justify-center rounded-full bg-[#1B54FF] text-xs font-bold text-white">
                  {(account.firstName?.[0] || account.email[0]).toUpperCase()}
                </div>
                <span className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                  {account.firstName ? `${account.firstName} ${account.lastName || ''}`.trim() : account.email}
                  <span className="ml-1.5 text-[10px] text-slate-400">(vous)</span>
                </span>
              </div>
              <span className="text-sm font-bold text-[#1B54FF]">{account.monthlyUsage} rech.</span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-600">
              <div className="h-1.5 rounded-full bg-[#1B54FF]" style={{ width: `${usagePct}%` }} />
            </div>
          </div>
        </div>
      </div>

      {/* Ajouter une licence */}
      <div className="flex items-center justify-between gap-3 rounded-xl border-2 border-dashed border-blue-200 dark:border-blue-800 bg-blue-50/50 dark:bg-blue-950/20 px-4 py-3">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-blue-100 dark:bg-blue-900/40">
            <UsersRound size={16} className="text-[#1B54FF]" />
          </div>
          <div>
            <p className="text-sm font-bold text-slate-800 dark:text-slate-200">Ajouter une licence</p>
            <p className="text-[10px] text-slate-500 dark:text-slate-400">Donnez accès à un collaborateur supplémentaire</p>
          </div>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1.5">
          <span className="text-base font-extrabold text-[#1B54FF]">99 €<span className="text-[10px] font-normal text-slate-400"> /mois</span></span>
          <button type="button" onClick={onRequestAuth}
            className="rounded-lg bg-[#1B54FF] px-3 py-1.5 text-[11px] font-bold text-white transition hover:bg-[#0b3fbc]">
            Ajouter →
          </button>
        </div>
      </div>

      {/* Alerte quota */}
      <div className={`flex items-center gap-3 rounded-xl border px-4 py-3 ${usagePct > 80 ? 'border-amber-200 dark:border-amber-800/50 bg-amber-50 dark:bg-amber-950/20' : 'border-emerald-200 dark:border-emerald-800/50 bg-emerald-50 dark:bg-emerald-950/20'}`}>
        <BadgeCheck size={16} className={`shrink-0 ${usagePct > 80 ? 'text-amber-600' : 'text-emerald-600'}`} />
        <div>
          <p className={`text-xs font-semibold ${usagePct > 80 ? 'text-amber-800 dark:text-amber-400' : 'text-emerald-800 dark:text-emerald-400'}`}>
            {usagePct > 80 ? 'Quota bientôt atteint' : 'Quota en bonne santé'}
          </p>
          <p className={`text-[10px] ${usagePct > 80 ? 'text-amber-600 dark:text-amber-500' : 'text-emerald-600 dark:text-emerald-500'}`}>
            {remaining.toLocaleString('fr-FR')} recherches disponibles jusqu'au 1er du mois
          </p>
        </div>
      </div>

      <button type="button" onClick={onLogout}
        className="flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 dark:border-slate-700 px-4 py-3 text-sm font-medium text-slate-600 dark:text-slate-300 transition hover:bg-slate-50 dark:hover:bg-slate-800">
        <LogOut size={15} /> Se déconnecter
      </button>
    </div>
  )
}

const DEMO_REFERRALS = [
  { initials: 'AB', color: 'bg-emerald-100 text-emerald-700', name: 'Agence Bernard',  sub: 'Inscrit le 12 mai 2026 · Plan Solo', status: 'Converti',   statusColor: 'bg-emerald-50 text-emerald-700' },
  { initials: 'IM', color: 'bg-amber-100 text-amber-700',    name: 'Immo Marché',     sub: 'Inscrit le 28 mai 2026 · En évaluation', status: 'En attente', statusColor: 'bg-amber-50 text-amber-700' },
  { initials: 'PL', color: 'bg-amber-100 text-amber-700',    name: 'Pierre Laurent',  sub: 'Inscrit le 2 juin 2026 · En évaluation', status: 'En attente', statusColor: 'bg-amber-50 text-amber-700' },
]

function ParrainageSection({ account, onLogout }: { account: Account; onLogout: () => void | Promise<void> }) {
  const refLink = `trouve.fr/ref/${(account.companyName || account.firstName).toLowerCase().replace(/\s+/g, '-')}`
  const [copied, setCopied] = useState(false)

  const copy = () => {
    navigator.clipboard.writeText(`https://${refLink}`).catch(() => {})
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const share = (channel: 'email' | 'whatsapp' | 'linkedin') => {
    const msg = encodeURIComponent(`Bonjour, je t'invite à découvrir trouvé!, l'outil de prospection pour les pros de l'immo. Profite de 20 recherches gratuites : https://${refLink}`)
    const urls: Record<string, string> = {
      email:    `mailto:?subject=Découvrez trouvé!&body=${msg}`,
      whatsapp: `https://wa.me/?text=${msg}`,
      linkedin: `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(`https://${refLink}`)}`,
    }
    window.open(urls[channel], '_blank')
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Bannière récompense */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[#1B54FF] to-indigo-500 p-5 text-white">
        <div className="absolute -right-5 -top-5 h-28 w-28 rounded-full bg-white/5" />
        <div className="absolute bottom-[-30px] right-8 h-20 w-20 rounded-full bg-white/5" />
        <p className="text-[10px] font-bold uppercase tracking-widest opacity-75">Programme de parrainage</p>
        <h3 className="mt-1.5 text-xl font-extrabold leading-tight tracking-tight">1 mois offert<br />par filleul converti</h3>
        <p className="mt-2 text-xs leading-relaxed opacity-80">
          Partagez votre lien unique. Quand un professionnel souscrit via votre lien, vous recevez <strong>1 mois gratuit</strong> sur votre plan.
        </p>
        <div className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-white/15 px-3 py-1.5 text-xs font-semibold">
          <Gift size={12} /> Pas de limite de parrainages
        </div>
      </div>

      {/* Lien de parrainage */}
      <div>
        <p className="mb-2.5 flex items-center gap-2 text-sm font-semibold text-slate-800 dark:text-slate-200">
          <Link size={15} className="text-blue-700" /> Votre lien de parrainage
        </p>
        <div className="flex gap-2">
          <div className="flex flex-1 items-center gap-2 overflow-hidden rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-2.5">
            <Link size={13} className="shrink-0 text-slate-400" />
            <span className="truncate text-sm text-slate-700 dark:text-slate-300">{refLink}</span>
          </div>
          <button type="button" onClick={copy}
            className="shrink-0 rounded-xl bg-[#1B54FF] px-4 py-2.5 text-sm font-bold text-white transition hover:bg-[#0b3fbc]">
            {copied ? '✓ Copié !' : 'Copier'}
          </button>
        </div>
        <div className="mt-2 grid grid-cols-3 gap-2">
          {([
            { label: 'Email',    ch: 'email'    as const },
            { label: 'WhatsApp', ch: 'whatsapp' as const },
            { label: 'LinkedIn', ch: 'linkedin' as const },
          ]).map(({ label, ch }) => (
            <button key={ch} type="button" onClick={() => share(ch)}
              className="flex items-center justify-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 py-2 text-xs font-semibold text-slate-600 dark:text-slate-300 transition hover:bg-slate-50 dark:hover:bg-slate-700">
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Stats */}
      <div>
        <p className="mb-2.5 flex items-center gap-2 text-sm font-semibold text-slate-800 dark:text-slate-200">
          <BarChart3 size={15} className="text-blue-700" /> Mes statistiques
        </p>
        <div className="grid grid-cols-3 gap-2.5">
          {[
            { value: '3',      label: 'Invitations',     color: 'text-[#1B54FF]' },
            { value: '1',      label: 'Convertis',        color: 'text-emerald-600' },
            { value: '1 mois', label: 'Gain accumulé',    color: 'text-amber-500' },
          ].map(({ value, label, color }) => (
            <div key={label} className="rounded-xl border border-slate-200 dark:border-slate-700 dark:bg-slate-800 p-3 text-center">
              <p className={`text-xl font-extrabold ${color}`}>{value}</p>
              <p className="mt-0.5 text-[10px] text-slate-500 dark:text-slate-400">{label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Filleuls */}
      <div>
        <p className="mb-2.5 flex items-center gap-2 text-sm font-semibold text-slate-800 dark:text-slate-200">
          <UsersRound size={15} className="text-blue-700" /> Mes filleuls
        </p>
        <div className="flex flex-col gap-1.5">
          {DEMO_REFERRALS.map(({ initials, color, name, sub, status, statusColor }) => (
            <div key={name} className="flex items-center justify-between rounded-xl border border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-2.5">
              <div className="flex items-center gap-2.5">
                <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold ${color}`}>{initials}</div>
                <div>
                  <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">{name}</p>
                  <p className="text-[10px] text-slate-400">{sub}</p>
                </div>
              </div>
              <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-[10px] font-bold ${statusColor}`}>{status}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Comment ça marche */}
      <div>
        <p className="mb-2.5 flex items-center gap-2 text-sm font-semibold text-slate-800 dark:text-slate-200">
          <BadgeCheck size={15} className="text-blue-700" /> Comment ça marche
        </p>
        <div className="flex flex-col gap-2">
          {[
            'Copiez votre lien unique et partagez-le à des professionnels de l\'immobilier.',
            'Ils s\'inscrivent et testent trouvé! 20 recherches totalement gratuites.',
            'Dès qu\'ils souscrivent à un plan payant, vous recevez 1 mois offert sur votre abonnement.',
          ].map((step, i) => (
            <div key={i} className="flex items-start gap-3 rounded-xl bg-slate-50 dark:bg-slate-800 px-3 py-3">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#1B54FF] text-[10px] font-bold text-white">{i + 1}</span>
              <p className="text-xs leading-relaxed text-slate-600 dark:text-slate-300" dangerouslySetInnerHTML={{ __html: step.replace('1 mois offert', '<strong>1 mois offert</strong>').replace('20 recherches totalement gratuites', '<strong>20 recherches totalement gratuites</strong>') }} />
            </div>
          ))}
        </div>
      </div>

      <button type="button" onClick={onLogout}
        className="flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 dark:border-slate-700 px-4 py-3 text-sm font-medium text-slate-600 dark:text-slate-300 transition hover:bg-slate-50 dark:hover:bg-slate-800">
        <LogOut size={15} /> Se déconnecter
      </button>
    </div>
  )
}

const PLANS_INFO = [
  {
    code: 'solo',
    name: 'Solo',
    price: 199,
    searches: 1500,
    seats: 1,
    recommended: false,
  },
  {
    code: 'agence',
    name: 'Agence',
    price: 499,
    searches: 5000,
    seats: 3,
    recommended: true,
  },
  {
    code: 'pro',
    name: 'Pro',
    price: 899,
    searches: 12000,
    seats: 7,
    recommended: false,
  },
]

function SubscriptionPanel({ quota, monthlyUsage, isDemo = false, onRequestAuth }: { quota: number; monthlyUsage: number; isDemo?: boolean; onRequestAuth?: () => void }) {
  const currentPlan = quota >= 10000 ? PLANS_INFO[2] : quota >= 4000 ? PLANS_INFO[1] : PLANS_INFO[0]
  const usagePct = Math.min(100, Math.round((monthlyUsage / quota) * 100))
  const [checkoutLoading, setCheckoutLoading] = useState<string | null>(null)
  const [checkoutError, setCheckoutError]     = useState<string | null>(null)
  const [isAnnual, setIsAnnual]               = useState(false)

  const handleCheckout = async (planCode: string) => {
    if (isDemo) { onRequestAuth?.(); return }
    if (planCode === 'reseau' || planCode === 'entreprise') {
      window.open('mailto:contact@trouve.fr?subject=Offre Entreprise sur mesure', '_blank')
      return
    }
    setCheckoutLoading(planCode)
    setCheckoutError(null)
    try {
      const { data: { session } } = await getSupabaseClient().auth.getSession()
      if (!session?.access_token) { onRequestAuth?.(); return }
      const res = await fetch('/api/stripe/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ plan_code: planCode, period: isAnnual ? 'annual' : 'monthly' }),
      })
      const data = await res.json()
      if (data.url) { window.location.href = data.url }
      else setCheckoutError(data.error ?? 'Une erreur est survenue.')
    } catch {
      setCheckoutError('Service momentanément indisponible. Réessayez.')
    } finally {
      setCheckoutLoading(null)
    }
  }

  return (
    <div className="mt-6 space-y-4">
      {/* Header */}
      <p className="flex items-center gap-2 font-medium text-slate-950 dark:text-white">
        <TrendingUp size={17} className="text-blue-700" />
        Mon abonnement
      </p>

      {/* Current plan card */}
      <div className="rounded-2xl border-2 border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/30 p-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wider text-blue-600 dark:text-blue-400">Plan actuel</p>
            <p className="mt-0.5 text-lg font-bold text-slate-950 dark:text-white">{currentPlan.name}</p>
          </div>
          <span className="rounded-full bg-white dark:bg-slate-800 px-3 py-1 text-sm font-bold text-blue-700 dark:text-blue-400 shadow-sm">
            {currentPlan.price} €<span className="text-xs font-normal text-slate-400"> /mois</span>
          </span>
        </div>
        <div className="mt-3">
          <div className="mb-1 flex justify-between text-xs text-slate-500 dark:text-slate-400">
            <span>{monthlyUsage} recherches utilisées</span>
            <span>{quota} incluses</span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-blue-200 dark:bg-blue-900/50">
            <div
              className={`h-2 rounded-full transition-all ${usagePct > 80 ? 'bg-amber-500' : 'bg-blue-600'}`}
              style={{ width: `${usagePct}%` }}
            />
          </div>
          <p className="mt-1 text-right text-[10px] text-slate-400">{usagePct}% utilisé</p>
        </div>
      </div>

      {/* Toggle annuel pour upgrade */}
      {PLANS_INFO.filter(p => p.searches > currentPlan.searches).length > 0 && (
        <div className="flex items-center gap-2 text-xs">
          <button onClick={() => setIsAnnual(false)}
            className={`rounded-lg px-3 py-1.5 font-semibold transition ${!isAnnual ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900' : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-200'}`}>
            Mensuel
          </button>
          <button onClick={() => setIsAnnual(true)}
            className={`rounded-lg px-3 py-1.5 font-semibold transition ${isAnnual ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900' : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-200'}`}>
            Annuel <span className="font-bold text-emerald-500">−20 %</span>
          </button>
        </div>
      )}

      {/* Upgrade options */}
      <div className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Passer à</p>
        {PLANS_INFO.filter(p => p.searches > currentPlan.searches).map(plan => (
          <div key={plan.code} className="flex items-center justify-between rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-3">
            <div className="flex items-center gap-2">
              {plan.recommended && <Sparkles size={13} className="text-amber-500" />}
              <div>
                <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  {plan.name} · {isAnnual ? Math.round(plan.price * 0.8) : plan.price} €/mois
                  {isAnnual && <span className="ml-1.5 text-[10px] font-bold text-emerald-500">−20 %</span>}
                </p>
                <p className="text-xs text-slate-400">{plan.searches.toLocaleString('fr-FR')} recherches · {plan.seats} compte{plan.seats > 1 ? 's' : ''}</p>
              </div>
            </div>
            <button type="button" onClick={() => handleCheckout(plan.code)}
              disabled={checkoutLoading !== null}
              className="flex items-center gap-1.5 rounded-lg bg-[#124bd2] px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-[#0b3fbc] disabled:opacity-60">
              {checkoutLoading === plan.code
                ? <span className="h-3 w-3 animate-spin rounded-full border-2 border-white border-t-transparent" />
                : <><TrendingUp size={11} /> Payer</>}
            </button>
          </div>
        ))}
        {PLANS_INFO.filter(p => p.searches > currentPlan.searches).length === 0 && (
          <div className="flex items-center justify-between rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-3">
            <div>
              <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">Réseau · Sur devis</p>
              <p className="text-xs text-slate-400">Utilisateurs illimités · Infrastructure dédiée</p>
            </div>
            <button type="button" onClick={() => handleCheckout('reseau')}
              className="flex items-center gap-1.5 rounded-lg bg-[#124bd2] px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-[#0b3fbc]">
              Contacter
            </button>
          </div>
        )}
        {checkoutError && (
          <p className="rounded-xl bg-red-50 dark:bg-red-950/30 px-3 py-2 text-xs text-red-700 dark:text-red-400">{checkoutError}</p>
        )}
        <div className="flex flex-wrap gap-x-3 gap-y-0.5 pt-1 text-[10px] text-slate-400">
          {['Stripe sécurisé', 'Facture TVA auto', 'Résiliable'].map(t => (
            <span key={t} className="flex items-center gap-1"><Zap size={8} className="text-emerald-400" />{t}</span>
          ))}
        </div>
      </div>

      {/* Add-ons */}
      <div className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Acheter en plus</p>
        <div className="grid grid-cols-2 gap-2">
          <button type="button"
            onClick={() => window.open('mailto:contact@trouve.fr?subject=Add-on : +500 recherches', '_blank')}
            className="flex flex-col items-start rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-3 text-left transition hover:border-blue-200 hover:bg-blue-50 dark:hover:bg-blue-950/20">
            <div className="flex items-center gap-1.5">
              <Plus size={13} className="text-blue-600" />
              <span className="text-xs font-bold text-slate-900 dark:text-slate-100">+500 recherches</span>
            </div>
            <span className="mt-1 text-lg font-bold text-[#124bd2]">49 €</span>
            <span className="text-[10px] text-slate-400">Valable 30 jours</span>
          </button>
          <button type="button"
            onClick={() => window.open('mailto:contact@trouve.fr?subject=Add-on : Siège supplémentaire', '_blank')}
            className="flex flex-col items-start rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-3 text-left transition hover:border-blue-200 hover:bg-blue-50 dark:hover:bg-blue-950/20">
            <div className="flex items-center gap-1.5">
              <CreditCard size={13} className="text-blue-600" />
              <span className="text-xs font-bold text-slate-900 dark:text-slate-100">Siège supp.</span>
            </div>
            <span className="mt-1 text-lg font-bold text-[#124bd2]">59 €</span>
            <span className="text-[10px] text-slate-400">Par mois</span>
          </button>
        </div>
      </div>
    </div>
  )
}

function formatAction(action: string) {
  const labels: Record<string, string> = {
    request_created: 'demande créée',
    access_request_created: 'demande créée',
    login: 'connexion',
    approved: 'accès approuvé',
    access_approved: 'accès approuvé',
    rejected: 'accès refusé',
    access_rejected: 'accès refusé',
    search_performed: 'recherche effectuée',
    favorite_saved: 'favori ajouté',
    favorite_removed: 'favori retiré',
  }

  return labels[action] ?? action.replace(/_/g, ' ')
}

function MiniMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 dark:border-slate-700 dark:bg-slate-800 p-4">
      <p className="text-[11px] text-slate-500 dark:text-slate-400">{label}</p>
      <p className="mt-2 text-sm font-medium text-slate-950 dark:text-slate-100">{value}</p>
    </div>
  )
}

function Field({
  id,
  label,
  type = 'text',
  value,
  minLength,
  placeholder,
  onChange,
}: {
  id: string
  label: string
  type?: string
  value: string
  minLength?: number
  placeholder?: string
  onChange: (value: string) => void
}) {
  const [showPwd, setShowPwd] = useState(false)
  const isPassword = type === 'password'
  const effectiveType = isPassword ? (showPwd ? 'text' : 'password') : type
  const EyeIcon = showPwd ? EyeOff : Eye

  return (
    <div>
      <label htmlFor={id} className="mb-2 block text-xs font-medium text-slate-600 dark:text-slate-400">{label}</label>
      <div className="relative">
        <input
          id={id}
          required
          type={effectiveType}
          minLength={minLength}
          value={value}
          placeholder={placeholder ?? label}
          onChange={(event) => onChange(event.target.value)}
          className={`h-12 w-full rounded-xl border border-slate-200 px-4 text-sm outline-none transition placeholder:text-slate-300 focus:border-blue-600 focus:ring-2 focus:ring-blue-100 ${isPassword ? 'pr-11' : ''}`}
        />
        {isPassword && (
          <button
            type="button"
            tabIndex={-1}
            onClick={() => setShowPwd(v => !v)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 transition hover:text-slate-600"
            aria-label={showPwd ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
          >
            <EyeIcon size={17} />
          </button>
        )}
      </div>
    </div>
  )
}
