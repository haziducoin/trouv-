import { type FormEvent, useEffect, useMemo, useState } from 'react'
import {
  BadgeCheck,
  Building2,
  Check,
  Clock3,
  Database,
  KeyRound,
  LogOut,
  ShieldCheck,
  UserRound,
  UsersRound,
  X,
} from 'lucide-react'
import { findCompanyBySiren, normalizeSiren, type VerifiedCompany } from '@/lib/companyApi'
import {
  authenticate,
  createAccessRequest,
  DEMO_ADMIN,
  getAccounts,
  getAuditEvents,
  getDataMetrics,
  reviewAccessRequest,
  usesRemoteDatabase,
  type Account,
  type AuditEvent,
  type DataMetric,
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
        setRegisterError('L’entreprise doit être active pour demander un accès.')
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
      setRegisterError('Vérifiez d’abord votre SIREN avant de soumettre la demande.')
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

  const handleReview = async (
    accountId: string,
    status: 'approved' | 'rejected',
  ) => {
    if (!currentAccount) return
    await reviewAccessRequest(accountId, status, currentAccount.email)
    await refreshWorkspaceData()
  }

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

        {view !== 'workspace' && !requestCreated && (
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
                  view === item.id
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
              attente de validation. L’administrateur contrôle la société avant activation.
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

        {!requestCreated && view === 'register' && (
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
                <option value="agence">Agence - gestion d’équipe</option>
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

        {!requestCreated && view === 'login' && (
          <form onSubmit={handleLogin} className="space-y-4">
            <Field id="login-email" label="Email" type="email" value={email} onChange={setEmail} />
            <Field id="login-password" label="Mot de passe" type="password" value={password} onChange={setPassword} />
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

        {view === 'workspace' && currentAccount && (
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
            Comptes de l’agence
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
  onChange,
}: {
  id: string
  label: string
  type?: string
  value: string
  minLength?: number
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
        onChange={(event) => onChange(event.target.value)}
        className="h-12 w-full rounded-xl border border-slate-200 px-4 text-sm outline-none transition focus:border-blue-600"
      />
    </div>
  )
}
