import { type FormEvent, useEffect, useMemo, useState } from 'react'
import {
  ArrowDown,
  BadgeCheck,
  Building2,
  BriefcaseBusiness,
  Check,
  Clock3,
  Database,
  Eye,
  KeyRound,
  LogOut,
  Mail,
  MapPin,
  Phone,
  Search,
  ShieldCheck,
  Target,
  UserRound,
  UsersRound,
  X,
  Zap,
  type LucideIcon,
} from 'lucide-react'
import trouveLogo from '@/assets/trouve-logo.png'
import { findCompanyBySiren, normalizeSiren, type VerifiedCompany } from '@/lib/companyApi'
import {
  authenticate,
  authenticateWithOAuth,
  createAccessRequest,
  DEMO_ADMIN,
  getAccounts,
  getAuditEvents,
  getDataMetrics,
  isOAuthPreviewEnabled,
  reviewAccessRequest,
  usesRemoteDatabase,
  type Account,
  type AuditEvent,
  type DataMetric,
  type OAuthProvider,
  type UserRole,
} from '@/lib/accountStore'
import { databaseModeLabel } from '@/lib/supabase'

export type AccountPanelView = 'login' | 'register' | 'workspace'

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
  pending: 'En validation',
  approved: 'Validé',
  rejected: 'Refusé',
  suspended: 'Suspendu',
}

export default function AccountPanel({
  initialView,
  currentAccount,
  onAuthenticated,
  onClose,
  onLogout,
}: AccountPanelProps) {
  const [view, setView] = useState<AccountPanelView>(currentAccount ? 'workspace' : initialView)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loginError, setLoginError] = useState('')
  const [loginLoading, setLoginLoading] = useState(false)
  const [oauthLoading, setOauthLoading] = useState<OAuthProvider | null>(null)
  const [form, setForm] = useState({
    firstName: '',
    lastName: '',
    email: '',
    password: '',
    siren: '',
    role: 'agent' as Exclude<UserRole, 'admin'>,
  })
  const [company, setCompany] = useState<VerifiedCompany | null>(null)
  const [sirenState, setSirenState] = useState<'idle' | 'loading' | 'error' | 'verified'>('idle')
  const [registerError, setRegisterError] = useState('')
  const [requestCreated, setRequestCreated] = useState<Account | null>(null)
  const [accounts, setAccounts] = useState<Account[]>([])
  const [auditEvents, setAuditEvents] = useState<AuditEvent[]>([])
  const [dataMetrics, setDataMetrics] = useState<DataMetric[]>([])
  const [workspaceError, setWorkspaceError] = useState('')

  useEffect(() => {
    setView(currentAccount ? 'workspace' : initialView)
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
        const [events, metrics] = await Promise.all([getAuditEvents(), getDataMetrics()])
        setAuditEvents(events)
        setDataMetrics(metrics)
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

  const verifyCompany = async () => {
    setCompany(null)
    setRegisterError('')
    setSirenState('loading')
    try {
      const result = await findCompanyBySiren(form.siren)
      if (!result) {
        setSirenState('error')
        setRegisterError('Aucune entreprise trouvée pour ce numéro SIREN.')
        return
      }
      if (!result.isActive) {
        setSirenState('error')
        setRegisterError("L'entreprise doit être active pour demander un accès.")
        return
      }
      setCompany(result)
      setSirenState('verified')
    } catch (error) {
      setSirenState('error')
      setRegisterError(error instanceof Error ? error.message : 'Vérification impossible.')
    }
  }

  const handleRegistration = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setRegisterError('')
    if (!company || company.siren !== normalizeSiren(form.siren)) {
      setRegisterError("Vérifiez d'abord votre SIREN avant de soumettre la demande.")
      return
    }
    try {
      const newAccount = await createAccessRequest(form, company)
      setRequestCreated(newAccount)
    } catch (error) {
      setRegisterError(error instanceof Error ? error.message : 'Impossible de créer la demande.')
    }
  }

  const handleLogin = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setLoginLoading(true)
    setLoginError('')
    try {
      const account = await authenticate(email, password)
      onAuthenticated(account)
      setView('workspace')
    } catch (error) {
      setLoginError(error instanceof Error ? error.message : 'Connexion impossible.')
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
      setLoginError(
        error instanceof Error
          ? error.message
          : 'Connexion OAuth impossible. Vérifiez le provider dans Supabase.',
      )
    }
  }

  const handleReview = async (
    accountId: string,
    status: 'approved' | 'rejected',
  ) => {
    if (!currentAccount) return
    await reviewAccessRequest(accountId, status, currentAccount.email)
    await refreshWorkspaceData()
  }

  if (view !== 'workspace') {
    const isRegister = view === 'register'
    const oauthPreview = isOAuthPreviewEnabled()

    return (
      <div className="fixed inset-0 z-50 overflow-y-auto bg-white text-[#07113d]">
        <div className="grid min-h-screen lg:grid-cols-[0.46fr_1fr]">
          <aside className="relative flex min-h-screen flex-col px-6 py-4 sm:px-9 lg:px-12">
            <button
              type="button"
              aria-label="Fermer"
              onClick={onClose}
              className="absolute right-5 top-5 flex h-10 w-10 items-center justify-center rounded-2xl border border-slate-200 text-slate-500 transition hover:border-blue-200 hover:text-[#124bd2] lg:hidden"
            >
              <X size={17} />
            </button>

            <img src={trouveLogo} alt="trouvé!" className="h-8 w-fit sm:h-9" />

            <div className="mt-7 max-w-[440px]">
              <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.24em] text-[#124bd2]">
                Accès professionnel
              </p>
              <h1 className="mt-3 text-2xl font-bold tracking-tight text-[#07113d]">
                {isRegister ? 'Créer votre accès trouvé!' : 'Bienvenue'}
              </h1>
              <p className="mt-2 text-sm leading-6 text-slate-500">
                {isRegister
                  ? 'Vérifiez votre société par SIREN, puis envoyez une demande nominative à valider.'
                  : 'Connectez-vous à votre compte pour continuer.'}
              </p>

              <div className="mt-5 space-y-3">
                <button
                  type="button"
                  onClick={() => void handleOAuth('google')}
                  disabled={Boolean(oauthLoading)}
                  className="flex h-12 w-full items-center justify-center gap-3 rounded-xl border border-slate-200 bg-white text-sm font-semibold text-[#07113d] shadow-sm transition hover:border-blue-200 hover:shadow-md"
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
                  className="flex h-12 w-full items-center justify-center gap-3 rounded-xl border border-slate-200 bg-white text-sm font-semibold text-[#07113d] shadow-sm transition hover:border-blue-200 hover:shadow-md"
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
                <p className="text-xs leading-5 text-slate-500">
                  {oauthPreview
                    ? 'Mode preview local : Google/Microsoft ouvrent un compte démo validé, sans quitter le site.'
                    : isRegister
                      ? 'Adresse professionnelle requise (@votreentreprise.fr). Votre accès sera validé sous 24–48h.'
                      : 'Connexion réservée aux adresses professionnelles (@votreentreprise.fr).'}
                </p>
              </div>

              <div className="my-4 flex items-center gap-4 text-sm text-slate-400">
                <span className="h-px flex-1 bg-slate-200" />
                ou
                <span className="h-px flex-1 bg-slate-200" />
              </div>

              {requestCreated ? (
                <div className="rounded-[28px] border border-blue-100 bg-blue-50 p-6">
                  <BadgeCheck className="text-[#124bd2]" size={34} />
                  <h2 className="mt-5 text-xl font-bold text-[#07113d]">Demande transmise</h2>
                  <p className="mt-2 text-sm leading-6 text-slate-600">
                    Le compte de {requestCreated.firstName} {requestCreated.lastName} est en attente
                    de validation. Vous recevrez une confirmation après contrôle de la société.
                  </p>
                  <div className="mt-5 rounded-2xl bg-white p-4 text-sm text-slate-600">
                    <p className="font-semibold text-[#07113d]">{requestCreated.companyName}</p>
                    <p className="mt-1">SIREN {requestCreated.siren} · {roleLabels[requestCreated.role]}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setRequestCreated(null)
                      setView('login')
                    }}
                    className="mt-6 h-12 w-full rounded-xl bg-[#0757f8] text-sm font-semibold text-white transition hover:bg-[#0048dd]"
                  >
                    Aller à la connexion
                  </button>
                </div>
              ) : isRegister ? (
                <form onSubmit={handleRegistration} className="mt-5 space-y-3.5">
                  <div className="grid grid-cols-2 gap-3">
                    <AuthInput
                      id="register-first-name"
                      label="Prénom"
                      value={form.firstName}
                      onChange={(value) => setForm({ ...form, firstName: value })}
                    />
                    <AuthInput
                      id="register-last-name"
                      label="Nom"
                      value={form.lastName}
                      onChange={(value) => setForm({ ...form, lastName: value })}
                    />
                  </div>
                  <AuthInput
                    id="register-email"
                    label="Adresse e-mail professionnelle"
                    type="email"
                    icon={Mail}
                    value={form.email}
                    onChange={(value) => setForm({ ...form, email: value })}
                  />
                  <div className="grid gap-3 sm:grid-cols-[1fr_1.05fr]">
                    <select
                      id="register-role"
                      value={form.role}
                      onChange={(event) =>
                        setForm({ ...form, role: event.target.value as Exclude<UserRole, 'admin'> })
                      }
                      className="h-[50px] rounded-xl border border-slate-200 bg-white px-4 text-sm text-slate-700 outline-none transition focus:border-[#0757f8] focus:ring-4 focus:ring-blue-100"
                    >
                      <option value="agent">Agent nominatif</option>
                      <option value="agence">Agence / équipe</option>
                    </select>
                    <div className="flex gap-2">
                      <AuthInput
                        id="register-siren"
                        label="SIREN société"
                        inputMode="numeric"
                        value={form.siren}
                        onChange={(value) => {
                          setForm({ ...form, siren: value })
                          setCompany(null)
                          setSirenState('idle')
                          setRegisterError('')
                        }}
                      />
                      <button
                        type="button"
                        onClick={verifyCompany}
                        disabled={sirenState === 'loading'}
                        className="h-[50px] rounded-xl bg-blue-50 px-4 text-sm font-semibold text-[#0757f8] transition hover:bg-blue-100 disabled:opacity-60"
                      >
                        {sirenState === 'loading' ? '...' : 'OK'}
                      </button>
                    </div>
                  </div>
                  {company && (
                    <div className="rounded-2xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
                      <span className="font-semibold">{company.name}</span>
                      <span className="mt-1 block text-xs">SIREN {company.siren} · entreprise active</span>
                    </div>
                  )}
                  <AuthInput
                    id="register-password"
                    label="Mot de passe"
                    type="password"
                    icon={KeyRound}
                    value={form.password}
                    minLength={8}
                    onChange={(value) => setForm({ ...form, password: value })}
                  />
                  {registerError && (
                    <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{registerError}</p>
                  )}
                  <button className="h-12 w-full rounded-xl bg-[#0757f8] text-sm font-semibold text-white shadow-[0_18px_42px_-20px_rgba(7,87,248,0.8)] transition hover:bg-[#0048dd]">
                    Soumettre pour validation
                  </button>
                </form>
              ) : (
                <form onSubmit={handleLogin} className="space-y-4">
                  <AuthInput id="login-email" label="Adresse e-mail pro" type="email" icon={Mail} value={email} onChange={setEmail} />
                  <AuthInput id="login-password" label="Mot de passe" type="password" icon={KeyRound} value={password} onChange={setPassword} trailingIcon={Eye} />
                  <div className="flex items-center justify-end text-sm">
                    <button
                      type="button"
                      onClick={() => window.open(`mailto:contact@trouve.fr?subject=Réinitialisation mot de passe&body=Email : ${encodeURIComponent(email || '(à renseigner)')}`, '_blank')}
                      className="font-semibold text-[#0757f8] hover:underline"
                    >
                      Mot de passe oublié ?
                    </button>
                  </div>
                  {loginError && (
                    <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{loginError}</p>
                  )}
                  <button
                    disabled={loginLoading}
                    className="h-12 w-full rounded-xl bg-[#0757f8] text-sm font-semibold text-white shadow-[0_18px_42px_-20px_rgba(7,87,248,0.8)] transition hover:bg-[#0048dd] disabled:opacity-60"
                  >
                    {loginLoading ? 'Connexion...' : 'Se connecter'}
                  </button>
                </form>
              )}

              {!requestCreated && (
                <p className="mt-6 text-center text-sm text-slate-500">
                  {isRegister ? 'Déjà un compte ? ' : 'Pas encore de compte ? '}
                  <button
                    type="button"
                    onClick={() => setView(isRegister ? 'login' : 'register')}
                    className="font-bold text-[#0757f8]"
                  >
                    {isRegister ? 'Se connecter' : "S'inscrire ici"}
                  </button>
                </p>
              )}
            </div>

            <div className="mt-auto hidden items-center gap-3 pb-2 pt-12 text-xs leading-5 text-slate-500 sm:flex">
              <ShieldCheck className="shrink-0 text-[#0757f8]" size={20} />
              <span>Vos données sont sécurisées et ne sont jamais revendues.</span>
            </div>
          </aside>

          <AuthShowcase />
        </div>
      </div>
    )
  }

  const drawerView = view as AccountPanelView

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/45 backdrop-blur-sm">
      <button aria-label="Fermer" className="absolute inset-0" onClick={onClose} />
      <section className="relative h-full w-full max-w-[620px] overflow-y-auto bg-white p-6 shadow-2xl sm:p-8">
        <header className="mb-8 flex items-start justify-between">
          <div>
            <p className="font-mono text-[11px] uppercase tracking-[0.26em] text-blue-600">
              Espace sécurisé
            </p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">
              {view === 'workspace' ? 'Compte professionnel' : 'Accès trouvé!'}
            </h2>
          </div>
          <button
            type="button"
            aria-label="Fermer"
            onClick={onClose}
            className="rounded-full border border-slate-200 p-2.5 text-slate-500 transition hover:bg-slate-50"
          >
            <X size={18} />
          </button>
        </header>

        {drawerView !== 'workspace' && !requestCreated && (
          <nav className="mb-7 flex rounded-2xl bg-slate-100 p-1">
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
                    ? 'bg-white text-slate-950 shadow-sm'
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
              <p className="font-medium text-slate-950">{requestCreated.companyName}</p>
              <p className="mt-1">SIREN {requestCreated.siren} · {roleLabels[requestCreated.role]}</p>
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
            <div>
              <label htmlFor="register-role" className="mb-2 block text-xs font-medium text-slate-600">Profil demandé</label>
              <select
                id="register-role"
                value={form.role}
                onChange={(event) =>
                  setForm({ ...form, role: event.target.value as Exclude<UserRole, 'admin'> })
                }
                className="h-12 w-full rounded-xl border border-slate-200 bg-white px-4 text-sm text-slate-800 outline-none transition focus:border-blue-600"
              >
                <option value="agent">Agent - accès nominatif</option>
                <option value="agence">Agence - gestion d'équipe</option>
              </select>
            </div>
            <div>
              <label htmlFor="register-siren" className="mb-2 block text-xs font-medium text-slate-600">
                Société rattachée
              </label>
              <div className="flex gap-2">
                <input
                  id="register-siren"
                  required
                  inputMode="numeric"
                  value={form.siren}
                  onChange={(event) => {
                    setForm({ ...form, siren: event.target.value })
                    setCompany(null)
                    setSirenState('idle')
                    setRegisterError('')
                  }}
                  placeholder="SIREN - 9 chiffres"
                  className="h-12 flex-1 rounded-xl border border-slate-200 px-4 text-sm outline-none transition focus:border-blue-600"
                />
                <button
                  type="button"
                  onClick={verifyCompany}
                  disabled={sirenState === 'loading'}
                  className="rounded-xl border border-blue-100 bg-blue-50 px-4 text-sm font-medium text-blue-700 transition hover:bg-blue-100 disabled:opacity-60"
                >
                  {sirenState === 'loading' ? '...' : 'Vérifier'}
                </button>
              </div>
            </div>
            {company && (
              <div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-4">
                <p className="flex items-center gap-2 text-sm font-medium text-emerald-800">
                  <BadgeCheck size={16} />
                  {company.name}
                </p>
                <p className="mt-1 text-xs text-emerald-700">SIREN {company.siren} · Entreprise active</p>
              </div>
            )}
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
                <p>{DEMO_ADMIN.password}</p>
                <p className="mt-2 text-slate-500">Permet de valider les demandes créées localement.</p>
              </div>
            ) : (
              <div className="mt-6 rounded-2xl border border-blue-100 bg-blue-50 p-4 text-xs leading-6 text-blue-800">
                Authentification sécurisée via Supabase. Les comptes et validations sont conservés
                dans votre base externe.
              </div>
            )}
          </form>
        )}

        {drawerView === 'workspace' && currentAccount && (
          <Workspace
            account={currentAccount}
            accounts={accounts}
            auditEvents={auditEvents}
            dataMetrics={dataMetrics}
            pendingRequests={pendingRequests}
            verifiedMembers={verifiedMembers}
            workspaceError={workspaceError}
            onReview={handleReview}
            onLogout={onLogout}
          />
        )}

        <div className={`mt-8 flex gap-3 rounded-2xl border p-4 text-xs leading-5 ${
          usesRemoteDatabase
            ? 'border-emerald-100 bg-emerald-50 text-emerald-900'
            : 'border-amber-100 bg-amber-50 text-amber-900'
        }`}>
          <ShieldCheck className="mt-0.5 shrink-0" size={16} />
          {usesRemoteDatabase
            ? 'Base Supabase active : comptes, demandes et journaux sont stockés dans votre espace externe.'
            : 'Démonstration locale : configurez Supabase pour stocker durablement comptes, recherches et journaux.'}
        </div>
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
            <span className="block text-[#0757f8]">Retrouvez les bons contacts</span>
            à partir d'une simple information
          </h2>
          <div className="mx-auto mt-1 h-2.5 w-48 rounded-full bg-[#0757f8]/15" />
          <p className="mt-4 text-base leading-7 text-slate-500">
            Nom, prénom, adresse, email, téléphone, entreprise...
            <span className="block">Trouvez instantanément les coordonnées dont vous avez besoin.</span>
          </p>
        </div>

        <div className="mx-auto mt-6 flex max-w-3xl items-center gap-4 rounded-2xl border border-white/80 bg-white p-2.5 shadow-[0_24px_80px_-50px_rgba(7,39,115,0.8)]">
          <Search className="ml-3 text-slate-400" size={22} />
          <span className="flex-1 text-left text-lg text-slate-400">Ex : Dupont, 75016, +33 6 12 34 56 78...</span>
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
                    <h3 className="text-xl font-bold text-[#07113d]">Martin Dupont</h3>
                    <p className="mt-2 text-sm leading-6 text-slate-500">Directeur Commercial<br />Acme Immobilier</p>
                  </div>
                  <span className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-700 shadow-[0_12px_28px_-16px_rgba(16,185,129,0.9)]">
                    Contact trouvé <BadgeCheck size={14} />
                  </span>
                </div>
                <div className="mt-5 space-y-2.5 text-[15px] font-medium text-[#07113d]">
                  <InfoLine icon={Phone} label="06 12 34 56 78" />
                  <InfoLine icon={Mail} label="martin.dupont@acme-immo.fr" />
                  <InfoLine icon={MapPin} label="16 Rue de la Paix, 75002 Paris" />
                  <InfoLine icon={BriefcaseBusiness} label="Acme Immobilier" />
                  <InfoLine icon={UsersRound} label="Dirigeant - 15 salariés" />
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
          <Metric value="5.8B+" label="Données" />
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
  trailingIcon: TrailingIcon,
  onChange,
}: {
  id: string
  label: string
  type?: string
  value: string
  minLength?: number
  inputMode?: 'text' | 'numeric' | 'decimal' | 'tel' | 'search' | 'email' | 'url'
  icon?: LucideIcon
  trailingIcon?: LucideIcon
  onChange: (value: string) => void
}) {
  return (
    <div className="relative flex-1">
      {Icon && <Icon className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={19} />}
      <input
        id={id}
        required
        type={type}
        minLength={minLength}
        inputMode={inputMode}
        value={value}
        placeholder={label}
        onChange={(event) => onChange(event.target.value)}
        className={`h-[50px] w-full rounded-xl border border-slate-200 bg-white text-sm font-medium text-[#07113d] outline-none transition placeholder:text-slate-400 focus:border-[#0757f8] focus:ring-4 focus:ring-blue-100 ${
          Icon ? 'pl-12' : 'pl-4'
        } ${TrailingIcon ? 'pr-12' : 'pr-4'}`}
      />
      {TrailingIcon && <TrailingIcon className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-slate-400" size={19} />}
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
  pendingRequests,
  verifiedMembers,
  workspaceError,
  onReview,
  onLogout,
}: {
  account: Account
  accounts: Account[]
  auditEvents: AuditEvent[]
  dataMetrics: DataMetric[]
  pendingRequests: Account[]
  verifiedMembers: Account[]
  workspaceError: string
  onReview: (accountId: string, status: 'approved' | 'rejected') => void
  onLogout: () => void | Promise<void>
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
          <p className="mt-2 text-xs text-slate-400">{account.companyName} · SIREN {account.siren}</p>
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
        <div className="mt-6 rounded-2xl border border-slate-200 p-5">
          <p className="flex items-center gap-2 font-medium text-slate-950">
            <UsersRound size={17} className="text-blue-700" />
            Comptes de l'agence
          </p>
          <p className="mt-2 text-sm text-slate-500">
            {verifiedMembers.length || 1} utilisateur{verifiedMembers.length > 1 ? 's' : ''} autorisé{verifiedMembers.length > 1 ? 's' : ''} · quota partagé suivi
          </p>
          <div className="mt-4 space-y-2">
            {verifiedMembers.map((member) => (
              <div key={member.id} className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-3 text-xs">
                <div>
                  <p className="font-medium text-slate-900">{member.firstName} {member.lastName}</p>
                  <p className="mt-0.5 text-slate-500">{member.email}</p>
                </div>
                <span className="rounded-full bg-white px-2.5 py-1 text-blue-700">{roleLabels[member.role]}</span>
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
                      <p className="mt-1 text-xs text-slate-500">{request.companyName} · SIREN {request.siren}</p>
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
    <div className="rounded-2xl border border-slate-200 p-4">
      <p className="text-[11px] text-slate-500">{label}</p>
      <p className="mt-2 text-sm font-medium text-slate-950">{value}</p>
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
  return (
    <div>
      <label htmlFor={id} className="mb-2 block text-xs font-medium text-slate-600">{label}</label>
      <input
        id={id}
        required
        type={type}
        minLength={minLength}
        value={value}
        placeholder={placeholder ?? label}
        onChange={(event) => onChange(event.target.value)}
        className="h-12 w-full rounded-xl border border-slate-200 px-4 text-sm outline-none transition placeholder:text-slate-300 focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
      />
    </div>
  )
}
